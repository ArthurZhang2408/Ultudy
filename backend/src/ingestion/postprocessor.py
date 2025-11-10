"""
PDF Post-Processor: Clean and enhance extracted content for LLM consumption.

This module implements industry best practices for PDF preprocessing:
1. Noise removal (headers, footers, page numbers)
2. Cross-page table merging
3. Context enhancement (auto-generate captions)
4. Symbol correction (OCR errors, formula notation)

Based on: PDF_EXTRACTION_ANALYSIS.md
"""

import re
from typing import List, Dict, Any, Optional


class PDFPostProcessor:
    """Clean and enhance extracted PDF content for LLM consumption."""

    # Common noise patterns (English + Chinese)
    NOISE_PATTERNS = [
        # Page numbers
        (r"第\s*\d+\s*页", ""),           # Chinese: 第5页
        (r"Page\s+\d+", ""),              # English: Page 5
        (r"^\s*\d+\s*$", ""),             # Standalone numbers
        (r"\d+\s*/\s*\d+", ""),           # Page ranges: 5/10
        (r"- \d+ -", ""),                 # Centered page numbers: - 5 -

        # Separators
        (r"---+\n+", "\n"),               # Repeated dashes
        (r"===+\n+", "\n"),               # Repeated equals
        (r"___+\n+", "\n"),               # Repeated underscores

        # Common headers/footers
        (r"^\s*Copyright.*?$", ""),       # Copyright notices
        (r"^\s*©.*?$", ""),               # Copyright symbol
        (r"^\s*All rights reserved.*?$", ""),
        (r"^\s*Confidential.*?$", ""),
        (r"^\s*Proprietary.*?$", ""),
        (r"^\s*Draft.*?$", ""),

        # Repeated whitespace
        (r"\n{3,}", "\n\n"),              # Max 2 newlines
        (r"[ \t]{2,}", " "),              # Max 1 space
    ]

    # Greek letters for formulas (OCR corrections)
    FORMULA_CORRECTIONS = [
        # Greek letters → LaTeX
        ('α', r'\alpha'),
        ('β', r'\beta'),
        ('γ', r'\gamma'),
        ('δ', r'\delta'),
        ('Δ', r'\Delta'),
        ('ε', r'\epsilon'),
        ('θ', r'\theta'),
        ('λ', r'\lambda'),
        ('μ', r'\mu'),
        ('π', r'\pi'),
        ('σ', r'\sigma'),
        ('Σ', r'\Sigma'),
        ('φ', r'\phi'),
        ('ω', r'\omega'),
        ('Ω', r'\Omega'),

        # Math symbols → LaTeX
        ('≤', r'\leq'),
        ('≥', r'\geq'),
        ('≠', r'\neq'),
        ('≈', r'\approx'),
        ('∞', r'\infty'),
        ('√', r'\sqrt'),
        ('∑', r'\sum'),
        ('∫', r'\int'),
        ('∂', r'\partial'),
        ('∇', r'\nabla'),
        ('×', r'\times'),
        ('÷', r'\div'),
        ('±', r'\pm'),
        ('∈', r'\in'),
        ('⊂', r'\subset'),
        ('∪', r'\cup'),
        ('∩', r'\cap'),
    ]

    def __init__(self):
        """Initialize post-processor."""
        pass

    # ========== Noise Removal ==========

    def remove_noise(self, text: str) -> str:
        """
        Remove common noise patterns from text.

        Args:
            text: Raw text from PDF page

        Returns:
            Cleaned text with noise removed
        """
        if not text:
            return ""

        # Apply all noise patterns
        for pattern, replacement in self.NOISE_PATTERNS:
            text = re.sub(pattern, replacement, text, flags=re.MULTILINE | re.IGNORECASE)

        return text.strip()

    def clean_pages(self, pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Clean all pages in document.

        Args:
            pages: List of page dictionaries with 'page' and 'text' keys

        Returns:
            List of cleaned pages (skips nearly empty pages)
        """
        cleaned = []

        for page in pages:
            original_text = page.get('text', '')
            cleaned_text = self.remove_noise(original_text)

            # Skip nearly empty pages (likely blank or just headers/footers)
            if len(cleaned_text.strip()) < 20:
                continue

            cleaned.append({
                'page': page['page'],
                'text': cleaned_text,
                'original_length': len(original_text),
                'cleaned_length': len(cleaned_text),
                'noise_removed': len(original_text) - len(cleaned_text)
            })

        return cleaned

    # ========== Cross-Page Table Merging ==========

    def merge_cross_page_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Merge tables that span consecutive pages.

        Industry best practice: Tables often split across pages with only
        the first page having headers. Detect and merge these.

        Args:
            tables: List of table dictionaries

        Returns:
            List of merged tables
        """
        if not tables:
            return []

        # Sort by page number
        sorted_tables = sorted(tables, key=lambda t: t['page'])

        merged = []
        pending_table = None

        for table in sorted_tables:
            if pending_table is None:
                # Start tracking a new table
                pending_table = table.copy()
                pending_table['page_start'] = table['page']
                pending_table['page_end'] = table['page']
                continue

            # Check if this continues the previous table
            if self._should_merge_tables(pending_table, table):
                # Merge rows
                pending_table['rows'].extend(table['rows'])
                pending_table['row_count'] += table['row_count']
                pending_table['page_end'] = table['page']
                pending_table['merged'] = True
                continue
            else:
                # Save completed table and start new one
                merged.append(pending_table)
                pending_table = table.copy()
                pending_table['page_start'] = table['page']
                pending_table['page_end'] = table['page']

        # Don't forget last table
        if pending_table:
            merged.append(pending_table)

        return merged

    def _should_merge_tables(self, table_a: Dict, table_b: Dict) -> bool:
        """
        Determine if two tables should be merged.

        Criteria:
        1. Consecutive pages (page_b = page_a + 1)
        2. Same column count
        3. Headers match OR table_b has no headers (continuation)

        Args:
            table_a: First table (earlier page)
            table_b: Second table (later page)

        Returns:
            True if tables should be merged
        """
        # Must be consecutive pages
        page_a_end = table_a.get('page_end', table_a['page'])
        if table_b['page'] != page_a_end + 1:
            return False

        # Must have same column count
        if table_a.get('col_count') != table_b.get('col_count'):
            return False

        # Get headers
        headers_a = [h.lower().strip() for h in table_a.get('headers', [])]
        headers_b = [h.lower().strip() for h in table_b.get('headers', [])]

        # If table_b has no headers (empty or all blank), it's likely a continuation
        if not headers_b or all(not h for h in headers_b):
            return True

        # If headers match closely, merge
        if len(headers_a) == len(headers_b):
            matching = sum(1 for a, b in zip(headers_a, headers_b) if a == b)
            similarity = matching / len(headers_a) if headers_a else 0
            return similarity > 0.7  # 70% header match threshold

        return False

    # ========== Context Enhancement ==========

    def enhance_table_context(self, tables: List[Dict], pages: List[Dict]) -> List[Dict]:
        """
        Add captions and context to tables from surrounding text.

        Industry insight: "对表格添加说明，避免模型断章取义"
        (Add context to tables to avoid LLM misinterpretation)

        Args:
            tables: List of table dictionaries
            pages: List of page dictionaries

        Returns:
            Enhanced tables with captions and context
        """
        enhanced = []

        for table in tables:
            page_text = self._get_page_text(table['page'], pages)

            # Look for table caption in preceding text
            caption = self._find_table_caption(table, page_text)
            if caption:
                table['caption'] = caption
            else:
                # Auto-generate caption
                table_num = len(enhanced) + 1
                table['caption'] = f"Table {table_num} (Page {table['page']})"

            # Add preceding paragraph as context
            context = self._extract_context(table, page_text)
            if context:
                table['context'] = context

            enhanced.append(table)

        return enhanced

    def _find_table_caption(self, table: Dict, page_text: str) -> Optional[str]:
        """
        Find table caption in surrounding text.

        Common patterns:
        - "Table 1: Description"
        - "Table 1. Description"
        - "表1：描述" (Chinese)

        Args:
            table: Table dictionary
            page_text: Full text of the page

        Returns:
            Caption string or None
        """
        # Common caption patterns
        patterns = [
            r"(Table\s+\d+[:\.].*?)(?:\n|$)",      # Table 1: Network Protocols
            r"(表\s*\d+[：:.].*?)(?:\n|$)",         # 表1：网络协议
            r"(Figure\s+\d+[:\.].*?)(?:\n|$)",     # Sometimes tables labeled as figures
            r"(Fig\.\s*\d+[:\.].*?)(?:\n|$)",      # Fig. 1: ...
        ]

        for pattern in patterns:
            match = re.search(pattern, page_text, re.IGNORECASE)
            if match:
                return match.group(1).strip()

        return None

    def _extract_context(self, table: Dict, page_text: str) -> Optional[str]:
        """
        Extract preceding paragraph as context for table.

        Args:
            table: Table dictionary
            page_text: Full text of the page

        Returns:
            Context paragraph or None
        """
        # Split into paragraphs
        paragraphs = [p.strip() for p in page_text.split('\n\n') if p.strip()]

        if paragraphs:
            # Return last non-empty paragraph (likely precedes table)
            for para in reversed(paragraphs):
                # Skip very short paragraphs and numbers-only
                if len(para) > 20 and not para.isdigit():
                    # Return first 200 chars to avoid too much context
                    return para[:200] + ("..." if len(para) > 200 else "")

        return None

    def _get_page_text(self, page_num: int, pages: List[Dict]) -> str:
        """
        Get text content of a specific page.

        Args:
            page_num: Page number
            pages: List of page dictionaries

        Returns:
            Page text or empty string
        """
        for page in pages:
            if page['page'] == page_num:
                return page.get('text', '')
        return ""

    # ========== Symbol Correction ==========

    def correct_formula_symbols(self, formulas: List[Dict]) -> List[Dict]:
        """
        Correct common symbol errors in formulas.

        Common OCR errors:
        - Greek letters → LaTeX commands
        - Math symbols → LaTeX commands

        Args:
            formulas: List of formula dictionaries with 'latex' field

        Returns:
            Corrected formulas
        """
        corrected = []

        for formula in formulas:
            latex = formula.get('latex', '')

            # Apply symbol corrections
            for wrong, right in self.FORMULA_CORRECTIONS:
                latex = latex.replace(wrong, right)

            formula['latex'] = latex
            formula['corrected'] = True
            corrected.append(formula)

        return corrected

    # ========== Full Pipeline ==========

    def process(self, extraction_result: Dict[str, Any]) -> Dict[str, Any]:
        """
        Apply full post-processing pipeline.

        Steps:
        1. Clean pages (remove noise)
        2. Merge cross-page tables
        3. Enhance table context
        4. Correct formula symbols

        Args:
            extraction_result: Raw extraction result with pages, tables, formulas, etc.

        Returns:
            Enhanced extraction result ready for LLM
        """
        result = extraction_result.copy()

        # Step 1: Clean pages
        if 'pages' in result:
            result['pages'] = self.clean_pages(result['pages'])

        # Step 2: Merge cross-page tables
        if 'tables' in result:
            result['tables'] = self.merge_cross_page_tables(result['tables'])

        # Step 3: Enhance table context
        if 'tables' in result and 'pages' in result:
            result['tables'] = self.enhance_table_context(result['tables'], result['pages'])

        # Step 4: Correct formula symbols
        if 'formulas' in result:
            result['formulas'] = self.correct_formula_symbols(result['formulas'])

        # Update summary
        if 'summary' in result:
            result['summary']['total_pages'] = len(result.get('pages', []))
            result['summary']['total_tables'] = len(result.get('tables', []))
            result['summary']['total_formulas'] = len(result.get('formulas', []))
            result['summary']['postprocessed'] = True

        return result


# Convenience function for direct use
def postprocess_extraction(extraction_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply post-processing to extraction result.

    Usage:
        from postprocessor import postprocess_extraction

        raw_result = extract_pdf(pdf_path)
        clean_result = postprocess_extraction(raw_result)

    Args:
        extraction_result: Raw extraction result

    Returns:
        Post-processed result
    """
    processor = PDFPostProcessor()
    return processor.process(extraction_result)
