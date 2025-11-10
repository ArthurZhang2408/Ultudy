"""
Unit tests for Markdown converter.

Tests cover:
1. Basic Markdown conversion
2. Table formatting
3. Formula embedding (LaTeX)
4. Code block syntax highlighting
5. Image references
6. Metadata section
"""

import sys
import os

# Add src directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from ingestion.markdown_converter import MarkdownConverter, convert_to_markdown


class TestBasicConversion:
    """Test basic Markdown conversion."""

    def test_convert_simple_document(self):
        """Test converting a simple document with just text."""
        converter = MarkdownConverter()

        extraction = {
            'pages': [
                {'page': 1, 'text': 'Introduction\n\nThis is the first page.'},
                {'page': 2, 'text': 'Chapter 1\n\nThis is the second page.'},
            ],
            'tables': [],
            'formulas': [],
            'code_blocks': [],
            'images': [],
            'summary': {
                'total_pages': 2,
                'total_tables': 0,
                'total_formulas': 0,
                'total_code_blocks': 0,
                'total_images': 0
            }
        }

        markdown = converter.convert(extraction)

        assert '## Page 1' in markdown
        assert '## Page 2' in markdown
        assert 'Introduction' in markdown
        assert 'Chapter 1' in markdown
        assert 'Document Metadata' in markdown

    def test_convert_with_title(self):
        """Test document with title."""
        converter = MarkdownConverter()

        extraction = {
            'title': 'Test Document',
            'pages': [{'page': 1, 'text': 'Content'}],
            'tables': [],
            'formulas': [],
            'code_blocks': [],
            'images': []
        }

        markdown = converter.convert(extraction)

        assert '# Test Document' in markdown

    def test_empty_document(self):
        """Test handling empty document."""
        converter = MarkdownConverter()

        extraction = {
            'pages': [],
            'tables': [],
            'formulas': [],
            'code_blocks': [],
            'images': []
        }

        markdown = converter.convert(extraction)

        assert markdown is not None
        assert len(markdown) > 0


class TestTableFormatting:
    """Test table conversion to Markdown."""

    def test_table_to_markdown(self):
        """Test basic table conversion."""
        converter = MarkdownConverter()

        table = {
            'page': 1,
            'caption': 'Table 1: Test Table',
            'headers': ['Name', 'Age', 'City'],
            'rows': [
                ['Alice', '25', 'Toronto'],
                ['Bob', '30', 'Waterloo'],
            ]
        }

        markdown = converter._table_to_markdown(table)

        assert '### Table 1: Test Table' in markdown
        assert '| Name | Age | City |' in markdown
        assert '| --- | --- | --- |' in markdown
        assert '| Alice | 25 | Toronto |' in markdown
        assert '| Bob | 30 | Waterloo |' in markdown

    def test_table_with_context(self):
        """Test table with context paragraph."""
        converter = MarkdownConverter()

        table = {
            'page': 1,
            'caption': 'Table 1',
            'context': 'This table shows student information.',
            'headers': ['Name', 'Age'],
            'rows': [['Alice', '25']]
        }

        markdown = converter._table_to_markdown(table)

        assert '*This table shows student information.*' in markdown

    def test_table_merged_pages(self):
        """Test table spanning multiple pages."""
        converter = MarkdownConverter()

        table = {
            'page': 5,
            'page_start': 5,
            'page_end': 6,
            'caption': 'Large Table',
            'headers': ['Col1', 'Col2'],
            'rows': [['A', 'B'], ['C', 'D']]
        }

        markdown = converter._table_to_markdown(table)

        assert '<!-- Source: Pages 5-6 -->' in markdown

    def test_table_missing_headers(self):
        """Test table without headers."""
        converter = MarkdownConverter()

        table = {
            'page': 1,
            'headers': [],
            'rows': [['A', 'B'], ['C', 'D']]
        }

        markdown = converter._table_to_markdown(table)

        # Should auto-generate headers
        assert 'Column 1' in markdown
        assert 'Column 2' in markdown


class TestFormulaEmbedding:
    """Test formula conversion to LaTeX."""

    def test_inline_formula(self):
        """Test short inline formula."""
        converter = MarkdownConverter()

        formula = {
            'page': 1,
            'latex': 'E = mc^{2}'
        }

        markdown = converter._formula_to_markdown(formula)

        assert markdown == '$E = mc^{2}$'

    def test_block_formula(self):
        """Test long block formula."""
        converter = MarkdownConverter()

        formula = {
            'page': 1,
            'latex': '\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}'
        }

        markdown = converter._formula_to_markdown(formula)

        # Long formulas should be display math
        assert markdown.startswith('$$')
        assert markdown.endswith('$$')

    def test_empty_formula(self):
        """Test handling empty formula."""
        converter = MarkdownConverter()

        formula = {
            'page': 1,
            'latex': ''
        }

        markdown = converter._formula_to_markdown(formula)

        assert markdown == ""


