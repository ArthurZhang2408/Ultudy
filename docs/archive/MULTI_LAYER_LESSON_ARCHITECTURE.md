# Multi-Layer Lesson Generation Architecture

## Overview

This PR implements a two-phase lesson generation system that addresses the scalability issues with generating all concepts at once for large documents (60+ pages).

### Previous Architecture
- **Single-phase**: Generate all 6-10 concepts for entire document at once
- **Problem**: Large documents require massive context windows, causing JSON syntax errors
- **User Experience**: All-or-nothing generation with long wait times

### New Architecture
- **Two-phase**:
  1. Extract 6-10 major sections from document (TOC or LLM-based)
  2. Generate 6-10 concepts per section on-demand
- **Benefits**:
  - Smaller context windows per LLM call (more reliable)
  - Progressive disclosure (user chooses which section to study)
  - Better content organization (36-100 total concepts instead of 6-10)

## User Flow

```
1. User clicks "Learn" on a document
   ↓
2. System extracts/loads sections (one-time operation)
   → Shows section selection screen with 6-10 sections
   ↓
3. User clicks on a section
   ↓
4. System generates concepts for that section (10-20 seconds)
   → Shows lesson summary screen
   ↓
5. User starts learning concepts
   ↓
6. User can go back to sections screen and pick another section
```

## Database Schema Changes

### New `sections` Table
```sql
CREATE TABLE sections (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES documents,
  course_id uuid,
  chapter varchar(100),
  section_number integer NOT NULL,
  name varchar(500) NOT NULL,
  description text,
  page_start integer,
  page_end integer,
  concepts_generated boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
```

### Modified `lessons` Table
- **Added**: `section_id uuid REFERENCES sections`
- **Changed**: Unique constraint from `(owner_id, document_id)` to `(owner_id, section_id)`
- **Backward Compatible**: Old lessons (section_id=null) still work

### Modified `concepts` Table
- **Added**: `section_id uuid REFERENCES sections`
- Allows filtering concepts by section for progress tracking

## Backend Implementation

### Section Extraction Service
**File**: `backend/src/study/section.service.js`

**Features**:
1. **TOC Parsing**: Regex-based extraction of common heading formats
   - "Chapter X: Title"
   - "Section Y.Z: Title"
   - "1.1 Title"
   - "ALL CAPS HEADINGS"
2. **LLM Fallback**: Gemini-based extraction when TOC parsing fails
3. **Section Text Extraction**: Heuristic-based chunking using page numbers or headings

**Extraction Priority**:
```javascript
// Try TOC first (fast, accurate if structure is clear)
const tocSections = parseTableOfContents(fullText);
if (tocSections && tocSections.length >= 6) {
  return tocSections;
}

// Fall back to LLM (slower but works for any document)
return extractSectionsWithLLM(documentInfo);
```

### API Endpoints

#### `POST /api/sections/generate`
Extracts and persists sections for a document.

**Request**:
```json
{
  "document_id": "uuid",
  "chapter": "optional chapter identifier",
  "force_llm": false
}
```

**Response**:
```json
{
  "sections": [
    {
      "id": "uuid",
      "section_number": 1,
      "name": "Introduction to Networks",
      "description": "Basic concepts and terminology",
      "page_start": 1,
      "page_end": 10,
      "concepts_generated": false
    }
  ]
}
```

**Caching**: Sections are cached in database. Returns cached sections if they exist.

#### `GET /api/sections?document_id=X`
Retrieves existing sections for a document.

#### `POST /api/lessons/generate` (Modified)
Now accepts optional `section_id` parameter.

**Request**:
```json
{
  "document_id": "uuid",
  "section_id": "uuid (optional)",
  "chapter": "optional",
  "include_check_ins": true
}
```

**Behavior**:
- **With `section_id`**: Generates concepts only for that section
- **Without `section_id`**: Falls back to old behavior (entire document)

### LLM Prompt Changes

