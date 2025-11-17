# Verification Guide: Testing Post-Processing Improvements

This guide shows you how to verify that Phase 1 post-processing actually improves extraction quality.

---

## Quick Verification (Recommended)

### Method 1: Automated Comparison Script

**Run the verification script**:
```bash
cd backend/scripts
python3 verify_postprocessing.py /path/to/your/document.pdf
```

**What it does**:
1. Extracts the PDF **without** post-processing (raw)
2. Extracts the PDF **with** post-processing (enhanced)
3. Compares the two results side-by-side
4. Shows improvements with metrics

**Example Output**:
```
🔬 Verification Script: Comparing Raw vs Post-Processed Extraction
================================================================================
PDF: sample.pdf

1️⃣  Running raw extraction (without post-processing)...
   ✅ Raw extraction complete

2️⃣  Running post-processed extraction...
   ✅ Post-processed extraction complete

3️⃣  Analyzing differences...

================================================================================
VERIFICATION: Raw Extraction vs Post-Processed
================================================================================

📊 Overall Summary
--------------------------------------------------------------------------------
Metric                                   Raw             Processed       Change
--------------------------------------------------------------------------------
Pages                                    10              9               -1
Tables                                   5               3               -2
Formulas                                 8               8               0

🧹 Noise Removal Analysis
--------------------------------------------------------------------------------
Total characters (raw): 45,230
Total characters (processed): 42,105
Noise removed: 3,125 chars (6.91%)
Pages removed (nearly empty): 1

Noise patterns found in raw:
  - Page Numbers: 10 instances
  - Copyright Notices: 2 instances
  - Separators: 15 instances

📋 Table Merging Analysis
--------------------------------------------------------------------------------
Raw tables: 5
Processed tables: 3
Tables merged: 2
Average rows per table:
  - Raw: 8.2 rows
  - Processed: 13.7 rows
  ✅ Merging increased average table size (better completeness)

📝 Context Enhancement Analysis
--------------------------------------------------------------------------------
Total tables: 3
Tables with captions: 3 (100.0%)
Tables with context: 2 (66.7%)

🔣 Symbol Correction Analysis
--------------------------------------------------------------------------------
Total formulas: 8
Formulas corrected: 3 (37.5%)

📄 Sample Content Comparison
--------------------------------------------------------------------------------

🔴 Raw (first 300 chars):
Page 5
Network Protocols

This chapter covers common networking protocols used in modern systems.

Copyright © 2024. All rights reserved.
Page 5

The following table shows protocols:...

🟢 Processed (first 300 chars):
Network Protocols

This chapter covers common networking protocols used in modern systems.

The following table shows protocols:...

📊 Table Comparison (first table):

🔴 Raw:
  Page: 5
  Headers: ['Protocol', 'Port']
  Rows: 10
  Caption: None

🟢 Processed:
  Page: 5 - 6
  Headers: ['Protocol', 'Port']
  Rows: 20
  Caption: Table 1: Network Protocols
  Context: The following table shows protocols and their default port numbers...
  ✅ MERGED from multiple pages

🔢 Formula Comparison (first formula):

🔴 Raw LaTeX:
  E = mc²

🟢 Processed LaTeX:
  E = mc^{2}
  ✅ CORRECTED symbols

================================================================================
SUMMARY
================================================================================

Post-processing improvements:
  ✅ Removed 6.91% noise
  ✅ Merged 2 cross-page tables
  ✅ Added captions to 3 tables
  ✅ Corrected 3 formulas

💾 Detailed results saved to: /tmp/postprocessing_comparison.json
```

---

## Method 2: Manual Side-by-Side Comparison

### Step 1: Extract WITHOUT Post-Processing

Temporarily disable post-processing by commenting out the code:

```bash
# Edit the extraction script
nano backend/scripts/extract_text_deterministic.py

# Comment out these lines:
# from ingestion.postprocessor import postprocess_extraction
# result = postprocess_extraction(result)

# Run extraction
python3 extract_text_deterministic.py sample.pdf > /tmp/raw.json
```

