# Rich Content Extraction for PDF Processing

## Current Status

### What We Extract Today

Currently, Ultudy uses **text-only extraction** from PDFs via PyMuPDF:

```python
# backend/scripts/extract_text.py (line 15)
text = page.get_text("text")
```

This approach has **critical limitations**:

#### ✅ What Gets Extracted:
- Plain text paragraphs
- Table cell contents (but as flat text, no structure)
- Text in headers/footers
- Figure captions
- Text annotations

#### ❌ What Gets Lost:
1. **Images** - Diagrams, charts, screenshots completely ignored
2. **Table structure** - Rows/columns/relationships lost
3. **Mathematical formulas** - May be garbled or incomplete
4. **Layout information** - Multi-column layouts may interleave incorrectly
5. **Visual relationships** - Connections between text and diagrams lost

### Real-World Impact

**Example: Table Extraction Issue**

Original PDF:
```
┌────────────┬─────────────────┐
│ Protocol   │ Port Number     │
├────────────┼─────────────────┤
│ HTTP       │ 80              │
│ HTTPS      │ 443             │
│ SSH        │ 22              │
└────────────┴─────────────────┘
```

Currently extracted as:
```
Protocol Port Number HTTP 80 HTTPS 443 SSH 22
```

**Problem**: The LLM sees this as a jumbled sentence, not a structured table. It can infer the structure, but it's unreliable and loses semantic meaning.

---

## Problem Statement

Educational PDFs are **highly visual documents** with:
- **Tables**: Comparison charts, data tables, lookup tables
- **Diagrams**: Network topologies, system architectures, flowcharts
- **Formulas**: Mathematical equations, chemical formulas
- **Code snippets**: With syntax highlighting and structure
- **Graphs**: Data visualizations, plots, charts

**Current text-only extraction fundamentally cannot capture this information**, leading to:
1. **Incomplete lessons** - Missing key visual concepts
2. **Misunderstood tables** - Data relationships lost
3. **Garbled formulas** - Math notation corrupted
4. **Poor concept extraction** - Visual learning aids ignored

---

## Desired Solution

### Goal
**Process PDFs as multimodal documents**, preserving all visual and structural information so the LLM can:
1. See tables as tables (with proper structure)
2. View images, diagrams, and charts visually
3. Understand mathematical formulas in their proper notation
4. Recognize code blocks with syntax
5. Understand layout-dependent content (multi-column, sidebars)

### Success Criteria
- [ ] Tables extracted with full structure (rows, columns, headers)
- [ ] Images embedded in lesson content with descriptions
- [ ] Mathematical formulas preserved accurately
- [ ] Diagrams analyzed and described by LLM
- [ ] Section extraction no longer confused by table cells
- [ ] Concepts reference visual elements when relevant

---

## Proposed Approaches

### Option 1: Enhanced PyMuPDF Extraction (Structured Text)

**Approach**: Use PyMuPDF's structured extraction mode instead of text-only.

```python
# Instead of:
text = page.get_text("text")

# Use:
blocks = page.get_text("dict")  # Returns structured data
```

**What This Provides**:
- Block-level structure (paragraphs, tables, images)
- Bounding box coordinates for layout
- Font information (for detecting headings)
- Image extraction with positioning
- Table detection (but not perfect parsing)

**Pros**:
- ✅ No additional API costs
- ✅ Fast processing
- ✅ Works offline
- ✅ Preserves document structure
- ✅ Can extract embedded images

**Cons**:
- ❌ Table parsing not always accurate
- ❌ Still text-only for formulas (no visual rendering)
- ❌ Requires complex parsing logic
- ❌ Image interpretation still needed (no AI analysis)

**Implementation Complexity**: Medium
**Estimated Cost**: $0 (no API calls)

---

### Option 2: Gemini Vision API (Multimodal)

**Approach**: Convert each PDF page to an image and send to Gemini Vision for multimodal processing.

```python
# Convert page to image
pixmap = page.get_pixmap(dpi=150)
image_bytes = pixmap.tobytes("png")

# Send to Gemini Vision
response = gemini_vision.generate_content([
    "Extract all content including tables, images, and formulas",
    Image(image_bytes)
])
```

**What This Provides**:
- Full visual understanding of page layout
- Accurate table recognition and parsing
- Mathematical formula recognition (via OCR + understanding)
- Image description and analysis
- Proper multi-column layout handling
- Chart and diagram interpretation

**Pros**:
- ✅ Sees exactly what humans see
- ✅ Best table extraction accuracy
- ✅ Understands visual relationships
- ✅ Can describe diagrams and charts
- ✅ Recognizes mathematical notation visually
- ✅ Handles complex layouts perfectly

