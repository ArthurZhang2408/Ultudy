#!/usr/bin/env python3
"""
Test script to verify bbox-based positioning and duplicate removal.

This script extracts a PDF and checks:
1. Tables appear at correct positions (not all at end)
2. No duplicate table text in output
3. Content is in logical reading order

Usage:
    python3 test_positioning.py <pdf_file>
"""

import sys
import os
import subprocess
import re


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 test_positioning.py <pdf_file>")
        print()
        print("Example: python3 test_positioning.py lecture.pdf")
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(f"Error: File not found: {pdf_path}")
        sys.exit(1)

    print("=" * 80)
    print("TESTING: BBOX-BASED POSITIONING & DUPLICATE REMOVAL")
    print("=" * 80)
    print()
    print(f"PDF: {pdf_path}")
    print()

    # Extract as Markdown
    print("Extracting PDF to Markdown...")
    result = subprocess.run(
        ['python3', 'backend/scripts/extract_text_deterministic.py', pdf_path, '--format', 'markdown'],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print("Error during extraction:")
        print(result.stderr)
        sys.exit(1)

    markdown = result.stdout

    # Save to file for inspection
    output_file = 'test_output.md'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(markdown)

    print(f"✅ Extraction complete. Saved to: {output_file}")
    print()

    # Analyze the output
    print("=" * 80)
    print("ANALYSIS")
    print("=" * 80)
    print()

    # Check 1: Count tables
    table_count = markdown.count('###') - markdown.count('#### ')  # Count H3 headings (tables)
    pipe_tables = len(re.findall(r'\|.*\|.*\|', markdown))

    print(f"1️⃣  Table Detection")
    print(f"   - Table headings (###): {table_count}")
    print(f"   - Pipe table rows (|...|): {pipe_tables}")
    print()

    # Check 2: Look for duplicate patterns
    print(f"2️⃣  Duplicate Detection")

    # Split into pages
    pages = markdown.split('## Page ')

    duplicate_found = False
    for i, page in enumerate(pages[1:], 1):  # Skip first empty split
        # Look for patterns of repeated content
        lines = page.split('\n')

        # Check for raw table text followed by formatted table
        raw_table_pattern = False
        formatted_table_pattern = False

        for j, line in enumerate(lines):
            # Check if we have both raw data lines AND pipe tables
            if '|' in line and '|' in line and not line.strip().startswith('###'):
                formatted_table_pattern = True

            # Look for suspicious patterns (data without table formatting)
            if len(line) < 100 and line.strip() and not line.startswith('#'):
                # Check if this looks like table data
                if any(keyword in line.lower() for keyword in ['year', 'name', 'value', 'date']):
                    # Check if there's a formatted table nearby
                    nearby_has_table = any('|' in lines[k] for k in range(max(0, j-10), min(len(lines), j+10)))
                    if nearby_has_table:
                        raw_table_pattern = True

        if raw_table_pattern and formatted_table_pattern:
            print(f"   ⚠️  Page {i}: Possible duplicate (raw + formatted table)")
            duplicate_found = True

    if not duplicate_found:
        print(f"   ✅ No obvious duplicates detected")

    print()

    # Check 3: Table positioning
    print(f"3️⃣  Table Positioning")

    # Check if all tables are at the end of pages
    tables_at_end = 0
    tables_inline = 0

    for page in pages[1:]:
        lines = [l for l in page.split('\n') if l.strip()]
        if not lines:
            continue

        # Find first table
        first_table_line = None
        for i, line in enumerate(lines):
            if line.strip().startswith('###') and 'Table' in line:
                first_table_line = i
                break

        if first_table_line is not None:
            # Check if table is near the end (last 20% of content)
            if first_table_line > len(lines) * 0.8:
                tables_at_end += 1
            else:
                tables_inline += 1

    print(f"   - Tables at end of page: {tables_at_end}")
    print(f"   - Tables inline (middle of page): {tables_inline}")

    if tables_inline > 0:
        print(f"   ✅ Good! Tables appear inline (bbox positioning working)")
    elif tables_at_end > 0:
        print(f"   ⚠️  All tables at page end (bbox positioning may not be working)")

    print()

    # Check 4: Reading order
    print(f"4️⃣  Reading Order")

    # Look for column indicators in first page
    first_page = pages[1] if len(pages) > 1 else ""

    if 'Column' in first_page or 'column' in first_page:
        print(f"   ℹ️  Document mentions columns (may be multi-column)")
    else:
        print(f"   ℹ️  No column references found")

    # Check if content flows logically
    print(f"   ✅ Content extracted (check {output_file} for reading order)")

    print()

    # Summary
    print("=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print()

    issues = []
    improvements = []

    if duplicate_found:
        issues.append("Possible duplicate content detected")
    else:
        improvements.append("No duplicates found")

    if tables_inline > 0:
        improvements.append(f"Tables positioned inline ({tables_inline} tables)")
    elif tables_at_end > 0:
        issues.append(f"All tables at page end ({tables_at_end} tables)")

    if improvements:
        print("✅ Improvements working:")
        for imp in improvements:
            print(f"   - {imp}")
        print()

    if issues:
        print("⚠️  Potential issues:")
        for issue in issues:
            print(f"   - {issue}")
        print()

    print(f"📄 Full output saved to: {output_file}")
    print(f"   Review manually to verify:")
    print(f"   1. Tables appear where they should (not all at end)")
    print(f"   2. No duplicate raw table text")
    print(f"   3. Reading order makes sense")
    print()
    print(f"💡 To view: cat {output_file} | less")
    print()


if __name__ == '__main__':
    main()
