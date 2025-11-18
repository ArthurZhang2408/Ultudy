# Backend Utility Scripts

**Last Updated:** 2025-01-18

This directory contains utility scripts for development, testing, and maintenance.

---

## Categories

1. **Database Utilities** - Schema management and cache clearing
2. **PDF Extraction Scripts** - Testing and comparing PDF extraction methods

---

## Database Utilities

### `dump-schema.cjs` - Database Schema Dump
**Usage**: `node scripts/dump-schema.cjs`

**What it does**: Exports complete database schema including:
- All table structures (columns, types, constraints)
- Primary keys and foreign keys
- Indexes and unique constraints
- Row counts for each table

**When to use**:
- Before making schema changes (backup)
- Documenting current database structure
- Comparing local vs production schemas
- Troubleshooting migration issues

**Environment**: Reads `DATABASE_URL` from environment variables

---

### `clear-cached-lessons.js` - Clear Cached Lessons
**Usage**: `node scripts/clear-cached-lessons.js [--all] [--section-only]`

**What it does**: Clears cached lessons from database to force clean regeneration

**Options**:
- `--all` - Clear ALL lessons (document-level and section-level)
- `--section-only` - Clear only section-scoped lessons (default)

**When to use**:
- After changing lesson generation pipeline
- When cached lessons are corrupted
- Testing lesson generation changes
- Debugging lesson quality issues

**Safety**: 3-second delay before deletion with cancel option

---

## PDF Extraction Scripts

This section contains scripts for extracting content from PDFs with different approaches.

## Quick Start

### Test Your PDF

```bash
# Quick test (text-only vs deterministic)
./test_rich_extraction.sh /path/to/your/document.pdf

# Detailed comparison (text vs deterministic vs vision)
python3 compare_extraction.py /path/to/your/document.pdf
```

## Scripts

### `extract_text.py` - Text-Only (Current)
**Usage**: `python3 extract_text.py document.pdf`

**What it does**: Extracts plain text from PDF
**Speed**: Very fast (<0.1s/page)
**Cost**: Free
**Output**: JSON with pages containing text only

**Problem**: Loses structure (tables become flat text, formulas unreadable)

---

### `extract_text_deterministic.py` - Deterministic (Recommended)
**Usage**: `python3 extract_text_deterministic.py document.pdf`

**What it does**: Extracts structured content using specialized libraries:
- Tables → pdfplumber/camelot (structured headers + rows)
- Images → PyMuPDF (original image data)
- Formulas → Pix2Text (LaTeX notation)
- Code → Pygments (language detection)

**Speed**: Fast (0.1-0.6s/page)
**Cost**: Free
**Output**: JSON with pages + tables + images + formulas + code_blocks

**Benefits**: Preserves structure, free, fast, deterministic

**Dependencies**:
```bash
pip3 install pdfplumber pygments

# Optional (for formula extraction):
pip3 install pix2text
```

---

### `extract_text_vision.py` - Vision-Based (Deprecated)
**Usage**: `python3 extract_text_vision.py document.pdf`

**What it does**: Uses Gemini Vision AI to extract all content
**Speed**: Slow (1-2s/page)
**Cost**: $0.004/page ($0.24 per 60-page doc)
**Output**: JSON with pages containing text + tables + images + formulas + code_blocks

**Why deprecated**: Using AI for structure parsing is wasteful. AI should be reserved for semantic understanding (lesson generation), not deterministic structure extraction.

**Dependencies**:
```bash
pip3 install google-generativeai
export GEMINI_API_KEY="your-key"
```

---

### `compare_extraction.py` - Comparison Tool
**Usage**: `python3 compare_extraction.py document.pdf`

**What it does**: Runs all three extraction methods and provides:
- Page counts
- Rich content counts (tables, images, formulas, code)
- Performance comparison (speed, cost)
- Sample extracted content
- Recommendations

**Output**: Detailed report showing which approach is best for your document

---

