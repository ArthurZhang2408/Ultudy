"""
Comparison script: Text-only vs Deterministic vs Vision extraction

This script compares three extraction approaches:
1. Text-only (current) - Fast but loses structure
2. Deterministic (recommended) - Fast, free, preserves structure
3. Vision-based (deprecated) - Slow, expensive, AI overkill

Usage:
    python compare_extraction.py <pdf_path>

Output:
    - Three-way comparison of extracted content
    - Quality metrics (tables found, images extracted, formulas recognized)
    - Cost and speed comparisons
    - Recommendations based on content type
"""

import sys
import json
import subprocess
import os


def extract_text_only(pdf_path):
    """Run current text-only extraction."""
    result = subprocess.run(
        ['python3', 'extract_text.py', pdf_path],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)


def extract_deterministic(pdf_path):
    """Run deterministic extraction (recommended)."""
    result = subprocess.run(
        ['python3', 'extract_text_deterministic.py', pdf_path],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)


def extract_vision(pdf_path):
    """Run vision-based extraction (deprecated)."""
    result = subprocess.run(
        ['python3', 'extract_text_vision.py', pdf_path],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)


def count_rich_content(result):
    """Count rich content elements extracted."""
    counts = {
        'tables': 0,
        'images': 0,
        'formulas': 0,
        'code_blocks': 0
    }

    # Check if result uses top-level arrays (deterministic) or page-level (vision)
    if 'tables' in result:
        # Deterministic format
        counts['tables'] = len(result.get('tables', []))
        counts['images'] = len(result.get('images', []))
        counts['formulas'] = len(result.get('formulas', []))
        counts['code_blocks'] = len(result.get('code_blocks', []))
    else:
        # Vision format (page-level)
        for page in result.get('pages', []):
            counts['tables'] += len(page.get('tables', []))
            counts['images'] += len(page.get('images', []))
            counts['formulas'] += len(page.get('formulas', []))
            counts['code_blocks'] += len(page.get('code_blocks', []))

    return counts


def estimate_cost(page_count, dpi=150):
    """Estimate API cost for vision-based extraction."""
    # Handle zero pages gracefully
    if page_count <= 0:
        return {
            'page_count': 0,
            'total_tokens': 0,
            'cost_usd': 0.0,
            'cost_per_page': 0.0,
            'error': 'No pages to process'
        }

    # Rough estimation based on Gemini 2.0 Flash pricing
    # 150 DPI page ≈ 1,500 vision tokens
    # $0.000002625 per vision token (as of Jan 2025)

    tokens_per_page = 1500
    cost_per_token = 0.000002625

    total_tokens = page_count * tokens_per_page
    total_cost = total_tokens * cost_per_token

    return {
        'page_count': page_count,
        'total_tokens': total_tokens,
        'cost_usd': round(total_cost, 4),
        'cost_per_page': round(total_cost / page_count, 6)
    }


def compare_page_content(text_page, vision_page):
    """Compare a single page's extraction results."""
    comparison = {
        'page': text_page.get('page'),
        'text_only': {
            'text_length': len(text_page.get('text', '')),
            'sample': text_page.get('text', '')[:200] + '...'
        },
        'vision': {
            'text_length': len(vision_page.get('text', '')),
            'tables_found': len(vision_page.get('tables', [])),
            'images_found': len(vision_page.get('images', [])),
            'formulas_found': len(vision_page.get('formulas', [])),
            'code_blocks_found': len(vision_page.get('code_blocks', []))
        }
    }

    # Add sample of first table if present
    if vision_page.get('tables'):
        table = vision_page['tables'][0]
        comparison['vision']['sample_table'] = {
            'caption': table.get('caption'),
            'headers': table.get('headers'),
            'row_count': len(table.get('rows', []))
        }

    # Add sample of first image if present
    if vision_page.get('images'):
        img = vision_page['images'][0]
        comparison['vision']['sample_image'] = {
            'type': img.get('type'),
            'description': img.get('description')[:100] + '...'
        }

    return comparison