**Cons**:
- ❌ Higher API costs (image tokens are expensive)
- ❌ Slower processing (vision models are slower)
- ❌ Requires internet connection
- ❌ May have rate limits

**Cost Estimation** (Gemini 2.0 Flash pricing):
- 150 DPI page image: ~300KB = ~1,500 vision tokens
- 60-page document: 90,000 vision tokens = ~$0.004/page
- **Total for 60-page doc: ~$0.24** (vs $0.01 for text-only)

**Implementation Complexity**: Low
**Estimated Cost**: ~$0.004 per page

---

### Option 3: Hybrid Approach (Structured Text + Vision for Rich Elements)

**Approach**: Use structured PyMuPDF extraction as default, but invoke Gemini Vision only for pages with:
- Complex tables
- Diagrams/images
- Mathematical formulas
- Multi-column layouts

```python
# 1. Extract structured data
blocks = page.get_text("dict")

# 2. Detect rich content
has_tables = detect_tables(blocks)
has_images = detect_images(blocks)
has_formulas = detect_formulas(blocks)

# 3. Use vision only when needed
if has_tables or has_images or has_formulas:
    page_image = page.get_pixmap()
    vision_result = gemini_vision.analyze(page_image)
else:
    # Use text extraction for plain text pages
    text_result = extract_text(blocks)
```

**Pros**:
- ✅ Best of both worlds
- ✅ Cost-effective (vision only when needed)
- ✅ Fast for text-heavy pages
- ✅ Accurate for rich content
- ✅ Scales well for large documents

**Cons**:
- ❌ More complex implementation
- ❌ Heuristics needed to detect rich content
- ❌ Still has some API costs

**Cost Estimation**:
- Assume 30% of pages have rich content
- 60-page doc: 18 pages × $0.004 = **$0.07**
- Remaining 42 pages: text-only (negligible cost)

**Implementation Complexity**: High
**Estimated Cost**: ~30% of Option 2

---

## Recommended Approach

### Phase 1: Option 2 (Gemini Vision) - MVP
**Start with full vision-based extraction** because:
1. **Simplest implementation** - Single extraction path
2. **Best accuracy** - No heuristics needed
3. **Proves value** - Demonstrates benefit before optimization
4. **Acceptable cost** - ~$0.24 per 60-page doc is reasonable for MVP

### Phase 2: Option 3 (Hybrid) - Optimization
**Optimize with hybrid approach** after proving value:
1. Add rich content detection heuristics
2. Fall back to structured text for plain pages
3. Reduce costs by ~70% while maintaining quality

### Phase 3: Enhanced Features
**Build on multimodal foundation**:
1. Interactive diagrams in lessons
2. Image-based quiz questions
3. Formula rendering and interactive exploration
4. Visual concept maps

---

## Implementation Plan

### Milestone 1: Vision-Based PDF Extraction
**Goal**: Replace text-only extraction with Gemini Vision

**Tasks**:
1. Update `extract_text.py` to convert pages to images
2. Integrate Gemini Vision API
3. Parse structured vision output (tables, images, formulas)
4. Update document storage schema for rich content
5. Add fallback to text-only if vision fails

**Deliverable**: PDFs processed with full visual understanding

**Estimated Time**: 1-2 weeks
**Estimated Cost Impact**: +$0.20-0.30 per document upload

---

### Milestone 2: Rich Content in Lessons
**Goal**: Display tables, images, and formulas in generated lessons

**Tasks**:
1. Update lesson generation prompts to reference visual content
2. Store extracted images with lessons
3. Render tables as HTML in frontend
4. Display mathematical formulas with MathJax/KaTeX
5. Show embedded diagrams in concept explanations

**Deliverable**: Lessons include tables, images, and formulas

**Estimated Time**: 1-2 weeks

---

### Milestone 3: Hybrid Optimization (Optional)
**Goal**: Reduce API costs while maintaining quality

**Tasks**:
1. Implement rich content detection heuristics
2. Add structured text extraction fallback
3. Benchmark accuracy vs cost tradeoffs
4. Add configuration for vision/text preference

**Deliverable**: 70% cost reduction with minimal quality loss

**Estimated Time**: 1 week

---

## Technical Architecture

### Current Flow
```
PDF File
  ↓
PyMuPDF (text mode)
  ↓
Plain text strings
  ↓
documents.full_text
  ↓
Gemini (text model)
  ↓
Lessons (text-only)
```

### Proposed Flow (Vision-Based)
```
PDF File
  ↓
PyMuPDF (render pages as images)
  ↓
Page images (PNG, 150 DPI)
  ↓
Gemini Vision API
  ↓
Structured content:
  - Text blocks
  - Tables (with structure)
  - Images (with descriptions)
  - Formulas (as LaTeX)
  ↓
documents.full_text (enriched with metadata)
documents.rich_content (JSON: tables, images, formulas)
  ↓
Gemini (multimodal model)
  ↓
Lessons with rich content:
  - Table references
  - Image embeddings
  - Formula rendering
```

