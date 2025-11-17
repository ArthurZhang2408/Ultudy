# Testing Deterministic PDF Extraction

This guide shows you how to test the deterministic extraction approach and compare it with text-only extraction.

## Quick Start

### 1. Install Dependencies

```bash
cd backend
pip3 install pdfplumber pygments

# Optional (for formula extraction):
pip3 install pix2text
```

### 2. Run the Test Script

```bash
cd backend/scripts
./test_rich_extraction.sh /path/to/your/document.pdf
```

This will:
- Extract text using current text-only method
- Extract tables, images, formulas, and code using deterministic libraries
- Show you a comparison of what was found

### 3. For Detailed Comparison

```bash
python3 compare_extraction.py /path/to/your/document.pdf
```

This runs a three-way comparison:
1. Text-only (current)
2. Deterministic (recommended)
3. Vision-based (deprecated, requires API key)

---

## What to Expect

### Text-Only Extraction (Current)

**Example output:**
```
Protocol Port Number HTTP 80 HTTPS 443 SSH 22
```

**Problem**: Structure is lost - can't tell which port goes with which protocol.

### Deterministic Extraction (New)

**Example output:**
```json
{
  "tables": [
    {
      "page": 1,
      "headers": ["Protocol", "Port Number"],
      "rows": [
        ["HTTP", "80"],
        ["HTTPS", "443"],
        ["SSH", "22"]
      ],
      "extraction_method": "pdfplumber"
    }
  ]
}
```

**Benefit**: Structure preserved, headers identified, ready for lesson generation.

---

## Testing Output

The test script will show:

```
🔬 Rich Content Extraction Test
================================

📄 PDF: /path/to/document.pdf

🔍 Checking dependencies...
✅ PyMuPDF installed
✅ pdfplumber installed (table extraction)
⚠️  pix2text not installed (formula extraction will be skipped)
✅ pygments installed (code detection)

================================

1️⃣  Testing TEXT-ONLY extraction...
✅ Text extraction succeeded: 10 pages

Sample (first 200 chars of page 1):
   Network Protocols This chapter covers common networking protocols...

2️⃣  Testing DETERMINISTIC extraction...
   (Free, fast, structure-preserving)

✅ Deterministic extraction succeeded: 10 pages

📊 Rich content detected:
   - Tables: 3
   - Images: 2
   - Formulas: 0
   - Code blocks: 1

Sample table (first found):
   Page: 1
   Method: pdfplumber
   Headers: ['Protocol', 'Port Number', 'Description']
   Rows: 5 x 3

================================
✅ Basic testing complete!

Results saved to:
  - Text-only: /tmp/text_result.json
  - Deterministic: /tmp/deterministic_result.json

💡 For detailed three-way comparison (text vs deterministic vs vision):
   python3 compare_extraction.py "/path/to/document.pdf"
```

---

## Detailed Comparison Output

When you run `compare_extraction.py`, you'll see:

```
================================================================================
EXTRACTION COMPARISON: Text-Only vs Deterministic vs Vision-Based
================================================================================

1️⃣  Running text-only extraction...
   ✅ Text-only complete

2️⃣  Running deterministic extraction...
   ✅ Deterministic complete

3️⃣  Running vision-based extraction (may take longer)...
   ✅ Vision complete

================================================================================
RESULTS SUMMARY
================================================================================

Document: /path/to/document.pdf

Pages extracted:
  - Text-only: 10
  - Deterministic: 10
  - Vision: 10

📊 Rich Content Detected:
--------------------------------------------------------------------------------

Content Type              Deterministic   Vision
-------------------------------------------------------
Tables                    3               3
Images                    2               2
Formulas                  0               0
Code Blocks               1               1
-------------------------------------------------------
TOTAL                     6               6

💰 Performance & Cost Comparison:
--------------------------------------------------------------------------------

Metric                         Text-Only       Deterministic   Vision
---------------------------------------------------------------------------
Speed (est.)                   <0.1s/page      0.1-0.6s/page   1-2s/page
Cost per page                  $0.00           $0.00           $0.004
Total cost (this doc)          $0.00           $0.00           $0.04
Offline capable                Yes             Yes             No
Preserves structure            No              Yes             Yes

📄 Sample Extracted Content (Deterministic):
--------------------------------------------------------------------------------

✅ Sample Table (Page 1):
   Method: pdfplumber
   Headers: ['Protocol', 'Port Number', 'Description']
   Rows: 5 x 3
   First row: ['HTTP', '80', 'Hypertext Transfer Protocol']

✅ Sample Image (Page 3):
   Format: png
   Size: 800x600
   Bytes: 45,234

✅ Sample Code Block (Page 7):
   Language: python
   Lines: 15
   Preview: def configure_network(ip, port):
    """Configure network settings"""
    settings = {
        'ip_address': ip,
        'port': port
    }
    return settings...

================================================================================
RECOMMENDATIONS
================================================================================

✅ This document contains 6 rich content elements (deterministic).

🎯 RECOMMENDED APPROACH: Deterministic Extraction

Reasons:
  ✅ FREE - Zero API costs
  ✅ FAST - 3-10x faster than vision
  ✅ ACCURATE - Purpose-built libraries for each content type
  ✅ OFFLINE - No internet required
  ✅ DETERMINISTIC - Same input = same output

Detected content:
  - 3 tables (pdfplumber/camelot)
  - 2 images (PyMuPDF)
  - 1 code blocks (Pygments)

💰 Cost savings: $0.04 per document
   (Vision would cost $0.04, Deterministic is FREE)

================================================================================

💡 Next Steps:
   1. Review sample content above
   2. Check if tables/formulas/images are extracted correctly
   3. If quality is good, integrate deterministic extraction
   4. Reserve AI (Gemini) for lesson generation, NOT structure parsing

================================================================================
```

