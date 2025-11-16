#!/bin/bash

# Quick test script for rich content extraction
# Usage: ./test_rich_extraction.sh [pdf_file]

set -e

echo "🔬 Rich Content Extraction Test"
echo "================================"
echo ""

# Check if PDF file provided
if [ -z "$1" ]; then
    echo "❌ Error: No PDF file specified"
    echo ""
    echo "Usage: ./test_rich_extraction.sh <path/to/document.pdf>"
    echo ""
    echo "Example:"
    echo "  ./test_rich_extraction.sh ~/Documents/textbook.pdf"
    exit 1
fi

PDF_FILE="$1"

# Check if file exists
if [ ! -f "$PDF_FILE" ]; then
    echo "❌ Error: File not found: $PDF_FILE"
    exit 1
fi

echo "📄 PDF: $PDF_FILE"
echo ""

# Check Python dependencies
echo "🔍 Checking dependencies..."

if ! python3 -c "import fitz" 2>/dev/null; then
    echo "❌ PyMuPDF not installed"
    echo "   Install: pip3 install PyMuPDF"
    exit 1
fi
echo "✅ PyMuPDF installed"

# Check optional dependencies
PDFPLUMBER_AVAILABLE=0
PIX2TEXT_AVAILABLE=0

if python3 -c "import pdfplumber" 2>/dev/null; then
    echo "✅ pdfplumber installed (table extraction)"
    PDFPLUMBER_AVAILABLE=1
else
    echo "⚠️  pdfplumber not installed (table extraction will be skipped)"
    echo "   Install: pip3 install pdfplumber"
fi

if python3 -c "from pix2text import Pix2Text" 2>/dev/null; then
    echo "✅ pix2text installed (formula extraction)"
    PIX2TEXT_AVAILABLE=1
else
    echo "⚠️  pix2text not installed (formula extraction will be skipped)"
    echo "   Install: pip3 install pix2text"
fi

if python3 -c "from pygments.lexers import guess_lexer" 2>/dev/null; then
    echo "✅ pygments installed (code detection)"
else
    echo "⚠️  pygments not installed (code detection will be skipped)"
    echo "   Install: pip3 install pygments"
fi

echo ""
echo "================================"
echo ""

# Test text-only extraction
echo "1️⃣  Testing TEXT-ONLY extraction..."
echo ""

if python3 extract_text.py "$PDF_FILE" > /tmp/text_result.json 2>&1; then
    PAGE_COUNT=$(python3 -c "import json; data=json.load(open('/tmp/text_result.json')); print(len(data.get('pages', [])))")
    echo "✅ Text extraction succeeded: $PAGE_COUNT pages"

    # Show sample of first page
    echo ""
    echo "Sample (first 200 chars of page 1):"
    python3 -c "import json; data=json.load(open('/tmp/text_result.json')); print(data['pages'][0]['text'][:200] + '...')" | sed 's/^/   /'
    echo ""
else
    echo "❌ Text extraction failed"
    cat /tmp/text_result.json
    exit 1
fi

# Test deterministic extraction
echo ""
echo "2️⃣  Testing DETERMINISTIC extraction..."
echo "   (Free, fast, structure-preserving)"
echo ""

if python3 extract_text_deterministic.py "$PDF_FILE" > /tmp/deterministic_result.json 2>&1; then
    DET_PAGES=$(python3 -c "import json; data=json.load(open('/tmp/deterministic_result.json')); print(len(data.get('pages', [])))")
    echo "✅ Deterministic extraction succeeded: $DET_PAGES pages"

    # Count rich content
    TABLES=$(python3 -c "import json; data=json.load(open('/tmp/deterministic_result.json')); print(len(data.get('tables', [])))")
    IMAGES=$(python3 -c "import json; data=json.load(open('/tmp/deterministic_result.json')); print(len(data.get('images', [])))")
    FORMULAS=$(python3 -c "import json; data=json.load(open('/tmp/deterministic_result.json')); print(len(data.get('formulas', [])))")
    CODE=$(python3 -c "import json; data=json.load(open('/tmp/deterministic_result.json')); print(len(data.get('code_blocks', [])))")

    echo ""
    echo "📊 Rich content detected:"
    echo "   - Tables: $TABLES"
    echo "   - Images: $IMAGES"
    echo "   - Formulas: $FORMULAS"
    echo "   - Code blocks: $CODE"

    # Show sample table if present
    if [ "$TABLES" -gt 0 ]; then
        echo ""
        echo "Sample table (first found):"
        python3 -c "
import json
data = json.load(open('/tmp/deterministic_result.json'))
tables = data.get('tables', [])
if tables:
    table = tables[0]
    print(f\"   Page: {table.get('page', '?')}\")
    print(f\"   Method: {table.get('extraction_method', 'unknown')}\")
    print(f\"   Headers: {table.get('headers', [])}\")
    print(f\"   Rows: {table.get('row_count', 0)} x {table.get('col_count', 0)}\")
"
    fi

else
    echo "❌ Deterministic extraction failed"
    echo ""
    echo "Error output:"
    cat /tmp/deterministic_result.json | sed 's/^/   /'
fi

# Run full comparison if user wants
echo ""
echo "================================"
echo "✅ Basic testing complete!"
echo ""
echo "Results saved to:"
echo "  - Text-only: /tmp/text_result.json"
echo "  - Deterministic: /tmp/deterministic_result.json"
echo ""
echo "💡 For detailed three-way comparison (text vs deterministic vs vision):"
echo "   python3 compare_extraction.py \"$PDF_FILE\""
echo ""
