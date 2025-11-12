# PDF Extraction Mode Guide

This guide explains how to switch between different PDF extraction modes in Ultudy.

## Overview

Ultudy supports three PDF extraction modes, each with different capabilities:

| Mode | Description | Use Case | Dependencies |
|------|-------------|----------|--------------|
| **enhanced** | Deterministic extraction with rich content (tables, formulas, code, images) converted to Markdown | Best accuracy, preserves structure, native page ranges | Python + PyMuPDF, pdfplumber, pix2text |
| **auto** (default) | Tries Python extractor, falls back to pdf-parse | Balanced approach with fallback | Python (optional) |
| **standard** | Simple pdf-parse extraction | Fast, minimal dependencies | None (uses npm packages only) |

## Quick Start

### Switch to Enhanced Mode (Recommended)

1. **Set environment variable** in your `.env` file:
   ```bash
   PDF_EXTRACTION_MODE=enhanced
   ```

2. **Install Python dependencies** (if not already installed):
   ```bash
   cd backend
   pip install PyMuPDF pdfplumber pix2text pygments pillow
   ```

3. **Restart your backend server**:
   ```bash
   npm run dev
   ```

4. **Upload a PDF** - it will now use enhanced extraction with:
   - Native page boundaries (no calculation needed!)
   - Tables extracted as Markdown
   - Mathematical formulas as LaTeX
   - Code blocks with language detection
   - Image references with bounding boxes

### Switch to Standard Mode

1. **Set environment variable**:
   ```bash
   PDF_EXTRACTION_MODE=standard
   ```

2. **Restart backend** - no additional dependencies needed

### Use Default Auto Mode

1. **Remove or comment out** the environment variable:
   ```bash
   # PDF_EXTRACTION_MODE=enhanced
   ```

2. **Restart backend**

## How It Works

### Enhanced Mode Architecture

```
PDF File
  ↓
extract_text_deterministic.py
  ↓
Structured JSON (pages, tables, formulas, code, images)
  ↓
markdown_converter.py (optional)
  ↓
Rich Markdown with native page boundaries
  ↓
Section-based lesson generation with accurate page ranges
```

### Key Benefits of Enhanced Mode

#### 1. **Native Page Range Support**

**Problem with current approach:**
```javascript
// Current: Calculates character positions (inaccurate)
const charsPerPage = Math.floor(fullText.length / estimatedPages);
const startChar = (page_start - 1) * charsPerPage;
```

**Enhanced mode solution:**
```javascript
// Enhanced: Uses actual page boundaries from PDF
const pages = extractTextWithDeterministic(filePath);
const sectionPages = pages.filter(p => p.page >= page_start && p.page <= page_end);
```

#### 2. **Rich Content Preservation**

Enhanced mode extracts and preserves:
- **Tables**: Converted to Markdown tables with headers
- **Formulas**: LaTeX notation (inline `$...$` and display `$$...$$`)
- **Code blocks**: With language detection
- **Images**: References with bounding boxes

Example output:
```markdown
## Page 5

### Network Protocol Layers

| Layer | Protocol | Function |
| ----- | -------- | -------- |
| Application | HTTP | Web communication |
| Transport | TCP | Reliable delivery |

The bandwidth-delay product is calculated as:

$$BDP = Bandwidth \times RTT$$

where $RTT$ is the round-trip time in seconds.
```

#### 3. **Better Section Extraction**

When generating lessons for a specific section:

**Before (calculated ranges):**
- Estimates character positions
- May include content from adjacent sections
- Loses formatting and structure

**After (native page ranges):**
- Exact page boundaries from PDF
- Only includes content within section's page range
- Preserves all rich content (tables, formulas, etc.)

## Configuration Options

### Environment Variables

Add these to your `.env` file in the `backend/` directory:

```bash
# PDF Extraction Mode
# Options: 'enhanced', 'auto', 'standard'
PDF_EXTRACTION_MODE=enhanced

# Skip embeddings generation (useful during development)
SKIP_EMBEDDINGS=true

# Python command (if using non-default Python installation)
PYTHON_COMMAND=python3
```

### Testing Different Modes

You can test extraction modes without changing `.env`:

```bash
# Test enhanced mode
PDF_EXTRACTION_MODE=enhanced npm run dev

# Test standard mode
PDF_EXTRACTION_MODE=standard npm run dev

# Test auto mode (default)
npm run dev
```

## Switching Between Modes

### Scenario 1: Development (Fast Iteration)

Use **standard** mode for fastest uploads:
```bash
PDF_EXTRACTION_MODE=standard
SKIP_EMBEDDINGS=true
```

### Scenario 2: Production (Best Quality)

Use **enhanced** mode for accurate extraction:
```bash
PDF_EXTRACTION_MODE=enhanced
SKIP_EMBEDDINGS=false
```

