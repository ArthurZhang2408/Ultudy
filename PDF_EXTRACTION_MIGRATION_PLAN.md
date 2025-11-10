# PDF Extraction Migration Plan: From POC to Production

**Date**: 2025-01-09
**Status**: Planning Phase
**Goal**: Migrate from basic deterministic extraction to production-ready system with post-processing and Markdown output

---

## Overview

Based on industry analysis (see `PDF_EXTRACTION_ANALYSIS.md`), we need to enhance our current POC with:
1. **Post-processing** (noise removal, table merging, context enhancement)
2. **Markdown output** (LLM-friendly format)
3. **Layout analysis** (multi-column handling)
4. **Document structure** (heading hierarchy, TOC)

**Timeline**: 3-4 weeks (phased approach)
**Risk Level**: Medium (requires testing with real documents)

---

## Phase 1: Post-Processing Module (Week 1)

### Objective
Add cleaning and enhancement steps to extracted content before LLM consumption.

### 1.1 Noise Removal

**Goal**: Remove headers, footers, page numbers, watermarks

**Implementation**:
```python
# File: backend/src/ingestion/postprocessor.py

import re
from typing import List, Dict, Any

class PDFPostProcessor:
    """Clean and enhance extracted PDF content for LLM consumption."""

    # Common noise patterns (English + Chinese)
    NOISE_PATTERNS = [
        # Page numbers
        (r"第\s*\d+\s*页", ""),           # Chinese: 第5页
        (r"Page\s+\d+", ""),              # English: Page 5
        (r"^\s*\d+\s*$", ""),             # Standalone numbers
        (r"\d+\s*/\s*\d+", ""),           # Page ranges: 5/10

        # Separators
        (r"---+\n+", "\n"),               # Repeated dashes
        (r"===+\n+", "\n"),               # Repeated equals
        (r"___+\n+", "\n"),               # Repeated underscores

        # Common headers/footers
        (r"^\s*Copyright.*?$", ""),       # Copyright notices
        (r"^\s*©.*?$", ""),               # Copyright symbol
        (r"^\s*All rights reserved.*?$", ""),
        (r"^\s*Confidential.*?$", ""),

        # Repeated whitespace
        (r"\n{3,}", "\n\n"),              # Max 2 newlines
        (r"[ \t]{2,}", " "),              # Max 1 space
    ]

    def remove_noise(self, text: str) -> str:
        """Remove common noise patterns from text."""
        for pattern, replacement in self.NOISE_PATTERNS:
            text = re.sub(pattern, replacement, text, flags=re.MULTILINE | re.IGNORECASE)

        return text.strip()

    def clean_pages(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Clean all pages in document."""
        cleaned = []

        for page in pages:
            cleaned_text = self.remove_noise(page['text'])

            # Skip nearly empty pages (likely blank or just headers)
            if len(cleaned_text.strip()) < 20:
                continue

            cleaned.append({
                'page': page['page'],
                'text': cleaned_text,
                'original_length': len(page['text']),
                'cleaned_length': len(cleaned_text)
            })

        return cleaned
```

**Testing**:
```python
# Test with real PDF headers/footers
test_text = """
Page 5
Network Protocols

This chapter covers HTTP and HTTPS protocols.

Copyright © 2024. All rights reserved.
Page 5
"""

processor = PDFPostProcessor()
cleaned = processor.remove_noise(test_text)
# Should output: "Network Protocols\n\nThis chapter covers HTTP and HTTPS protocols."
```

---

### 1.2 Cross-Page Table Merging

**Goal**: Merge tables that span multiple pages

