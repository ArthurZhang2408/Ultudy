"""
Verification Script: Compare Raw Extraction vs Post-Processed Results

This script helps you verify the post-processing improvements by:
1. Running extraction with and without post-processing
2. Showing side-by-side comparison
3. Highlighting improvements
4. Generating quality metrics

Usage:
    python3 verify_postprocessing.py <pdf_path>
"""

import sys
import json
import subprocess
import os
from typing import Dict, Any


def extract_without_postprocessing(pdf_path: str) -> Dict[str, Any]:
    """
    Extract PDF without post-processing (disable the module).

    This temporarily patches the extraction script to skip post-processing.
    """
    script_path = os.path.join(os.path.dirname(__file__), 'extract_text_deterministic.py')

    # Read the script
    with open(script_path, 'r') as f:
        script_content = f.read()

    # Create temporary version without post-processing
    temp_script = script_content.replace(
        'from ingestion.postprocessor import postprocess_extraction',
        '# DISABLED: from ingestion.postprocessor import postprocess_extraction'
    ).replace(
        'result = postprocess_extraction(result)',
        '# DISABLED: result = postprocess_extraction(result)'
    )

    # Write temporary script
    temp_path = '/tmp/extract_no_postprocess.py'
    with open(temp_path, 'w') as f:
        f.write(temp_script)

    # Run extraction
    try:
        result = subprocess.run(
            ['python3', temp_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            print(f"❌ Raw extraction failed: {result.stderr}", file=sys.stderr)
            return {}

        return json.loads(result.stdout)
    except Exception as e:
        print(f"❌ Error running raw extraction: {e}", file=sys.stderr)
        return {}


def extract_with_postprocessing(pdf_path: str) -> Dict[str, Any]:
    """Extract PDF with post-processing enabled."""
    script_path = os.path.join(os.path.dirname(__file__), 'extract_text_deterministic.py')

    try:
        result = subprocess.run(
            ['python3', script_path, pdf_path],
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            print(f"❌ Post-processed extraction failed: {result.stderr}", file=sys.stderr)
            return {}

        return json.loads(result.stdout)
    except Exception as e:
        print(f"❌ Error running post-processed extraction: {e}", file=sys.stderr)
        return {}


def analyze_noise_removal(raw: Dict, processed: Dict) -> Dict:
    """Analyze noise removal effectiveness."""
    raw_pages = raw.get('pages', [])
    processed_pages = processed.get('pages', [])

    total_raw_length = sum(len(p.get('text', '')) for p in raw_pages)
    total_processed_length = sum(len(p.get('text', '')) for p in processed_pages)

    noise_removed = total_raw_length - total_processed_length
    noise_percentage = (noise_removed / total_raw_length * 100) if total_raw_length > 0 else 0

    # Count common noise patterns
    noise_patterns_found = {
        'page_numbers': 0,
        'copyright_notices': 0,
        'separators': 0
    }

    for page in raw_pages:
        text = page.get('text', '')
        if 'Page ' in text or '页' in text:
            noise_patterns_found['page_numbers'] += 1
        if 'Copyright' in text or '©' in text:
            noise_patterns_found['copyright_notices'] += 1
        if '---' in text or '===' in text:
            noise_patterns_found['separators'] += 1

    return {
        'total_raw_chars': total_raw_length,
        'total_processed_chars': total_processed_length,
        'noise_removed_chars': noise_removed,
        'noise_percentage': round(noise_percentage, 2),
        'noise_patterns_found': noise_patterns_found,
        'pages_removed': len(raw_pages) - len(processed_pages)
    }


def analyze_table_merging(raw: Dict, processed: Dict) -> Dict:
    """Analyze table merging effectiveness."""
    raw_tables = raw.get('tables', [])
    processed_tables = processed.get('tables', [])

    merged_count = sum(1 for t in processed_tables if t.get('merged', False))

    # Calculate average rows per table
    raw_avg_rows = (sum(t.get('row_count', 0) for t in raw_tables) / len(raw_tables)) if raw_tables else 0
    processed_avg_rows = (sum(t.get('row_count', 0) for t in processed_tables) / len(processed_tables)) if processed_tables else 0

    return {
        'raw_table_count': len(raw_tables),
        'processed_table_count': len(processed_tables),
        'tables_merged': len(raw_tables) - len(processed_tables),
        'merged_count': merged_count,
        'raw_avg_rows': round(raw_avg_rows, 1),
        'processed_avg_rows': round(processed_avg_rows, 1)
    }


def analyze_context_enhancement(raw: Dict, processed: Dict) -> Dict:
    """Analyze context enhancement effectiveness."""
    raw_tables = raw.get('tables', [])
    processed_tables = processed.get('tables', [])

    captions_added = sum(1 for t in processed_tables if 'caption' in t)
    context_added = sum(1 for t in processed_tables if 'context' in t)

    return {
        'total_tables': len(processed_tables),
        'tables_with_captions': captions_added,
        'tables_with_context': context_added,
        'caption_percentage': round((captions_added / len(processed_tables) * 100) if processed_tables else 0, 1),
        'context_percentage': round((context_added / len(processed_tables) * 100) if processed_tables else 0, 1)
    }


def analyze_symbol_correction(raw: Dict, processed: Dict) -> Dict:
    """Analyze formula symbol correction."""
    raw_formulas = raw.get('formulas', [])
    processed_formulas = processed.get('formulas', [])

    corrections_made = 0
    for raw_f, proc_f in zip(raw_formulas, processed_formulas):
        if raw_f.get('latex', '') != proc_f.get('latex', ''):
            corrections_made += 1

    return {
        'total_formulas': len(processed_formulas),
        'formulas_corrected': corrections_made,
        'correction_percentage': round((corrections_made / len(processed_formulas) * 100) if processed_formulas else 0, 1)
    }


def show_comparison(raw: Dict, processed: Dict):
    """Display side-by-side comparison."""
    print("\n" + "=" * 80)
    print("VERIFICATION: Raw Extraction vs Post-Processed")
    print("=" * 80)

    # Overall summary
    print(f"\n📊 Overall Summary")
    print("-" * 80)
    print(f"{'Metric':<40} {'Raw':<15} {'Processed':<15} {'Change':<10}")
    print("-" * 80)

    raw_pages = len(raw.get('pages', []))
    proc_pages = len(processed.get('pages', []))
    print(f"{'Pages':<40} {raw_pages:<15} {proc_pages:<15} {proc_pages - raw_pages:+d}")

    raw_tables = len(raw.get('tables', []))
    proc_tables = len(processed.get('tables', []))
    print(f"{'Tables':<40} {raw_tables:<15} {proc_tables:<15} {proc_tables - raw_tables:+d}")

    raw_formulas = len(raw.get('formulas', []))
    proc_formulas = len(processed.get('formulas', []))
    print(f"{'Formulas':<40} {raw_formulas:<15} {proc_formulas:<15} {proc_formulas - raw_formulas:+d}")

    # Noise removal analysis
    print(f"\n🧹 Noise Removal Analysis")
    print("-" * 80)
    noise_analysis = analyze_noise_removal(raw, processed)
    print(f"Total characters (raw): {noise_analysis['total_raw_chars']:,}")
    print(f"Total characters (processed): {noise_analysis['total_processed_chars']:,}")
    print(f"Noise removed: {noise_analysis['noise_removed_chars']:,} chars ({noise_analysis['noise_percentage']}%)")
    print(f"Pages removed (nearly empty): {noise_analysis['pages_removed']}")
    print(f"\nNoise patterns found in raw:")
    for pattern, count in noise_analysis['noise_patterns_found'].items():
        print(f"  - {pattern.replace('_', ' ').title()}: {count} instances")

    # Table merging analysis
    print(f"\n📋 Table Merging Analysis")
    print("-" * 80)
    table_analysis = analyze_table_merging(raw, processed)
    print(f"Raw tables: {table_analysis['raw_table_count']}")
    print(f"Processed tables: {table_analysis['processed_table_count']}")
    print(f"Tables merged: {table_analysis['tables_merged']}")
    print(f"Average rows per table:")
    print(f"  - Raw: {table_analysis['raw_avg_rows']} rows")
    print(f"  - Processed: {table_analysis['processed_avg_rows']} rows")
    if table_analysis['processed_avg_rows'] > table_analysis['raw_avg_rows']:
        print(f"  ✅ Merging increased average table size (better completeness)")

    # Context enhancement analysis
    print(f"\n📝 Context Enhancement Analysis")
    print("-" * 80)
    context_analysis = analyze_context_enhancement(raw, processed)
    print(f"Total tables: {context_analysis['total_tables']}")
    print(f"Tables with captions: {context_analysis['tables_with_captions']} ({context_analysis['caption_percentage']}%)")
    print(f"Tables with context: {context_analysis['tables_with_context']} ({context_analysis['context_percentage']}%)")

    # Symbol correction analysis
    print(f"\n🔣 Symbol Correction Analysis")
    print("-" * 80)
    symbol_analysis = analyze_symbol_correction(raw, processed)
    print(f"Total formulas: {symbol_analysis['total_formulas']}")
    print(f"Formulas corrected: {symbol_analysis['formulas_corrected']} ({symbol_analysis['correction_percentage']}%)")

    # Sample comparisons
    print(f"\n📄 Sample Content Comparison")
    print("-" * 80)

    # Show first page comparison
    raw_pages_list = raw.get('pages', [])
    proc_pages_list = processed.get('pages', [])

    if raw_pages_list and proc_pages_list:
        raw_sample = raw_pages_list[0].get('text', '')[:300]
        proc_sample = proc_pages_list[0].get('text', '')[:300]

        print(f"\n🔴 Raw (first 300 chars):")
        print(f"{raw_sample}...")

        print(f"\n🟢 Processed (first 300 chars):")
        print(f"{proc_sample}...")

    # Show table comparison
    raw_tables_list = raw.get('tables', [])
    proc_tables_list = processed.get('tables', [])

    if raw_tables_list and proc_tables_list:
        print(f"\n📊 Table Comparison (first table):")
        print(f"\n🔴 Raw:")
        raw_table = raw_tables_list[0]
        print(f"  Page: {raw_table.get('page')}")
        print(f"  Headers: {raw_table.get('headers', [])}")
        print(f"  Rows: {raw_table.get('row_count', 0)}")
        print(f"  Caption: {raw_table.get('caption', 'None')}")

        print(f"\n🟢 Processed:")
        proc_table = proc_tables_list[0]
        print(f"  Page: {proc_table.get('page_start', proc_table.get('page'))} - {proc_table.get('page_end', proc_table.get('page'))}")
        print(f"  Headers: {proc_table.get('headers', [])}")
        print(f"  Rows: {proc_table.get('row_count', 0)}")
        print(f"  Caption: {proc_table.get('caption', 'None')}")
        if proc_table.get('context'):
            print(f"  Context: {proc_table['context'][:100]}...")
        if proc_table.get('merged'):
            print(f"  ✅ MERGED from multiple pages")

    # Show formula comparison
    raw_formulas_list = raw.get('formulas', [])
    proc_formulas_list = processed.get('formulas', [])

    if raw_formulas_list and proc_formulas_list:
        print(f"\n🔢 Formula Comparison (first formula):")
        raw_formula = raw_formulas_list[0]
        proc_formula = proc_formulas_list[0]

        print(f"\n🔴 Raw LaTeX:")
        print(f"  {raw_formula.get('latex', 'N/A')}")

        print(f"\n🟢 Processed LaTeX:")
        print(f"  {proc_formula.get('latex', 'N/A')}")

        if raw_formula.get('latex') != proc_formula.get('latex'):
            print(f"  ✅ CORRECTED symbols")

    # Final summary
    print(f"\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    improvements = []
    if noise_analysis['noise_percentage'] > 5:
        improvements.append(f"✅ Removed {noise_analysis['noise_percentage']}% noise")
    if table_analysis['tables_merged'] > 0:
        improvements.append(f"✅ Merged {table_analysis['tables_merged']} cross-page tables")
    if context_analysis['tables_with_captions'] > 0:
        improvements.append(f"✅ Added captions to {context_analysis['tables_with_captions']} tables")
    if symbol_analysis['formulas_corrected'] > 0:
        improvements.append(f"✅ Corrected {symbol_analysis['formulas_corrected']} formulas")

    if improvements:
        print("\nPost-processing improvements:")
        for improvement in improvements:
            print(f"  {improvement}")
    else:
        print("\n⚠️  No significant improvements detected (document may already be clean)")

    print()


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 verify_postprocessing.py <pdf_path>")
        print()
        print("This script compares raw extraction vs post-processed extraction")
        print("to help you verify the improvements from Phase 1.")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"❌ Error: File not found: {pdf_path}")
        sys.exit(1)

    print("🔬 Verification Script: Comparing Raw vs Post-Processed Extraction")
    print("=" * 80)
    print(f"PDF: {pdf_path}")
    print()

    # Step 1: Extract without post-processing
    print("1️⃣  Running raw extraction (without post-processing)...")
    raw_result = extract_without_postprocessing(pdf_path)
    if not raw_result:
        print("❌ Raw extraction failed. Cannot proceed with comparison.")
        sys.exit(1)
    print("   ✅ Raw extraction complete")

    # Step 2: Extract with post-processing
    print("\n2️⃣  Running post-processed extraction...")
    processed_result = extract_with_postprocessing(pdf_path)
    if not processed_result:
        print("❌ Post-processed extraction failed. Cannot proceed with comparison.")
        sys.exit(1)
    print("   ✅ Post-processed extraction complete")

    # Step 3: Compare and display
    print("\n3️⃣  Analyzing differences...")
    show_comparison(raw_result, processed_result)

    # Save detailed results
    output_path = '/tmp/postprocessing_comparison.json'
    with open(output_path, 'w') as f:
        json.dump({
            'raw': raw_result,
            'processed': processed_result,
            'analysis': {
                'noise_removal': analyze_noise_removal(raw_result, processed_result),
                'table_merging': analyze_table_merging(raw_result, processed_result),
                'context_enhancement': analyze_context_enhancement(raw_result, processed_result),
                'symbol_correction': analyze_symbol_correction(raw_result, processed_result)
            }
        }, f, indent=2)

    print(f"\n💾 Detailed results saved to: {output_path}")
    print()


if __name__ == "__main__":
    main()
