# Testing Rich Content Extraction

This guide shows you how to test the vision-based PDF extraction and compare it with text-only extraction.

## Prerequisites

### 1. Install Python Dependencies

```bash
cd backend
pip3 install -r requirements.txt
```

This installs:
- `google-generativeai` - Gemini Vision API
- `Pillow` - Image processing (likely already installed)
- `PyMuPDF` - PDF processing (already installed)

### 2. Set Up Gemini API Key

You need a Gemini API key to use vision-based extraction:

1. Get a free API key from: https://aistudio.google.com/app/apikey
2. Set the environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

**Important**: The free tier has generous limits:
- 1,500 requests per day
- 1 million tokens per day
- Rate limit: 15 RPM (requests per minute)

For testing a few PDFs, this is more than enough!

---

## Testing Methods

### Option 1: Quick Test with Existing Text-Only Script

**Test the current text-only extraction** (no API key needed):

```bash
cd backend/scripts
python3 extract_text.py /path/to/your/document.pdf
```

**Output**: JSON with pages containing only plain text

**Example**:
```json
{
  "pages": [
    {
      "page": 1,
      "text": "Protocol Port Number HTTP 80 HTTPS 443 SSH 22"
    }
  ]
}
```

Notice: **Table structure is lost** - just flat text!

---

### Option 2: Test Vision-Based Extraction (NEW)

**Test the new vision-based extraction** (requires API key):

```bash
cd backend/scripts
export GEMINI_API_KEY="your-key"
python3 extract_text_vision.py /path/to/your/document.pdf
```

**Output**: JSON with rich content structure

**Example**:
```json
{
  "pages": [
    {
      "page": 1,
      "text": "Common network protocols and their port numbers",
      "tables": [
        {
          "caption": "Network Protocols",
          "headers": ["Protocol", "Port Number"],
          "rows": [
            ["HTTP", "80"],
            ["HTTPS", "443"],
            ["SSH", "22"]
          ],
          "location": "center of page"
        }
      ],
      "images": [],
      "formulas": [],
      "code_blocks": []
    }
  ],
  "extraction_mode": "vision",
  "dpi": 150
}
```

Notice: **Table structure preserved** with headers and rows!

---

### Option 3: Side-by-Side Comparison (RECOMMENDED)

**Run both extractions and see the difference**:

```bash
cd backend/scripts
export GEMINI_API_KEY="your-key"
python3 compare_extraction.py /path/to/your/document.pdf
```

**Output**: Detailed comparison report

**Example Output**:
```
================================================================================
EXTRACTION COMPARISON: Text-Only vs Vision-Based
================================================================================

Running text-only extraction...
Running vision-based extraction (may take longer)...

================================================================================
RESULTS SUMMARY
================================================================================

Document: /path/to/document.pdf
Pages extracted (text-only): 10
Pages extracted (vision): 10

📊 Rich Content Detected:
  - Tables: 3
  - Images/Diagrams: 2
  - Mathematical Formulas: 5
  - Code Blocks: 1

💰 Cost Estimation (Vision-Based):
  - Total tokens: 15,000
  - Total cost: $0.04
  - Per page: $0.004

📄 Page-by-Page Comparison:
--------------------------------------------------------------------------------

Page 1:
  Text-only: 450 chars
  Vision: 520 chars
    + 1 tables
    + 0 images
    + 0 formulas
    + 0 code blocks
  Sample table: Network Protocols (3 rows)

Page 2:
  Text-only: 680 chars
  Vision: 720 chars
    + 0 tables
    + 1 images
    + 2 formulas
    + 0 code blocks
  Sample image: diagram - Network topology showing router connections...

================================================================================
RECOMMENDATIONS
================================================================================

✅ This document contains 11 rich content elements.
   Vision-based extraction is RECOMMENDED for:
   - 3 tables with structured data
   - 2 diagrams/charts that need description
   - 5 mathematical formulas
   - 1 code blocks with syntax

   Estimated cost: $0.04 (acceptable for educational content)
```

---

## Testing with Sample Documents

### Find a Good Test PDF

**Best PDFs for testing** (contain rich content):

1. **Technical documentation** - Tables, code blocks
2. **Math/Physics textbooks** - Formulas, diagrams
3. **Computer science papers** - Algorithms, flowcharts
4. **Chemistry textbooks** - Molecular diagrams, tables
5. **Network/infrastructure docs** - Topology diagrams, port tables

**Example sources**:
- Your existing uploaded documents in Ultudy
- Sample PDFs from: https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
- University course materials
- Technical whitepapers

---

## Expected Results