### Step 2: Extract WITH Post-Processing

```bash
# Restore the commented lines in extract_text_deterministic.py

# Run extraction
python3 extract_text_deterministic.py sample.pdf > /tmp/processed.json
```

### Step 3: Compare Results

**Check noise removal**:
```bash
# Raw - will show page numbers, headers
cat /tmp/raw.json | jq '.pages[0].text' | head -20

# Processed - should be cleaner
cat /tmp/processed.json | jq '.pages[0].text' | head -20
```

**Check table merging**:
```bash
# Raw - more tables (some split)
cat /tmp/raw.json | jq '.tables | length'

# Processed - fewer tables (merged)
cat /tmp/processed.json | jq '.tables | length'

# Check for merged flag
cat /tmp/processed.json | jq '.tables[] | select(.merged == true)'
```

**Check captions added**:
```bash
# Raw - likely missing captions
cat /tmp/raw.json | jq '.tables[0].caption'

# Processed - should have captions
cat /tmp/processed.json | jq '.tables[0].caption'
```

**Check symbol correction**:
```bash
# Raw - may have Unicode symbols
cat /tmp/raw.json | jq '.formulas[0].latex'

# Processed - should have LaTeX commands
cat /tmp/processed.json | jq '.formulas[0].latex'
```

---

## Method 3: Visual Inspection

### Compare Specific Improvements

**1. Noise Removal**

Look for these in raw extraction (should be absent in processed):
```bash
grep -i "Page [0-9]" /tmp/raw.json    # Page numbers
grep -i "Copyright" /tmp/raw.json     # Copyright notices
grep "---" /tmp/raw.json              # Separator lines
```

**2. Table Completeness**

```bash
# Compare row counts
echo "Raw tables:"
cat /tmp/raw.json | jq '.tables[] | {page, rows: .row_count}'

echo "Processed tables:"
cat /tmp/processed.json | jq '.tables[] | {page_start, page_end, rows: .row_count, merged}'
```

**3. Context Enhancement**

```bash
# Check which tables have context
cat /tmp/processed.json | jq '.tables[] | {caption, has_context: (.context != null)}'
```

---

## What to Look For

### ✅ Good Signs (Post-Processing Working)

1. **Noise Removal**:
   - Fewer characters in processed pages
   - No "Page X" text
   - No copyright notices
   - No "---" separator lines

2. **Table Merging**:
   - Fewer tables in processed (merged count)
   - Some tables marked with `"merged": true`
   - Higher average rows per table
   - `page_start` and `page_end` fields present

3. **Context Enhancement**:
   - All tables have `caption` field
   - Many tables have `context` field
   - Captions are descriptive (not just "Table 1")

4. **Symbol Correction**:
   - Formulas use `\alpha` instead of `α`
   - Math symbols use LaTeX (`\leq` not `≤`)

### ❌ Warning Signs (Post-Processing Not Working)

1. **Still seeing noise**:
   - "Page X" appears in text
   - Copyright notices present
   - Lots of separator lines

2. **Tables not merged**:
   - Same number of tables in raw vs processed
   - No `merged: true` flags
   - Average rows per table unchanged

3. **No context**:
   - Tables missing `caption` field
   - No `context` fields
   - Captions are just "Table {n}"

4. **Symbols uncorrected**:
   - Unicode symbols (α, β, ≤) still present
   - LaTeX commands (`\alpha`) absent

---

## Troubleshooting

### "No improvements detected"

**Possible causes**:
1. **PDF is already clean** - Some PDFs don't have noise
2. **Post-processing didn't run** - Check for error messages
3. **Single-page PDF** - Table merging won't apply

**How to verify post-processing ran**:
```bash
cat /tmp/processed.json | jq '.summary.postprocessed'
# Should output: true
```

### "Tables not merging"

**Possible causes**:
1. **Tables on non-consecutive pages** - Won't merge (by design)
2. **Different column counts** - Won't merge (different schemas)
3. **Both have headers** - Won't merge (not continuations)