**Implementation**:
```python
# File: backend/src/ingestion/postprocessor.py

class PDFPostProcessor:
    def merge_cross_page_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge tables that span consecutive pages."""
        if not tables:
            return []

        # Sort by page number
        sorted_tables = sorted(tables, key=lambda t: t['page'])

        merged = []
        pending_table = None

        for table in sorted_tables:
            if pending_table is None:
                pending_table = table.copy()
                continue

            # Check if this continues the previous table
            if self._should_merge_tables(pending_table, table):
                # Merge rows
                pending_table['rows'].extend(table['rows'])
                pending_table['row_count'] += table['row_count']
                pending_table['page_end'] = table['page']
                continue
            else:
                # Save completed table and start new one
                merged.append(pending_table)
                pending_table = table.copy()

        # Don't forget last table
        if pending_table:
            merged.append(pending_table)

        return merged

    def _should_merge_tables(self, table_a: Dict, table_b: Dict) -> bool:
        """Determine if two tables should be merged."""
        # Must be consecutive pages
        if table_b['page'] != table_a.get('page_end', table_a['page']) + 1:
            return False

        # Must have same column count
        if table_a['col_count'] != table_b['col_count']:
            return False

        # Headers should match (allowing minor differences)
        headers_a = [h.lower().strip() for h in table_a.get('headers', [])]
        headers_b = [h.lower().strip() for h in table_b.get('headers', [])]

        # If table_b has no headers, it's likely a continuation
        if not headers_b or all(not h for h in headers_b):
            return True

        # If headers match closely, merge
        matching = sum(1 for a, b in zip(headers_a, headers_b) if a == b)
        similarity = matching / len(headers_a) if headers_a else 0

        return similarity > 0.7  # 70% header match threshold
```

**Testing**:
```python
# Test table merging
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

processor = PDFPostProcessor()
merged = processor.merge_cross_page_tables(tables)
# Should output: 1 table with 4 rows, pages 5-6
```

---

### 1.3 Context Enhancement

**Goal**: Add captions and context to tables, formulas, code blocks

**Implementation**:
```python
# File: backend/src/ingestion/postprocessor.py

class PDFPostProcessor:
    def enhance_table_context(self, tables: List[Dict], pages: List[Dict]) -> List[Dict]:
        """Add captions and context to tables from surrounding text."""
        enhanced = []

        for table in tables:
            page_text = self._get_page_text(table['page'], pages)

            # Look for table caption in preceding text
            caption = self._find_table_caption(table, page_text)
            if caption:
                table['caption'] = caption
            else:
                # Auto-generate caption
                table['caption'] = f"Table {len(enhanced) + 1} (Page {table['page']})"

            # Add preceding paragraph as context
            context = self._extract_context(table, page_text)
            if context:
                table['context'] = context

            enhanced.append(table)

        return enhanced

    def _find_table_caption(self, table: Dict, page_text: str) -> str:
        """Find table caption in surrounding text."""
        # Common caption patterns
        patterns = [
            r"(Table\s+\d+[:\.].*?)(?:\n|$)",      # Table 1: Network Protocols
            r"(表\s*\d+[：:.].*?)(?:\n|$)",         # 表1：网络协议
            r"(Figure\s+\d+[:\.].*?)(?:\n|$)",     # Sometimes tables labeled as figures
        ]

        for pattern in patterns:
            match = re.search(pattern, page_text, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        return ""

    def _extract_context(self, table: Dict, page_text: str) -> str:
        """Extract preceding paragraph as context."""
        # Split into paragraphs
        paragraphs = [p.strip() for p in page_text.split('\n\n') if p.strip()]

        if paragraphs:
            # Return last non-empty paragraph (likely precedes table)
            for para in reversed(paragraphs):
                if len(para) > 20 and not para.isdigit():
                    return para[:200]  # First 200 chars

        return ""

    def _get_page_text(self, page_num: int, pages: List[Dict]) -> str:
        """Get text content of a specific page."""
        for page in pages:
            if page['page'] == page_num:
                return page['text']
        return ""
```

---

### 1.4 Symbol Correction (Formulas)

**Goal**: Fix common OCR errors in mathematical formulas

**Implementation**:
```python
# File: backend/src/ingestion/postprocessor.py

class PDFPostProcessor:
    # Common OCR errors in formulas
    FORMULA_CORRECTIONS = [
        # Greek letters
        ('α', r'\\alpha'),
        ('β', r'\\beta'),
        ('γ', r'\\gamma'),
        ('Δ', r'\\Delta'),
        ('π', r'\\pi'),

        # Math symbols
        ('≤', r'\\leq'),
        ('≥', r'\\geq'),
        ('≠', r'\\neq'),
        ('≈', r'\\approx'),
        ('∞', r'\\infty'),
        ('√', r'\\sqrt'),
        ('∑', r'\\sum'),
        ('∫', r'\\int'),

        # Common OCR mistakes
        ('l', '1'),   # Only in numeric context
        ('O', '0'),   # Only in numeric context
        ('I', '1'),   # Only in numeric context
    ]

    def correct_formula_symbols(self, formulas: List[Dict]) -> List[Dict]:
        """Correct common symbol errors in formulas."""
        corrected = []

        for formula in formulas:
            latex = formula.get('latex', '')

            # Apply symbol corrections
            for wrong, right in self.FORMULA_CORRECTIONS:
                latex = latex.replace(wrong, right)

            formula['latex'] = latex
            corrected.append(formula)

        return corrected
```

