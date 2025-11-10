"""
Unit tests for PDF post-processor.

Tests cover:
1. Noise removal (headers, footers, page numbers)
2. Cross-page table merging
3. Context enhancement
4. Symbol correction
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ingestion.postprocessor import PDFPostProcessor


class TestNoiseRemoval:
    """Test noise removal functionality."""

    def test_remove_page_numbers(self):
        """Test removal of page numbers."""
        processor = PDFPostProcessor()

        text = """
        Page 5
        Network Protocols

        This chapter covers HTTP.

        第 6 页
        """

        cleaned = processor.remove_noise(text)

        assert "Page 5" not in cleaned
        assert "第 6 页" not in cleaned
        assert "Network Protocols" in cleaned
        assert "HTTP" in cleaned

    def test_remove_copyright(self):
        """Test removal of copyright notices."""
        processor = PDFPostProcessor()

        text = """
        Network Security

        This document is confidential.

        Copyright © 2024. All rights reserved.
        """

        cleaned = processor.remove_noise(text)

        assert "Copyright" not in cleaned
        assert "All rights reserved" not in cleaned
        assert "confidential" not in cleaned  # Case insensitive
        assert "Network Security" in cleaned

    def test_remove_separators(self):
        """Test removal of repeated separators."""
        processor = PDFPostProcessor()

        text = """
        Chapter 1

        ---

        Introduction

        ===

        Background
        """

        cleaned = processor.remove_noise(text)

        assert "---" not in cleaned
        assert "===" not in cleaned
        assert "Chapter 1" in cleaned
        assert "Introduction" in cleaned

    def test_clean_pages_skip_empty(self):
        """Test that nearly empty pages are skipped."""
        processor = PDFPostProcessor()

        pages = [
            {'page': 1, 'text': 'Page 1\n\nThis is substantial content with enough text to keep.'},
            {'page': 2, 'text': 'Page 2'},  # Too short, should be skipped
            {'page': 3, 'text': 'Page 3\n\nAnother page with enough content.'},
        ]

        cleaned = processor.clean_pages(pages)

        assert len(cleaned) == 2
        assert cleaned[0]['page'] == 1
        assert cleaned[1]['page'] == 3


class TestTableMerging:
    """Test cross-page table merging."""

    def test_merge_consecutive_tables(self):
        """Test merging tables on consecutive pages."""
        processor = PDFPostProcessor()

        tables = [
            {
                'page': 5,
                'headers': ['Protocol', 'Port'],
                'rows': [['HTTP', '80'], ['HTTPS', '443']],
                'col_count': 2,
                'row_count': 2
            },
            {
                'page': 6,
                'headers': ['', ''],  # Continuation has no headers
                'rows': [['SSH', '22'], ['FTP', '21']],
                'col_count': 2,
                'row_count': 2
            }
        ]

        merged = processor.merge_cross_page_tables(tables)

        assert len(merged) == 1
        assert merged[0]['row_count'] == 4
        assert merged[0]['page_start'] == 5
        assert merged[0]['page_end'] == 6
        assert merged[0]['merged'] == True
        assert len(merged[0]['rows']) == 4

    def test_no_merge_non_consecutive(self):
        """Test that non-consecutive tables are not merged."""
        processor = PDFPostProcessor()

        tables = [
            {
                'page': 5,
                'headers': ['Protocol', 'Port'],
                'rows': [['HTTP', '80']],
                'col_count': 2,
                'row_count': 1
            },
            {
                'page': 8,  # Not consecutive (page 7 missing)
                'headers': ['Name', 'Value'],
                'rows': [['SSH', '22']],
                'col_count': 2,
                'row_count': 1
            }
        ]

        merged = processor.merge_cross_page_tables(tables)

        assert len(merged) == 2  # Should remain separate

    def test_no_merge_different_columns(self):
        """Test that tables with different column counts are not merged."""
        processor = PDFPostProcessor()

        tables = [
            {
                'page': 5,
                'headers': ['Protocol', 'Port'],
                'rows': [['HTTP', '80']],
                'col_count': 2,
                'row_count': 1
            },
            {
                'page': 6,
                'headers': ['Name', 'Value', 'Description'],  # 3 columns
                'rows': [['SSH', '22', 'Secure Shell']],
                'col_count': 3,
                'row_count': 1
            }
        ]

        merged = processor.merge_cross_page_tables(tables)

        assert len(merged) == 2  # Should remain separate


class TestContextEnhancement:
    """Test context enhancement functionality."""

    def test_find_table_caption(self):
        """Test finding table captions."""
        processor = PDFPostProcessor()

        page_text = """
        Network Protocols

        Table 1: Common Network Protocols

        This table shows the most common protocols.
        """

        table = {'page': 1}
        caption = processor._find_table_caption(table, page_text)

        assert caption is not None
        assert "Table 1" in caption
        assert "Common Network Protocols" in caption

    def test_extract_context(self):
        """Test extracting context paragraphs."""
        processor = PDFPostProcessor()

        page_text = """
        Network Security Fundamentals

        This section covers the basics of network security.

        The following table shows common protocols and their port numbers.

        [TABLE WOULD BE HERE]
        """

        table = {'page': 1}
        context = processor._extract_context(table, page_text)

        assert context is not None
        assert "protocols" in context.lower() or "port" in context.lower()

    def test_enhance_table_context_with_pages(self):
        """Test full context enhancement with pages."""
        processor = PDFPostProcessor()

        tables = [
            {
                'page': 1,
                'headers': ['Protocol', 'Port'],
                'rows': [['HTTP', '80']],
                'col_count': 2,
                'row_count': 1
            }
        ]

        pages = [
            {
                'page': 1,
                'text': 'Table 1: Network Protocols\n\nThis shows common protocols.'
            }
        ]

        enhanced = processor.enhance_table_context(tables, pages)

        assert len(enhanced) == 1
        assert 'caption' in enhanced[0]
        assert 'Table 1' in enhanced[0]['caption']


class TestSymbolCorrection:
    """Test formula symbol correction."""

    def test_correct_greek_letters(self):
        """Test Greek letter to LaTeX conversion."""
        processor = PDFPostProcessor()

        formulas = [
            {'latex': 'α + β = γ', 'page': 1}
        ]

        corrected = processor.correct_formula_symbols(formulas)

        assert len(corrected) == 1
        assert r'\alpha' in corrected[0]['latex']
        assert r'\beta' in corrected[0]['latex']
        assert r'\gamma' in corrected[0]['latex']
        assert 'α' not in corrected[0]['latex']

    def test_correct_math_symbols(self):
        """Test math symbol to LaTeX conversion."""
        processor = PDFPostProcessor()

        formulas = [
            {'latex': 'x ≤ y ≥ z ≠ ∞', 'page': 1}
        ]

        corrected = processor.correct_formula_symbols(formulas)

        latex = corrected[0]['latex']
        assert r'\leq' in latex
        assert r'\geq' in latex
        assert r'\neq' in latex
        assert r'\infty' in latex


class TestFullPipeline:
    """Test full post-processing pipeline."""

    def test_process_full_extraction(self):
        """Test complete post-processing pipeline."""
        processor = PDFPostProcessor()

        extraction_result = {
            'pages': [
                {'page': 1, 'text': 'Page 1\n\nNetwork Protocols\n\nThis chapter covers protocols.'},
                {'page': 2, 'text': 'Page 2'},  # Will be removed (too short)
            ],
            'tables': [
                {
                    'page': 1,
                    'headers': ['Protocol', 'Port'],
                    'rows': [['HTTP', '80']],
                    'col_count': 2,
                    'row_count': 1
                },
                {
                    'page': 2,
                    'headers': ['', ''],
                    'rows': [['HTTPS', '443']],
                    'col_count': 2,
                    'row_count': 1
                },
            ],
            'formulas': [
                {'latex': 'E = mc²', 'page': 1}  # Will be normalized
            ],
            'code_blocks': [],
            'images': [],
            'summary': {
                'total_pages': 2,
                'total_tables': 2,
                'total_formulas': 1,
                'total_code_blocks': 0
            }
        }

        result = processor.process(extraction_result)

        # Check pages cleaned (empty page removed)
        assert len(result['pages']) == 1

        # Check tables merged
        assert len(result['tables']) <= 2  # May be merged if consecutive

        # Check formulas corrected
        assert len(result['formulas']) == 1

        # Check summary updated
        assert result['summary']['postprocessed'] == True
        assert result['summary']['total_pages'] == 1


# Run tests if executed directly
if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