def main():
    if len(sys.argv) < 2:
        print("Usage: python compare_extraction.py <pdf_path>")
        sys.exit(1)

    pdf_path = sys.argv[1]

    print("=" * 80)
    print("EXTRACTION COMPARISON: Text-Only vs Deterministic vs Vision-Based")
    print("=" * 80)
    print()

    # Run all three extractions
    print("1️⃣  Running text-only extraction...")
    try:
        text_result = extract_text_only(pdf_path)
        print("   ✅ Text-only complete")
    except Exception as e:
        print(f"   ❌ Text extraction failed: {e}")
        text_result = {"pages": [], "error": str(e)}

    print("\n2️⃣  Running deterministic extraction...")
    try:
        deterministic_result = extract_deterministic(pdf_path)
        print("   ✅ Deterministic complete")
    except Exception as e:
        print(f"   ❌ Deterministic extraction failed: {e}")
        deterministic_result = {"pages": [], "error": str(e)}

    print("\n3️⃣  Running vision-based extraction (may take longer)...")
    try:
        vision_result = extract_vision(pdf_path)
        print("   ✅ Vision complete")
    except Exception as e:
        print(f"   ❌ Vision extraction failed: {e}")
        vision_result = {"pages": [], "error": str(e)}

    print()
    print("=" * 80)
    print("RESULTS SUMMARY")
    print("=" * 80)

    # Page counts
    text_pages = len(text_result.get('pages', []))
    deterministic_pages = len(deterministic_result.get('pages', []))
    vision_pages = len(vision_result.get('pages', []))

    print(f"\nDocument: {pdf_path}")
    print(f"\nPages extracted:")
    print(f"  - Text-only: {text_pages}")
    if text_result.get('error'):
        print(f"    ⚠️  Error: {text_result['error']}")
    print(f"  - Deterministic: {deterministic_pages}")
    if deterministic_result.get('error'):
        print(f"    ⚠️  Error: {deterministic_result['error']}")
    print(f"  - Vision: {vision_pages}")
    if vision_result.get('error'):
        print(f"    ⚠️  Error: {vision_result['error']}")

    # Rich content counts
    print(f"\n📊 Rich Content Detected:")
    print("-" * 80)

    deterministic_counts = count_rich_content(deterministic_result)
    vision_counts = count_rich_content(vision_result)

    print(f"\n{'Content Type':<25} {'Deterministic':<15} {'Vision':<15}")
    print("-" * 55)
    print(f"{'Tables':<25} {deterministic_counts['tables']:<15} {vision_counts['tables']:<15}")
    print(f"{'Images':<25} {deterministic_counts['images']:<15} {vision_counts['images']:<15}")
    print(f"{'Formulas':<25} {deterministic_counts['formulas']:<15} {vision_counts['formulas']:<15}")
    print(f"{'Code Blocks':<25} {deterministic_counts['code_blocks']:<15} {vision_counts['code_blocks']:<15}")
    print("-" * 55)
    print(f"{'TOTAL':<25} {sum(deterministic_counts.values()):<15} {sum(vision_counts.values()):<15}")

    # Performance & Cost comparison
    print(f"\n💰 Performance & Cost Comparison:")
    print("-" * 80)

    cost = estimate_cost(vision_pages)

    print(f"\n{'Metric':<30} {'Text-Only':<15} {'Deterministic':<15} {'Vision':<15}")
    print("-" * 75)
    print(f"{'Speed (est.)':<30} {'<0.1s/page':<15} {'0.1-0.6s/page':<15} {'1-2s/page':<15}")
    print(f"{'Cost per page':<30} {'$0.00':<15} {'$0.00':<15} {'$0.004':<15}")

    if not cost.get('error'):
        total_cost = cost['cost_usd']
        print(f"{'Total cost (this doc)':<30} {'$0.00':<15} {'$0.00':<15} ${total_cost:<14}")

    print(f"{'Offline capable':<30} {'Yes':<15} {'Yes':<15} {'No':<15}")
    print(f"{'Preserves structure':<30} {'No':<15} {'Yes':<15} {'Yes':<15}")

    # Sample content from deterministic extraction
    print(f"\n📄 Sample Extracted Content (Deterministic):")
    print("-" * 80)

    if deterministic_counts['tables'] > 0:
        tables = deterministic_result.get('tables', [])
        if tables:
            table = tables[0]
            print(f"\n✅ Sample Table (Page {table.get('page', '?')}):")
            print(f"   Method: {table.get('extraction_method', 'unknown')}")
            print(f"   Headers: {table.get('headers', [])}")
            print(f"   Rows: {table.get('row_count', 0)} x {table.get('col_count', 0)}")
            if table.get('rows') and len(table['rows']) > 0:
                print(f"   First row: {table['rows'][0]}")

    if deterministic_counts['images'] > 0:
        images = deterministic_result.get('images', [])
        if images:
            img = images[0]
            print(f"\n✅ Sample Image (Page {img.get('page', '?')}):")
            print(f"   Format: {img.get('format', 'unknown')}")
            print(f"   Size: {img.get('width', '?')}x{img.get('height', '?')}")
            print(f"   Bytes: {img.get('size_bytes', 0):,}")

    if deterministic_counts['formulas'] > 0:
        formulas = deterministic_result.get('formulas', [])
        if formulas:
            formula = formulas[0]
            print(f"\n✅ Sample Formula (Page {formula.get('page', '?')}):")
            print(f"   LaTeX: {formula.get('latex', 'N/A')}")

    if deterministic_counts['code_blocks'] > 0:
        code_blocks = deterministic_result.get('code_blocks', [])
        if code_blocks:
            code = code_blocks[0]
            print(f"\n✅ Sample Code Block (Page {code.get('page', '?')}):")
            print(f"   Language: {code.get('language', 'unknown')}")
            print(f"   Lines: {code.get('line_count', 0)}")
            code_preview = code.get('code', '')[:150]
            if code_preview:
                print(f"   Preview: {code_preview}...")

    # Recommendations
    print()
    print("=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)

    total_rich_deterministic = sum(deterministic_counts.values())
    total_rich_vision = sum(vision_counts.values())

    if total_rich_deterministic > 0:
        print(f"\n✅ This document contains {total_rich_deterministic} rich content elements (deterministic).")
        print("\n🎯 RECOMMENDED APPROACH: Deterministic Extraction")
        print("\nReasons:")
        print("  ✅ FREE - Zero API costs")
        print("  ✅ FAST - 3-10x faster than vision")
        print("  ✅ ACCURATE - Purpose-built libraries for each content type")
        print("  ✅ OFFLINE - No internet required")
        print("  ✅ DETERMINISTIC - Same input = same output")

        print("\nDetected content:")
        if deterministic_counts['tables'] > 0:
            print(f"  - {deterministic_counts['tables']} tables (pdfplumber/camelot)")
        if deterministic_counts['images'] > 0:
            print(f"  - {deterministic_counts['images']} images (PyMuPDF)")
        if deterministic_counts['formulas'] > 0:
            print(f"  - {deterministic_counts['formulas']} formulas (Pix2Text → LaTeX)")
        if deterministic_counts['code_blocks'] > 0:
            print(f"  - {deterministic_counts['code_blocks']} code blocks (Pygments)")

        if not cost.get('error'):
            vision_cost = cost['cost_usd']
            print(f"\n💰 Cost savings: ${vision_cost} per document")
            print(f"   (Vision would cost ${vision_cost}, Deterministic is FREE)")
    else:
        print("\n❌ No rich content detected.")
        print("   Text-only extraction may be sufficient.")
        print("   However, this might be a false negative - manual review recommended.")

    print("\n" + "=" * 80)
    print("\n💡 Next Steps:")
    print("   1. Review sample content above")
    print("   2. Check if tables/formulas/images are extracted correctly")
    print("   3. If quality is good, integrate deterministic extraction")
    print("   4. Reserve AI (Gemini) for lesson generation, NOT structure parsing")

    print()
    print("=" * 80)


if __name__ == "__main__":
    main()
