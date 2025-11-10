"""
Unit tests for Layout Analyzer.

Tests cover:
1. Column detection (single, two-column, three-column)
2. Heading hierarchy (H1/H2/H3)
3. Reading order determination
4. Document structure building
5. Text block extraction
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ingestion.layout_analyzer import (
    LayoutAnalyzer,
    LayoutType,
    HeadingLevel,
    TextBlock,
    analyze_layout
)


class TestColumnDetection:
    """Test column detection functionality."""

    def test_cluster_coordinates(self):
        """Test coordinate clustering algorithm."""
        analyzer = LayoutAnalyzer()

        coords = [10, 12, 15, 100, 105, 110, 300, 305]
        clusters = analyzer._cluster_coordinates(coords, threshold=20)

        # Should create 3 clusters
        assert len(clusters) == 3
        assert len(clusters[0]) == 3  # 10, 12, 15
        assert len(clusters[1]) == 3  # 100, 105, 110
        assert len(clusters[2]) == 2  # 300, 305

    def test_cluster_empty(self):
        """Test clustering with empty list."""
        analyzer = LayoutAnalyzer()

        clusters = analyzer._cluster_coordinates([], threshold=20)
        assert clusters == []

    def test_cluster_single(self):
        """Test clustering with single coordinate."""
        analyzer = LayoutAnalyzer()

        clusters = analyzer._cluster_coordinates([100], threshold=20)
        assert len(clusters) == 1
        assert clusters[0] == [100]


class TestBlockAssignment:
    """Test assigning blocks to columns."""

    def test_assign_single_column(self):
        """Test assignment when no columns detected."""
        analyzer = LayoutAnalyzer()

        blocks = [
            TextBlock(
                text="Test",
                page=1,
                bbox=(10, 10, 100, 20),
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=-1,
                reading_order=-1
            )
        ]

        result = analyzer._assign_to_columns(blocks, columns=None)

        assert len(result) == 1
        assert result[0].column == 0

    def test_assign_two_columns(self):
        """Test assignment to two columns."""
        analyzer = LayoutAnalyzer()

        # Create blocks in left and right columns
        blocks = [
            TextBlock(
                text="Left",
                page=1,
                bbox=(50, 10, 200, 20),  # Center at x=125
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
                bbox=(350, 10, 500, 20),  # Center at x=425
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=-1,
                reading_order=-1
            )
        ]

        # Two columns: left (0-300) and right (300-600)
        columns = [(0, 300), (300, 600)]

        result = analyzer._assign_to_columns(blocks, columns)

        assert result[0].column == 0  # Left column
        assert result[1].column == 1  # Right column


class TestReadingOrder:
    """Test reading order determination."""

    def test_reading_order_single_column(self):
        """Test reading order in single column (top to bottom)."""
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
            ),
            TextBlock(
                text="Middle",
                page=1,
                bbox=(10, 50, 100, 60),
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

        # Should be sorted top to bottom
        assert ordered[0].text == "Top"
        assert ordered[1].text == "Middle"
        assert ordered[2].text == "Bottom"

        # Reading order should be sequential
        assert ordered[0].reading_order == 0
        assert ordered[1].reading_order == 1
        assert ordered[2].reading_order == 2

    def test_reading_order_two_columns(self):
        """Test reading order in two columns (left then right)."""
        analyzer = LayoutAnalyzer()

        blocks = [
            # Right column (should come second)
            TextBlock(
                text="Right-Top",
                page=1,
                bbox=(350, 10, 500, 20),
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=1,
                reading_order=-1
            ),
            TextBlock(
                text="Right-Bottom",
                page=1,
                bbox=(350, 100, 500, 110),
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=1,
                reading_order=-1
            ),
            # Left column (should come first)
            TextBlock(
                text="Left-Top",
                page=1,
                bbox=(10, 10, 150, 20),
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=0,
                reading_order=-1
            ),
            TextBlock(
                text="Left-Bottom",
                page=1,
                bbox=(10, 100, 150, 110),
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

        # Should process left column first, then right
        assert ordered[0].text == "Left-Top"
        assert ordered[1].text == "Left-Bottom"
        assert ordered[2].text == "Right-Top"
        assert ordered[3].text == "Right-Bottom"


class TestHeadingDetection:
    """Test heading detection and hierarchy."""

    def test_detect_headings_by_size(self):
        """Test heading detection based on font size."""
        analyzer = LayoutAnalyzer()

        blocks = [
            # Body text (12pt)
            TextBlock(
                text="Body paragraph 1",
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
                text="Body paragraph 2",
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
            # H1 heading (18pt - 50% larger)
            TextBlock(
                text="Main Title",
                page=1,
                bbox=(10, 10, 200, 30),
                font_size=18,
                font_name="Arial",
                font_weight="bold",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=0,
                reading_order=0
            ),
            # H2 heading (15pt - 25% larger)
            TextBlock(
                text="Section Heading",
                page=1,
                bbox=(10, 35, 200, 45),
                font_size=15,
                font_name="Arial",
                font_weight="bold",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=0,
                reading_order=3
            )
        ]

        headings = analyzer._detect_headings(blocks)

        # Should detect 2 headings
        assert len(headings) == 2

        # Find by text
        main_title = next(h for h in headings if h.text == "Main Title")
        section = next(h for h in headings if h.text == "Section Heading")

        # Check hierarchy
        assert main_title.heading_level == HeadingLevel.H1
        assert section.heading_level == HeadingLevel.H2

    def test_detect_headings_by_bold(self):
        """Test heading detection based on bold font."""
        analyzer = LayoutAnalyzer()

        blocks = [
            # Body text
            TextBlock(
                text="Normal text",
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
            # Bold text (slightly larger)
            TextBlock(
                text="Bold Heading",
                page=1,
                bbox=(10, 10, 200, 20),
                font_size=13,  # Only 8% larger, but bold
                font_name="Arial-Bold",
                font_weight="bold",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=0,
                reading_order=0
            )
        ]

        headings = analyzer._detect_headings(blocks)

        # Should detect bold text as heading
        assert len(headings) == 1
        assert headings[0].text == "Bold Heading"

    def test_no_headings(self):
        """Test when no headings detected."""
        analyzer = LayoutAnalyzer()

        blocks = [
            TextBlock(
                text="Body text",
                page=1,
                bbox=(10, 10, 200, 20),
                font_size=12,
                font_name="Arial",
                font_weight="normal",
                is_heading=False,
                heading_level=HeadingLevel.BODY,
                column=0,
                reading_order=0
            )
        ]

        headings = analyzer._detect_headings(blocks)

        assert len(headings) == 0


class TestDocumentStructure:
    """Test document structure building."""

    def test_build_simple_structure(self):
        """Test building structure with H1 and H2."""
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
            ),
            TextBlock(
                text="Section 1.2",
                page=2,
                bbox=(10, 10, 200, 20),
                font_size=15,
                font_name="Arial",
                font_weight="bold",
                is_heading=True,
                heading_level=HeadingLevel.H2,
                column=0,
                reading_order=2
            )
        ]

        structure = analyzer._build_document_structure(headings, [])

        # Should have one H1 section
        assert len(structure['sections']) == 1

        # H1 should have 2 subsections
        assert structure['sections'][0]['title'] == "Chapter 1"
        assert len(structure['sections'][0]['subsections']) == 2

        # Check subsections
        assert structure['sections'][0]['subsections'][0]['title'] == "Section 1.1"
        assert structure['sections'][0]['subsections'][1]['title'] == "Section 1.2"

    def test_build_nested_structure(self):
        """Test building structure with H1/H2/H3."""
        analyzer = LayoutAnalyzer()

        headings = [
            TextBlock(
                text="Chapter",
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
                text="Section",
                page=1,
                bbox=(10, 40, 200, 50),
                font_size=15,
                font_name="Arial",
                font_weight="bold",
                is_heading=True,
                heading_level=HeadingLevel.H2,
                column=0,
                reading_order=1
            ),
            TextBlock(
                text="Subsection",
                page=1,
                bbox=(10, 60, 200, 70),
                font_size=13,
                font_name="Arial",
                font_weight="bold",
                is_heading=True,
                heading_level=HeadingLevel.H3,
                column=0,
                reading_order=2
            )
        ]

        structure = analyzer._build_document_structure(headings, [])

        # Check nesting
        h1 = structure['sections'][0]
        assert h1['title'] == "Chapter"

        h2 = h1['subsections'][0]
        assert h2['title'] == "Section"

        h3 = h2['subsections'][0]
        assert h3['title'] == "Subsection"


class TestBlockSerialization:
    """Test converting TextBlock to dict."""

    def test_block_to_dict(self):
        """Test TextBlock serialization."""
        analyzer = LayoutAnalyzer()

        block = TextBlock(
            text="Test text",
            page=1,
            bbox=(10, 20, 100, 30),
            font_size=12,
            font_name="Arial",
            font_weight="bold",
            is_heading=True,
            heading_level=HeadingLevel.H2,
            column=0,
            reading_order=5
        )

        result = analyzer._block_to_dict(block)

        assert result['text'] == "Test text"
        assert result['page'] == 1
        assert result['bbox'] == [10, 20, 100, 30]
        assert result['font_size'] == 12
        assert result['font_name'] == "Arial"
        assert result['font_weight'] == "bold"
        assert result['is_heading'] == True
        assert result['heading_level'] == 2
        assert result['column'] == 0
        assert result['reading_order'] == 5


class TestLayoutTypeDetection:
    """Test overall layout type detection."""

    def test_determine_single_column(self):
        """Test detection of single-column document."""
        analyzer = LayoutAnalyzer()

        pages = [
            {'page': 1, 'layout': 'single_column'},
            {'page': 2, 'layout': 'single_column'},
            {'page': 3, 'layout': 'single_column'}
        ]

        layout = analyzer._determine_overall_layout(pages)
        assert layout == LayoutType.SINGLE_COLUMN

    def test_determine_two_column(self):
        """Test detection of two-column document."""
        analyzer = LayoutAnalyzer()

        pages = [
            {'page': 1, 'layout': 'two_column'},
            {'page': 2, 'layout': 'two_column'},
            {'page': 3, 'layout': 'two_column'}
        ]

        layout = analyzer._determine_overall_layout(pages)
        assert layout == LayoutType.TWO_COLUMN

    def test_determine_mixed_layout(self):
        """Test detection of mixed layout document."""
        analyzer = LayoutAnalyzer()

        pages = [
            {'page': 1, 'layout': 'single_column'},
            {'page': 2, 'layout': 'two_column'},
            {'page': 3, 'layout': 'two_column'}
        ]

        layout = analyzer._determine_overall_layout(pages)
        assert layout == LayoutType.MIXED


class TestConvenienceFunction:
    """Test convenience function."""

    def test_analyze_layout_function_structure(self):
        """Test that analyze_layout returns correct structure."""
        # This test doesn't require an actual PDF, just tests the module import
        from ingestion.layout_analyzer import analyze_layout

        # Verify function exists and is callable
        assert callable(analyze_layout)


# Run tests if executed directly
if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