**Section Extraction Prompt**:
```
Extract 6-10 major sections from this document.
Focus on major conceptual divisions, not just chapter headings.

Return JSON:
{
  "sections": [
    {
      "name": "Section name",
      "description": "1-2 sentence overview",
      "page_range": "estimated pages"
    }
  ]
}
```

**Lesson Generation Prompt** (now includes section context):
```
**Title:** Computer Networks
**Chapter:** Chapter 1
**Section:** Network Core Architecture
**Section Overview:** Introduces packet switching and circuit switching

**Full Content:**
[Section text only, not entire document]
```

## Frontend Implementation

### New Types
```typescript
type Section = {
  id: string;
  section_number: number;
  name: string;
  description: string | null;
  page_start: number | null;
  page_end: number | null;
  concepts_generated: boolean;
  created_at: string;
};
```

### State Management
```typescript
// Section-related state
const [sections, setSections] = useState<Section[]>([]);
const [loadingSections, setLoadingSections] = useState(true);
const [generatingSections, setGeneratingSections] = useState(false);
const [selectedSection, setSelectedSection] = useState<Section | null>(null);
const [generatingLesson, setGeneratingLesson] = useState(false);

// Screen state
const [showingSummary, setShowingSummary] = useState(true);
const [showingSections, setShowingSections] = useState(false);
```

### Screen Flow
1. **Section Selection Screen** (`showingSections=true`)
   - Grid of section cards
   - Each card shows: section number, name, description, page range
   - Visual indicator: Green (concepts ready), White (not generated)
   - Click to generate/view concepts

2. **Lesson Summary Screen** (`showingSummary=true`)
   - Shows section context in header
   - "Back to sections" button (instead of "Back to courses")
   - Displays concepts for selected section only

3. **Concept Learning Screen** (existing)
   - No changes to learning experience
   - "Back to summary" returns to section's summary

### Navigation Hierarchy
```
Courses List
  ↓
Section Selection (NEW)
  ↓
Lesson Summary
  ↓
Concept Learning
```

## Migration Strategy

### Database Migration
- **Deletes all existing lessons** to force regeneration with new structure
- This is acceptable because:
  1. Progress is tracked separately in `concepts` table (not deleted)
  2. Lessons are cached for performance, not critical data
  3. Users can regenerate easily

### Backward Compatibility
- Old lessons (without sections) theoretically still work
- But migration deletes them anyway for clean slate
- Future documents will always use section-based generation

## Testing Checklist

### Backend
- [ ] Section extraction works for documents with TOC
- [ ] Section extraction falls back to LLM correctly
- [ ] Lesson generation with section_id filters text correctly
- [ ] Concepts are linked to sections in database
- [ ] Section concepts_generated flag updates after lesson generation

### Frontend
- [ ] Section selection screen shows all sections
- [ ] Clicking section generates concepts (loading state shows)
- [ ] Generated sections show green "✓ Ready" indicator
- [ ] Summary screen shows section context
- [ ] "Back to sections" navigation works
- [ ] Concepts display correctly for section-scoped lessons

### Edge Cases
- [ ] Very small documents (< 10 pages): Should still create sections
- [ ] No clear TOC: LLM fallback should work
- [ ] Network errors: Proper error messages displayed
- [ ] Rapid clicks: Disabled state prevents duplicate API calls

## Performance Characteristics

### Old System (Single-Phase)
- **Generation Time**: 20-30 seconds for 6-10 concepts
- **Context Size**: Entire document (60 pages = ~120k tokens)
- **Failure Rate**: High for 60+ page documents (JSON syntax errors)

### New System (Two-Phase)
- **Section Extraction**: 5-10 seconds (one-time, cached)
- **Concept Generation**: 10-20 seconds per section (on-demand)
- **Context Size per Call**: 1/6 to 1/10 of document (~10-20k tokens)
- **Failure Rate**: Much lower (smaller JSON responses)

