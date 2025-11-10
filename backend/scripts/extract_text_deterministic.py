"""
Deterministic PDF extraction using specialized libraries

This script extracts rich content (tables, images, formulas, code) from PDFs
using deterministic parsers instead of AI vision models.

Libraries used:
- pdfplumber: Table extraction (primary)
- camelot-py: Table extraction (fallback)
- PyMuPDF (fitz): Image extraction, text extraction
- pix2text: Formula extraction (LaTeX)
- pygments: Code language detection

Usage:
    python extract_text_deterministic.py <pdf_path>

Output:
    JSON with pages containing text, tables, images, formulas, and code blocks
"""

import json
import sys
import os
from typing import List, Dict, Any

# Check required imports
try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed. Run: pip install PyMuPDF"}))
    sys.exit(1)


def extract_tables_pdfplumber(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract tables using pdfplumber (primary method)."""
    try:
        import pdfplumber
    except ImportError:
        print("⚠️  pdfplumber not installed, skipping table extraction", file=sys.stderr)
        return []

    tables = []
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                page_tables = page.extract_tables()

                for table_index, table in enumerate(page_tables):
                    if not table or len(table) == 0:
                        continue

                    # Extract headers and rows
                    headers = table[0] if table else []
                    rows = table[1:] if len(table) > 1 else []

                    # Clean up None values
                    headers = [str(h) if h is not None else "" for h in headers]
                    rows = [[str(cell) if cell is not None else "" for cell in row] for row in rows]

                    tables.append({
                        "page": page_num + 1,
                        "table_index": table_index,
                        "caption": f"Table {len(tables) + 1}",  # Auto-generated
                        "headers": headers,
                        "rows": rows,
                        "row_count": len(rows),
                        "col_count": len(headers),
                        "extraction_method": "pdfplumber"
                    })

        print(f"✅ pdfplumber: Found {len(tables)} tables", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  pdfplumber extraction failed: {e}", file=sys.stderr)

    return tables


def extract_tables_camelot(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract tables using Camelot (fallback method)."""
    try:
        import camelot
    except ImportError:
        print("⚠️  camelot not installed, skipping Camelot fallback", file=sys.stderr)
        return []

    tables = []
    try:
        # Try lattice mode first (for tables with borders)
        camelot_tables = camelot.read_pdf(pdf_path, pages='all', flavor='lattice')

        # If no tables found, try stream mode (for borderless tables)
        if len(camelot_tables) == 0:
            camelot_tables = camelot.read_pdf(pdf_path, pages='all', flavor='stream')

        for table_index, table in enumerate(camelot_tables):
            df = table.df
            headers = df.columns.tolist()
            rows = df.values.tolist()

            # Convert to strings
            headers = [str(h) for h in headers]
            rows = [[str(cell) for cell in row] for row in rows]

            tables.append({
                "page": table.page,
                "table_index": table_index,
                "caption": f"Table {table_index + 1}",
                "headers": headers,
                "rows": rows,
                "row_count": len(rows),
                "col_count": len(headers),
                "extraction_method": "camelot",
                "accuracy": float(table.accuracy) if hasattr(table, 'accuracy') else None
            })

        print(f"✅ Camelot: Found {len(tables)} tables", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Camelot extraction failed: {e}", file=sys.stderr)

    return tables


def extract_images(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract images using PyMuPDF."""
    images = []

    try:
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            image_list = page.get_images(full=True)

            for img_index, img in enumerate(image_list):
                xref = img[0]

                try:
                    # Extract image
                    base_image = doc.extract_image(xref)

                    # Get image position
                    try:
                        bbox = page.get_image_bbox(img)
                        bbox_dict = {
                            "x0": bbox.x0,
                            "y0": bbox.y0,
                            "x1": bbox.x1,
                            "y1": bbox.y1
                        }
                    except:
                        bbox_dict = None

                    images.append({
                        "page": page_num + 1,
                        "image_index": img_index,
                        "format": base_image["ext"],
                        "width": base_image.get("width"),
                        "height": base_image.get("height"),
                        "size_bytes": len(base_image["image"]),
                        "bbox": bbox_dict,
                        "extraction_method": "pymupdf",
                        # Note: Not storing actual image data in JSON (too large)
                        # In production, save to disk and store path
                    })
                except Exception as e:
                    print(f"⚠️  Failed to extract image {img_index} on page {page_num + 1}: {e}", file=sys.stderr)

        doc.close()
        print(f"✅ PyMuPDF: Found {len(images)} images", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Image extraction failed: {e}", file=sys.stderr)

    return images


def extract_formulas_pix2text(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract mathematical formulas using Pix2Text."""
    try:
        from pix2text import Pix2Text
        from PIL import Image
        import io
    except ImportError:
        print("⚠️  pix2text not installed, skipping formula extraction", file=sys.stderr)
        print("   Install: pip install pix2text", file=sys.stderr)
        return []

    formulas = []

    try:
        # Initialize Pix2Text
        p2t = Pix2Text.from_config()
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Convert page to image
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_bytes))

            # Recognize content with formula detection
            try:
                result = p2t.recognize(img, rec_config={'mfd': {'use_mfd': True}})

                # Extract formulas
                for formula_index, formula in enumerate(result.get('formulas', [])):
                    latex = formula.get('latex', '')
                    if latex:
                        formulas.append({
                            "page": page_num + 1,
                            "formula_index": formula_index,
                            "latex": latex,
                            "bbox": formula.get('bbox'),
                            "extraction_method": "pix2text"
                        })
            except Exception as e:
                print(f"⚠️  Formula recognition failed on page {page_num + 1}: {e}", file=sys.stderr)

        doc.close()
        print(f"✅ Pix2Text: Found {len(formulas)} formulas", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Formula extraction failed: {e}", file=sys.stderr)

    return formulas


def detect_code_blocks(pdf_path: str) -> List[Dict[str, Any]]:
    """Detect code blocks using font analysis and Pygments."""
    try:
        from pygments.lexers import guess_lexer, get_lexer_by_name
        from pygments.util import ClassNotFound
    except ImportError:
        print("⚠️  pygments not installed, skipping code detection", file=sys.stderr)
        return []

    code_blocks = []

    try:
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            blocks = page.get_text("dict")["blocks"]

            for block_index, block in enumerate(blocks):
                if block["type"] != 0:  # Not a text block
                    continue

                # Check if block uses monospace font
                is_monospace = False
                block_text_parts = []

                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        font = span.get("font", "")
                        text = span.get("text", "")

                        if "Mono" in font or "Courier" in font or "Code" in font:
                            is_monospace = True

                        block_text_parts.append(text)

                if not is_monospace:
                    continue

                # Extract full text
                text = "\n".join(block_text_parts).strip()

                if len(text) < 10:  # Too short to be meaningful code
                    continue

                # Detect language with Pygments
                language = "unknown"
                try:
                    lexer = guess_lexer(text)
                    language = lexer.name.lower()
                except (ClassNotFound, Exception):
                    pass

                code_blocks.append({
                    "page": page_num + 1,
                    "code_block_index": block_index,
                    "code": text,
                    "language": language,
                    "line_count": len(text.split('\n')),
                    "bbox": block.get("bbox"),
                    "extraction_method": "font_detection"
                })

        doc.close()
        print(f"✅ Code detection: Found {len(code_blocks)} code blocks", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Code block detection failed: {e}", file=sys.stderr)

    return code_blocks


def extract_text(pdf_path: str) -> List[Dict[str, Any]]:
    """Extract plain text from PDF (same as current method)."""
    pages = []

    try:
        doc = fitz.open(pdf_path)

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")

            pages.append({
                "page": page_num + 1,
                "text": text
            })

        doc.close()
    except Exception as e:
        print(f"❌ Text extraction failed: {e}", file=sys.stderr)
        raise

    return pages


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path"}))
        sys.exit(1)

    pdf_path = sys.argv[1]

    if not os.path.exists(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        sys.exit(1)

    print(f"🔬 Extracting rich content from: {pdf_path}", file=sys.stderr)
    print("=" * 80, file=sys.stderr)

    try:
        # Extract all content types
        print("\n📊 Extracting tables...", file=sys.stderr)
        tables = extract_tables_pdfplumber(pdf_path)

        # Fallback to Camelot if pdfplumber found nothing
        if len(tables) == 0:
            print("   Trying Camelot fallback...", file=sys.stderr)
            tables = extract_tables_camelot(pdf_path)

        print("\n🖼️  Extracting images...", file=sys.stderr)
        images = extract_images(pdf_path)

        print("\n🔢 Extracting formulas...", file=sys.stderr)
        formulas = extract_formulas_pix2text(pdf_path)

        print("\n💻 Detecting code blocks...", file=sys.stderr)
        code_blocks = detect_code_blocks(pdf_path)

        print("\n📄 Extracting text...", file=sys.stderr)
        pages = extract_text(pdf_path)

        # Combine results
        print("\n" + "=" * 80, file=sys.stderr)
        print(f"✅ Extraction complete!", file=sys.stderr)
        print(f"   Tables: {len(tables)}", file=sys.stderr)
        print(f"   Images: {len(images)}", file=sys.stderr)
        print(f"   Formulas: {len(formulas)}", file=sys.stderr)
        print(f"   Code blocks: {len(code_blocks)}", file=sys.stderr)
        print(f"   Pages: {len(pages)}", file=sys.stderr)

        # Output JSON
        result = {
            "pages": pages,
            "tables": tables,
            "images": images,
            "formulas": formulas,
            "code_blocks": code_blocks,
            "extraction_mode": "deterministic",
            "summary": {
                "total_pages": len(pages),
                "total_tables": len(tables),
                "total_images": len(images),
                "total_formulas": len(formulas),
                "total_code_blocks": len(code_blocks)
            }
        }

        print(json.dumps(result, indent=2))

    except Exception as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
