# Backend Utility Scripts

This directory contains active utility scripts for the backend service.

**Note:** Demo, test, and deprecated scripts have been moved to `/docs/archived-scripts/`

## PDF Extraction Scripts (Active)

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

## Database Utility Scripts

### `check-ivfflat-support.js` - Check pgvector Index Support
**Usage**: `node scripts/check-ivfflat-support.js`

**What it does**: Checks if your PostgreSQL database supports IVFFlat indexes for pgvector

### `clear-cached-lessons.js` - Clear Redis Lesson Cache
**Usage**: `node scripts/clear-cached-lessons.js`

**What it does**: Clears all cached lesson data from Redis

---

## Archived Scripts

The following scripts have been moved to `/docs/archived-scripts/`:
- Demo scripts (`demo_improvements.sh`, `demo_phase3.py`, etc.)
- Test scripts (`test_rich_extraction.sh`, `compare_extraction.py`, etc.)
- Deprecated extraction (`extract_text_vision.py`)
- Database setup scripts (superseded by migrations)

See `/docs/archived-scripts/README.md` for more information.

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

| Feature | Text-Only | Deterministic |
|---------|-----------|---------------|
| **Speed** | <0.1s/page | 0.1-0.6s/page |
| **Cost** | $0 | $0 |
| **Tables** | Lost | ✅ Preserved |
| **Images** | Ignored | ✅ Extracted |
| **Formulas** | Lost | ✅ LaTeX |
| **Code** | As text | ✅ Detected |
| **Offline** | ✅ Yes | ✅ Yes |

**Note:** Vision-based extraction has been deprecated. See `/docs/archived-scripts/` for historical reference.

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
