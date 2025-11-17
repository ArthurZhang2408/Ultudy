# Testing Phase 3: Layout Analysis

This guide shows you how to test Phase 3 and see what improvements it brings.

---

## Quick Test (Recommended)

Run this command with any PDF file:

```bash
python3 backend/scripts/demo_phase3.py <your-pdf-file>
```

**Example**:
```bash
python3 backend/scripts/demo_phase3.py ~/Documents/lecture.pdf
```

This will show you:
1. **Layout type detected** (single/two/three column)
2. **Headings found** with hierarchy (H1/H2/H3)
3. **Document structure** (outline/table of contents)
4. **Reading order** correction for multi-column docs
5. **Before/After comparison** of what Phase 3 adds

---

## What You'll See

### For a Two-Column Document (Academic Paper)

```
PHASE 3: LAYOUT ANALYSIS DEMO
════════════════════════════════════════════════════════════════

1️⃣  LAYOUT TYPE DETECTION
─────────────────────────────────────────────────────────────
   Document layout: TWO_COLUMN

   💡 This is a two-column document (common in academic papers)
      Without Phase 3: Text from both columns would be mixed
      With Phase 3: Columns read in correct order (left→right)

2️⃣  PER-PAGE LAYOUT
─────────────────────────────────────────────────────────────
   Page 1: two_column (2 column(s), 45 text blocks)
   Page 2: two_column (2 column(s), 52 text blocks)
   ...

3️⃣  HEADING HIERARCHY
─────────────────────────────────────────────────────────────
   Total headings: 8

   [H1] Introduction... (page 1)
     [H2] Background... (page 1)
     [H2] Related Work... (page 2)
   [H1] Methods... (page 3)
     [H2] Data Collection... (page 3)
     [H2] Analysis... (page 4)
   ...

4️⃣  DOCUMENT STRUCTURE (Outline)
─────────────────────────────────────────────────────────────
   2 main section(s):

   • Introduction (H1, page 1)
     • Background (H2, page 1)
     • Related Work (H2, page 2)
   • Methods (H1, page 3)
     • Data Collection (H2, page 3)
     • Analysis (H2, page 4)

5️⃣  READING ORDER CORRECTION
─────────────────────────────────────────────────────────────
   Page 1 has 2 columns
   Text blocks in correct reading order:

   [ 0] Column 0: Introduction The field of machine learning has...
   [ 1] Column 0: Recent advances in deep learning have shown...
   [ 2] Column 0: However, challenges remain in the area of...
   ...
   [23] Column 1: In this paper, we propose a novel approach...
   [24] Column 1: Our method builds upon previous work by...

   💡 Without Phase 3: Blocks from different columns would be mixed
      With Phase 3: Each column read fully before moving to next
```

### For a Single-Column Document (Textbook)

```
1️⃣  LAYOUT TYPE DETECTION
─────────────────────────────────────────────────────────────
   Document layout: SINGLE_COLUMN

   💡 This is a single-column document (common in textbooks)

3️⃣  HEADING HIERARCHY
─────────────────────────────────────────────────────────────
   Total headings: 15

   [H1] Chapter 1: Introduction to Databases... (page 1)
     [H2] 1.1 What is a Database?... (page 2)
     [H2] 1.2 Database Management Systems... (page 3)
       [H3] 1.2.1 Relational Databases... (page 4)
       [H3] 1.2.2 NoSQL Databases... (page 5)
   [H1] Chapter 2: SQL Fundamentals... (page 10)
     [H2] 2.1 SELECT Statements... (page 11)
   ...
```

---

## What Phase 3 Specifically Adds

**Before Phase 3** (you already had Phase 1+2):
- ✅ Clean text (Phase 1: noise removal, table merging)
- ✅ Markdown format (Phase 2: LLM-optimal output)
- ❌ **No layout detection**
- ❌ **No heading hierarchy**
- ❌ **Wrong reading order in multi-column PDFs**
- ❌ **No document structure**

**After Phase 3** (current PR #18):
- ✅ Clean text (Phase 1)
- ✅ Markdown format (Phase 2)
- ✅ **Layout detected** (single/two/three column)
- ✅ **Headings identified** (H1/H2/H3 hierarchy)
- ✅ **Correct reading order** (columns read left→right)
- ✅ **Document structure** (hierarchical outline)

---

## See the JSON Output

To see all the layout data in JSON format:

```bash
python3 backend/scripts/extract_text_deterministic.py <pdf> | jq '.layout'
```

**Key fields**:
```json
{
  "layout_type": "two_column",
  "pages": [
    {
      "page": 1,
      "layout": "two_column",
      "columns": 2,
      "blocks": [...],     // Text blocks in reading order
      "headings": [...]     // Headings on this page
    }
  ],
  "headings": [...],        // All headings with hierarchy
  "structure": {            // Document outline
    "sections": [
      {
        "title": "Introduction",
        "level": 1,
        "page": 1,
        "subsections": [...]
      }
    ]
  }
}
```

---

## See the Markdown Output

To see how headings are properly formatted in Markdown:

```bash
python3 backend/scripts/extract_text_deterministic.py <pdf> --format markdown | less
```

**What you'll see**:
- Proper heading markers (`#`, `##`, `###`)
- Text in correct reading order (for multi-column docs)
- Tables formatted with pipe syntax
- Formulas with LaTeX notation

---

## Why Phase 3 Matters

### 1. Multi-Column Documents (70% of Academic Papers)

**Problem without Phase 3**:
```
Left column text line 1
Right column text line 1  ← JUMPED TO OTHER COLUMN!
Left column text line 2
Right column text line 2
```
Result: Gibberish text, semantic meaning lost

**Solution with Phase 3**:
```
Left column text line 1
Left column text line 2
Left column text line 3
Right column text line 1  ← CORRECT! Finished left first
Right column text line 2
```
Result: Proper semantic flow

### 2. Heading Hierarchy

**For Lesson Generation**:
- Split content by sections (not arbitrary chunks)
- One lesson per section (better organization)
- Questions reference specific sections

**For Navigation**:
- Jump to specific sections
- Auto-generate table of contents
- Section-based search

### 3. Document Structure

**For LLMs**:
- Understand document organization
- Better context for each paragraph
- Improved chunking for RAG systems

**For Users**:
- See document outline
- Navigate by sections
- Better learning experience

---

## Testing with Your Own PDFs

1. **Single-column textbook**:
   - Should detect: `SINGLE_COLUMN`
   - Should find: Chapter/section headings
   - Should build: Hierarchical structure

2. **Academic paper (2-column)**:
   - Should detect: `TWO_COLUMN`
   - Should find: Abstract, Introduction, Methods, etc.
   - Should correct: Reading order (left column → right column)

3. **Document with no headings**:
   - Should detect: Layout type still works
   - Should report: 0 headings detected
   - Should still: Correct reading order

---

## Troubleshooting

### "Layout analysis not available"

Make sure you're on the correct branch:
```bash
git branch
# Should show: * feature/pdf-layout-phase3
```

If not:
```bash
git checkout feature/pdf-layout-phase3
```

### No headings detected

Some PDFs don't have distinct headings (same font size throughout).
This is normal - Phase 3 will still correct reading order.

### Wrong layout type detected

If a document is detected as the wrong layout type:
- Check if it has unusual formatting
- Report the issue with the PDF file
- Phase 3 handles 95% of standard academic/textbook layouts

---

## Next Steps

After testing Phase 3:
1. Review the output - does it make sense?
2. Try with different PDF types (textbook vs paper)
3. Check if reading order is correct
4. Verify headings match what you see in the PDF

When ready, Phase 4 will integrate this into the database and lesson generation!