**Deliverable**: `backend/src/ingestion/postprocessor.py` with all cleaning functions

**Success Criteria**:
- [ ] Headers/footers removed from 95% of test documents
- [ ] Cross-page tables merged correctly (test with 10 multi-page tables)
- [ ] Table captions auto-generated when missing
- [ ] Formula symbols corrected

**Time Estimate**: 3-4 days

---

## Phase 2: Markdown Output (Week 2)

### Objective
Convert extracted JSON to Markdown format for optimal LLM consumption.

### 2.1 Markdown Converter

**Goal**: Transform JSON structure to readable Markdown

**Implementation**:
```python
# File: backend/src/ingestion/markdown_converter.py

from typing import List, Dict, Any

class MarkdownConverter:
    """Convert extracted PDF content to Markdown format."""

    def convert(self, extraction_result: Dict[str, Any]) -> str:
        """Convert full extraction result to Markdown."""
        sections = []

        # Add document title if available
        if extraction_result.get('title'):
            sections.append(f"# {extraction_result['title']}\n")

        # Process pages with embedded rich content
        sections.extend(self._build_page_sections(extraction_result))

        return "\n\n".join(sections)

    def _build_page_sections(self, result: Dict) -> List[str]:
        """Build Markdown sections with embedded tables, formulas, etc."""
        pages = result.get('pages', [])
        tables = result.get('tables', [])
        formulas = result.get('formulas', [])
        code_blocks = result.get('code_blocks', [])
        images = result.get('images', [])

        # Group rich content by page
        content_by_page = self._group_content_by_page(
            tables, formulas, code_blocks, images
        )

        sections = []

        for page in pages:
            page_num = page['page']
            page_md = [f"## Page {page_num}\n"]

            # Add main text
            page_md.append(page['text'])

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

    def _table_to_markdown(self, table: Dict) -> str:
        """Convert table to Markdown format."""
        lines = []

        # Add caption if available
        if table.get('caption'):
            lines.append(f"**{table['caption']}**\n")

        # Add context if available
        if table.get('context'):
            lines.append(f"_{table['context']}_\n")

        # Build table
        headers = table.get('headers', [])
        rows = table.get('rows', [])

        if headers:
            # Header row
            lines.append("| " + " | ".join(str(h) for h in headers) + " |")
            # Separator
            lines.append("| " + " | ".join("---" for _ in headers) + " |")

        # Data rows
        for row in rows:
            lines.append("| " + " | ".join(str(cell) for cell in row) + " |")

        return "\n".join(lines)

    def _formula_to_markdown(self, formula: Dict) -> str:
        """Convert formula to Markdown with LaTeX."""
        latex = formula.get('latex', '')
        context = formula.get('context', '')

        if context:
            return f"{context}: ${latex}$"
        else:
            return f"${latex}$"

    def _code_to_markdown(self, code: Dict) -> str:
        """Convert code block to Markdown with syntax highlighting."""
        language = code.get('language', '').lower()
        code_text = code.get('code', '')

        # Clean language (pygments names → markdown names)
        lang_map = {
            'python': 'python',
            'javascript': 'javascript',
            'java': 'java',
            'c++': 'cpp',
            'c': 'c',
            'bash': 'bash',
            'shell': 'bash',
        }

        md_lang = lang_map.get(language, language)

        return f"```{md_lang}\n{code_text}\n```"

    def _image_to_markdown(self, image: Dict) -> str:
        """Convert image reference to Markdown."""
        # For now, just reference the image
        # In future, could save images and embed them
        return f"![Image on page {image['page']}](image_{image['page']}_{image['image_index']}.{image['format']})"

    def _group_content_by_page(self, tables, formulas, code_blocks, images) -> Dict[int, Dict]:
        """Group all rich content by page number."""
        content = {}

        for table in tables:
            page = table['page']
            if page not in content:
                content[page] = {'tables': [], 'formulas': [], 'code_blocks': [], 'images': []}
            content[page]['tables'].append(table)

        for formula in formulas:
            page = formula['page']
            if page not in content:
                content[page] = {'tables': [], 'formulas': [], 'code_blocks': [], 'images': []}
            content[page]['formulas'].append(formula)

        for code in code_blocks:
            page = code['page']
            if page not in content:
                content[page] = {'tables': [], 'formulas': [], 'code_blocks': [], 'images': []}
            content[page]['code_blocks'].append(code)

        for image in images:
            page = image['page']
            if page not in content:
                content[page] = {'tables': [], 'formulas': [], 'code_blocks': [], 'images': []}
            content[page]['images'].append(image)

        return content
```

