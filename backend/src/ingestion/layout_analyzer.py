"""
Layout Analyzer: Detect document structure and reading order.

Phase 3 of PDF extraction enhancement. Focuses on:
1. Multi-column detection (2-column, 3-column layouts)
2. Heading hierarchy (H1/H2/H3 based on font size/weight)
3. Reading order correction (left-to-right, top-to-bottom)
4. Document structure map generation

Industry insight: "布局分析是结构化的关键" (Layout analysis is key to structuring)
- 70% of PDFs have multi-column layouts (academic papers, textbooks)
- Wrong reading order breaks semantic understanding
- Heading hierarchy enables proper chunking for RAG

Based on: PDF_EXTRACTION_MIGRATION_PLAN.md - Phase 3
"""

import fitz  # PyMuPDF
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class LayoutType(Enum):
    """Document layout types."""
    SINGLE_COLUMN = "single_column"
    TWO_COLUMN = "two_column"
    THREE_COLUMN = "three_column"
    MIXED = "mixed"  # Different layouts on different pages


class HeadingLevel(Enum):
    """Heading hierarchy levels."""
    H1 = 1  # Main title
    H2 = 2  # Section heading
    H3 = 3  # Subsection heading
    BODY = 0  # Body text


@dataclass
class TextBlock:
    """Represents a text block with layout information."""
    text: str
    page: int
    bbox: Tuple[float, float, float, float]  # (x0, y0, x1, y1)
    font_size: float
    font_name: str
    font_weight: str  # "bold", "normal"
    is_heading: bool
    heading_level: HeadingLevel
    column: int  # Which column (0-indexed)
    reading_order: int  # Global reading order


