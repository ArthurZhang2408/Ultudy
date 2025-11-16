# Backend Utility Scripts

This directory contains utility scripts for backend development and operations.

## PDF Extraction Scripts (Legacy)

**Note:** Modern PDF uploads use vision-based LLM extraction automatically (see `/backend/src/ingestion/llm_extractor.js`). These Python scripts are only for local testing or legacy document processing.

### `extract_text.py` - Simple Text Extraction
**Usage**: `python3 extract_text.py document.pdf`

Extracts plain text from PDF using pdf-parse library.

- **Speed**: Very fast (<0.1s/page)
- **Cost**: Free
- **Output**: JSON with plain text per page
- **Limitation**: Loses formatting, tables, formulas

### `extract_text_deterministic.py` - Structured Extraction
**Usage**: `python3 extract_text_deterministic.py document.pdf`

Extracts structured content preserving tables, images, and formulas.

- **Speed**: Fast (0.1-0.6s/page)
- **Cost**: Free
- **Libraries**: pdfplumber, PyMuPDF, Pix2Text, Pygments
- **Output**: JSON with pages + tables + images + formulas + code blocks

**Dependencies**:
```bash
pip3 install pdfplumber pygments

# Optional (for formula extraction):
pip3 install pix2text
```

---

## Database Utility Scripts

### `check-ivfflat-support.js` - Check pgvector Index Support
**Usage**: `node scripts/check-ivfflat-support.js`

Checks if your PostgreSQL database supports IVFFlat indexes for pgvector.

### `clear-cached-lessons.js` - Clear Redis Lesson Cache
**Usage**: `node scripts/clear-cached-lessons.js`

Clears all cached lesson data from Redis.

---

## Production PDF Processing

For actual PDF uploads in the application, use:

**Endpoint**: `POST /upload/pdf-structured`

**Processing**: Vision-based LLM extraction via `llm_extractor.js`
- Automatically extracts sections, concepts, and markdown content
- No manual script execution needed
- Async processing with job queue

See `/backend/src/ingestion/llm_extractor.js` for implementation.

---

**Note**: Demo, test, and deprecated scripts have been removed from the codebase. They're available in git history if needed for reference.