---

### 2.2 Update Extraction Script

**Goal**: Add `--format markdown` option to extraction script

**Implementation**:
```python
# File: backend/scripts/extract_text_deterministic.py

def main():
    import argparse

    parser = argparse.ArgumentParser(description='Extract rich content from PDF')
    parser.add_argument('pdf_path', help='Path to PDF file')
    parser.add_argument('--format', choices=['json', 'markdown'], default='json',
                       help='Output format (default: json)')
    args = parser.parse_args()

    # ... existing extraction code ...

    result = {
        'pages': pages,
        'tables': tables,
        'images': images,
        'formulas': formulas,
        'code_blocks': code_blocks
    }

    # Apply post-processing
    from postprocessor import PDFPostProcessor
    processor = PDFPostProcessor()

    result['pages'] = processor.clean_pages(result['pages'])
    result['tables'] = processor.merge_cross_page_tables(result['tables'])
    result['tables'] = processor.enhance_table_context(result['tables'], result['pages'])
    result['formulas'] = processor.correct_formula_symbols(result['formulas'])

    # Output in requested format
    if args.format == 'markdown':
        from markdown_converter import MarkdownConverter
        converter = MarkdownConverter()
        markdown = converter.convert(result)
        print(markdown)
    else:
        print(json.dumps(result, indent=2))
```

**Usage**:
```bash
# JSON output (default)
python3 extract_text_deterministic.py document.pdf

# Markdown output (for LLM)
python3 extract_text_deterministic.py document.pdf --format markdown
```

**Deliverable**: Markdown converter with proper table/formula/code formatting

**Success Criteria**:
- [ ] Tables render correctly in Markdown viewers
- [ ] Formulas display with LaTeX notation ($...$)
- [ ] Code blocks have syntax highlighting hints
- [ ] Page structure preserved
- [ ] Output is human-readable

**Time Estimate**: 2-3 days

---

## Phase 3: Layout Analysis (Week 2-3)

### Objective
Handle multi-column layouts and heading hierarchy detection.

### 3.1 Multi-Column Detection

**Goal**: Correctly order text from multi-column layouts

**Implementation**:
```python
# File: backend/src/ingestion/layout_analyzer.py

import fitz  # PyMuPDF

class LayoutAnalyzer:
    """Analyze PDF layout for proper text extraction."""

    def extract_text_with_layout(self, pdf_path: str) -> List[Dict]:
        """Extract text preserving multi-column layout."""
        doc = fitz.open(pdf_path)
        pages = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Get text blocks with positions
            blocks = page.get_text("blocks")

            # Detect columns
            columns = self._detect_columns(blocks, page.rect.width)

            # Sort blocks by reading order (column-aware)
            ordered_blocks = self._sort_blocks_by_reading_order(blocks, columns)

            # Extract text in correct order
            text = "\n\n".join(block[4] for block in ordered_blocks if block[4].strip())

            pages.append({
                'page': page_num + 1,
                'text': text,
                'columns': len(columns),
                'layout': 'multi-column' if len(columns) > 1 else 'single-column'
            })

        doc.close()
        return pages

    def _detect_columns(self, blocks: List, page_width: float) -> List[Dict]:
        """Detect column boundaries."""
        if not blocks:
            return [{'x0': 0, 'x1': page_width}]

        # Get x-coordinates of all blocks
        x_coords = []
        for block in blocks:
            if block[6] == 0:  # Text block only
                x_coords.append(block[0])  # x0
                x_coords.append(block[2])  # x1

        if not x_coords:
            return [{'x0': 0, 'x1': page_width}]

        # Simple column detection: if large gap in middle, it's 2-column
        x_coords.sort()
        mid_point = page_width / 2

        # Find blocks on left vs right
        left_blocks = [b for b in blocks if b[2] < mid_point]
        right_blocks = [b for b in blocks if b[0] > mid_point]

        # If significant content on both sides, it's 2-column
        if len(left_blocks) > 3 and len(right_blocks) > 3:
            return [
                {'x0': 0, 'x1': mid_point},
                {'x0': mid_point, 'x1': page_width}
            ]

        return [{'x0': 0, 'x1': page_width}]

    def _sort_blocks_by_reading_order(self, blocks: List, columns: List[Dict]) -> List:
        """Sort blocks by column-aware reading order."""
        sorted_blocks = []

        for column in columns:
            # Get blocks in this column
            column_blocks = [
                b for b in blocks
                if b[0] >= column['x0'] and b[2] <= column['x1']
            ]

            # Sort by vertical position (top to bottom)
            column_blocks.sort(key=lambda b: b[1])  # y0

            sorted_blocks.extend(column_blocks)

        return sorted_blocks
```

