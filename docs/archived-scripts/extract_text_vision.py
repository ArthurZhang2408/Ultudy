"""
Proof-of-concept: Vision-based PDF extraction using Gemini Vision API

This script demonstrates how to extract rich content (tables, images, formulas)
from PDF pages by converting them to images and processing with Gemini Vision.

Usage:
    python extract_text_vision.py <pdf_path>

Environment Variables:
    GEMINI_API_KEY - Required for Gemini Vision API
    GEMINI_VISION_MODEL - Model to use (default: gemini-2.0-flash-exp)
    PDF_IMAGE_DPI - Image quality (default: 150)
"""

import json
import sys
import os

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed"}))
    sys.exit(1)

try:
    import google.generativeai as genai
except ImportError:
    print(json.dumps({"error": "google-generativeai not installed. Run: pip install google-generativeai"}))
    sys.exit(1)

from PIL import Image
import io


def page_to_image(page, dpi=150):
    """Convert a PDF page to a PIL Image."""
    # Get pixmap (raster image) from page
    pix = page.get_pixmap(dpi=dpi)

    # Convert to PIL Image
    img_bytes = pix.tobytes("png")
    img = Image.open(io.BytesIO(img_bytes))

    return img


def extract_with_vision(pdf_path, api_key=None, model_name=None, dpi=150):
    """
    Extract rich content from PDF using Gemini Vision API.

    Returns:
        List of pages with structured content including:
        - text: Plain text content
        - tables: Extracted tables with structure
        - images: Descriptions of visual elements
        - formulas: Mathematical formulas in LaTeX
    """
    # Configure Gemini
    api_key = api_key or os.environ.get('GEMINI_API_KEY')
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable is required")

    genai.configure(api_key=api_key)

    model_name = model_name or os.environ.get('GEMINI_VISION_MODEL', 'gemini-2.0-flash-exp')
    model = genai.GenerativeModel(model_name)

    # Open PDF
    doc = fitz.open(pdf_path)
    pages = []

    # System prompt for structured extraction
    extraction_prompt = """Analyze this PDF page and extract ALL content in structured format.

Your task:
1. Extract all text content
2. Identify and parse any TABLES with full structure (headers, rows, columns)
3. Describe any IMAGES, DIAGRAMS, or CHARTS
4. Extract MATHEMATICAL FORMULAS in LaTeX notation
5. Identify CODE BLOCKS with language

Return JSON in this EXACT format:
{
  "text": "Full text content of the page",
  "tables": [
    {
      "caption": "Table title or description",
      "headers": ["Column 1", "Column 2", ...],
      "rows": [
        ["Cell 1", "Cell 2", ...],
        ["Cell 1", "Cell 2", ...]
      ],
      "location": "Position description (e.g., 'top of page', 'middle')"
    }
  ],
  "images": [
    {
      "type": "diagram|chart|photo|screenshot",
      "description": "Detailed description of what's shown",
      "location": "Position description"
    }
  ],
  "formulas": [
    {
      "latex": "E = mc^2",
      "description": "Brief explanation of the formula",
      "location": "Position description"
    }
  ],
  "code_blocks": [
    {
      "language": "python|javascript|etc",
      "code": "actual code content",
      "location": "Position description"
    }
  ]
}

IMPORTANT:
- For tables, preserve EXACT cell contents and structure
- For images, describe in detail (colors, shapes, labels, relationships)
- For formulas, use proper LaTeX notation
- For code, preserve formatting and syntax
- Extract ALL content, do not summarize or skip anything"""

    for page_num in range(len(doc)):
        page = doc[page_num]

        # Convert page to image
        img = page_to_image(page, dpi=dpi)

        # Send to Gemini Vision
        response = model.generate_content([
            extraction_prompt,
            img
        ])

        try:
            # Parse JSON response
            result = json.loads(response.text)
            result['page'] = page_num + 1
            pages.append(result)
        except json.JSONDecodeError as e:
            # Fallback: return raw text if JSON parsing fails
            pages.append({
                'page': page_num + 1,
                'text': response.text,
                'tables': [],
                'images': [],
                'formulas': [],
                'code_blocks': [],
                'error': f'JSON parse error: {str(e)}'
            })

    doc.close()
    return pages


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    dpi = int(os.environ.get('PDF_IMAGE_DPI', '150'))

    try:
        pages = extract_with_vision(pdf_path, dpi=dpi)

        # Print results
        print(json.dumps({
            "pages": pages,
            "extraction_mode": "vision",
            "dpi": dpi
        }, indent=2))

    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
