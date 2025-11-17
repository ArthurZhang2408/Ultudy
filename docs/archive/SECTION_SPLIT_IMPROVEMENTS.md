# Section Split Improvements - Nov 11, 2025

## Problems Fixed

### Issue 1: Page Number Markers Causing Confusion ❌
**Problem:** Markdown had "## Page N" markers that confused section detection
**Solution:** Removed all page markers from markdown conversion
**Files Changed:**
- `src/ingestion/markdown_converter.py:88,147` - Removed page headings
- `src/ingestion/service.js:107` - Removed page marker insertion
- `src/study/section.service.js:215-223,288-292` - Removed page range computation logic

### Issue 2: Lost Document Layout Information ❌
**Problem:** Bold/italic/header formatting not preserved, making section detection impossible
**Solution:** Enhanced markdown to preserve PDF formatting
**Files Changed:**
- `src/ingestion/markdown_converter.py:213-218` - Added bold text wrapping for non-heading text

**Now preserves:**
- ✅ Headers (`# Heading`, `## Heading`, `### Heading`)
- ✅ Bold text (`**bold text**`)
- ✅ LaTeX formulas (`$$formula$$`)
- ✅ Tables, code blocks, images

### Issue 3: Section Splitting Mid-Sentence ❌
**Problem:** Splits occurred at arbitrary character positions, breaking in middle of sentences
**Solution:** Smart boundary detection with paragraph/sentence awareness

**Files Changed:**
- `src/study/section.service.js:402-462` - New `findSmartBoundary()` function

**Split Priority:**
1. **Paragraph breaks** (`\n\n`) - highest priority
2. **Sentence ends** (`. ! ?` followed by space/newline)
3. **Single newlines** (`\n`)
4. **Character position** (fallback only)

### Issue 4: Poor Section Extraction Quality ❌
**Problem:** LLM extracting 3 sections when document clearly has 2, not using structural markers
**Solution:** Completely rewrote extraction prompt to focus on document structure

**Files Changed:**
- `src/study/section.service.js:163-223` - New system instruction and user prompt

**New Extraction Strategy:**
```
PRIMARY INDICATORS (highest priority):
1. Markdown headings (# Heading, ## Heading, ### Heading)
2. Bold text section titles (**Section Name**)
3. Text with larger font sizes (detected as headings)

SECONDARY INDICATORS:
4. Numbered sections (1. Section Name, 1.1 Subsection)
5. Clear topic transitions
6. Whitespace patterns
```

**Critical Change:** Section names must match EXACTLY as they appear in text (no paraphrasing!)

## New Section Splitting Algorithm

### Phase 1: Section Extraction
```javascript
// LLM looks for structural markers
"## Introduction"     → Section name: "Introduction"
"**Core Concepts**"   → Section name: "Core Concepts"
"### Learning Goals"  → Section name: "Learning Goals"
```

### Phase 2: Markdown Splitting
```javascript
splitMarkdownBySections(fullText, sections) {
  // For each section:

  // 1. Try to find as markdown heading
  const headingMatch = /^#{1,3}\s*Introduction/mi

  // 2. Try to find as bold text
  const boldMatch = /\*\*Introduction\*\*/i

  // 3. Search in expected region
  const regionSearch = fullText.substring(expectedStart, expectedEnd)

  // 4. Use smart boundary (paragraph/sentence aware)
  const smartBoundary = findSmartBoundary(approximatePos)
}
```

### Phase 3: Smart Boundary Detection
```javascript
findSmartBoundary(text, approximatePos) {
  // Search ±500 chars from approximate position

  // Priority 1: Paragraph break (\n\n)
  // Priority 2: Sentence end (. ! ?)
  // Priority 3: Single newline (\n)
  // Priority 4: Approximate position
}
```

## Example: 3-Page PDF with 2 Sections

### Old Behavior (Broken):
```
Markdown:
## Page 1
Content...
## Page 2  ← Confusing!
**Introduction** content... more content...
## Page 3
**Core Concepts** content...

LLM extracts: 3 sections (confused by page markers)
Split: Middle of sentences, arbitrary positions
Result: Overlapping concepts, nonsense boundaries
```

### New Behavior (Fixed):
```
Markdown:
**Introduction** content... more content...

**Core Concepts** content...

LLM extracts: 2 sections (finds bold text)
Split: Finds "**Introduction**" → start
       Finds "**Core Concepts**" → end of Introduction
       Uses paragraph breaks for clean boundaries

Result: Clean sections, no overlap!
```

## Section Splitting Strategies

When finding section boundaries, the system tries in order:

### Strategy 1: Heading Match (Best) ✅
```javascript
// Find: # Section Name, ## Section Name, ### Section Name
const headingPattern = /^#{1,3}\s*Section Name/mi
```
**Quality:** Highest - exact structural marker

### Strategy 2: Bold Text Match (Good) ✅
```javascript
// Find: **Section Name**
const boldPattern = /\*\*Section Name\*\*/i
```
**Quality:** High - clear visual indicator