**Check table pages**:
```bash
cat /tmp/processed.json | jq '.tables[] | {page, col_count, has_headers: (.headers | length > 0)}'
```

### "Noise still present"

**Add custom noise patterns**:
```python
# Edit backend/src/ingestion/postprocessor.py
NOISE_PATTERNS = [
    # Add your pattern
    (r"Your custom pattern", ""),
]
```

---

## Real-World Test Cases

### Test Case 1: Academic Paper (2-column)

**What to expect**:
- ✅ Page numbers removed
- ✅ Multi-column text ordered correctly (Phase 3 feature)
- ✅ Tables with formulas have corrected LaTeX
- ✅ References section cleaned

### Test Case 2: Technical Manual

**What to expect**:
- ✅ Headers/footers removed
- ✅ Code blocks detected
- ✅ Tables with captions
- ✅ Diagrams extracted as images

### Test Case 3: Business Report

**What to expect**:
- ✅ Copyright removed
- ✅ Multi-page tables merged
- ✅ Charts detected as images
- ✅ Executive summary clean

---

## Metrics to Track

### Quantitative Metrics

```bash
# Calculate noise percentage
RAW_CHARS=$(cat /tmp/raw.json | jq '[.pages[].text | length] | add')
PROC_CHARS=$(cat /tmp/processed.json | jq '[.pages[].text | length] | add')
NOISE_PCT=$(echo "scale=2; ($RAW_CHARS - $PROC_CHARS) / $RAW_CHARS * 100" | bc)
echo "Noise removed: $NOISE_PCT%"

# Table merge ratio
RAW_TABLES=$(cat /tmp/raw.json | jq '.tables | length')
PROC_TABLES=$(cat /tmp/processed.json | jq '.tables | length')
echo "Tables: $RAW_TABLES → $PROC_TABLES (merged: $((RAW_TABLES - PROC_TABLES)))"

# Caption coverage
CAPTIONED=$(cat /tmp/processed.json | jq '[.tables[] | select(.caption != null)] | length')
TOTAL=$(cat /tmp/processed.json | jq '.tables | length')
echo "Tables with captions: $CAPTIONED / $TOTAL"
```

### Qualitative Assessment

**Read the first page**:
```bash
cat /tmp/processed.json | jq -r '.pages[0].text' | head -30
```

**Questions to ask**:
- Is it readable without distractions?
- Are page numbers gone?
- Does it look like clean content?
- Would an LLM understand this easily?

---

## Expected Results Summary

| PDF Type | Noise Removed | Tables Merged | Captions Added | Symbols Fixed |
|----------|---------------|---------------|----------------|---------------|
| Academic Paper | 5-10% | 20-30% | 100% | 50-80% |
| Technical Manual | 3-8% | 10-20% | 100% | 10-30% |
| Business Report | 8-15% | 30-50% | 100% | 5-15% |
| Textbook | 10-20% | 40-60% | 100% | 60-90% |

---

## Next Steps After Verification

Once you've verified post-processing works:

1. **Test with your actual documents** - Use PDFs from your Ultudy library
2. **Review any edge cases** - Note PDFs that don't improve
3. **Proceed to Phase 2** - Markdown output for LLM optimization
4. **Integrate into pipeline** - Enable for production uploads

---

## Quick Command Reference

```bash
# Run automated verification
python3 verify_postprocessing.py document.pdf

# Check postprocessed flag
cat output.json | jq '.summary.postprocessed'

# Count noise removed
cat output.json | jq '.pages[0].noise_removed'

# List merged tables
cat output.json | jq '.tables[] | select(.merged == true)'

# Show all captions
cat output.json | jq '.tables[].caption'

# Compare formulas
cat raw.json | jq '.formulas[0].latex'
cat processed.json | jq '.formulas[0].latex'
```

---

**Remember**: The goal is cleaner, more structured content that helps LLMs generate better lessons. Even small improvements (5-10% noise removal) can significantly impact LLM quality!