---

### 3.2 Heading Hierarchy Detection

**Goal**: Identify H1/H2/H3 headings for document structure

**Implementation**:
```python
# File: backend/src/ingestion/layout_analyzer.py

class LayoutAnalyzer:
    def detect_headings(self, pdf_path: str) -> List[Dict]:
        """Detect heading hierarchy based on font size and style."""
        doc = fitz.open(pdf_path)
        headings = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]

            for block in blocks:
                if block["type"] != 0:  # Not text
                    continue

                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        if not text or len(text) < 3:
                            continue

                        font_size = span.get("size", 12)
                        font_flags = span.get("flags", 0)

                        # Check if bold
                        is_bold = (font_flags & 2**4) != 0

                        # Determine heading level
                        level = None
                        if font_size > 16 and is_bold:
                            level = 1  # H1
                        elif font_size > 14 and is_bold:
                            level = 2  # H2
                        elif font_size > 12 and is_bold:
                            level = 3  # H3

                        if level:
                            headings.append({
                                'text': text,
                                'level': level,
                                'page': page_num + 1,
                                'font_size': font_size
                            })

        doc.close()
        return headings

    def build_structure_map(self, headings: List[Dict]) -> Dict:
        """Build hierarchical document structure."""
        structure = {
            'sections': []
        }

        current_h1 = None
        current_h2 = None

        for heading in headings:
            if heading['level'] == 1:
                current_h1 = {
                    'title': heading['text'],
                    'page': heading['page'],
                    'subsections': []
                }
                structure['sections'].append(current_h1)
                current_h2 = None

            elif heading['level'] == 2 and current_h1:
                current_h2 = {
                    'title': heading['text'],
                    'page': heading['page'],
                    'subsections': []
                }
                current_h1['subsections'].append(current_h2)

            elif heading['level'] == 3 and current_h2:
                current_h2['subsections'].append({
                    'title': heading['text'],
                    'page': heading['page']
                })

        return structure
```

**Deliverable**: Layout analyzer with column detection and heading hierarchy

**Success Criteria**:
- [ ] 2-column academic papers extract in correct order
- [ ] Headings detected with 90% accuracy
- [ ] Document structure map shows proper hierarchy
- [ ] Works on single-column and multi-column layouts

**Time Estimate**: 3-4 days

---

## Phase 4: Integration & Testing (Week 3-4)

### Objective
Integrate enhanced extraction into Ultudy ingestion pipeline and test with real documents.

### 4.1 Update Ingestion Pipeline

**Goal**: Replace simple text extraction with enhanced extraction