### Strategy 3: Name Search (Okay) ⚠️
```javascript
// Search for "section name" in expected region
const regionSearch = fullText.substring(expectedStart, expectedEnd)
const match = regionSearch.toLowerCase().indexOf(sectionName.toLowerCase())
```
**Quality:** Medium - might match wrong occurrence

### Strategy 4: Smart Boundary (Fallback) ⚠️
```javascript
// Use proportional division + smart boundary detection
const approximatePos = (i / sections.length) * fullText.length
const smartBoundary = findSmartBoundary(fullText, approximatePos)
```
**Quality:** Low - assumes equal-sized sections

## Console Logging

### During Section Extraction:
```
[section.service] Using LLM for section extraction
[section.service] Extracted 2 sections (split will be based on markdown headers)
[section.service] Section 1: "Introduction"
[section.service] Section 2: "Core Concepts"
```

### During Markdown Splitting:
```
[section.service] Splitting markdown into 2 section chunks
[section.service] Found section "Introduction" as bold text at position 45
[section.service] Next section "Core Concepts" found as bold at 2850
[section.service] Section "Introduction": 2800 chars (47.0% of document)
[section.service] Section "Core Concepts": 3200 chars (53.0% of document)
```

### During Lesson Generation:
```
[lessons/generate] Section info: {
  name: 'Introduction',
  has_markdown_text: true,
  markdown_length: 2800
}
[lessons/generate] Using pre-split markdown: 2800 chars (47.0% of document)
```

## Testing Instructions

### Step 1: Clear Old Data
```bash
# Clear all cached lessons
node scripts/clear-cached-lessons.js --all

# Delete old sections (optional - for re-testing)
# Via SQL or UI
```

### Step 2: Upload PDF
- Upload your 3-page PDF with 2 clear sections
- Check it has structural markers (bold text, headers, etc.)

### Step 3: Generate Sections
- Click "Generate Sections"
- Check console logs for extraction quality
- Verify section count matches document structure
- Look for "Found section X as bold text" or "as heading"

### Step 4: Verify Splits
- Check console for split percentages
- Each section should be reasonable size (not 90% + 10%)
- Check markdown_text preview in logs
- Verify no mid-sentence cuts

### Step 5: Generate Concepts
- Generate concepts for Section 1
- Generate concepts for Section 2
- Verify NO overlapping concepts
- Concepts should be section-specific

## What to Look For

### Good Signs ✅
```
[section.service] Found section "Introduction" as heading at position 0
[section.service] Section "Introduction": 2800 chars (47.0% of document)
```
→ Clean split, reasonable percentage

```
[lessons/generate] Using pre-split markdown: 2800 chars (47.0% of document)
```
→ Using pre-split text, not extracting dynamically

### Warning Signs ⚠️
```
[section.service] Could not find section "XYZ", using smart boundary
```
→ Section name doesn't match markdown (LLM paraphrased)

```
[section.service] Section "Introduction": 150 chars (2.5% of document)
[section.service] Section "Everything Else": 5850 chars (97.5% of document)
```
→ Uneven split - check document structure

### Bad Signs ❌
```
[section.service] Extracted 5 sections (split will be based on markdown headers)
```
→ When document clearly has 2 sections - check PDF layout

```
[lessons/generate] Section has no markdown_text, falling back to extraction
```
→ Migration didn't run or section not regenerated

## Files Modified

1. **src/ingestion/markdown_converter.py**
   - Line 88: Removed page heading from fallback path
   - Line 147: Removed page heading from layout path
   - Lines 213-218: Added bold text wrapping

2. **src/ingestion/service.js**
   - Line 107: Removed page marker insertion

3. **src/study/section.service.js**
   - Lines 163-192: New structure-focused system instruction
   - Lines 194-223: New extraction prompt (exact name matching)
   - Lines 269-276: Removed page range parsing
   - Lines 288-292: Removed page range computation
   - Lines 402-462: New `findSmartBoundary()` function
   - Lines 468-554: Enhanced `splitMarkdownBySections()` with multiple strategies

4. **src/routes/study.js**
   - Lines 348-392: Updated to use markdown_text field (already done earlier)
   - Lines 594-607: Updated INSERT to include markdown_text (already done earlier)

## Migration

**Database:** Already applied - `20251111000000_add_markdown_text_to_sections.cjs`

**Backwards Compatible:** Yes - falls back to old extraction if markdown_text is NULL

## Expected Results

### Before (Broken):
- ❌ 3 sections for 2-section document
- ❌ Overlapping concepts
- ❌ Splits mid-sentence
- ❌ Confused by page markers
- ❌ Lost formatting information

### After (Fixed):
- ✅ Correct section count based on document structure
- ✅ No overlapping concepts
- ✅ Clean paragraph/sentence boundaries
- ✅ No page markers to confuse LLM
- ✅ Preserves headers, bold text, formatting
- ✅ Smart fallback with boundary detection

---

**Result:** Dramatically improved section detection and splitting quality!