---

## Database Schema Changes

### New Fields for `documents` Table
```sql
ALTER TABLE documents ADD COLUMN rich_content JSONB;
ALTER TABLE documents ADD COLUMN extraction_mode VARCHAR(20) DEFAULT 'text';
```

**Schema Example**:
```json
{
  "tables": [
    {
      "page": 5,
      "rows": [...],
      "headers": ["Protocol", "Port"],
      "caption": "Common network protocols"
    }
  ],
  "images": [
    {
      "page": 7,
      "url": "/storage/img_doc123_p7.png",
      "description": "Network topology diagram",
      "width": 600,
      "height": 400
    }
  ],
  "formulas": [
    {
      "page": 12,
      "latex": "E = mc^2",
      "context": "Einstein's mass-energy equivalence"
    }
  ]
}
```

### New Fields for `lessons` Table
```sql
ALTER TABLE lessons ADD COLUMN rich_elements JSONB;
```

**Schema Example**:
```json
{
  "referenced_tables": ["table_page5_0"],
  "referenced_images": ["img_page7_0"],
  "referenced_formulas": ["formula_page12_0"]
}
```

---

## API Changes

### New Environment Variables
```bash
# Enable vision-based extraction
ENABLE_VISION_EXTRACTION=true

# Gemini Vision model
GEMINI_VISION_MODEL=gemini-2.0-flash-exp

# Image quality (DPI)
PDF_IMAGE_DPI=150

# Fallback to text if vision fails
VISION_FALLBACK_TO_TEXT=true
```

### Updated Ingestion Response
```json
{
  "documentId": "abc-123",
  "pageCount": 60,
  "extractionMode": "vision",
  "richContent": {
    "tablesExtracted": 12,
    "imagesExtracted": 8,
    "formulasExtracted": 24
  },
  "cost": {
    "visionTokens": 90000,
    "estimatedCost": "$0.24"
  }
}
```

---

## Risks & Mitigation

### Risk 1: High API Costs
**Impact**: Vision tokens are 10-20x more expensive than text tokens

**Mitigation**:
- Phase 2 hybrid approach reduces costs by 70%
- Add cost warnings in UI before upload
- Allow users to choose text-only for cost savings
- Cache vision results aggressively

### Risk 2: Slower Processing
**Impact**: Vision models take 2-3x longer than text extraction

**Mitigation**:
- Process pages in parallel (batch API calls)
- Show progressive upload status
- Add queue system for large documents
- Pre-process during off-peak hours

### Risk 3: Vision API Failures
**Impact**: Extraction fails if API is unavailable

**Mitigation**:
- Automatic fallback to text-only mode
- Retry logic with exponential backoff
- Store raw page images for re-processing
- Add manual re-extract button in UI

### Risk 4: Storage Requirements
**Impact**: Storing images increases storage needs

**Mitigation**:
- Compress images before storage (WebP format)
- Delete images after successful extraction
- Option to re-extract on demand
- S3/cloud storage for large deployments

---

## Success Metrics

### Quantitative
- [ ] Table extraction accuracy: >95%
- [ ] Image descriptions relevance: >90% (manual review)
- [ ] Formula recognition accuracy: >98%
- [ ] Section extraction false positive rate: <5%
- [ ] Processing time increase: <3x
- [ ] Cost per document: <$0.30

### Qualitative
- [ ] Lessons include visual elements naturally
- [ ] Users can understand concepts without referring to original PDF
- [ ] Complex topics (networking, math, chemistry) well-explained
- [ ] Tables rendered in readable format
- [ ] Formulas display correctly

---

## Alternative Considerations

### Specialized Tools
- **Camelot-py / Tabula**: Table extraction only
- **MathPix**: Formula OCR (paid service)
- **AWS Textract**: Document analysis (expensive)
- **Azure Document Intelligence**: Similar to Textract

**Verdict**: Gemini Vision provides the most comprehensive solution at competitive pricing.

---

## Next Steps

1. **Create proof-of-concept** - Test Gemini Vision on sample PDFs
2. **Benchmark accuracy** - Compare table/formula extraction quality
3. **Estimate real costs** - Run on representative documents
4. **Design rich content UI** - Mockups for displaying tables/images
5. **Implement Milestone 1** - Replace text extraction with vision

---

## References

- [PyMuPDF Documentation](https://pymupdf.readthedocs.io/)
- [Gemini Vision API](https://ai.google.dev/gemini-api/docs/vision)
- [Gemini Pricing](https://ai.google.dev/pricing)
- Previous work: `MULTI_LAYER_LESSON_ARCHITECTURE.md`
