# ⚠️ POTENTIALLY OUTDATED - Pipeline Analysis: PDF Upload to Concept Generation

**STATUS: This document was created at a specific point in time to troubleshoot section extraction and lesson generation issues. Some of the problems described may have been resolved. Refer to current architecture docs for up-to-date information.**

**See also:**
- [`LESSON_GENERATION_ARCHITECTURE.md`](../LESSON_GENERATION_ARCHITECTURE.md) - Current lesson generation architecture
- [`PRODUCT_VISION.md`](../PRODUCT_VISION.md) - Current technical architecture

---

## Current Pipeline Architecture

### Phase 1: PDF Upload → Text Extraction

```
User uploads PDF
    ↓
POST /upload/pdf (routes/upload.js)
    ↓
ingestionService.ingest() (ingestion/service.js)
    ↓
extractTextFromPdf() (ingestion/extractor.js)
    ↓
    ├─ Mode: 'enhanced' → extractTextWithDeterministic() → Python script
    ├─ Mode: 'auto' → extractTextWithPython() → Simple Python extraction
    └─ Mode: 'standard' → extractTextWithPdfParse() → JS pdf-parse library
    ↓
Returns: pages[] = [{page: 1, text: "..."}, ...]
    ↓
Stores in DB:
  - documents.full_text = pages.map(p => p.text).join('\n\n')
  - documents.pages = pages.length
```

**Output:** `full_text` string stored in database (all pages concatenated)

---

### Phase 2: Section Extraction

```
User clicks "Generate Sections"
    ↓
POST /sections/generate (routes/study.js)
    ↓
extractSections() (study/section.service.js)
    ↓
    ├─ Strategy 1: parseTableOfContents(full_text) [Regex-based]
    │   └─ Searches for patterns like "1.1 Section Name"
    │   └─ Estimates page numbers from line positions
    ├─ Strategy 2: extractSectionsWithLLM() [LLM-based]
    │   └─ Sends full_text to LLM (Gemini)
    │   └─ LLM returns: {sections: [{name, description, page_range}]}
    │   └─ Parses page_range string "5-10" into integers
    └─ Strategy 3: createFallbackSections() [Equal divisions]
    ↓
Stores in DB:
  sections table = {
    id, section_number, name, description,
    page_start, page_end,  ← THESE ARE NULL!
    concepts_generated: false
  }
```

**Current Problem:**
- LLM returns `page_range: "unknown"` when it can't find page markers
- Regex fails to parse "unknown"
- page_start and page_end are set to NULL

---

### Phase 3: Lesson Generation (Section-Scoped)

```
User clicks "Start Learning" on a section
    ↓
POST /lessons/generate with {document_id, section_id} (routes/study.js)
    ↓
1. Load section from DB
   sectionData = {id, name, description, page_start, page_end}
    ↓
2. Extract section text
   extractSectionText(fullText, sectionData, allSections, totalPages)
    ↓
   Strategy 1: IF page_start && page_end exist
     └─ Calculate: startChar = (page_start - 1) * charsPerPage
     └─ Return: fullText.substring(startChar, endChar)
   Strategy 2: ELSE search for section name in text
     └─ Find section by name, extract until next section
   Strategy 3: ELSE use proportional chunking
     └─ Divide fullText by section count
    ↓
3. Generate lesson with LLM
   buildFullContextLesson(document, {
     section_name,              ← PASSED
     section_description,       ← PASSED
     full_text_override: textToProcess  ← Section text
   })
    ↓
4. Build LLM prompt
   buildFullContextLessonPrompt({
     section_name,  ← Used to add CRITICAL SCOPE REQUIREMENT
     full_text      ← The extracted section text
   })
    ↓
5. LLM generates concepts
   Gemini receives:
     - System instruction
     - User prompt with section scope requirement
     - full_text (the extracted section text)
    ↓
6. Store lesson + concepts
   INSERT INTO lessons (section_id, concepts)
   INSERT INTO concepts (section_id, name, ...)
```

---

## 🚨 CRITICAL COUPLING ISSUES

### Issue 1: Page Range Dependency

**Problem:** Section extraction relies on LLM to provide page ranges, but:
- LLM has no reliable way to detect page boundaries in plain text
- When `full_text` is just concatenated strings, there are no page markers
- LLM returns `page_range: "unknown"` → NULL in database

**Consequence:**
- `extractSectionText()` fails Strategy 1 (page-based extraction)
- Falls back to Strategy 2 (name search) or Strategy 3 (proportional)
- Extracts WRONG text for the section

**Root Cause:** Page information is LOST when converting to full_text:
```javascript
// ingestion/service.js
const fullText = pages.map((p) => p.text).join('\n\n');
//                                      ↑
//                        Page boundaries lost here!
```

### Issue 2: Section Text Extraction Failure

**Problem:** When page_start/page_end are NULL, fallback strategies fail:

