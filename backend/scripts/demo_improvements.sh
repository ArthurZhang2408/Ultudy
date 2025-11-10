#!/bin/bash
#
# Demo script to compare extraction with and without improvements
# Shows the difference between:
# - Raw extraction (no post-processing, no layout)
# - Phase 1: Post-processing (cleaning, table merging)
# - Phase 2: Markdown output (LLM-optimal format)
# - Phase 3: Layout analysis (multi-column, headings, structure)
#

PDF_FILE="$1"

if [ -z "$PDF_FILE" ]; then
    echo "Usage: $0 <pdf_file>"
    echo ""
    echo "Example: $0 lecture.pdf"
    exit 1
fi

if [ ! -f "$PDF_FILE" ]; then
    echo "Error: File not found: $PDF_FILE"
    exit 1
fi

echo "═══════════════════════════════════════════════════════════════"
echo "PDF Extraction Improvement Demo"
echo "═══════════════════════════════════════════════════════════════"
echo "File: $PDF_FILE"
echo ""

# Create output directory
OUTPUT_DIR="demo_output"
mkdir -p "$OUTPUT_DIR"

echo "Running extractions..."
echo ""

# 1. Raw extraction (no post-processing)
echo "1️⃣  Raw Extraction (baseline - no improvements)"
echo "   - No cleaning, no enhancement"
echo "   - JSON output only"
echo ""
SKIP_POSTPROCESSING=1 python3 backend/scripts/extract_text_deterministic.py "$PDF_FILE" 2>/dev/null > "$OUTPUT_DIR/1_raw.json"

# 2. With post-processing (Phase 1)
echo "2️⃣  Phase 1: Post-Processing"
echo "   - Noise removal (headers, footers, page numbers)"
echo "   - Table merging (cross-page tables)"
echo "   - Context enhancement (auto-captions)"
echo "   - Symbol correction (formulas)"
echo ""
python3 backend/scripts/extract_text_deterministic.py "$PDF_FILE" 2>/dev/null > "$OUTPUT_DIR/2_postprocessed.json"

# 3. Markdown output (Phase 2)
echo "3️⃣  Phase 2: Markdown Output"
echo "   - LLM-optimal format"
echo "   - Structured tables (pipe syntax)"
echo "   - LaTeX formulas"
echo "   - Code blocks with syntax highlighting"
echo ""
python3 backend/scripts/extract_text_deterministic.py "$PDF_FILE" --format markdown 2>/dev/null > "$OUTPUT_DIR/3_markdown.md"

# 4. With layout analysis (Phase 3) - JSON
echo "4️⃣  Phase 3: Layout Analysis (JSON)"
echo "   - Multi-column detection"
echo "   - Heading hierarchy (H1/H2/H3)"
echo "   - Reading order correction"
echo "   - Document structure map"
echo ""
python3 backend/scripts/extract_text_deterministic.py "$PDF_FILE" 2>/dev/null > "$OUTPUT_DIR/4_with_layout.json"

# 5. With layout analysis (Phase 3) - Markdown
echo "5️⃣  Phase 3: Layout Analysis (Markdown)"
echo "   - All Phase 2 benefits"
echo "   - Plus: Proper heading markers"
echo "   - Plus: Correct reading order"
echo ""
python3 backend/scripts/extract_text_deterministic.py "$PDF_FILE" --format markdown 2>/dev/null > "$OUTPUT_DIR/5_layout_markdown.md"

echo "═══════════════════════════════════════════════════════════════"
echo "✅ Extraction complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Output files created in: $OUTPUT_DIR/"
echo ""
echo "📊 Comparison Summary:"
echo ""

# Compare file sizes
echo "File sizes:"
ls -lh "$OUTPUT_DIR" | awk 'NR>1 {printf "  %-30s %8s\n", $9, $5}'
echo ""

# Count tables in raw vs processed
RAW_TABLES=$(jq '.summary.total_tables' "$OUTPUT_DIR/1_raw.json" 2>/dev/null || echo "0")
PROC_TABLES=$(jq '.summary.total_tables' "$OUTPUT_DIR/2_postprocessed.json" 2>/dev/null || echo "0")
LAYOUT_TYPE=$(jq -r '.summary.layout_type // "unknown"' "$OUTPUT_DIR/4_with_layout.json" 2>/dev/null || echo "unknown")
HEADINGS=$(jq '.summary.total_headings // 0' "$OUTPUT_DIR/4_with_layout.json" 2>/dev/null || echo "0")

echo "Content Analysis:"
echo "  Tables (raw):              $RAW_TABLES"
echo "  Tables (post-processed):   $PROC_TABLES"
echo "  Layout type detected:      $LAYOUT_TYPE"
echo "  Headings detected:         $HEADINGS"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "How to view the differences:"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "1. Compare raw vs post-processed (see cleaning/merging):"
echo "   diff $OUTPUT_DIR/1_raw.json $OUTPUT_DIR/2_postprocessed.json | head -50"
echo ""
echo "2. View Markdown output (LLM-ready format):"
echo "   cat $OUTPUT_DIR/3_markdown.md | less"
echo ""
echo "3. View layout structure (document outline):"
echo "   jq '.layout.structure' $OUTPUT_DIR/4_with_layout.json"
echo ""
echo "4. View headings with hierarchy:"
echo "   jq '.layout.headings[] | {level: .heading_level, text: .text, page: .page}' $OUTPUT_DIR/4_with_layout.json"
echo ""
echo "5. Compare Markdown with and without layout:"
echo "   diff $OUTPUT_DIR/3_markdown.md $OUTPUT_DIR/5_layout_markdown.md | head -50"
echo ""
echo "6. View reading order (multi-column correction):"
echo "   jq '.layout.pages[0].blocks[] | {order: .reading_order, text: .text}' $OUTPUT_DIR/4_with_layout.json | head -20"
echo ""
echo "═══════════════════════════════════════════════════════════════"