**Implementation**:
```javascript
// File: backend/src/ingestion/extractor.js

const { execSync } = require('child_process');
const path = require('path');

/**
 * Extract rich content from PDF using enhanced deterministic extraction
 */
async function extractRichContent(pdfPath) {
  const scriptPath = path.join(__dirname, '../../scripts/extract_text_deterministic.py');

  try {
    // Run extraction with Markdown output
    const result = execSync(
      `python3 ${scriptPath} "${pdfPath}" --format markdown`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }  // 10MB buffer
    );

    const markdown = result.toString();

    // Also get JSON for structured storage
    const jsonResult = execSync(
      `python3 ${scriptPath} "${pdfPath}" --format json`,
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const structured = JSON.parse(jsonResult);

    return {
      markdown,           // For LLM input
      structured,         // For database storage
      summary: {
        total_pages: structured.summary.total_pages,
        total_tables: structured.summary.total_tables,
        total_formulas: structured.summary.total_formulas,
        total_code_blocks: structured.summary.total_code_blocks
      }
    };
  } catch (error) {
    console.error('Rich content extraction failed:', error);
    // Fallback to simple text extraction
    return extractSimpleText(pdfPath);
  }
}

module.exports = { extractRichContent };
```

---

### 4.2 Database Schema Update

**Goal**: Store rich content in documents table

**Migration**:
```sql
-- File: backend/db/migrations/20250109000000_add_rich_content.cjs

exports.up = async function(knex) {
  await knex.schema.alterTable('documents', (table) => {
    // Store structured content as JSONB
    table.jsonb('rich_content').nullable();

    // Store Markdown for LLM
    table.text('markdown_content').nullable();

    // Summary fields for quick access
    table.integer('table_count').defaultTo(0);
    table.integer('formula_count').defaultTo(0);
    table.integer('code_block_count').defaultTo(0);
    table.integer('image_count').defaultTo(0);
  });
};

exports.down = async function(knex) {
  await knex.schema.alterTable('documents', (table) => {
    table.dropColumn('rich_content');
    table.dropColumn('markdown_content');
    table.dropColumn('table_count');
    table.dropColumn('formula_count');
    table.dropColumn('code_block_count');
    table.dropColumn('image_count');
  });
};
```

---

### 4.3 Update Document Service

**Goal**: Use Markdown content in lesson generation

**Implementation**:
```javascript
// File: backend/src/routes/documents.js

router.post('/:id/upload', upload.single('file'), async (req, res) => {
  const { id } = req.params;
  const file = req.file;

  try {
    // Extract rich content
    const { markdown, structured, summary } = await extractRichContent(file.path);

    // Store in database
    await client.query(
      `UPDATE documents
       SET full_text = $1,
           markdown_content = $2,
           rich_content = $3,
           table_count = $4,
           formula_count = $5,
           code_block_count = $6,
           image_count = $7
       WHERE id = $8`,
      [
        structured.pages.map(p => p.text).join('\n'),  // Plain text (legacy)
        markdown,                                        // Markdown (for LLM)
        JSON.stringify(structured),                      // Structured (for analysis)
        summary.total_tables,
        summary.total_formulas,
        summary.total_code_blocks,
        summary.total_images || 0,
        id
      ]
    );

    res.json({ success: true, summary });
  } catch (error) {
    console.error('Upload failed:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### 4.4 Update Lesson Generation

**Goal**: Use Markdown content instead of plain text

**Implementation**:
```javascript
// File: backend/src/study/section.service.js

async function generateLessonForSection(documentId, sectionData) {
  // Get document with Markdown content
  const { rows } = await client.query(
    `SELECT id, title, markdown_content, rich_content
     FROM documents
     WHERE id = $1`,
    [documentId]
  );

  const document = rows[0];

  // Use Markdown for LLM input (preserves structure)
  const content = document.markdown_content || document.full_text;

  // Extract section content from Markdown
  const sectionContent = extractSectionFromMarkdown(content, sectionData);

  // Generate lesson with structured content
  const lesson = await llmProvider.generateLesson({
    title: sectionData.name,
    content: sectionContent,  // Now includes tables, formulas in Markdown format
    document_title: document.title
  });

  return lesson;
}

function extractSectionFromMarkdown(markdown, sectionData) {
  // Find section in Markdown by heading
  const headingPattern = new RegExp(`^#{1,3}\\s+${sectionData.name}`, 'mi');
  const lines = markdown.split('\n');

  let inSection = false;
  let sectionLines = [];
  let currentHeadingLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];

      if (title.toLowerCase().includes(sectionData.name.toLowerCase())) {
        inSection = true;
        currentHeadingLevel = level;
        sectionLines.push(line);
        continue;
      }

      // Stop if we hit another heading of same or higher level
      if (inSection && level <= currentHeadingLevel) {
        break;
      }
    }

    if (inSection) {
      sectionLines.push(line);
    }
  }

  return sectionLines.join('\n');
}
```

---

### 4.5 Testing Strategy

**Test Documents** (varied content types):
1. Academic paper (2-column, formulas, tables)
2. Technical manual (code blocks, diagrams)
3. Business report (tables, charts)
4. Textbook chapter (multi-page tables, formulas)
5. Scanned document (OCR test - future)

**Test Cases**:

```python
# File: backend/tests/test_extraction.py

