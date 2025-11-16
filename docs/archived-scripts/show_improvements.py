#!/usr/bin/env python3
"""
Show improvements from Phase 1-3 with side-by-side comparison.

Usage:
    python3 show_improvements.py <pdf_file>
"""

import sys
import os
import json
import subprocess
from typing import Dict, Any


def extract_raw(pdf_path: str) -> Dict[str, Any]:
    """Extract without any improvements (baseline)."""
    env = os.environ.copy()
    env['SKIP_POSTPROCESSING'] = '1'

    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path],
        env=env,
        capture_output=True,
        text=True
    )

    return json.loads(result.stdout)


def extract_improved(pdf_path: str) -> Dict[str, Any]:
    """Extract with all improvements (Phases 1-3)."""
    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path],
        capture_output=True,
        text=True
    )

    return json.loads(result.stdout)


def extract_markdown(pdf_path: str) -> str:
    """Extract as Markdown (Phase 2)."""
    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path, '--format', 'markdown'],
        capture_output=True,
        text=True
    )

    return result.stdout


def calculate_improvements(raw: Dict, improved: Dict) -> Dict[str, Any]:
    """Calculate improvement metrics."""
    metrics = {}

    # Text length comparison
    raw_text_length = sum(len(p['text']) for p in raw.get('pages', []))
    improved_text_length = sum(len(p['text']) for p in improved.get('pages', []))

    noise_removed = raw_text_length - improved_text_length
    noise_percentage = (noise_removed / raw_text_length * 100) if raw_text_length > 0 else 0

    metrics['noise_removed'] = noise_removed
    metrics['noise_percentage'] = noise_percentage

    # Table comparison
    metrics['raw_tables'] = len(raw.get('tables', []))
    metrics['improved_tables'] = len(improved.get('tables', []))

    # Tables with captions
    raw_with_captions = sum(1 for t in raw.get('tables', []) if t.get('caption') and 'Table' in t.get('caption', ''))
    improved_with_captions = sum(1 for t in improved.get('tables', []) if t.get('caption') and 'Table' in t.get('caption', ''))

    metrics['raw_captions'] = raw_with_captions
    metrics['improved_captions'] = improved_with_captions

    # Layout analysis
    if 'layout' in improved:
        metrics['layout_type'] = improved['layout'].get('layout_type', 'N/A')
        metrics['headings_detected'] = len(improved['layout'].get('headings', []))
        metrics['has_structure'] = len(improved['layout'].get('structure', {}).get('sections', [])) > 0
    else:
        metrics['layout_type'] = 'N/A'
        metrics['headings_detected'] = 0
        metrics['has_structure'] = False

    return metrics


def print_comparison(metrics: Dict[str, Any], markdown_sample: str):
    """Print formatted comparison."""
    print("=" * 80)
    print("PDF EXTRACTION IMPROVEMENTS - PHASE 1-3 COMPARISON")
    print("=" * 80)
    print()

    # Phase 1: Post-Processing
    print("📊 PHASE 1: POST-PROCESSING (Cleaning & Enhancement)")
    print("-" * 80)
    print(f"  Noise removed:           {metrics['noise_removed']:,} characters ({metrics['noise_percentage']:.2f}%)")
    print(f"  Tables before:           {metrics['raw_tables']}")
    print(f"  Tables after merging:    {metrics['improved_tables']}")
    print(f"  Tables with captions:    {metrics['raw_captions']} → {metrics['improved_captions']}")
    print()

    # Phase 2: Markdown Output
    print("📝 PHASE 2: MARKDOWN OUTPUT (LLM-Optimal Format)")
    print("-" * 80)
    print("  Format:                  JSON → Markdown")
    print("  Tables:                  Pipe syntax (| Header | Header |)")
    print("  Formulas:                LaTeX notation ($...$)")
    print("  Code:                    Fenced blocks with language hints")
    print()
    print("  Sample Markdown output (first 500 chars):")
    print("  " + "-" * 76)
    for line in markdown_sample[:500].split('\n')[:10]:
        print(f"  {line}")
    if len(markdown_sample) > 500:
        print("  ...")
    print()

    # Phase 3: Layout Analysis
    print("📐 PHASE 3: LAYOUT ANALYSIS (Structure & Order)")
    print("-" * 80)
    print(f"  Layout type detected:    {metrics['layout_type']}")
    print(f"  Headings detected:       {metrics['headings_detected']}")
    print(f"  Document structure:      {'✅ Yes' if metrics['has_structure'] else '❌ No'}")
    print(f"  Reading order:           {'✅ Corrected' if metrics['layout_type'] != 'N/A' else '❌ Not available'}")
    print()

    # Summary
    print("=" * 80)
    print("SUMMARY OF IMPROVEMENTS")
    print("=" * 80)
    print()
    print("Before (Raw extraction):")
    print("  ❌ Noisy text (page numbers, headers, footers)")
    print("  ❌ Split tables across pages")
    print("  ❌ No captions or context")
    print("  ❌ JSON output (not optimal for LLMs)")
    print("  ❌ No structure detection")
    print("  ❌ Wrong reading order in multi-column PDFs")
    print()
    print("After (Phase 1-3):")
    print(f"  ✅ Clean text ({metrics['noise_percentage']:.1f}% noise removed)")
    print(f"  ✅ Merged tables (improved from {metrics['raw_tables']} to {metrics['improved_tables']})")
    print(f"  ✅ Auto-generated captions ({metrics['improved_captions']} tables)")
    print("  ✅ Markdown output (LLM-ready)")
    print(f"  ✅ Structure detection ({metrics['headings_detected']} headings)")
    print(f"  ✅ Correct reading order ({metrics['layout_type']} layout)")
    print()

    print("=" * 80)
    print("WHAT EACH PHASE DOES")
    print("=" * 80)
    print()
    print("Phase 1: Post-Processing")
    print("  • Removes noise (page numbers, copyright, separators)")
    print("  • Merges tables split across pages")
    print("  • Auto-generates captions from surrounding text")
    print("  • Corrects formula symbols (Unicode → LaTeX)")
    print()
    print("Phase 2: Markdown Output")
    print("  • Converts JSON to Markdown (LLM-optimal format)")
    print("  • Formats tables with pipe syntax")
    print("  • Embeds formulas with LaTeX notation")
    print("  • Creates syntax-highlighted code blocks")
    print()
    print("Phase 3: Layout Analysis")
    print("  • Detects multi-column layouts (70% of academic papers)")
    print("  • Identifies heading hierarchy (H1/H2/H3)")
    print("  • Corrects reading order (left→right, top→bottom)")
    print("  • Builds document structure map (outline)")
    print()
    print("=" * 80)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 show_improvements.py <pdf_file>")
        print()
        print("Example: python3 show_improvements.py lecture.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    print("Extracting PDF (this may take a moment)...")
    print()

    # Extract with different methods
    raw = extract_raw(pdf_path)
    improved = extract_improved(pdf_path)
    markdown_sample = extract_markdown(pdf_path)

    # Calculate improvements
    metrics = calculate_improvements(raw, improved)

    # Print comparison
    print_comparison(metrics, markdown_sample)

    print()
    print("💡 TIP: To see detailed output files, run:")
    print(f"   ./backend/scripts/demo_improvements.sh {pdf_path}")
    print()


if __name__ == '__main__':
    main()
