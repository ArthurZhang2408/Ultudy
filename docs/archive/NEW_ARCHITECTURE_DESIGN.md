# New Architecture: LLM-First Structured Extraction

## Vision

**One LLM call upon upload** → Returns complete structured extraction with sections as separate markdown files

## Flow

```
┌─────────────┐
│  PDF Upload │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  LLM Vision Model (Gemini 2.0 Flash with vision)       │
│  Input: PDF file (binary)                              │
│  Output: Structured JSON with sections                  │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  {                                                       │
│    "title": "Chapter 9: Statistics",                    │
│    "sections": [                                         │
│      {                                                   │
│        "name": "Introduction",                          │
│        "description": "Overview of statistics",         │
│        "markdown": "# Introduction\n\n...",             │
│        "page_start": 1,                                  │
│        "page_end": 2                                     │
│      },                                                  │
│      {                                                   │
│        "name": "Core Concepts",                         │
│        "description": "Key statistical concepts",       │
│        "markdown": "# Core Concepts\n\n...",            │
│        "page_start": 2,                                  │
│        "page_end": 3                                     │
│      }                                                   │
│    ]                                                     │
│  }                                                       │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Store in Database                                       │
│  - documents.title                                       │
│  - sections.markdown_text (each section separate)       │
└──────┬──────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│  Generate Concepts (later)                              │
│  Input: sections[0].markdown_text                       │
│  Output: Concepts for that section only                 │
└─────────────────────────────────────────────────────────┘
```

## LLM Extraction Requirements

### Input
- **PDF file** (binary, direct to vision model)
- No pre-processing needed

### Output (Structured JSON)
```json
{
  "title": "Document title",
  "sections": [
    {
      "name": "Logical section name (LLM decides best name for this cluster)",
      "description": "1-2 sentence overview",
      "markdown": "Complete markdown for this section (properly escaped for JSON)"
    }
  ]
}
```

