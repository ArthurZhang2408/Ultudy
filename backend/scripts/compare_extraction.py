"""
Comparison script: Text-only vs Vision-based extraction

This script demonstrates the difference between current text-only extraction
and the proposed vision-based approach.

Usage:
    python compare_extraction.py <pdf_path>

Output:
    - Side-by-side comparison of extracted content
    - Quality metrics (tables found, images described, formulas extracted)
    - Cost estimation for vision-based approach
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


def extract_vision(pdf_path):
    """Run vision-based extraction."""
    result = subprocess.run(
        ['python3', 'extract_text_vision.py', pdf_path],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)


def count_rich_content(vision_result):
    """Count rich content elements extracted."""
    counts = {
        'tables': 0,
        'images': 0,
        'formulas': 0,
        'code_blocks': 0
    }

    for page in vision_result.get('pages', []):
        counts['tables'] += len(page.get('tables', []))
        counts['images'] += len(page.get('images', []))
        counts['formulas'] += len(page.get('formulas', []))
        counts['code_blocks'] += len(page.get('code_blocks', []))

    return counts


def estimate_cost(page_count, dpi=150):
    """Estimate API cost for vision-based extraction."""
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
    print("EXTRACTION COMPARISON: Text-Only vs Vision-Based")
    print("=" * 80)
    print()

    # Run both extractions
    print("Running text-only extraction...")
    text_result = extract_text_only(pdf_path)

    print("Running vision-based extraction (may take longer)...")
    vision_result = extract_vision(pdf_path)

    print()
    print("=" * 80)
    print("RESULTS SUMMARY")
    print("=" * 80)

    # Page counts
    text_pages = len(text_result.get('pages', []))
    vision_pages = len(vision_result.get('pages', []))

    print(f"\nDocument: {pdf_path}")
    print(f"Pages extracted (text-only): {text_pages}")
    print(f"Pages extracted (vision): {vision_pages}")

    # Rich content counts
    rich_counts = count_rich_content(vision_result)
    print(f"\n📊 Rich Content Detected:")
    print(f"  - Tables: {rich_counts['tables']}")
    print(f"  - Images/Diagrams: {rich_counts['images']}")
    print(f"  - Mathematical Formulas: {rich_counts['formulas']}")
    print(f"  - Code Blocks: {rich_counts['code_blocks']}")

    # Cost estimation
    cost = estimate_cost(vision_pages)
    print(f"\n💰 Cost Estimation (Vision-Based):")
    print(f"  - Total tokens: {cost['total_tokens']:,}")
    print(f"  - Total cost: ${cost['cost_usd']}")
    print(f"  - Per page: ${cost['cost_per_page']}")

    # Page-by-page comparison
    print(f"\n📄 Page-by-Page Comparison:")
    print("-" * 80)

    for i in range(min(3, len(text_result.get('pages', [])))):  # First 3 pages
        text_page = text_result['pages'][i]
        vision_page = vision_result['pages'][i]

        comparison = compare_page_content(text_page, vision_page)

        print(f"\nPage {comparison['page']}:")
        print(f"  Text-only: {comparison['text_only']['text_length']} chars")
        print(f"  Vision: {comparison['vision']['text_length']} chars")
        print(f"    + {comparison['vision']['tables_found']} tables")
        print(f"    + {comparison['vision']['images_found']} images")
        print(f"    + {comparison['vision']['formulas_found']} formulas")
        print(f"    + {comparison['vision']['code_blocks_found']} code blocks")

        if comparison['vision'].get('sample_table'):
            table = comparison['vision']['sample_table']
            print(f"  Sample table: {table['caption']} ({table['row_count']} rows)")

        if comparison['vision'].get('sample_image'):
            img = comparison['vision']['sample_image']
            print(f"  Sample image: {img['type']} - {img['description']}")

    # Recommendations
    print()
    print("=" * 80)
    print("RECOMMENDATIONS")
    print("=" * 80)

    total_rich = sum(rich_counts.values())
    if total_rich > 0:
        print(f"\n✅ This document contains {total_rich} rich content elements.")
        print("   Vision-based extraction is RECOMMENDED for:")
        if rich_counts['tables'] > 0:
            print(f"   - {rich_counts['tables']} tables with structured data")
        if rich_counts['images'] > 0:
            print(f"   - {rich_counts['images']} diagrams/charts that need description")
        if rich_counts['formulas'] > 0:
            print(f"   - {rich_counts['formulas']} mathematical formulas")
        if rich_counts['code_blocks'] > 0:
            print(f"   - {rich_counts['code_blocks']} code blocks with syntax")

        print(f"\n   Estimated cost: ${cost['cost_usd']} (acceptable for educational content)")
    else:
        print("\n❌ No rich content detected.")
        print("   Text-only extraction may be sufficient.")
        print("   However, this might be a false negative - manual review recommended.")

    print()
    print("=" * 80)


if __name__ == "__main__":
    main()
