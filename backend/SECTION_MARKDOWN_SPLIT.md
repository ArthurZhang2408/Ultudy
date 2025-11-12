# Section-Based Markdown Splitting

## Problem Solved

**Before:** Sections with overlapping page ranges (e.g., Section 1: pages 1-2, Section 2: pages 2-3) would generate duplicate concepts because both sections would extract the same content from page 2.

**After:** Each section gets its own pre-split markdown chunk during section extraction, ensuring clean boundaries and no overlapping concepts.

## How It Works

### 1. PDF Upload (No Changes)
- PDF → Full markdown conversion (one file)
- Full markdown stored in `documents.full_text`

### 2. Section Extraction (NEW BEHAVIOR)

**File:** `src/study/section.service.js`

When extracting sections (TOC, LLM, or fallback), the system now:

1. **Extract section metadata** (name, description, page_range)
2. **Split markdown by section boundaries**:
   - Strategy 1: Find section name as heading (`# Section Name`, `## Section Name`)
   - Strategy 2: Search for section name anywhere in text
   - Strategy 3: Use proportional division (fallback)
3. **Store each section's markdown chunk** in `sections.markdown_text`

```javascript
// Example output
[
  {
    name: "Introduction",
    markdown_text: "# Introduction\n\nThis section covers...\n(4,500 chars)"
  },
  {
    name: "Core Concepts",
    markdown_text: "# Core Concepts\n\nIn this section...\n(7,200 chars)"
  }
]
```

**Key Function:** `splitMarkdownBySections(fullText, sections)` (line 406)
- Takes full markdown + section metadata
- Returns sections with `markdown_text` field added
- Logs exact character counts and percentages

### 3. Database Storage (UPDATED)

**Migration:** `20251111000000_add_markdown_text_to_sections.cjs`

**Schema Change:**
```sql
ALTER TABLE sections ADD COLUMN markdown_text text;
```

**Insert Query:** `src/routes/study.js:594`
```sql
INSERT INTO sections
  (owner_id, document_id, course_id, chapter, section_number,
   name, description, page_start, page_end, markdown_text, concepts_generated)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
```

### 4. Lesson Generation (UPDATED)

**File:** `src/routes/study.js:348-392`

When generating a lesson for a section:

1. **Load section** including `markdown_text` field
2. **Use pre-split markdown** if available:
   ```javascript
   if (sectionData.markdown_text) {
     textToProcess = sectionData.markdown_text;
     console.log(`Using pre-split markdown: ${textToProcess.length} chars`);
   }
   ```
3. **Fallback to extraction** if `markdown_text` is NULL (backwards compatibility)

**Result:** LLM receives ONLY that section's content, no overlap with other sections.

## Example Scenario

**3-page PDF with 2 sections:**

### Old Behavior (Overlapping):
```
Section 1 (pages 1-2): Extract chars 0-4000 → includes concepts from pages 1-2
Section 2 (pages 2-3): Extract chars 2000-6000 → includes concepts from pages 2-3
                                    ^^^^^
                              OVERLAP! Page 2 concepts duplicated
```

### New Behavior (Clean Split):
```
Section 1: markdown_text = "# Introduction\n..." (2,800 chars, 47% of doc)
           → Concepts only from Introduction section

Section 2: markdown_text = "# Core Concepts\n..." (3,200 chars, 53% of doc)
           → Concepts only from Core Concepts section

NO OVERLAP! Each section has distinct content
```

## Splitting Strategies

The `splitMarkdownBySections` function tries 3 strategies in order:

### Strategy 1: Heading Match (Best)
```javascript
// Look for: # Section Name, ## Section Name, ### Section Name
const namePattern = new RegExp(`^#{1,3}\\s*${escapeRegex(currentSection.name)}`, 'mi');
```
✅ Most accurate - finds exact markdown heading

### Strategy 2: Name Search (Good)
```javascript
// Search for section name anywhere in expected region
const searchRegion = fullText.substring(searchStart, searchEnd);
const match = searchRegion.toLowerCase().indexOf(sectionName.toLowerCase());
```
✅ Works when section name not a heading

### Strategy 3: Proportional Division (Fallback)
```javascript
// Divide document equally by section count
const sectionStart = Math.floor((i / sections.length) * fullText.length);
```
⚠️ Last resort when section name not found in text

## Console Output

You'll see detailed logging during section extraction:

```
[section.service] Splitting markdown into 2 section chunks
[section.service] Found section "Introduction" at position 0
[section.service] Section "Introduction": 2800 chars (47.0% of document)
[section.service] Found section "Core Concepts" at position 2850
[section.service] Section "Core Concepts": 3200 chars (53.0% of document)
```

And during lesson generation:

```
[lessons/generate] Section info: {
  name: 'Introduction',
  has_markdown_text: true,
  markdown_length: 2800
}
[lessons/generate] Using pre-split markdown: 2800 chars (47.0% of document)
```

## Benefits

1. ✅ **No overlapping concepts** - Each section has distinct content
2. ✅ **No page-based extraction** - Uses semantic section boundaries
3. ✅ **Cleaner boundaries** - Split by markdown structure, not character counts
4. ✅ **Backwards compatible** - Falls back to old extraction if markdown_text is NULL
5. ✅ **Observable** - Detailed logging shows exact splits
6. ✅ **Deterministic** - Same section always gets same markdown chunk

## Testing

**To test with your 3-page PDF:**

1. **Delete old sections:**
   ```sql
   DELETE FROM sections WHERE document_id = 'your-doc-id';
   DELETE FROM lessons WHERE document_id = 'your-doc-id';
   DELETE FROM concepts WHERE document_id = 'your-doc-id';
   ```

2. **Regenerate sections:**
   - Navigate to document in UI
   - Click "Generate Sections"
   - Check console for split percentages

3. **Generate concepts for both sections:**
   - Section 1 → should get concepts from first part only
   - Section 2 → should get concepts from second part only
   - **NO OVERLAP!**

4. **Verify in console:**
   ```
   [lessons/generate] Using pre-split markdown: X chars (Y% of document)
   ```

## Migration Notes

- **Existing sections:** Will have `markdown_text = NULL`
- **Lesson generation:** Falls back to old extraction for NULL values
- **New sections:** Will have `markdown_text` populated
- **No breaking changes:** System works for both old and new data

## Files Changed

1. `db/migrations/20251111000000_add_markdown_text_to_sections.cjs` - Schema change
2. `src/study/section.service.js:406-476` - Markdown splitting logic
3. `src/routes/study.js:594` - Insert markdown_text into database
4. `src/routes/study.js:348-392` - Use markdown_text in lesson generation

---

**Result:** Clean section boundaries, no overlapping concepts, no page-based extraction!