**CRITICAL JSON SAFETY:**
- Markdown content MUST be properly escaped for JSON
- Use schema-based generation (Gemini's `responseSchema` parameter)
- Validate JSON before parsing
- Never use markdown code blocks in response (direct JSON only)

### Markdown Conversion Rules (for each section)

**Text Formatting:**
- Headers: `# Heading`, `## Heading`, `### Heading`
- Bold: `**bold text**`
- Italic: `*italic text*`
- Code: `` `inline code` ``

**Math:**
- Inline math: `$x^2 + y^2 = z^2$`
- Display math: `$$E = mc^2$$`
- Preserve all LaTeX formatting

**Tables:**
```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

**Code Blocks:**
```markdown
\`\`\`python
code here
\`\`\`
```

**Images:**
```markdown
![Description of image](image_reference)
```

**Lists:**
```markdown
1. Numbered item
2. Another item

- Bullet item
- Another bullet
```

## API Design

### New Endpoint: `/upload/pdf-structured`

**Request:**
```
POST /upload/pdf-structured
Content-Type: multipart/form-data

{
  file: <PDF binary>,
  owner_id: "user-123"
}
```

**Process:**
1. Save PDF to storage
2. Send PDF to Gemini 2.0 Flash (vision)
3. Parse structured response
4. Store document + sections in database
5. Return structured response

**Response:**
```json
{
  "document_id": "uuid",
  "title": "Chapter 9: Statistics",
  "sections": [
    {
      "section_id": "uuid",
      "section_number": 1,
      "name": "Introduction",
      "description": "...",
      "page_start": 1,
      "page_end": 2
    }
  ]
}
```

## Database Schema Changes

### No changes needed!

We already have:
- `sections.markdown_text` (from previous migration)
- Just populate it during upload instead of during split

## Implementation Plan

### Step 1: Create LLM Vision Extraction Service

**File:** `src/ingestion/llm_extractor.js`

```javascript
import { getGeminiVisionModel } from '../providers/llm/gemini_vision.js';

export async function extractStructuredSections(pdfPath) {
  const model = await getGeminiVisionModel();

  const systemPrompt = `You are an expert at analyzing PDFs and extracting structured content.

  Analyze this PDF and extract its main sections as separate markdown documents.

  For each section:
  1. Identify section boundaries (headers, bold text, visual breaks)
  2. Convert content to clean markdown
  3. Preserve formatting (bold, italic, headers)
  4. Convert math to LaTeX ($inline$, $$display$$)
  5. Convert tables to markdown tables
  6. Describe images with ![alt text](reference)
  7. Extract code blocks with syntax highlighting

  Return structured JSON.`;

  const userPrompt = `Extract all major sections from this PDF.

  SECTION GUIDELINES:
  - Each section should be substantial (room for many concepts)
  - Group related content into logical clusters
  - Name sections based on the conceptual theme (you decide the best name)
  - Don't worry about matching exact document headings

  For each section, provide:
  - name: A clear, logical name for this conceptual cluster
  - description: 1-2 sentence overview of what concepts this section covers
  - markdown: Complete markdown content for this section

  Convert all content faithfully:
  - Math equations → LaTeX ($inline$, $$display$$)
  - Tables → Markdown tables
  - Text formatting → **bold**, *italic*, # headers
  - Images → Descriptions with ![alt](ref)
  - Code → \`\`\`language blocks

  CRITICAL: Ensure markdown is properly escaped for JSON (handle newlines, quotes, backslashes).`;

  const result = await model.generateStructuredContent({
    pdfFile: pdfPath,
    systemPrompt,
    userPrompt,
    responseSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Document title'
        },
        sections: {
          type: 'array',
          description: '3-6 large sections',
          minItems: 3,
          maxItems: 6,
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Logical section name for this cluster'
              },
              description: {
                type: 'string',
                description: 'Brief overview of concepts covered'
              },
              markdown: {
                type: 'string',
                description: 'Complete markdown content (properly escaped for JSON)'
              }
            },
            required: ['name', 'description', 'markdown']
          }
        }
      },
      required: ['title', 'sections']
    }
  });

  return result;
}
```

### Step 2: Create Gemini Vision Provider

**File:** `src/providers/llm/gemini_vision.js`

```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs/promises';

export async function getGeminiVisionModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);

  return {
    async generateStructuredContent({ pdfFile, systemPrompt, userPrompt, responseSchema }) {
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema
        }
      });

      // Read PDF as binary
      const pdfData = await fs.readFile(pdfFile);
      const pdfBase64 = pdfData.toString('base64');

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: pdfBase64
                }
              },
              { text: userPrompt }
            ]
          }
        ]
      });

      const response = result.response;
      const text = response.text();

      // CRITICAL: Validate JSON before parsing
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        console.error('[gemini_vision] Invalid JSON response:', text.substring(0, 500));
        throw new Error('LLM returned invalid JSON');
      }

      // Validate structure
      if (!parsed.title || !Array.isArray(parsed.sections)) {
        throw new Error('LLM response missing required fields');
      }

      if (parsed.sections.length < 3 || parsed.sections.length > 6) {
        console.warn(`[gemini_vision] Expected 3-6 sections, got ${parsed.sections.length}`);
      }

      return parsed;
    }
  };
}
```

### Step 3: Update Upload Route

**File:** `src/routes/upload.js`

```javascript
import { extractStructuredSections } from '../ingestion/llm_extractor.js';