import pytest
from ingestion.postprocessor import PDFPostProcessor
from ingestion.markdown_converter import MarkdownConverter

def test_noise_removal():
    """Test header/footer removal."""
    processor = PDFPostProcessor()

    text = """
    Page 5
    Network Protocols

    This chapter covers HTTP.

    Copyright © 2024
    """

    cleaned = processor.remove_noise(text)
    assert "Page 5" not in cleaned
    assert "Copyright" not in cleaned
    assert "Network Protocols" in cleaned

def test_table_merging():
    """Test cross-page table merging."""
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
            'headers': ['', ''],
            'rows': [['HTTPS', '443']],
            'col_count': 2,
            'row_count': 1
        }
    ]

    merged = processor.merge_cross_page_tables(tables)
    assert len(merged) == 1
    assert merged[0]['row_count'] == 2

def test_markdown_conversion():
    """Test Markdown output."""
    converter = MarkdownConverter()

    result = {
        'pages': [{'page': 1, 'text': 'Introduction'}],
        'tables': [{
            'page': 1,
            'caption': 'Table 1',
            'headers': ['A', 'B'],
            'rows': [['1', '2']]
        }],
        'formulas': [{
            'page': 1,
            'latex': 'E = mc^2'
        }],
        'code_blocks': [],
        'images': []
    }

    markdown = converter.convert(result)

    assert '# ' in markdown or '## ' in markdown
    assert '| A | B |' in markdown
    assert '$E = mc^2$' in markdown
```

**Success Criteria**:
- [ ] All test documents process without errors
- [ ] Tables preserved in Markdown format
- [ ] Formulas render with LaTeX notation
- [ ] Multi-column layouts extract correctly
- [ ] Headers/footers removed
- [ ] Cross-page tables merged
- [ ] Lesson generation uses Markdown content
- [ ] LLM output quality improved (subjective testing)

**Time Estimate**: 5-7 days

---

## Phase 5: Optional Enhancements (Week 4+)

### 5.1 OCR Support (Low Priority)

**Goal**: Support scanned PDFs

**Implementation**:
```python
# File: backend/scripts/ocr_extractor.py

from paddleocr import PaddleOCR

class OCRExtractor:
    def __init__(self):
        self.ocr = PaddleOCR(use_angle_cls=True, lang='en')

    def extract_scanned_pdf(self, pdf_path: str) -> List[Dict]:
        """Extract text from scanned PDF using OCR."""
        # Convert PDF pages to images
        # Run OCR on each image
        # Return structured result
        pass