class TestCodeBlocks:
    """Test code block conversion."""

    def test_python_code(self):
        """Test Python code block."""
        converter = MarkdownConverter()

        code = {
            'page': 1,
            'language': 'python',
            'code': 'def hello():\n    print("Hello")'
        }

        markdown = converter._code_to_markdown(code)

        assert '```python' in markdown
        assert 'def hello():' in markdown
        assert '```' in markdown
        assert 'Code from page 1' in markdown

    def test_unknown_language(self):
        """Test code with unknown language."""
        converter = MarkdownConverter()

        code = {
            'page': 1,
            'language': 'unknown',
            'code': 'some code'
        }

        markdown = converter._code_to_markdown(code)

        # Should still create code block
        assert '```' in markdown
        assert 'some code' in markdown

    def test_language_mapping(self):
        """Test language name mapping."""
        converter = MarkdownConverter()

        # C++ should map to cpp
        code = {
            'page': 1,
            'language': 'c++',
            'code': 'int main() {}'
        }

        markdown = converter._code_to_markdown(code)

        assert '```cpp' in markdown


class TestImageReferences:
    """Test image reference generation."""

    def test_image_reference(self):
        """Test basic image reference."""
        converter = MarkdownConverter()

        image = {
            'page': 1,
            'image_index': 0,
            'format': 'png',
            'width': 800,
            'height': 600
        }

        markdown = converter._image_to_markdown(image)

        assert markdown.startswith('![')
        assert '800x600' in markdown
        assert 'image_p1_0.png' in markdown


class TestFullConversion:
    """Test complete document conversion."""

    def test_complete_document(self):
        """Test document with all content types."""
        converter = MarkdownConverter()

        extraction = {
            'title': 'Complete Document',
            'pages': [
                {'page': 1, 'text': 'Introduction to the topic.'},
            ],
            'tables': [
                {
                    'page': 1,
                    'caption': 'Table 1: Data',
                    'headers': ['A', 'B'],
                    'rows': [['1', '2']]
                }
            ],
            'formulas': [
                {
                    'page': 1,
                    'latex': 'x = y'
                }
            ],
            'code_blocks': [
                {
                    'page': 1,
                    'language': 'python',
                    'code': 'print("test")'
                }
            ],
            'images': [
                {
                    'page': 1,
                    'image_index': 0,
                    'format': 'png',
                    'width': 100,
                    'height': 100
                }
            ],
            'summary': {
                'total_pages': 1,
                'total_tables': 1,
                'total_formulas': 1,
                'total_code_blocks': 1,
                'total_images': 1,
                'postprocessed': True
            }
        }

        markdown = converter.convert(extraction)

        # Check all components present
        assert '# Complete Document' in markdown
        assert '## Page 1' in markdown
        assert 'Introduction' in markdown
        assert '### Table 1: Data' in markdown
        assert '| A | B |' in markdown
        assert '$x = y$' in markdown
        assert '```python' in markdown
        assert 'print("test")' in markdown
        assert '![' in markdown
        assert '## Document Metadata' in markdown
        assert 'Post-processed: Yes' in markdown

    def test_metadata_section(self):
        """Test metadata section generation."""
        converter = MarkdownConverter()

        summary = {
            'total_pages': 10,
            'total_tables': 5,
            'total_formulas': 3,
            'total_code_blocks': 2,
            'total_images': 1,
            'postprocessed': True
        }

        markdown = converter._build_metadata_section(summary)

        assert 'Document Metadata' in markdown
        assert 'Total Pages**: 10' in markdown
        assert 'Tables**: 5' in markdown
        assert 'Formulas**: 3' in markdown
        assert 'Code Blocks**: 2' in markdown
        assert 'Images**: 1' in markdown
        assert 'Post-processed: Yes' in markdown


class TestConvenienceFunction:
    """Test convenience function."""

    def test_convert_to_markdown_function(self):
        """Test standalone convert function."""
        extraction = {
            'pages': [{'page': 1, 'text': 'Test'}],
            'tables': [],
            'formulas': [],
            'code_blocks': [],
            'images': []
        }

        markdown = convert_to_markdown(extraction)

        assert isinstance(markdown, str)
        assert '## Page 1' in markdown
        assert 'Test' in markdown


# Run tests if executed directly
if __name__ == '__main__':
    import pytest
    pytest.main([__file__, '-v'])
