import json
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed"}))
    sys.exit(1)


def extract_text(pdf_path: str):
    doc = fitz.open(pdf_path)
    pages = []
    for index, page in enumerate(doc):
        text = page.get_text("text")
        pages.append({"page": index + 1, "text": text})
    doc.close()
    return pages


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing PDF path"}))
        sys.exit(1)

    pdf_path = sys.argv[1]

    try:
        pages = extract_text(pdf_path)
    except Exception as exc:  # pylint: disable=broad-except
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    print(json.dumps({"pages": pages}))


if __name__ == "__main__":
    main()
