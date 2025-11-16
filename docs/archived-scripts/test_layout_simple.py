"""
Simple test script for layout analyzer (no pytest required).
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ingestion.layout_analyzer import (
    LayoutAnalyzer,
    LayoutType,
    HeadingLevel,
    TextBlock
)


def test_cluster_coordinates():
    """Test coordinate clustering."""
    analyzer = LayoutAnalyzer()

    coords = [10, 12, 15, 100, 105, 110, 300, 305]
    clusters = analyzer._cluster_coordinates(coords, threshold=20)

    assert len(clusters) == 3, f"Expected 3 clusters, got {len(clusters)}"
    assert len(clusters[0]) == 3, f"Expected 3 in cluster 0, got {len(clusters[0])}"
    print("✅ Coordinate clustering works")


def test_assign_to_columns():
    """Test column assignment."""
    analyzer = LayoutAnalyzer()

    blocks = [
        TextBlock(
            text="Left",
            page=1,
            bbox=(50, 10, 200, 20),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=-1,
            reading_order=-1
        ),
        TextBlock(
            text="Right",
            page=1,
            bbox=(350, 10, 500, 20),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=-1,
            reading_order=-1
        )
    ]

    columns = [(0, 300), (300, 600)]
    result = analyzer._assign_to_columns(blocks, columns)

    assert result[0].column == 0, f"Expected column 0, got {result[0].column}"
    assert result[1].column == 1, f"Expected column 1, got {result[1].column}"
    print("✅ Column assignment works")


def test_reading_order():
    """Test reading order determination."""
    analyzer = LayoutAnalyzer()

    blocks = [
        TextBlock(
            text="Bottom",
            page=1,
            bbox=(10, 100, 100, 110),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=0,
            reading_order=-1
        ),
        TextBlock(
            text="Top",
            page=1,
            bbox=(10, 10, 100, 20),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=0,
            reading_order=-1
        )
    ]

    ordered = analyzer._determine_reading_order(blocks)

    assert ordered[0].text == "Top", f"Expected 'Top' first, got '{ordered[0].text}'"
    assert ordered[1].text == "Bottom", f"Expected 'Bottom' second, got '{ordered[1].text}'"
    assert ordered[0].reading_order == 0
    assert ordered[1].reading_order == 1
    print("✅ Reading order works")


def test_heading_detection():
    """Test heading detection."""
    analyzer = LayoutAnalyzer()

    blocks = [
        TextBlock(
            text="Body 1",
            page=1,
            bbox=(10, 50, 200, 60),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=0,
            reading_order=1
        ),
        TextBlock(
            text="Body 2",
            page=1,
            bbox=(10, 70, 200, 80),
            font_size=12,
            font_name="Arial",
            font_weight="normal",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=0,
            reading_order=2
        ),
        TextBlock(
            text="Heading",
            page=1,
            bbox=(10, 10, 200, 30),
            font_size=18,
            font_name="Arial-Bold",
            font_weight="bold",
            is_heading=False,
            heading_level=HeadingLevel.BODY,
            column=0,
            reading_order=0
        )
    ]

    headings = analyzer._detect_headings(blocks)

    assert len(headings) == 1, f"Expected 1 heading, got {len(headings)}"
    assert headings[0].text == "Heading"
    assert headings[0].heading_level == HeadingLevel.H1
    print("✅ Heading detection works")


def test_document_structure():
    """Test document structure building."""
    analyzer = LayoutAnalyzer()

    headings = [
        TextBlock(
            text="Chapter 1",
            page=1,
            bbox=(10, 10, 200, 30),
            font_size=18,
            font_name="Arial",
            font_weight="bold",
            is_heading=True,
            heading_level=HeadingLevel.H1,
            column=0,
            reading_order=0
        ),
        TextBlock(
            text="Section 1.1",
            page=1,
            bbox=(10, 40, 200, 50),
            font_size=15,
            font_name="Arial",
            font_weight="bold",
            is_heading=True,
            heading_level=HeadingLevel.H2,
            column=0,
            reading_order=1
        )
    ]

    structure = analyzer._build_document_structure(headings, [])

    assert len(structure['sections']) == 1
    assert structure['sections'][0]['title'] == "Chapter 1"
    assert len(structure['sections'][0]['subsections']) == 1
    assert structure['sections'][0]['subsections'][0]['title'] == "Section 1.1"
    print("✅ Document structure building works")


def main():
    """Run all tests."""
    print("Running Layout Analyzer Tests...")
    print("=" * 80)

    try:
        test_cluster_coordinates()
        test_assign_to_columns()
        test_reading_order()
        test_heading_detection()
        test_document_structure()

        print("=" * 80)
        print("✅ All tests passed!")
        return 0
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
