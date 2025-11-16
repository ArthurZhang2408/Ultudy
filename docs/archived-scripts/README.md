# Archived Scripts

This directory contains demo, test, experimental, and deprecated utility scripts from earlier development phases. These scripts are **not used in production** and are kept here for historical reference.

## Demo Scripts

- **demo_improvements.sh** - Shell script demonstrating PDF extraction improvements
- **demo_phase3.py** - Python demo for Phase 3 extraction features
- **show_improvements.py** - Script to visualize extraction improvements

## Test Scripts

- **test_layout_simple.py** - Simple layout analysis testing
- **test_positioning.py** - Position detection testing for PDF extraction
- **test_rich_extraction.sh** - Rich content extraction testing
- **verify_postprocessing.py** - Postprocessing verification script

## Analysis Scripts

- **compare_extraction.py** - Compare different extraction methods

## Database Setup Scripts (Deprecated)

These scripts were used for manual database table creation but have been **superseded by migrations**:

- **create-jobs-table.js** - Direct SQL approach to create jobs table
- **setup-jobs-table.sh** - Bash script using admin API endpoints
- **setup-jobs-table-simple.js** - Node.js script using admin API endpoints

**Note:** The jobs table should be created via the migration system:
```bash
npm run migrate up
```
See migration: `backend/db/migrations/20251115000000_add_jobs_table.cjs`

## Status

### PDF Extraction Scripts
These scripts were used during the development of the PDF extraction pipeline but have been superseded by:
- Vision-based LLM extraction (primary method)
- Enhanced deterministic extraction (fallback method)

### Database Setup Scripts
These scripts are obsolete. Use the migration system instead:
```bash
cd backend
npm run migrate up  # Run all pending migrations
```

## Archived Date

November 16, 2025

## Notes

If you need to reference these scripts for understanding historical approaches, they are preserved here. However, **they should not be used in production** or integrated into the main codebase.

For current setup instructions, see:
- Database: Use `npm run migrate up` in the backend directory
- PDF Extraction: See `CURRENT_ARCHITECTURE.md` (when available)