### Text-Only Extraction (Current)

**What you'll see**:
```
Protocol Port Number HTTP 80 HTTPS 443 SSH 22 FTP 21 DNS 53
```

**Problems**:
- No table structure
- Can't tell which number goes with which protocol
- Hard for LLM to understand relationships

---

### Vision-Based Extraction (NEW)

**What you'll see**:
```json
{
  "tables": [{
    "headers": ["Protocol", "Port Number"],
    "rows": [
      ["HTTP", "80"],
      ["HTTPS", "443"],
      ["SSH", "22"],
      ["FTP", "21"],
      ["DNS", "53"]
    ]
  }]
}
```

**Benefits**:
- Clear structure preserved
- Headers identified
- LLM can generate accurate concepts
- Can render as HTML table in lessons

---

## Troubleshooting

### Error: "GEMINI_API_KEY environment variable is required"

**Solution**: Set your API key
```bash
export GEMINI_API_KEY="your-key-here"
```

Or set it permanently in your shell config (`~/.bashrc` or `~/.zshrc`):
```bash
echo 'export GEMINI_API_KEY="your-key"' >> ~/.zshrc
source ~/.zshrc
```

---

### Error: "ModuleNotFoundError: No module named 'google.generativeai'"

**Solution**: Install dependencies
```bash
cd backend
pip3 install -r requirements.txt
```

Or install directly:
```bash
pip3 install google-generativeai
```

---

### Error: "Rate limit exceeded"

**Solution**: You've hit the free tier rate limit (15 requests/minute)

- Wait 60 seconds and try again
- For large documents, the script processes pages sequentially
- Consider upgrading to paid tier if testing extensively

---

### Error: "Failed to parse JSON"

**Solution**: Gemini returned non-JSON output (rare)

This is usually because:
- The page is too complex
- The image quality is poor
- The API had a temporary issue

The script will show the raw response in the error for debugging.

---

## Quick Start Commands

**Fastest way to see the difference**:

```bash
# 1. Install dependencies
pip3 install google-generativeai

# 2. Set API key (get from https://aistudio.google.com/app/apikey)
export GEMINI_API_KEY="your-key"

# 3. Find a PDF with tables or diagrams
cd backend/scripts

# 4. Run comparison
python3 compare_extraction.py ~/path/to/document.pdf

# You'll see:
# - How many tables/images/formulas were found
# - Cost estimation
# - Side-by-side comparison
# - Recommendations
```

---

## What to Look For

When testing, pay attention to:

### ✅ Success Indicators
- Tables show proper structure (headers, rows)
- Images have meaningful descriptions
- Formulas captured in LaTeX notation
- Code blocks identified with language
- Cost is reasonable (<$0.30 per 60-page doc)

### ⚠️ Warning Signs
- Tables still appear as flat text → Vision extraction may have failed
- No images detected in a visual document → Check API key
- Cost is $0 for vision extraction → Fallback to text-only occurred
- Errors in output → Check API key and rate limits

---

## Next Steps After Testing

Once you've verified vision extraction works:

1. **Review the output quality**
   - Are tables structured correctly?
   - Are image descriptions accurate?
   - Are formulas in proper LaTeX?

2. **Check the cost**
   - Is $0.004 per page acceptable?
   - Would hybrid approach (30% pages) be better?

3. **Test with your real documents**
   - Upload a typical Ultudy document
   - Run comparison
   - See if rich content improves lesson quality

4. **Decide on implementation**
   - Phase 1: Full vision (MVP)
   - Phase 2: Hybrid optimization
   - Phase 3: Enhanced features

---

## Sample Test PDFs

If you don't have PDFs handy, you can create a simple test:

```python
# Create a test PDF with a table
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle
from reportlab.lib import colors

doc = SimpleDocTemplate("test_table.pdf", pagesize=letter)
data = [
    ['Protocol', 'Port'],
    ['HTTP', '80'],
    ['HTTPS', '443'],
    ['SSH', '22']
]
table = Table(data)
table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
    ('GRID', (0, 0), (-1, -1), 1, colors.black)
]))
doc.build([table])
```

Then test:
```bash
python3 compare_extraction.py test_table.pdf
```

You should see the table properly extracted by vision, but garbled by text-only!

---

## Questions?

- **How much does testing cost?** Free tier allows testing ~1000 pages/day
- **Do I need to pay?** No, free tier is sufficient for testing
- **What if I don't have an API key?** Text-only extraction still works
- **Can I test without uploading?** Yes, scripts run locally on your PDFs
- **How long does it take?** ~1-2 seconds per page for vision extraction

Enjoy testing! 🎉
