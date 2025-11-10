"""
Markdown Converter: Transform extracted PDF content to LLM-optimal Markdown format.

Industry insight: "最佳载体是Markdown" (Markdown is the ideal format for LLMs)
- Preserves structure (headings, tables, lists)
- Removes redundant formatting
- Supports formulas (LaTeX) and code blocks
- Native LLM understanding (GPT-4, Claude trained on Markdown)

This module converts our JSON extraction to structured Markdown that LLMs
can easily parse and understand.

Based on: PDF_EXTRACTION_ANALYSIS.md
"""

from typing import List, Dict, Any, Optional


class MarkdownConverter:
    """Convert extracted PDF content to Markdown format."""

    def __init__(self):
        """Initialize converter."""
        pass

    def convert(self, extraction_result: Dict[str, Any]) -> str:
        """
        Convert full extraction result to Markdown.

        Args:
            extraction_result: Dict with pages, tables, formulas, code_blocks, images

        Returns:
            Markdown string ready for LLM consumption
        """
        sections = []

        # Add document title if available
        title = extraction_result.get('title')
        if title:
            sections.append(f"# {title}\n")

        # Get extraction mode for metadata comment
        mode = extraction_result.get('extraction_mode', 'unknown')
        sections.append(f"<!-- Extracted with {mode} mode -->")

        # Process pages with embedded rich content
        page_sections = self._build_page_sections(extraction_result)
        sections.extend(page_sections)

        # Add metadata summary at end
        if extraction_result.get('summary'):
            sections.append(self._build_metadata_section(extraction_result['summary']))

        return "\n\n".join(sections)

    def _build_page_sections(self, result: Dict) -> List[str]:
        """
        Build Markdown sections with embedded tables, formulas, etc.

        Strategy: Use layout analysis blocks if available for proper ordering,
        otherwise fall back to appending rich content after page text.
        """
        pages = result.get('pages', [])
        tables = result.get('tables', [])
        formulas = result.get('formulas', [])
        code_blocks = result.get('code_blocks', [])
        images = result.get('images', [])
        layout = result.get('layout')

        # If layout analysis is available, use ordered blocks
        if layout and 'pages' in layout:
            return self._build_with_layout(layout, tables, formulas, code_blocks, images)

        # Fall back to original approach
        # Group rich content by page
        content_by_page = self._group_content_by_page(
            tables, formulas, code_blocks, images
        )

        sections = []

        for page in pages:
            page_num = page['page']
            page_md = []

            # Page heading
            page_md.append(f"## Page {page_num}")

            # Main text content
            text = page.get('text', '').strip()
            if text:
                page_md.append(text)

            # Add rich content for this page
            page_content = content_by_page.get(page_num, {})

            # Tables
            for table in page_content.get('tables', []):
                page_md.append(self._table_to_markdown(table))

            # Formulas
            for formula in page_content.get('formulas', []):
                page_md.append(self._formula_to_markdown(formula))

            # Code blocks
            for code in page_content.get('code_blocks', []):
                page_md.append(self._code_to_markdown(code))

            # Images (as references)
            for image in page_content.get('images', []):
                page_md.append(self._image_to_markdown(image))

            sections.append("\n\n".join(page_md))

        return sections

    def _build_with_layout(
        self,
        layout: Dict,
        tables: List[Dict],
        formulas: List[Dict],
        code_blocks: List[Dict],
        images: List[Dict]
    ) -> List[str]:
        """
        Build page sections using layout analysis with bbox-based positioning.

        Merges text blocks with tables/formulas/code based on vertical position
        to preserve original document layout.
        """
        sections = []

        for page_data in layout['pages']:
            page_num = page_data['page']

            # Get all content for this page with bbox coordinates
            content_items = self._merge_content_by_position(
                page_data,
                [t for t in tables if t.get('page') == page_num or t.get('page_start') == page_num],
                [f for f in formulas if f.get('page') == page_num],
                [c for c in code_blocks if c.get('page') == page_num],
                [i for i in images if i.get('page') == page_num]
            )

            # Build markdown
            page_md = [f"## Page {page_num}"]

            for item in content_items:
                page_md.append(item['markdown'])

            sections.append("\n\n".join(page_md))

        return sections

    def _merge_content_by_position(
        self,
        page_data: Dict,
        tables: List[Dict],
        formulas: List[Dict],
        code_blocks: List[Dict],
        images: List[Dict]
    ) -> List[Dict]:
        """
        Merge all content types and sort by vertical position (bbox).

        Returns list of content items with their markdown representation,
        sorted in reading order (column-aware for multi-column layouts).
        """
        content_items = []

        # Get text blocks from layout
        blocks = page_data.get('blocks', [])

        # Create lookup sets for table/formula/code regions to avoid duplicates
        table_regions = set()
        for table in tables:
            if 'bbox' in table:
                bbox = table['bbox']
                # Create a region key (rounded to avoid floating point issues)
                region = (round(bbox[1], 1), round(bbox[3], 1))  # (top, bottom)
                table_regions.add(region)

        # Add text blocks (filtered to avoid table regions)
        for block in blocks:
            text = block.get('text', '').strip()
            if not text:
                continue

            bbox = block.get('bbox', [0, 0, 0, 0])
            y_pos = bbox[1]  # Top y-coordinate

            # Check if this text block overlaps with a table region
            block_region = (round(bbox[1], 1), round(bbox[3], 1))
            is_in_table = any(
                abs(block_region[0] - tr[0]) < 5 and abs(block_region[1] - tr[1]) < 5
                for tr in table_regions
            )

            if is_in_table:
                # Skip text blocks that are inside table regions
                continue

            # Format text with heading markers if applicable
            if block.get('is_heading'):
                level = block.get('heading_level', 0)
                if level == 1:
                    markdown = f"# {text}"
                elif level == 2:
                    markdown = f"## {text}"
                elif level == 3:
                    markdown = f"### {text}"
                else:
                    markdown = text
            else:
                markdown = text

            content_items.append({
                'type': 'text',
                'y_pos': y_pos,
                'column': block.get('column', 0),
                'reading_order': block.get('reading_order', 0),
                'markdown': markdown
            })

        # Add tables at their correct positions
        for table in tables:
            bbox = table.get('bbox')
            if bbox:
                y_pos = bbox[1]
            else:
                # Fallback: place at end if no bbox
                y_pos = 9999

            content_items.append({
                'type': 'table',
                'y_pos': y_pos,
                'column': 0,  # Tables typically span columns
                'reading_order': 9999,  # Default high value
                'markdown': self._table_to_markdown(table)
            })

        # Add formulas at their correct positions
        for formula in formulas:
            bbox = formula.get('bbox')
            if bbox:
                y_pos = bbox[1] if isinstance(bbox, (list, tuple)) else bbox.get('y0', 9999)
            else:
                y_pos = 9999

            markdown = self._formula_to_markdown(formula)
            if markdown:
                content_items.append({
                    'type': 'formula',
                    'y_pos': y_pos,
                    'column': 0,
                    'reading_order': 9999,
                    'markdown': markdown
                })

        # Add code blocks at their correct positions
        for code in code_blocks:
            bbox = code.get('bbox')
            if bbox:
                y_pos = bbox[1] if isinstance(bbox, (list, tuple)) else bbox.get('y0', 9999)
            else:
                y_pos = 9999

            markdown = self._code_to_markdown(code)
            if markdown:
                content_items.append({
                    'type': 'code',
                    'y_pos': y_pos,
                    'column': 0,
                    'reading_order': 9999,
                    'markdown': markdown
                })

        # Add images at their correct positions
        for image in images:
            bbox = image.get('bbox')
            if bbox:
                y_pos = bbox[1] if isinstance(bbox, (list, tuple)) else bbox.get('y0', 9999)
            else:
                y_pos = 9999

            markdown = self._image_to_markdown(image)
            if markdown:
                content_items.append({
                    'type': 'image',
                    'y_pos': y_pos,
                    'column': 0,
                    'reading_order': 9999,
                    'markdown': markdown
                })

        # Sort by reading_order (which accounts for columns and y-position)
        # For items without explicit reading_order, use y_pos as fallback
        content_items.sort(key=lambda x: (x['reading_order'], x['y_pos']))

        return content_items

    def _table_to_markdown(self, table: Dict) -> str:
        """
        Convert table to Markdown format.

        Markdown tables are LLM-friendly and preserve structure perfectly.
        """
        lines = []

        # Add caption if available
        caption = table.get('caption')
        if caption:
            lines.append(f"### {caption}")

        # Add context if available (helps LLM understand table purpose)
        context = table.get('context')
        if context:
            lines.append(f"*{context}*")

        # Build table structure
        headers = table.get('headers', [])
        rows = table.get('rows', [])

        if not headers and not rows:
            return ""  # Empty table

        # Ensure headers exist (use column numbers if missing)
        if not headers:
            col_count = len(rows[0]) if rows else 0
            headers = [f"Column {i+1}" for i in range(col_count)]

        # Header row
        header_line = "| " + " | ".join(str(h).strip() for h in headers) + " |"
        lines.append(header_line)

        # Separator row
        separator = "| " + " | ".join("---" for _ in headers) + " |"
        lines.append(separator)

        # Data rows
        for row in rows:
            # Ensure row has same number of columns as headers
            padded_row = list(row) + [''] * (len(headers) - len(row))
            row_line = "| " + " | ".join(str(cell).strip() for cell in padded_row[:len(headers)]) + " |"
            lines.append(row_line)

        # Add source page info as comment
        page_start = table.get('page_start', table.get('page'))
        page_end = table.get('page_end', page_start)
        if page_start == page_end:
            lines.append(f"<!-- Source: Page {page_start} -->")
        else:
            lines.append(f"<!-- Source: Pages {page_start}-{page_end} -->")

        return "\n".join(lines)

    def _formula_to_markdown(self, formula: Dict) -> str:
        """
        Convert formula to Markdown with LaTeX.

        Uses inline math $...$ or display math $$...$$ depending on context.
        """
        latex = formula.get('latex', '').strip()
        if not latex:
            return ""

        # Check if it's a block equation (long or has multiple operators)
        is_block = len(latex) > 50 or '\n' in latex or '\\begin' in latex

        if is_block:
            # Display math (centered, block)
            return f"$$\n{latex}\n$$"
        else:
            # Inline math
            return f"${latex}$"

    def _code_to_markdown(self, code: Dict) -> str:
        """
        Convert code block to Markdown with syntax highlighting.

        Uses fenced code blocks with language hints for proper highlighting.
        """
        # Normalize to empty string if None to prevent AttributeError
        language = (code.get('language') or '').lower()
        code_text = (code.get('code') or '').strip()

        if not code_text:
            return ""

        # Map Pygments language names to common Markdown language names
        lang_map = {
            'python': 'python',
            'javascript': 'javascript',
            'java': 'java',
            'c++': 'cpp',
            'c': 'c',
            'bash': 'bash',
            'shell': 'bash',
            'sql': 'sql',
            'html': 'html',
            'css': 'css',
            'json': 'json',
            'xml': 'xml',
            'yaml': 'yaml',
            'markdown': 'markdown',
            'plaintext': '',
            'text': '',
        }

        md_lang = lang_map.get(language, language)

        # Add comment about detection
        lines = []
        if md_lang:
            lines.append(f"```{md_lang}")
        else:
            lines.append("```")
        lines.append(code_text)
        lines.append("```")

        # Add source info
        page = code.get('page', '?')
        lines.append(f"<!-- Code from page {page}, detected as: {language} -->")

        return "\n".join(lines)

    def _image_to_markdown(self, image: Dict) -> str:
        """
        Convert image reference to Markdown.

        For now, just creates a reference. In future, could save images
        and embed them with actual image data.
        """
        page = image.get('page', '?')
        img_index = image.get('image_index', 0)
        img_format = image.get('format', 'png')
        width = image.get('width', '?')
        height = image.get('height', '?')

        # Create descriptive alt text
        alt_text = f"Image {img_index} from page {page} ({width}x{height})"

        # Create reference (could be replaced with actual image path later)
        img_filename = f"image_p{page}_{img_index}.{img_format}"

        return f"![{alt_text}]({img_filename})"

    def _build_metadata_section(self, summary: Dict) -> str:
        """
        Build metadata section at end of document.

        Provides LLM with document statistics for context.
        """
        lines = [
            "---",
            "",
            "## Document Metadata",
            "",
            f"- **Total Pages**: {summary.get('total_pages', 0)}",
            f"- **Tables**: {summary.get('total_tables', 0)}",
            f"- **Formulas**: {summary.get('total_formulas', 0)}",
            f"- **Code Blocks**: {summary.get('total_code_blocks', 0)}",
            f"- **Images**: {summary.get('total_images', 0)}",
        ]

        if summary.get('postprocessed'):
            lines.append("- Post-processed: Yes (cleaned and enhanced)")

        return "\n".join(lines)

    def _group_content_by_page(
        self,
        tables: List[Dict],
        formulas: List[Dict],
        code_blocks: List[Dict],
        images: List[Dict]
    ) -> Dict[int, Dict]:
        """
        Group all rich content by page number.

        Returns:
            Dict mapping page_num -> {tables: [], formulas: [], code_blocks: [], images: []}
        """
        content = {}

        # Helper to ensure page exists in dict
        def ensure_page(page_num):
            if page_num not in content:
                content[page_num] = {
                    'tables': [],
                    'formulas': [],
                    'code_blocks': [],
                    'images': []
                }

        # Group tables (handle both single page and page ranges)
        for table in tables:
            page_start = table.get('page_start', table.get('page'))
            ensure_page(page_start)
            content[page_start]['tables'].append(table)

        # Group formulas
        for formula in formulas:
            page = formula.get('page')
            if page:
                ensure_page(page)
                content[page]['formulas'].append(formula)

        # Group code blocks
        for code in code_blocks:
            page = code.get('page')
            if page:
                ensure_page(page)
                content[page]['code_blocks'].append(code)

        # Group images
        for image in images:
            page = image.get('page')
            if page:
                ensure_page(page)
                content[page]['images'].append(image)

        return content

    def convert_to_file(self, extraction_result: Dict[str, Any], output_path: str):
        """
        Convert extraction result and save to file.

        Args:
            extraction_result: Dict with extracted content
            output_path: Path to save Markdown file

        Returns:
            Path to saved file
        """
        markdown = self.convert(extraction_result)

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(markdown)

        return output_path


# Convenience function for direct use
def convert_to_markdown(extraction_result: Dict[str, Any]) -> str:
    """
    Convert extraction result to Markdown.

    Usage:
        from markdown_converter import convert_to_markdown

        result = extract_pdf(pdf_path)
        markdown = convert_to_markdown(result)
        print(markdown)

    Args:
        extraction_result: Dict with pages, tables, formulas, etc.

    Returns:
        Markdown string
    """
    converter = MarkdownConverter()
    return converter.convert(extraction_result)