### Scenario 3: Minimal Dependencies

Use **auto** mode (default) with pdf-parse fallback:
```bash
# No PDF_EXTRACTION_MODE set
SKIP_EMBEDDINGS=true
```

## Implementation Details

### Files Modified

1. **`src/ingestion/extractor-enhanced.js`** (NEW)
   - Enhanced PDF extraction using deterministic pipeline
   - Native page range extraction
   - Full content extraction with rich media

2. **`src/ingestion/extractor.js`** (UPDATED)
   - Added mode switching logic
   - Integrates enhanced extractor
   - Maintains backward compatibility

3. **`src/ingestion/markdown_converter.py`** (EXISTING)
   - Converts structured extraction to Markdown
   - Preserves tables, formulas, code blocks
   - Maintains page boundaries

4. **`scripts/extract_text_deterministic.py`** (EXISTING)
   - Deterministic PDF extraction
   - Uses pdfplumber, PyMuPDF, pix2text
   - Returns structured JSON

### Code Example: Using Enhanced Extraction

```javascript
import { extractPageRange } from './ingestion/extractor.js';

// Extract pages 5-10 from a PDF
const text = await extractPageRange(pdfPath, 5, 10);
console.log(`Extracted ${text.length} characters from pages 5-10`);
```

### Code Example: Section-Based Lesson Generation

```javascript
// In lesson generation endpoint
if (section_id) {
  // Load section metadata (includes page_start, page_end)
  const section = await loadSection(section_id);

  // With enhanced mode, this uses native page boundaries
  const sectionText = extractSectionText(
    document.full_text,
    section,
    allSections,
    document.pages
  );

  // Generate lesson only from section content
  const lesson = await generateLesson(sectionText);
}
```

## Troubleshooting

### Enhanced mode not working

**Symptom:** Backend falls back to standard mode even with `PDF_EXTRACTION_MODE=enhanced`

**Solutions:**
1. Check Python dependencies are installed:
   ```bash
   python3 -c "import fitz, pdfplumber; print('OK')"
   ```

2. Check script exists:
   ```bash
   ls backend/scripts/extract_text_deterministic.py
   ```

3. Check logs for error messages:
   ```bash
   npm run dev
   # Look for: [extractor] Enhanced extraction failed
   ```

### Python dependencies failing to install

**Symptom:** `pip install pix2text` fails

**Solutions:**
1. Try installing without pix2text (formula extraction will be skipped):
   ```bash
   pip install PyMuPDF pdfplumber pygments pillow
   ```

2. Or use conda:
   ```bash
   conda install -c conda-forge pymupdf pdfplumber
   ```

### Performance issues

**Symptom:** PDF uploads are slow

**Solutions:**
1. Skip embeddings during development:
   ```bash
   SKIP_EMBEDDINGS=true
   ```

2. Use standard mode for faster extraction:
   ```bash
   PDF_EXTRACTION_MODE=standard
   ```

## Comparison: Before vs After

### Before (Calculated Page Ranges)

```javascript
// Estimate character positions
const charsPerPage = fullText.length / totalPages;
const startChar = (page_start - 1) * charsPerPage;
const endChar = page_end * charsPerPage;
const sectionText = fullText.substring(startChar, endChar);
```

**Issues:**
- ❌ Inaccurate when pages have varying content density
- ❌ May include content from adjacent sections
- ❌ Loses all formatting and rich content
- ❌ No awareness of actual page boundaries

### After (Native Page Ranges with Enhanced Mode)

```javascript
// Use actual page objects from PDF
const pages = await extractTextWithDeterministic(pdfPath);
const sectionPages = pages.filter(
  p => p.page >= page_start && p.page <= page_end
);
const sectionText = sectionPages.map(p => p.text).join('\n\n');
```

**Benefits:**
- ✅ Exact page boundaries from PDF structure
- ✅ Only includes content within specified pages
- ✅ Preserves tables, formulas, code blocks as Markdown
- ✅ No calculation or estimation needed

## Next Steps

1. **Enable enhanced mode** in your `.env` file
2. **Install Python dependencies** (if needed)
3. **Upload a test PDF** with tables, formulas, or code
4. **Compare results** between standard and enhanced modes
5. **Check concept generation** for improved accuracy

## References

- **Markdown Converter Documentation**: `src/ingestion/markdown_converter.py`
- **Deterministic Extraction**: `scripts/extract_text_deterministic.py`
- **Section Service**: `src/study/section.service.js`
- **Lesson Generation**: `src/routes/study.js` (lines 272-438)

---

**Questions or Issues?**

Check the console logs for detailed extraction information:
- `[extractor] Using PDF extraction mode: enhanced`
- `[extractor-enhanced] Extracted N pages with rich content`
- `[extractSectionText] Using page numbers: pages X-Y`