class LayoutAnalyzer:
    """Analyze PDF layout and structure."""

    def __init__(self):
        """Initialize layout analyzer."""
        # Thresholds for column detection
        self.COLUMN_GAP_THRESHOLD = 30  # Min gap between columns (points)
        self.MIN_COLUMN_WIDTH = 100  # Min width for a column (points)

        # Thresholds for heading detection
        self.HEADING_SIZE_RATIO = 1.2  # Heading is 20% larger than body
        self.MIN_HEADING_SIZE = 12  # Minimum font size for headings

        # Font weight keywords
        self.BOLD_KEYWORDS = ['bold', 'heavy', 'black', 'semibold']

    def analyze(self, pdf_path: str) -> Dict[str, Any]:
        """
        Analyze PDF layout and structure.

        Args:
            pdf_path: Path to PDF file

        Returns:
            Dict with layout analysis results:
            {
                'layout_type': 'two_column',
                'pages': [
                    {
                        'page': 1,
                        'layout': 'two_column',
                        'columns': 2,
                        'blocks': [...],  # Ordered text blocks
                    }
                ],
                'headings': [...],  # Detected headings with hierarchy
                'structure': {...}  # Document structure map
            }
        """
        doc = fitz.open(pdf_path)

        pages_analysis = []
        all_blocks = []
        all_headings = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Extract text blocks with layout info
            blocks = self._extract_text_blocks(page, page_num + 1)

            # Detect columns on this page
            layout_type, columns = self._detect_columns(blocks, page)

            # Assign blocks to columns
            blocks_with_columns = self._assign_to_columns(blocks, columns)

            # Determine reading order
            ordered_blocks = self._determine_reading_order(blocks_with_columns)

            # Detect headings
            headings = self._detect_headings(ordered_blocks)

            pages_analysis.append({
                'page': page_num + 1,
                'layout': layout_type.value,
                'columns': len(columns) if columns else 1,
                'column_bounds': columns,
                'blocks': [self._block_to_dict(b) for b in ordered_blocks],
                'headings': [self._block_to_dict(b) for b in headings]
            })

            all_blocks.extend(ordered_blocks)
            all_headings.extend(headings)

        doc.close()

        # Determine overall document layout
        overall_layout = self._determine_overall_layout(pages_analysis)

        # Build document structure
        structure = self._build_document_structure(all_headings, all_blocks)

        return {
            'layout_type': overall_layout.value,
            'pages': pages_analysis,
            'headings': [self._block_to_dict(h) for h in all_headings],
            'structure': structure,
            'total_pages': len(pages_analysis),
            'total_headings': len(all_headings)
        }

    def _extract_text_blocks(self, page: fitz.Page, page_num: int) -> List[TextBlock]:
        """Extract text blocks with font and position information."""
        blocks = []

        # Get text with detailed formatting
        text_dict = page.get_text("dict")

        for block in text_dict.get("blocks", []):
            if block.get("type") != 0:  # Not a text block
                continue

            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue

                    # Get font info
                    font_name = span.get("font", "")
                    font_size = span.get("size", 0)

                    # Detect bold by font name
                    font_weight = "bold" if any(kw in font_name.lower() for kw in self.BOLD_KEYWORDS) else "normal"

                    # Get bounding box
                    bbox = tuple(span.get("bbox", [0, 0, 0, 0]))

                    blocks.append(TextBlock(
                        text=text,
                        page=page_num,
                        bbox=bbox,
                        font_size=font_size,
                        font_name=font_name,
                        font_weight=font_weight,
                        is_heading=False,  # Will be determined later
                        heading_level=HeadingLevel.BODY,
                        column=-1,  # Will be assigned later
                        reading_order=-1  # Will be assigned later
                    ))

        return blocks

    def _detect_columns(self, blocks: List[TextBlock], page: fitz.Page) -> Tuple[LayoutType, Optional[List[Tuple[float, float]]]]:
        """
        Detect column layout on page.

        Returns:
            (layout_type, column_bounds)
            column_bounds: List of (x_left, x_right) for each column
        """
        if not blocks:
            return LayoutType.SINGLE_COLUMN, None

        page_width = page.rect.width
        page_height = page.rect.height

        # Collect x-coordinates of block left edges
        x_coords = sorted([b.bbox[0] for b in blocks])

        # Find clusters of x-coordinates (column left edges)
        clusters = self._cluster_coordinates(x_coords, self.COLUMN_GAP_THRESHOLD)

        if len(clusters) <= 1:
            # Single column
            return LayoutType.SINGLE_COLUMN, None

        # Build column boundaries
        columns = []
        for i, cluster in enumerate(clusters):
            # Left edge of column
            x_left = min(cluster)

            # Right edge: either next column's left edge or page width
            if i + 1 < len(clusters):
                x_right = min(clusters[i + 1]) - self.COLUMN_GAP_THRESHOLD / 2
            else:
                x_right = page_width

            # Validate column width
            if x_right - x_left >= self.MIN_COLUMN_WIDTH:
                columns.append((x_left, x_right))

        # Determine layout type
        if len(columns) == 1:
            layout = LayoutType.SINGLE_COLUMN
        elif len(columns) == 2:
            layout = LayoutType.TWO_COLUMN
        elif len(columns) == 3:
            layout = LayoutType.THREE_COLUMN
        else:
            layout = LayoutType.MIXED

        return layout, columns if len(columns) > 1 else None

    def _cluster_coordinates(self, coords: List[float], threshold: float) -> List[List[float]]:
        """Cluster coordinates that are within threshold of each other."""
        if not coords:
            return []

        clusters = []
        current_cluster = [coords[0]]

        for coord in coords[1:]:
            if coord - current_cluster[-1] <= threshold:
                current_cluster.append(coord)
            else:
                clusters.append(current_cluster)
                current_cluster = [coord]

        clusters.append(current_cluster)
        return clusters

    def _assign_to_columns(self, blocks: List[TextBlock], columns: Optional[List[Tuple[float, float]]]) -> List[TextBlock]:
        """Assign each block to a column."""
        if not columns:
            # Single column - all blocks in column 0
            for block in blocks:
                block.column = 0
            return blocks

        for block in blocks:
            block_center = (block.bbox[0] + block.bbox[2]) / 2

            # Find which column contains this block
            for col_idx, (x_left, x_right) in enumerate(columns):
                if x_left <= block_center <= x_right:
                    block.column = col_idx
                    break
            else:
                # Block doesn't fit in any column - assign to nearest
                block.column = 0

        return blocks

    def _determine_reading_order(self, blocks: List[TextBlock]) -> List[TextBlock]:
        """
        Determine correct reading order for blocks.

        Strategy:
        1. Group by page and column
        2. Within each column, sort top-to-bottom (by y-coordinate)
        3. Process columns left-to-right
        """
        # Group by page and column
        page_column_groups = {}
        for block in blocks:
            key = (block.page, block.column)
            if key not in page_column_groups:
                page_column_groups[key] = []
            page_column_groups[key].append(block)

        # Sort each group top-to-bottom
        for key in page_column_groups:
            page_column_groups[key].sort(key=lambda b: b.bbox[1])  # Sort by y0 (top)

        # Assign global reading order
        ordered_blocks = []
        order_counter = 0

        # Process pages in order
        pages = sorted(set(block.page for block in blocks))
        for page in pages:
            # Get columns for this page
            page_blocks = [b for b in blocks if b.page == page]
            columns = sorted(set(b.column for b in page_blocks))

            # Process columns left-to-right
            for col in columns:
                key = (page, col)
                if key in page_column_groups:
                    for block in page_column_groups[key]:
                        block.reading_order = order_counter
                        ordered_blocks.append(block)
                        order_counter += 1

        return ordered_blocks

    def _detect_headings(self, blocks: List[TextBlock]) -> List[TextBlock]:
        """
        Detect headings and assign hierarchy levels.

        Strategy:
        1. Calculate median body text size
        2. Blocks significantly larger = headings
        3. Assign levels based on size (larger = higher level)
        4. Bold text more likely to be heading
        """
        if not blocks:
            return []

        # Calculate median font size (approximation of body text size)
        font_sizes = [b.font_size for b in blocks if b.font_size > 0]
        if not font_sizes:
            return []

        font_sizes.sort()
        median_size = font_sizes[len(font_sizes) // 2]

        # Detect headings
        headings = []
        for block in blocks:
            is_heading = False
            heading_level = HeadingLevel.BODY

            # Check size ratio
            size_ratio = block.font_size / median_size if median_size > 0 else 1.0

            # Criteria for heading
            if size_ratio >= self.HEADING_SIZE_RATIO and block.font_size >= self.MIN_HEADING_SIZE:
                is_heading = True
            elif block.font_weight == "bold" and size_ratio >= 1.1:
                is_heading = True

            if is_heading:
                # Assign level based on size
                if size_ratio >= 1.5:
                    heading_level = HeadingLevel.H1
                elif size_ratio >= 1.3:
                    heading_level = HeadingLevel.H2
                else:
                    heading_level = HeadingLevel.H3

                block.is_heading = True
                block.heading_level = heading_level
                headings.append(block)

        return headings

    def _determine_overall_layout(self, pages_analysis: List[Dict]) -> LayoutType:
        """Determine overall document layout type."""
        if not pages_analysis:
            return LayoutType.SINGLE_COLUMN

        # Count layout types
        layout_counts = {}
        for page in pages_analysis:
            layout = page['layout']
            layout_counts[layout] = layout_counts.get(layout, 0) + 1

        # Most common layout
        most_common = max(layout_counts.items(), key=lambda x: x[1])[0]

        # If all pages have same layout
        if len(layout_counts) == 1:
            return LayoutType(most_common)
        else:
            return LayoutType.MIXED

    def _build_document_structure(self, headings: List[TextBlock], all_blocks: List[TextBlock]) -> Dict[str, Any]:
        """
        Build hierarchical document structure.

        Returns nested structure showing sections and subsections.
        """
        structure = {
            'sections': []
        }

        current_h1 = None
        current_h2 = None

        for heading in headings:
            if heading.heading_level == HeadingLevel.H1:
                # New main section
                current_h1 = {
                    'title': heading.text,
                    'level': 1,
                    'page': heading.page,
                    'subsections': []
                }
                structure['sections'].append(current_h1)
                current_h2 = None

            elif heading.heading_level == HeadingLevel.H2:
                # New subsection
                current_h2 = {
                    'title': heading.text,
                    'level': 2,
                    'page': heading.page,
                    'subsections': []
                }
                if current_h1:
                    current_h1['subsections'].append(current_h2)
                else:
                    # H2 without H1 parent
                    structure['sections'].append(current_h2)

            elif heading.heading_level == HeadingLevel.H3:
                # Sub-subsection
                h3 = {
                    'title': heading.text,
                    'level': 3,
                    'page': heading.page
                }
                if current_h2:
                    current_h2['subsections'].append(h3)
                elif current_h1:
                    current_h1['subsections'].append(h3)
                else:
                    structure['sections'].append(h3)

        return structure

    def _block_to_dict(self, block: TextBlock) -> Dict[str, Any]:
        """Convert TextBlock to dictionary for JSON serialization."""
        return {
            'text': block.text,
            'page': block.page,
            'bbox': list(block.bbox),
            'font_size': block.font_size,
            'font_name': block.font_name,
            'font_weight': block.font_weight,
            'is_heading': block.is_heading,
            'heading_level': block.heading_level.value,
            'column': block.column,
            'reading_order': block.reading_order
        }


def analyze_layout(pdf_path: str) -> Dict[str, Any]:
    """
    Convenience function for layout analysis.

    Usage:
        from ingestion.layout_analyzer import analyze_layout

        layout = analyze_layout('document.pdf')
        print(f"Layout: {layout['layout_type']}")
        print(f"Headings: {len(layout['headings'])}")

    Args:
        pdf_path: Path to PDF file

    Returns:
        Layout analysis dict
    """
    analyzer = LayoutAnalyzer()
    return analyzer.analyze(pdf_path)