---

## Dependencies

### Required (already installed)
- `PyMuPDF` - PDF processing and image extraction

### Recommended
- `pdfplumber` - Table extraction (primary)
  ```bash
  pip3 install pdfplumber
  ```

- `pygments` - Code language detection
  ```bash
  pip3 install pygments
  ```

### Optional
- `pix2text` - Formula extraction (LaTeX conversion)
  ```bash
  pip3 install pix2text
  ```
  Note: Downloads ~500MB model on first run

- `camelot-py` - Table extraction fallback
  ```bash
  pip3 install camelot-py[cv]
  brew install ghostscript  # macOS
  ```

---

## Understanding the Results

### Tables
- **Method**: Shows which library extracted it (pdfplumber or camelot)
- **Headers**: Column names from the table
- **Rows**: Number of data rows
- **Quality check**: Look at first row to verify data is correct

### Images
- **Format**: png, jpg, etc.
- **Size**: Dimensions in pixels
- **Bytes**: File size (helps identify small icons vs meaningful diagrams)

### Formulas
- **LaTeX**: Mathematical notation ready for MathJax rendering
- **Example**: `E = mc^2` → `E = mc^{2}` in LaTeX

### Code Blocks
- **Language**: Detected programming language (python, javascript, etc.)
- **Lines**: Number of code lines
- **Preview**: First 150 characters of the code

---

## Troubleshooting

### "pdfplumber not installed"
```bash
pip3 install pdfplumber
```

### "No tables detected" (but PDF has tables)
Try installing camelot as fallback:
```bash
pip3 install camelot-py[cv]
brew install ghostscript
```

### "Formula extraction failed"
This is optional. Formulas will be skipped if pix2text is not installed:
```bash
pip3 install pix2text
```

### Permission denied on test script
```bash
chmod +x backend/scripts/test_rich_extraction.sh
```

---

## Comparison with Vision Approach

| Feature | Text-Only | Deterministic | Vision (AI) |
|---------|-----------|---------------|-------------|
| **Speed** | Very Fast (<0.1s/page) | Fast (0.1-0.6s/page) | Slow (1-2s/page) |
| **Cost** | Free | Free | $0.004/page |
| **Tables** | Lost (flat text) | Preserved (structured) | Preserved (structured) |
| **Images** | Ignored | Extracted (no description) | Extracted + described |
| **Formulas** | Lost | LaTeX (with pix2text) | LaTeX |
| **Code** | As text | Detected + highlighted | Detected + highlighted |
| **Offline** | Yes | Yes | No (requires API) |
| **Reliable** | Yes | Yes | Can hallucinate |

**Conclusion**: Deterministic is the right approach for structure extraction. Reserve AI for lesson generation.

---

## Next Steps

1. **Test with your documents**
   ```bash
   cd backend/scripts
   ./test_rich_extraction.sh ~/Documents/your-textbook.pdf
   ```

2. **Review the output**
   - Are tables extracted correctly?
   - Are images found?
   - Are formulas recognized?

3. **If quality is good**
   - Integrate into ingestion pipeline
   - Update database schema to store rich content
   - Use structured data in lesson generation prompts

4. **Reserve AI for what it's good at**
   - Understanding table content
   - Generating educational narratives
   - Creating concept explanations
   - NOT parsing structure!

---

## Questions?

- **Do I need all dependencies?** No, only PyMuPDF is required. Others enable specific features.
- **How long does testing take?** ~1-5 seconds for a 10-page PDF (deterministic)
- **What if I don't have PDFs?** Use any educational PDF - textbooks, papers, documentation
- **Can I skip vision comparison?** Yes, focus on text-only vs deterministic
- **Will this work on my documents?** Test it! That's what this guide is for.

Enjoy testing! 🎉