### Total Time Comparison
**For 60-page document studying 3 sections:**
- **Old**: 30 seconds upfront (all concepts)
- **New**: 10s (sections) + 15s×3 (concepts) = 55s total, but spread out
  - **Advantage**: User starts interacting after 10s, not 30s
  - **User Experience**: Progressive, feels faster

## Example Flow

### Initial Document Load
```
User: Clicks "Learn" on "Computer Networks - Chapter 1" (60 pages)

[Loading sections - 8 seconds]
API: POST /api/sections/generate { document_id: "..." }

[Section Selection Screen]
Shows:
1. Introduction (Pages 1-8)
2. Network Core Architecture (Pages 9-18)
3. Packet Switching (Pages 19-28)
4. Circuit Switching (Pages 29-38)
5. Network Protocols (Pages 39-48)
6. Performance Metrics (Pages 49-60)
```

### User Selects Section
```
User: Clicks "Network Core Architecture"

[Generating concepts - 15 seconds]
API: POST /api/lessons/generate {
  document_id: "...",
  section_id: "section-2-id"
}

[Lesson Summary Screen]
Shows:
"Network Core Architecture"
Concepts:
1. Packet Switching Basics
2. Store-and-Forward Transmission
3. Queuing Delays
4. Packet Loss
5. Circuit Switching vs Packet Switching
6. Virtual Circuits
7. Datagram Networks
8. Network Performance Trade-offs
```

### User Learns and Goes Back
```
User: Completes 3 concepts, clicks "Back to sections"

[Section Selection Screen]
Shows:
1. Introduction (Pages 1-8) [Generate Concepts →]
2. Network Core Architecture (Pages 9-18) [✓ Ready - View Concepts →]
3. Packet Switching (Pages 19-28) [Generate Concepts →]
...

User: Clicks "Packet Switching" to study next section
```

## Known Limitations

1. **Section Text Extraction**: Heuristic-based, may not be perfect
   - Improvement: Could use PDF page-by-page data more effectively

2. **No Cross-Section Dependencies**: Concepts are scoped to sections
   - Improvement: Could add "prerequisite sections" metadata

3. **TOC Parsing Regex**: May miss non-standard heading formats
   - Mitigation: LLM fallback handles this

4. **Page Number Estimation**: May be inaccurate for complex PDFs
   - Impact: Low (only affects display, not functionality)

## Future Enhancements

### Short Term
1. **Section Summary**: Show how many concepts in each section before generation
2. **Bulk Generation**: "Generate All Sections" button for power users
3. **Section Progress**: Show completion % per section in selection screen

### Medium Term
1. **Smart Section Ordering**: Suggest which section to study next based on prerequisites
2. **Cross-Section Search**: Find concepts across all sections
3. **Section Bookmarks**: Save favorite sections for quick access

### Long Term
1. **Dynamic Section Sizing**: Adjust section granularity based on user preference
2. **Section Dependencies**: Show prerequisites (e.g., "Study Section 1 before Section 3")
3. **Concept Graph View**: Visualize relationships between concepts across sections

## Deployment Notes

### Environment Variables
No new environment variables required. Uses existing `GEMINI_API_KEY`.

### Migration Command
```bash
cd backend
npm run migrate:pg
```

### Rollback Plan
If issues arise:
```bash
cd backend
npm run migrate:down:pg  # Reverts last migration
```

This will:
- Remove sections table
- Remove section_id columns
- Restore old unique constraints
- User data in concepts table remains intact

## Summary

This multi-layer architecture improves both reliability and user experience for large document learning:
- **Reliability**: Smaller LLM calls, fewer JSON errors
- **UX**: Progressive disclosure, faster perceived load time
- **Scalability**: Can handle 100+ page documents effectively
- **Flexibility**: Users choose which sections to study

The two-phase approach (sections → concepts) provides a better mental model that aligns with how textbooks are structured and how students actually study.