### `test_rich_extraction.sh` - Quick Test Script
**Usage**: `./test_rich_extraction.sh document.pdf`

**What it does**:
1. Checks dependencies
2. Runs text-only extraction
3. Runs deterministic extraction
4. Shows basic comparison

**Best for**: Quick validation without running full comparison

---

## Recommended Workflow

1. **Test with your documents**
   ```bash
   ./test_rich_extraction.sh ~/Documents/textbook.pdf
   ```

2. **Review the output**
   - Are tables extracted correctly?
   - Are images found?
   - Are formulas recognized?

3. **Run detailed comparison if needed**
   ```bash
   python3 compare_extraction.py ~/Documents/textbook.pdf
   ```

4. **Check the JSON output**
   ```bash
   cat /tmp/deterministic_result.json | jq '.summary'
   ```

## Output Format

### Text-Only
```json
{
  "pages": [
    {
      "page": 1,
      "text": "Protocol Port HTTP 80 HTTPS 443..."
    }
  ]
}
```

### Deterministic
```json
{
  "pages": [
    {
      "page": 1,
      "text": "Network Protocols..."
    }
  ],
  "tables": [
    {
      "page": 1,
      "headers": ["Protocol", "Port"],
      "rows": [["HTTP", "80"], ["HTTPS", "443"]],
      "extraction_method": "pdfplumber"
    }
  ],
  "images": [
    {
      "page": 2,
      "format": "png",
      "width": 800,
      "height": 600
    }
  ],
  "formulas": [
    {
      "page": 3,
      "latex": "E = mc^{2}"
    }
  ],
  "code_blocks": [
    {
      "page": 5,
      "language": "python",
      "code": "def hello():\n    print('Hello')"
    }
  ],
  "summary": {
    "total_pages": 10,
    "total_tables": 3,
    "total_images": 2,
    "total_formulas": 5,
    "total_code_blocks": 1
  }
}
```

## Performance Comparison

| Feature | Text-Only | Deterministic | Vision |
|---------|-----------|---------------|--------|
| **Speed** | <0.1s/page | 0.1-0.6s/page | 1-2s/page |
| **Cost** | $0 | $0 | $0.004/page |
| **Tables** | Lost | ✅ Preserved | ✅ Preserved |
| **Images** | Ignored | ✅ Extracted | ✅ Extracted + described |
| **Formulas** | Lost | ✅ LaTeX | ✅ LaTeX |
| **Code** | As text | ✅ Detected | ✅ Detected |
| **Offline** | ✅ Yes | ✅ Yes | ❌ No |

## Troubleshooting

### "ModuleNotFoundError: No module named 'pdfplumber'"
```bash
pip3 install pdfplumber
```

### "No tables detected" (but PDF has tables)
Try installing Camelot as fallback:
```bash
pip3 install camelot-py[cv]
brew install ghostscript  # macOS
```

### "Permission denied: ./test_rich_extraction.sh"
```bash
chmod +x test_rich_extraction.sh
```

### "Formula extraction failed"
Formulas are optional. Install pix2text if needed:
```bash
pip3 install pix2text
```

## Next Steps

See the project documentation:
- `DETERMINISTIC_PDF_EXTRACTION.md` - Full design document
- `TESTING_DETERMINISTIC_EXTRACTION.md` - Comprehensive testing guide

---

## Architecture Recommendation

**Proper approach**:
1. Use **deterministic extraction** (pdfplumber, PyMuPDF, etc.) to parse PDF structure
2. Store structured data in database
3. Use **AI (Gemini)** for semantic understanding and lesson generation

**Wrong approach**:
1. ❌ Use AI to parse structure (wasteful, slow, expensive)
2. ❌ Feed raw images to vision models for table extraction
3. ❌ Pay for AI to do deterministic work

**The right tool for the right job**:
- Specialized parsers → Structure
- AI → Semantics

This is how production systems work (Adobe, DocuSign, etc.)