**Strategy 2 (Name Search):**
```javascript
let sectionStart = fullText.indexOf(currentSection.name);
// ❌ Fails if section name doesn't appear verbatim in text
// ❌ Fails if name appears multiple times
```

**Strategy 3 (Proportional Chunking):**
```javascript
const chunkSize = Math.floor(fullText.length / allSections.length);
const start = sectionIndex * chunkSize;
// ❌ Assumes equal-sized sections (rarely true)
// ❌ No awareness of actual content boundaries
```

**Consequence:**
- Wrong text extracted for section
- But `section_name` is still passed to LLM
- LLM sees "Generate for Section X" but receives text from Section Y or entire document

### Issue 3: Cached Lessons from Wrong Scope

**Problem:** Lesson caching doesn't validate scope consistency:
```javascript
if (existingLessons.length > 0) {
  console.log('[lessons/generate] Returning cached lesson');
  return buildLessonResponse(existingLessons[0]);
  // ❌ Returns cached lesson without checking if text matches
}
```

**Consequence:**
- First generation fails with "invalid JSON"
- Creates partial/corrupted lesson in database
- Second attempt returns cached lesson
- Cached lesson might be from different section or document-level

---

## 🎯 PROPOSED DECOUPLED ARCHITECTURE

### Phase 1: Enhanced PDF Extraction (Pluggable)

**Current:**
```javascript
const fullText = pages.map(p => p.text).join('\n\n');
```

**Proposed:**
```javascript
// Store pages with structure preserved
const pagesStructured = pages.map(p => ({
  page_number: p.page,
  text: p.text,
  markdown: p.markdown,  // If enhanced mode
  has_tables: p._fullResult?.tables?.length > 0,
  has_formulas: p._fullResult?.formulas?.length > 0
}));

// Store both flat text AND structured pages
documents.full_text = pages.map(p => p.text).join('\n\n');
documents.pages_structured = JSON.stringify(pagesStructured);  // NEW
```

**Benefits:**
- Can reconstruct page boundaries later
- Can extract by page range without calculation
- Supports enhanced extraction features

### Phase 2: Section Extraction (Decoupled from Pages)

**Current:** Section extraction tries to guess page numbers from text
**Proposed:** Use actual page metadata when available

```javascript
export async function extractSections(documentInfo, options = {}) {
  const { full_text, title, pages_structured } = documentInfo;

  // Strategy 1: Use enhanced extraction's native page detection
  if (pages_structured) {
    return extractSectionsFromStructuredPages(pages_structured);
  }

  // Strategy 2: LLM extraction from full_text
  const sections = await extractSectionsWithLLM({ full_text, title });

  // Strategy 3: Fallback equal divisions
  return createFallbackSections(full_text, title);
}
```

**Benefits:**
- Explicit strategy selection based on available data
- No false expectations from LLM to provide page numbers it can't know
- Clear fallback chain

### Phase 3: Section Text Extraction (Pluggable)

**Current:** Single function with 3 strategies in sequence
**Proposed:** Strategy pattern with explicit selection

```javascript
class SectionTextExtractor {
  constructor(document, section) {
    this.document = document;
    this.section = section;
    this.strategies = [
      new PageRangeStrategy(),      // Uses page_start/page_end
      new StructuredPagesStrategy(), // Uses pages_structured JSON
      new NameSearchStrategy(),      // Searches for section name
      new ProportionalStrategy()     // Equal division fallback
    ];
  }

  extract() {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(this.document, this.section)) {
        console.log(`[SectionExtractor] Using ${strategy.name}`);
        return strategy.extract(this.document, this.section);
      }
    }
    throw new Error('No extraction strategy available');
  }
}
```

**Benefits:**
- Clear which strategy is being used
- Easy to add new strategies
- Explicit failure modes

### Phase 4: Lesson Generation (Always Section-Aware)

**Current:** Prompt engineering coupled with successful text extraction
**Proposed:** Always include section context, regardless of extraction quality

```javascript
async function buildFullContextLesson(document, options = {}) {
  const {
    chapter,
    include_check_ins,
    section_name,
    section_description,
    full_text_override,
    extraction_strategy  // NEW: Track what extraction was used
  } = options;

  // ALWAYS log what text is being used
  const textForLLM = full_text_override || document.full_text;
  console.log(`[buildFullContextLesson] Text source: ${extraction_strategy || 'document'}`);
  console.log(`[buildFullContextLesson] Text length: ${textForLLM.length} chars`);
  console.log(`[buildFullContextLesson] Section: ${section_name || 'NONE'}`);

  // Build prompt with section context (even if extraction failed)
  const prompt = buildFullContextLessonPrompt({
    title: document.title,
    full_text: textForLLM,
    chapter,
    section_name,
    section_description,
    extraction_quality: calculateExtractionQuality(textForLLM, section_name)  // NEW
  });

  // Add warning to prompt if extraction quality is low
  if (extraction_quality < 0.5) {
    prompt.warnings.push('WARNING: Section text extraction may be inaccurate');
  }

  return provider.generateFullContextLesson(prompt);
}
```

