# Testing LLM-Based Structured Upload

## New Endpoint

**POST** `/upload/pdf-structured`

## What It Does

1. **Upload PDF** → Saves to storage
2. **Send to Gemini 2.0 Flash (vision)** → LLM reads the PDF
3. **LLM returns structured JSON:**
   ```json
   {
     "title": "Chapter 9: Statistics",
     "sections": [
       {
         "name": "Introduction",
         "description": "Overview of statistical concepts",
         "markdown": "# Introduction\n\nContent with **bold**, *italic*, $math$..."
       },
       {
         "name": "Core Concepts",
         "description": "Key statistical methods",
         "markdown": "# Core Concepts\n\nMore content..."
       }
     ]
   }
   ```
4. **Store in database** → Each section gets its own markdown
5. **Return response** with section metadata

## Testing with cURL

```bash
# Upload a PDF
curl -X POST http://localhost:3000/upload/pdf-structured \
  -H "x-user-id: dev-user-001" \
  -F "file=@/path/to/your.pdf"
```

## Expected Response

```json
{
  "document_id": "uuid-here",
  "title": "Chapter Title",
  "section_count": 3,
  "sections": [
    {
      "section_number": 1,
      "name": "Introduction",
      "description": "Overview of concepts",
      "markdown_length": 2847
    },
    {
      "section_number": 2,
      "name": "Core Concepts",
      "description": "Main ideas and methods",
      "markdown_length": 4562
    },
    {
      "section_number": 3,
      "name": "Applications",
      "description": "Real-world examples",
      "markdown_length": 3104
    }
  ]
}
```

## Console Logs to Watch For

### Success Path:
```
[upload/pdf-structured] Saving PDF to storage...
[upload/pdf-structured] PDF saved: /path/to/storage/dev-user-001/uuid.pdf
[upload/pdf-structured] Extracting structured sections with LLM...
[llm_extractor] Starting structured extraction from PDF
[gemini_vision] Reading PDF file: /path/to/storage/dev-user-001/uuid.pdf
[gemini_vision] PDF size: 0.45 MB
[gemini_vision] Creating vision model with schema-based generation...
[gemini_vision] Sending PDF to Gemini...
[gemini_vision] Response received in 8542ms
[gemini_vision] Response length: 12847 characters
[gemini_vision] ✅ Valid JSON response
[gemini_vision] ✅ Extracted 3 sections:
[gemini_vision]   1. "Introduction" - 2847 chars
[gemini_vision]   2. "Core Concepts" - 4562 chars
[gemini_vision]   3. "Applications" - 3104 chars
[llm_extractor] ✅ Extraction successful
[llm_extractor] Title: "Chapter 9: Statistics"
[llm_extractor] Sections: 3
[upload/pdf-structured] Extracted 3 sections
[upload/pdf-structured] Title: "Chapter 9: Statistics"
[upload/pdf-structured] Document created: uuid-here
[upload/pdf-structured] Section 1 "Introduction": 2847 chars, id=uuid-1
[upload/pdf-structured] Section 2 "Core Concepts": 4562 chars, id=uuid-2
[upload/pdf-structured] Section 3 "Applications": 3104 chars, id=uuid-3
[upload/pdf-structured] ✅ Upload complete
```

### Error: Invalid JSON
```
[gemini_vision] ❌ Invalid JSON response
[gemini_vision] First 500 chars: {title: "Chapter...
[gemini_vision] Parse error: Unexpected token...
[llm_extractor] ❌ Extraction failed: LLM returned invalid JSON
[upload/pdf-structured] ❌ Error: LLM returned invalid JSON
```

## Verifying in Database

```sql
-- Check document was created
SELECT id, title, pages FROM documents WHERE id = 'your-doc-id';

-- Check sections were created with markdown
SELECT
  section_number,
  name,
  description,
  LENGTH(markdown_text) as markdown_length
FROM sections
WHERE document_id = 'your-doc-id'
ORDER BY section_number;

-- View actual markdown content
SELECT
  section_number,
  name,
  SUBSTRING(markdown_text, 1, 500) as markdown_preview
FROM sections
WHERE document_id = 'your-doc-id'
ORDER BY section_number;
```

## Next Steps After Upload

1. **Verify sections exist:**
   ```bash
   curl http://localhost:3000/sections?document_id=your-doc-id \
     -H "x-user-id: dev-user-001"
   ```

2. **Generate concepts for a section:**
   ```bash
   curl -X POST http://localhost:3000/lessons/generate \
     -H "x-user-id: dev-user-001" \
     -H "Content-Type: application/json" \
     -d '{
       "document_id": "your-doc-id",
       "section_id": "section-id-from-above"
     }'
   ```

3. **Check concepts were generated:**
   ```bash
   curl http://localhost:3000/concepts?document_id=your-doc-id \
     -H "x-user-id: dev-user-001"
   ```

## Troubleshooting

### Issue: "GEMINI_API_KEY is required"
**Solution:** Set environment variable:
```bash
export GEMINI_API_KEY=your-key-here
npm run dev
```

### Issue: "LLM returned invalid JSON"
**Causes:**
1. Markdown not properly escaped (shouldn't happen with responseSchema)
2. Model returned text instead of JSON
3. Response too large and truncated

**Debug:**
- Check console logs for actual response
- Verify using `gemini-2.0-flash-exp` model
- Check `responseSchema` is being used

### Issue: Section count wrong (e.g., 1 section when expecting 2)
**Causes:**
1. PDF doesn't have clear section markers
2. LLM decided to group everything together

**Solution:**
- Check PDF has visual section breaks
- Adjust prompt to emphasize section count
- May need to improve prompt guidance

### Issue: Markdown missing formatting
**Causes:**
1. PDF doesn't have formatted text
2. LLM not preserving formatting

**Solution:**
- Verify PDF has bold/italic/headers
- Check prompt emphasizes formatting preservation
- Try different PDF

## Cost Estimate

**Gemini 2.0 Flash (vision) pricing:**
- ~$0.01-0.02 per PDF (varies by size)

**For a 3-page PDF:**
- Input tokens: ~5,000 (PDF + prompt)
- Output tokens: ~3,000 (markdown for 3 sections)
- **Total: ~$0.015 per upload**

## Benefits vs Old Approach

### Old (Python extraction):
- ❌ Multi-stage pipeline
- ❌ Lost formatting information
- ❌ Complex boundary detection
- ❌ Overlapping sections
- ✅ Free (local processing)

### New (LLM vision):
- ✅ Single call, structured output
- ✅ Preserves all formatting
- ✅ Intelligent section detection
- ✅ Clean boundaries, no overlap
- ❌ ~$0.015 per PDF

**Trade-off:** Small cost for dramatically better quality and simpler architecture.
