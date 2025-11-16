#!/usr/bin/env python3
"""
Demo Phase 3: Layout Analysis improvements.

Shows what Phase 3 adds on top of Phase 1+2:
- Before Phase 3: Post-processing + Markdown (but no layout analysis)
- After Phase 3: Post-processing + Markdown + Layout analysis

Usage:
    python3 demo_phase3.py <pdf_file>
"""

import sys
import os
import json
import subprocess


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 demo_phase3.py <pdf_file>")
        print()
        print("Example: python3 demo_phase3.py lecture.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    print("=" * 80)
    print("PHASE 3: LAYOUT ANALYSIS DEMO")
    print("=" * 80)
    print()
    print(f"Analyzing: {pdf_path}")
    print()

    # Extract with Phase 3
    print("Extracting with Phase 3 (layout analysis)...")
    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print("Error during extraction:")
        print(result.stderr)
        sys.exit(1)

    data = json.loads(result.stdout)

    print()
    print("=" * 80)
    print("WHAT PHASE 3 DETECTED")
    print("=" * 80)
    print()

    # Check if layout analysis ran
    if 'layout' not in data:
        print("⚠️  Layout analysis not available!")
        print()
        print("This could mean:")
        print("  1. Layout analyzer module not found")
        print("  2. Import error occurred")
        print("  3. Phase 3 code not on this branch")
        print()
        print("Make sure you're on the 'feature/pdf-layout-phase3' branch")
        sys.exit(1)

    layout = data['layout']

    # 1. Layout Type
    print("1️⃣  LAYOUT TYPE DETECTION")
    print("-" * 80)
    layout_type = layout.get('layout_type', 'unknown')
    print(f"   Document layout: {layout_type.upper()}")
    print()

    if layout_type == 'two_column':
        print("   💡 This is a two-column document (common in academic papers)")
        print("      Without Phase 3: Text from both columns would be mixed")
        print("      With Phase 3: Columns read in correct order (left→right)")
    elif layout_type == 'single_column':
        print("   💡 This is a single-column document (common in textbooks)")
    elif layout_type == 'three_column':
        print("   💡 This is a three-column document (rare, but handled!)")
    elif layout_type == 'mixed':
        print("   💡 Different pages have different layouts")
        print("      Phase 3 detects layout per-page")
    print()

    # 2. Page-by-page layout
    print("2️⃣  PER-PAGE LAYOUT")
    print("-" * 80)
    pages = layout.get('pages', [])
    for page in pages[:5]:  # Show first 5 pages
        page_num = page['page']
        page_layout = page['layout']
        columns = page['columns']
        blocks = len(page.get('blocks', []))
        print(f"   Page {page_num}: {page_layout} ({columns} column(s), {blocks} text blocks)")

    if len(pages) > 5:
        print(f"   ... and {len(pages) - 5} more pages")
    print()

    # 3. Heading Detection
    print("3️⃣  HEADING HIERARCHY")
    print("-" * 80)
    headings = layout.get('headings', [])

    if not headings:
        print("   No headings detected in this document")
    else:
        print(f"   Total headings: {len(headings)}")
        print()
        print("   Heading hierarchy:")

        for heading in headings[:10]:  # Show first 10
            level = heading['heading_level']
            text = heading['text'][:60]  # Truncate long headings
            page = heading['page']

            indent = "  " * (level - 1)
            level_name = f"H{level}"

            print(f"   {indent}[{level_name}] {text}... (page {page})")

        if len(headings) > 10:
            print(f"   ... and {len(headings) - 10} more headings")

    print()

    # 4. Document Structure
    print("4️⃣  DOCUMENT STRUCTURE (Outline)")
    print("-" * 80)
    structure = layout.get('structure', {})
    sections = structure.get('sections', [])

    if not sections:
        print("   No structure detected")
    else:
        print(f"   {len(sections)} main section(s):")
        print()

        def print_section(section, indent=0):
            prefix = "  " * indent
            title = section['title'][:50]
            level = section['level']
            page = section['page']

            print(f"   {prefix}• {title} (H{level}, page {page})")

            for subsection in section.get('subsections', [])[:3]:
                print_section(subsection, indent + 1)

            if len(section.get('subsections', [])) > 3:
                print(f"   {prefix}  ... and {len(section['subsections']) - 3} more subsections")

        for section in sections[:5]:
            print_section(section)

        if len(sections) > 5:
            print(f"   ... and {len(sections) - 5} more sections")

    print()

    # 5. Reading Order Example
    print("5️⃣  READING ORDER CORRECTION")
    print("-" * 80)

    if pages:
        first_page = pages[0]
        blocks = first_page.get('blocks', [])

        if first_page['layout'] in ['two_column', 'three_column']:
            print(f"   Page 1 has {first_page['columns']} columns")
            print("   Text blocks in correct reading order:")
            print()

            for i, block in enumerate(blocks[:8]):  # Show first 8 blocks
                text = block['text'][:50].replace('\n', ' ')
                column = block['column']
                order = block['reading_order']

                print(f"   [{order:2d}] Column {column}: {text}...")

            if len(blocks) > 8:
                print(f"   ... and {len(blocks) - 8} more blocks")

            print()
            print("   💡 Without Phase 3: Blocks from different columns would be mixed")
            print("      With Phase 3: Each column read fully before moving to next")

        else:
            print(f"   Page 1 is single-column (reading order is straightforward)")
            print(f"   Total text blocks: {len(blocks)}")

    print()

    # Summary
    print("=" * 80)
    print("SUMMARY: WHAT PHASE 3 ADDS")
    print("=" * 80)
    print()

    print("Before Phase 3 (Phase 1+2 only):")
    print("  ✅ Clean text (Phase 1: post-processing)")
    print("  ✅ Markdown format (Phase 2: LLM-optimal output)")
    print("  ❌ No layout detection")
    print("  ❌ No heading hierarchy")
    print("  ❌ Wrong reading order in multi-column PDFs")
    print("  ❌ No document structure")
    print()

    print("After Phase 3 (all phases):")
    print("  ✅ Clean text (Phase 1)")
    print("  ✅ Markdown format (Phase 2)")
    print(f"  ✅ Layout detected: {layout_type}")
    print(f"  ✅ Headings identified: {len(headings)} headings with H1/H2/H3 levels")
    print(f"  ✅ Correct reading order: {len(pages)} pages analyzed")
    print(f"  ✅ Document structure: {len(sections)} sections mapped")
    print()

    # Benefits
    print("=" * 80)
    print("BENEFITS FOR YOUR USE CASE")
    print("=" * 80)
    print()

    if layout_type == 'two_column':
        print("🎯 This document is TWO-COLUMN:")
        print()
        print("   Problem without Phase 3:")
        print("     - Left column line 1")
        print("     - Right column line 1  ← WRONG! Jumped to other column")
        print("     - Left column line 2")
        print("     - Right column line 2")
        print("     → Text makes no sense, semantic meaning lost")
        print()
        print("   Solution with Phase 3:")
        print("     - Left column line 1")
        print("     - Left column line 2")
        print("     - Left column line 3")
        print("     - Right column line 1  ← Correct! Finished left first")
        print("     - Right column line 2")
        print("     → Text flows naturally, meaning preserved")
        print()

    if headings:
        print("📚 Heading Hierarchy Detected:")
        print()
        print("   For Lesson Generation:")
        print(f"     - Can split by sections ({len(sections)} main sections)")
        print("     - One lesson per section (better organization)")
        print("     - Questions can reference specific sections")
        print()
        print("   For Navigation:")
        print("     - Jump to specific sections")
        print("     - Table of contents generation")
        print("     - Section-based search")
        print()

    if layout_type != 'single_column':
        print("📐 Multi-Column Layout:")
        print()
        print("   Why this matters:")
        print("     - 70% of academic papers use 2-column layout")
        print("     - Without correction: Text is gibberish")
        print("     - With correction: Proper semantic flow")
        print()

    print("=" * 80)
    print()

    # Generate and save Markdown output
    print("=" * 80)
    print("MARKDOWN OUTPUT")
    print("=" * 80)
    print()
    print("Generating Markdown output...")

    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path, '--format', 'markdown'],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        markdown = result.stdout
        output_file = 'output.md'

        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(markdown)

        print(f"✅ Markdown saved to: {output_file}")
        print()

        # Show preview
        lines = markdown.split('\n')
        print("Preview (first 30 lines):")
        print("-" * 80)
        for line in lines[:30]:
            print(line)
        if len(lines) > 30:
            print("...")
            print(f"({len(lines) - 30} more lines)")
        print("-" * 80)
        print()
        print(f"📄 Full output in: {output_file}")
        print(f"   View with: cat {output_file} | less")
        print(f"   Or open in editor: open {output_file}")
    else:
        print("⚠️  Failed to generate Markdown")
        print(result.stderr)

    print()
    print("=" * 80)
    print()

    # Show JSON structure sample
    print("💡 MORE COMMANDS:")
    print()
    print("  View full JSON structure with layout data:")
    print(f"    python3 backend/scripts/extract_text_deterministic.py {pdf_path} | jq '.layout'")
    print()
    print("  Test positioning and duplicates:")
    print(f"    python3 backend/scripts/test_positioning.py {pdf_path}")
    print()


if __name__ == '__main__':
    main()