router.post('/pdf-structured', upload.single('file'), async (req, res) => {
  try {
    const { file } = req;
    const ownerId = req.userId;

    // Save PDF to storage
    const documentId = randomUUID();
    const pdfPath = path.join(storageDir, ownerId, `${documentId}.pdf`);
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });
    await fs.writeFile(pdfPath, file.buffer);

    console.log(`[upload/pdf-structured] Extracting sections from PDF...`);

    // Extract structured sections with LLM
    const extraction = await extractStructuredSections(pdfPath);

    console.log(`[upload/pdf-structured] Extracted ${extraction.sections.length} sections`);

    // Store in database
    await tenantHelpers.withTenant(ownerId, async (client) => {
      // Insert document
      await client.query(
        `INSERT INTO documents (id, title, pages, owner_id)
         VALUES ($1, $2, $3, $4)`,
        [documentId, extraction.title, extraction.sections.length, ownerId]
      );

      // Insert sections with markdown
      for (const section of extraction.sections) {
        await client.query(
          `INSERT INTO sections
           (owner_id, document_id, section_number, name, description,
            markdown_text, concepts_generated)
           VALUES ($1, $2, $3, $4, $5, $6, false)`,
          [
            ownerId,
            documentId,
            extraction.sections.indexOf(section) + 1,
            section.name,
            section.description,
            section.markdown  // LLM-generated markdown, properly escaped
          ]
        );
      }
    });

    res.json({
      document_id: documentId,
      title: extraction.title,
      section_count: extraction.sections.length,
      sections: extraction.sections.map((s, i) => ({
        section_number: i + 1,
        name: s.name,
        description: s.description
      }))
    });
  } catch (error) {
    console.error('[upload/pdf-structured] Error:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Step 4: Concept Generation (No Changes Needed!)

Lesson generation already uses `markdown_text`:

```javascript
// routes/study.js:370-372 (already implemented)
if (sectionData.markdown_text) {
  textToProcess = sectionData.markdown_text;
  console.log(`Using pre-split markdown: ${textToProcess.length} chars`);
}
```

## Benefits

### ✅ Single Source of Truth
- LLM does all extraction in one shot
- No multi-stage pipeline with error accumulation
- Consistent quality across all sections

### ✅ No Boundary Issues
- LLM understands document structure natively
- Sees images, formatting, layout
- Makes intelligent section decisions
- No arbitrary splits or character-based boundaries

### ✅ Faithful Conversion
- Math equations → LaTeX (LLM understands formulas)
- Tables → Markdown tables (preserves structure)
- Images → Descriptions (vision model sees them)
- Formatting → Markdown (bold, italic, headers preserved)

### ✅ Clean Separation
- Upload: Extract structured sections
- Later: Generate concepts from section markdown
- Each section is independent
- No overlapping content

### ✅ Future-Proof
- Easy to improve: just update LLM prompt
- Can add new extraction features
- Can switch to better vision models
- Can fine-tune on specific document types

## Migration Path

### Option A: Gradual (Recommended)
1. Add new `/upload/pdf-structured` endpoint
2. Keep old `/upload/pdf` for backwards compatibility
3. Frontend uses new endpoint for new uploads
4. Old documents continue working with old flow

### Option B: Full Switch
1. Implement new endpoint
2. Delete old extraction code
3. All uploads use new flow
4. Existing documents need re-upload

## Cost Considerations

**Old approach:**
- Python PDF extraction: Free (local)
- Gemini embeddings: ~$0.001 per doc
- Gemini section extraction: ~$0.002 per doc
- **Total: ~$0.003 per document**

**New approach:**
- Gemini 2.0 Flash vision: ~$0.01-0.02 per PDF
- **Total: ~$0.01-0.02 per document**

**Trade-off:** 3-7x cost increase, but:
- ✅ Dramatically better quality
- ✅ Simpler architecture
- ✅ No multi-stage errors
- ✅ Faithful content preservation
- ✅ Native vision understanding

## Next Steps

1. **Verify Gemini 2.0 Flash supports PDF input**
2. **Implement `llm_extractor.js`**
3. **Implement `gemini_vision.js`**
4. **Create new upload endpoint**
5. **Test with your 3-page PDF**
6. **Compare quality vs old approach**

Should I proceed with implementation?