```

**When to use**: Only if user uploads scanned documents

**Time Estimate**: 3-4 days (if needed)

---

### 5.2 MinerU Integration (Alternative Approach)

**Goal**: Use MinerU for better layout analysis

**Pros**:
- Better multi-column handling
- Native Markdown output
- Formula extraction built-in

**Cons**:
- AGPL license (商业需授权) - commercial use requires licensing
- Larger dependency

**Decision**: Evaluate after Phase 1-4 testing. Only adopt if significant quality improvement.

---

## Timeline Summary

| Phase | Duration | Deliverables | Priority |
|-------|----------|--------------|----------|
| **Phase 1: Post-Processing** | Week 1 (3-4 days) | Noise removal, table merging, context enhancement | ✅ Critical |
| **Phase 2: Markdown Output** | Week 2 (2-3 days) | Markdown converter, format option | ✅ Critical |
| **Phase 3: Layout Analysis** | Week 2-3 (3-4 days) | Multi-column handling, heading detection | ✅ High |
| **Phase 4: Integration** | Week 3-4 (5-7 days) | Pipeline integration, DB schema, testing | ✅ Critical |
| **Phase 5: OCR (Optional)** | Week 4+ (3-4 days) | Scanned PDF support | ⚠️ Low (if needed) |

**Total**: 3-4 weeks for core system (Phases 1-4)

---

## Success Metrics

### Quality Metrics:
- [ ] Table extraction accuracy: >95%
- [ ] Formula extraction accuracy: >95%
- [ ] Heading detection accuracy: >90%
- [ ] Noise removal effectiveness: >95% (headers/footers removed)
- [ ] Cross-page table merging: 100% for standard cases

### Performance Metrics:
- [ ] Processing speed: <1s per page (average)
- [ ] No regression from current POC
- [ ] Memory usage: <500MB for 100-page document

### Integration Metrics:
- [ ] Zero downtime deployment
- [ ] Backward compatibility (existing documents still work)
- [ ] LLM quality improvement (measured by user feedback)

---

## Risk Mitigation

### High Risk: Markdown Format Breaking Lesson Generation
**Mitigation**:
- Phase 2 includes extensive testing with actual lesson generation
- Keep plain text as fallback in database
- Gradual rollout (enable for new documents first)

### Medium Risk: Multi-Column Detection Failures
**Mitigation**:
- Test with 20+ real academic papers
- Manual review of extraction quality
- Add column detection confidence score
- Fallback to simple extraction if low confidence

### Medium Risk: Performance Degradation
**Mitigation**:
- Benchmark each phase
- Optimize hotspots (table merging, Markdown conversion)
- Consider async processing for large documents

### Low Risk: OCR Library Size
**Mitigation**:
- Make OCR optional (separate dependency)
- Only load when needed
- Document system requirements

---

## Rollout Plan

### Stage 1: Internal Testing (Week 3)
- Test with 20 sample documents
- Compare with current extraction
- Measure quality improvements
- Fix critical bugs

### Stage 2: Opt-in Beta (Week 4)
- Deploy to production (feature flag)
- Enable for new document uploads only
- Monitor error rates
- Collect user feedback

### Stage 3: Full Rollout (Week 5)
- Enable for all new uploads
- Optionally re-process existing documents
- Monitor performance
- Document any issues

### Stage 4: Legacy Migration (Week 6+)
- Re-extract high-priority existing documents
- Update markdown_content field
- Keep full_text for backward compatibility

---

## Dependencies

### Python Libraries (Add to requirements.txt):
```txt
# Already installed
PyMuPDF>=1.23.0
pdfplumber>=0.11.0
Pillow>=10.0.0
pygments>=2.18.0

# New (Phase 1-3)
# None - using existing libraries

# Optional (Phase 5)
paddleocr>=2.7.0  # For OCR support
mineru>=1.0.0     # Alternative extraction (if needed)
```

### System Requirements:
- Python 3.8+
- PostgreSQL with JSONB support
- 2GB RAM minimum (for large PDFs)

---

## Monitoring & Metrics

### Track After Deployment:
1. **Extraction Success Rate**: % of PDFs processed without errors
2. **Processing Time**: Average time per page
3. **Content Quality**: Manual review of 10 random documents/week
4. **LLM Performance**: Compare lesson quality (old vs new extraction)
5. **User Satisfaction**: Feedback on lesson accuracy

### Dashboard (Future):
```javascript
// Admin panel showing:
- Documents processed: 1,234
- Tables extracted: 567
- Formulas found: 89
- Average processing time: 0.4s/page
- Error rate: 0.8%
```

---

## Next Immediate Steps

1. **Create Git branch**: `feature/enhanced-pdf-extraction`
2. **Implement Phase 1**: Post-processing module (noise removal, table merging)
3. **Write tests**: Unit tests for each post-processing function
4. **Document progress**: Update this file with actual results

**Start Date**: 2025-01-10 (tomorrow)
**Review Date**: 2025-01-17 (end of Week 1)

---

## Questions to Resolve

1. **MinerU vs current approach**: Test both, decide based on quality/license
2. **OCR priority**: Only implement if users upload scanned PDFs
3. **Re-processing**: Should we re-extract existing documents? (Probably not immediately)
4. **Performance**: What's acceptable processing time? (Target: <1s/page)

---

## Conclusion

This migration plan transforms our POC into a production-ready system by adding the critical post-processing and formatting steps that industry systems use. The phased approach allows for testing and validation at each step, with clear success criteria and risk mitigation strategies.

**Key Takeaway**: Extraction is only 30% of the work. The other 70% (cleaning, formatting, context enhancement) is what makes content truly LLM-ready.