---

## 🔧 IMMEDIATE FIXES NEEDED

### Fix 1: Clear Cached Lessons

**Problem:** Corrupted/wrong-scope lessons are cached

**Solution:**
```sql
-- Clear all cached lessons to force regeneration
DELETE FROM lessons WHERE section_id IS NOT NULL;
```

### Fix 2: Stop LLM from Guessing Page Numbers

**Problem:** LLM can't reliably provide page ranges from plain text

**Solution:** Change LLM prompt to NOT ask for page numbers:
```javascript
// Instead of:
"page_range": "estimated page numbers (e.g., '1-5' or 'unknown')"

// Use:
"page_range": "unknown"  // Always unknown for text-based extraction
```

Then compute page ranges from text length:
```javascript
// After LLM returns sections
sections.forEach((section, index) => {
  const estimatedPages = Math.ceil(fullText.length / 2000);
  const pagesPerSection = Math.ceil(estimatedPages / sections.length);
  section.page_start = (index * pagesPerSection) + 1;
  section.page_end = Math.min((index + 1) * pagesPerSection, estimatedPages);
});
```

### Fix 3: Add Extraction Quality Metrics

**Problem:** No visibility into whether correct text was extracted

**Solution:** Calculate confidence score:
```javascript
function calculateExtractionQuality(extractedText, sectionName) {
  let score = 0.0;

  // Check 1: Text contains section name
  if (extractedText.toLowerCase().includes(sectionName.toLowerCase())) {
    score += 0.3;
  }

  // Check 2: Text length is reasonable (not entire document)
  const textLengthRatio = extractedText.length / fullText.length;
  if (textLengthRatio > 0.05 && textLengthRatio < 0.5) {
    score += 0.3;
  }

  // Check 3: Text doesn't contain other section names
  const otherSectionNames = allSections
    .filter(s => s.name !== sectionName)
    .map(s => s.name);

  const containsOtherSections = otherSectionNames.some(name =>
    extractedText.toLowerCase().includes(name.toLowerCase())
  );

  if (!containsOtherSections) {
    score += 0.4;
  }

  return score;
}
```

Log this score:
```javascript
console.log(`[SectionExtractor] Extraction quality: ${(quality * 100).toFixed(0)}%`);
if (quality < 0.5) {
  console.warn('[SectionExtractor] ⚠️  LOW QUALITY EXTRACTION - concepts may be document-scoped');
}
```

---

## 📋 IMPLEMENTATION PLAN

### Immediate (Fix Current Issues)
1. ✅ Clear cached lessons from database
2. ✅ Fix section extraction to compute page ranges instead of asking LLM
3. ✅ Add extraction quality metrics and warnings
4. ✅ Log exactly what text is sent to LLM

### Short Term (Decouple Components)
1. 🔄 Create SectionTextExtractor with strategy pattern
2. 🔄 Store pages_structured in database
3. 🔄 Update extraction to preserve page boundaries
4. 🔄 Add extraction_strategy field to lessons

### Long Term (Full Pluggability)
1. 📅 Create extraction adapter interface
2. 📅 Create section detection adapter interface
3. 📅 Create lesson generation adapter interface
4. 📅 Configuration file for pipeline stages

---

## 🎓 KEY INSIGHTS

1. **Page Information is Lost Too Early**
   - Converting pages to flat text loses structure
   - Need to preserve page boundaries through pipeline

2. **LLM Can't Know What It Can't See**
   - Asking LLM for page numbers from plain text is futile
   - Must compute from metadata or text length

3. **Extraction Failure ≠ Prompt Failure**
   - Even if text extraction is wrong, prompt should still be section-scoped
   - Quality metrics help detect extraction problems

4. **Caching Must Validate Consistency**
   - Can't just return any cached lesson
   - Must verify scope, text version, and generation parameters match

5. **Every Component Should Be Observable**
   - Log which strategy is used
   - Log extraction quality
   - Log what text is sent to LLM
   - Makes debugging possible

---

## 🚀 NEXT STEPS

**Which would you prefer?**

**Option A: Quick Fix (2-3 hours)**
- Clear cached lessons
- Fix page range computation
- Add quality metrics
- Get sections working with current architecture

**Option B: Proper Refactor (1-2 days)**
- Implement strategy pattern
- Store structured pages
- Full decoupling of components
- Future-proof architecture

**Option C: Hybrid (4-6 hours)**
- Quick fixes to unblock you
- Start refactoring piece by piece
- Migrate gradually without breaking existing functionality

I recommend **Option C** - fix the immediate issues so you can work, then refactor properly.

Let me know which you prefer and I'll implement it.
