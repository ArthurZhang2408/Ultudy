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

if ! python3 -c "from PIL import Image" 2>/dev/null; then
    echo "❌ Pillow not installed"
    echo "   Install: pip3 install Pillow"
    exit 1
fi
echo "✅ Pillow installed"

if ! python3 -c "import google.generativeai" 2>/dev/null; then
    echo "⚠️  google-generativeai not installed"
    echo "   Install: pip3 install google-generativeai"
    echo ""
    echo "   You can still test text-only extraction without it."
    echo ""
    VISION_AVAILABLE=0
else
    echo "✅ google-generativeai installed"
    VISION_AVAILABLE=1
fi

echo ""

# Check API key
if [ -z "$GEMINI_API_KEY" ]; then
    echo "⚠️  GEMINI_API_KEY not set"
    echo ""
    echo "   Vision extraction requires an API key."
    echo "   Get one free at: https://aistudio.google.com/app/apikey"
    echo ""
    echo "   Then set it:"
    echo "   export GEMINI_API_KEY='your-key-here'"
    echo ""
    echo "   You can still test text-only extraction without it."
    echo ""
    VISION_AVAILABLE=0
else
    echo "✅ GEMINI_API_KEY is set"
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

# Test vision extraction if available
if [ $VISION_AVAILABLE -eq 1 ]; then
    echo ""
    echo "2️⃣  Testing VISION-BASED extraction..."
    echo "   (This may take 1-2 seconds per page)"
    echo ""

    if python3 extract_text_vision.py "$PDF_FILE" > /tmp/vision_result.json 2>&1; then
        VISION_PAGES=$(python3 -c "import json; data=json.load(open('/tmp/vision_result.json')); print(len(data.get('pages', [])))")
        echo "✅ Vision extraction succeeded: $VISION_PAGES pages"

        # Count rich content
        TABLES=$(python3 -c "import json; data=json.load(open('/tmp/vision_result.json')); print(sum(len(p.get('tables', [])) for p in data.get('pages', [])))")
        IMAGES=$(python3 -c "import json; data=json.load(open('/tmp/vision_result.json')); print(sum(len(p.get('images', [])) for p in data.get('pages', [])))")
        FORMULAS=$(python3 -c "import json; data=json.load(open('/tmp/vision_result.json')); print(sum(len(p.get('formulas', [])) for p in data.get('pages', [])))")
        CODE=$(python3 -c "import json; data=json.load(open('/tmp/vision_result.json')); print(sum(len(p.get('code_blocks', [])) for p in data.get('pages', [])))")

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
data = json.load(open('/tmp/vision_result.json'))
for page in data.get('pages', []):
    if page.get('tables'):
        table = page['tables'][0]
        print(f\"   Caption: {table.get('caption', 'N/A')}\")
        print(f\"   Headers: {table.get('headers', [])}\")
        print(f\"   Rows: {len(table.get('rows', []))} rows\")
        break
"
        fi

        # Estimate cost
        COST=$(python3 -c "print(round($VISION_PAGES * 0.004, 4))")
        echo ""
        echo "💰 Estimated cost: \$$COST (at \$0.004/page)"

    else
        echo "❌ Vision extraction failed"
        echo ""
        echo "Error output:"
        cat /tmp/vision_result.json | sed 's/^/   /'
    fi

    # Run comparison
    echo ""
    echo "3️⃣  Running full comparison..."
    echo ""
    python3 compare_extraction.py "$PDF_FILE"

else
    echo ""
    echo "⏭️  Skipping vision extraction (dependencies not available)"
    echo ""
    echo "To test vision extraction:"
    echo "  1. pip3 install google-generativeai"
    echo "  2. export GEMINI_API_KEY='your-key'"
    echo "  3. Run this script again"
fi

echo ""
echo "================================"
echo "✅ Testing complete!"
echo ""
echo "Results saved to:"
echo "  - Text-only: /tmp/text_result.json"
if [ $VISION_AVAILABLE -eq 1 ]; then
    echo "  - Vision: /tmp/vision_result.json"
fi
echo ""
