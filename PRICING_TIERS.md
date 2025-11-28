# Ultudy Pricing Tiers & Feature Comparison

**Last Updated:** 2025-11-24
**Status:** Current
**Purpose:** Comprehensive pricing strategy, cost analysis, and feature matrix for Ultudy's tiered subscription model

---

## 📊 Tier Overview

| Tier | Price (CAD) | Target User | Key Feature |
|------|-------------|-------------|-------------|
| **Free** | $0 | Students trying Ultudy | 1 PDF, 10 pages max |
| **Tier 1: Student** | $17/month | Single-course learners | Single-chapter PDF uploads |
| **Tier 2: Pro** | $40/month | Multi-course power users | Multi-chapter PDFs, multiple sources per chapter |

---

## 🆓 Free Tier

### Features
- **1 PDF upload per month**
- **Maximum 10 pages per PDF**
- **Gemini 2.5 Flash-Lite** for vision and generation
- All core learning features:
  - Section-based lessons
  - Concept mastery tracking
  - Multiple-choice check-ins
  - Mastery grid visualization

### Limitations
- Single PDF only (no multi-upload)
- Page limit enforced at upload
- No chapter detection
- Standard generation speed (Flash-Lite)

### UI/UX
- **Explicit limit display**: Show "Free: 1/1 PDFs used this month" banner
- **Upgrade prompts**: "Want more? Upgrade to Student for $17/month"
- **Page counter**: Show "8/10 pages" during PDF upload

### Cost Analysis (per user/month)
- AI costs: ~$0.02 (1 PDF × 10 pages)
- Infrastructure: ~$0.15 (shared resources)
- **Total cost: $0.17/user/month**
- **Sustainable up to 10,000 free users** (~$1,700/month infrastructure)

---

## 💼 Tier 1: Student ($17 CAD/month)

### Features
- **Unlimited single-chapter PDF uploads**
- **No page limit** (reasonable use)
- **Gemini 2.5 Flash-Lite** for vision and generation
- All Free tier features plus:
  - Multiple courses support
  - Unlimited section generation
  - Full mastery tracking history
  - Export lessons (future)

### Use Case
Perfect for students taking 2-4 courses who want to:
- Upload lecture slides (20-40 pages each)
- Generate study materials per chapter
- Track mastery across multiple courses

### Technical Details
- Single-chapter PDFs only
- Section extraction → Concept generation
- Markdown-based content extraction
- Standard processing speed (~30s per PDF)

### Cost Analysis (per user/month)
**Assumptions:** 4 PDFs/month, 30 pages each, 5 sections/PDF

- **AI costs**: $0.11 (vision + generation with Flash-Lite)
- **Storage (S3)**: $0.002 (70MB)
- **Database (Railway)**: $0.25 (shared Postgres)
- **Redis (Upstash)**: $0.01 (caching)
- **Vercel**: $0.015 (frontend)
- **Total cost: $0.38/user/month**
- **Profit margin: ~$16.47 CAD/month (97%)**

---

## 🚀 Tier 2: Pro ($40 CAD/month)

### Features
- **Multi-chapter PDF support**
- **Multiple sources per chapter**
- **100 chapters per month** (with overage pricing)
- **Gemini 2.5 Flash** for generation (higher quality)
- **Gemini 2.5 Flash-Lite** for vision
- **"Faster Response" toggle** to switch gen model to Flash-Lite
- All Tier 1 features plus:
  - Chapter detection & extraction
  - Multi-source chapter merging
  - Content conflict detection
  - Advanced deduplication

### Use Case
Perfect for students or professionals who:
- Use multiple textbooks per course
- Combine lecture notes + textbook + slides
- Study comprehensive multi-chapter materials
- Need higher quality AI-generated content

### Workflow

#### 1. **Upload Phase**
User uploads multiple PDFs (textbook.pdf, lecture_1.pdf, lecture_2.pdf)

#### 2. **Chapter Detection Phase**
- AI analyzes each PDF to detect:
  - Is it single-chapter or multi-chapter?
  - If multi-chapter: extract chapter numbers, titles, and page ranges
- **User sees modal**: Checkbox list of detected chapters
  - ✅ Chapter 1: Introduction to Databases (pages 1-15)
  - ✅ Chapter 2: Relational Model (pages 16-30)
  - ✅ Chapter 3: SQL Basics (pages 31-50)
- User selects which chapters to import

#### 3. **Chapter Extraction Phase**
- For single-chapter PDFs: Extract markdown directly
- For multi-chapter PDFs:
  - Use page ranges to extract specific pages on-demand
  - **No splitting/storage** of individual chapter PDFs
  - Convert to markdown per chapter

#### 4. **Source Organization Phase**
Frontend displays chapters grouped by number:
```
Chapter 1: Introduction to Databases
  ├─ textbook.pdf (pages 1-15)
  └─ lecture_1.pdf (pages 1-8)

Chapter 2: Relational Model
  ├─ textbook.pdf (pages 16-30)
  └─ lecture_2.pdf (pages 1-12)
```

#### 5. **Study Phase**
- User clicks "Study Chapter 1"
- **Content detection**: AI checks if sources match topics
  - ✅ Both about databases → proceed
  - ⚠️ Warning: "Source mismatch detected: one source covers networks, another databases"
- **Deduplication**: AI identifies and removes duplicate content
- **Markdown merging**: Combines sources with clear headers:
  ```markdown
  # Chapter 1: Introduction to Databases

  ## Source: textbook.pdf
  [Content from textbook...]

  ## Source: lecture_1.pdf
  [Content from lecture...]
  ```
- **Section/concept generation**: Combined markdown → sections → concepts

### Technical Details

**Chapter Detection Algorithm:**
```
Input: PDF file
1. Analyze first 10 pages with Flash-Lite vision
2. Detect pattern:
   - Single chapter: Only one "Chapter X" heading
   - Multi-chapter: Multiple "Chapter X" headings with page numbers
3. If multi-chapter:
   - Extract chapter_number, title, page_start, page_end for each
4. Return metadata array
```

**Page Range Extraction:**
- **No PDF splitting/storage** - saves S3 costs
- On-demand: Extract pages X-Y when user selects chapter
- Use PDF.js or similar to extract specific page ranges
- Process extracted pages through vision model

**Content Conflict Detection:**
```
Input: [markdown_source_1, markdown_source_2]
1. Extract key topics from each (using Flash-Lite)
2. Compare topic similarity (cosine similarity)
3. If similarity < 0.5:
   - Flag warning: "Sources may cover different topics"
4. Otherwise: Proceed to deduplication
```

**Deduplication Strategy:**
```
Input: [markdown_source_1, markdown_source_2]
1. Split into sections/paragraphs
2. For each section in source_2:
   - Compare to all sections in source_1
   - If similarity > 0.85: Mark as duplicate
3. Keep unique sections from both sources
4. Merge with clear source attribution
```

### Rate Limits
- **100 chapters per month** included
- Overage: **$10 CAD per 20 additional chapters**
- Dashboard shows: "72/100 chapters used this month"

### Cost Analysis (per user/month)
**Assumptions:** 10 multi-chapter PDFs, 30 chapters total, 2 sources avg per chapter

- **Chapter detection**: $0.04 (Flash-Lite vision)
- **Chapter extraction**: $0.18 (Flash-Lite vision for markdown)
- **Lesson generation**: $4.86 (Flash for quality, 150 sections)
- **Storage (S3)**: $0.006 (280MB, no split PDFs)
- **Database (Railway)**: $2.00 (complex queries, chapter metadata)
- **Redis (Upstash)**: $0.04 (more caching)
- **Vercel**: $0.075 (more serverless usage)
- **Total cost: $7.21/user/month**
- **Profit margin: ~$29.97 CAD/month (75%)**

**With overage (120 chapters):**
- Additional AI cost: ~$2.00 (20 extra chapters)
- Total cost: ~$9.21/user
- User pays: $40 + $10 = $50 CAD
- Profit: ~$40 CAD (80% margin still excellent)

---

## 🔄 Tier Migration & Upgrades

### Free → Tier 1
- Keep existing PDF and lessons
- Unlock unlimited uploads
- Seamless transition

### Tier 1 → Tier 2
- Keep all existing courses and lessons
- Unlock multi-chapter features
- Existing single-chapter PDFs remain accessible
- New uploads can use multi-chapter detection

### Downgrade Scenarios
- **Tier 2 → Tier 1**: Multi-chapter data remains read-only, new uploads single-chapter only
- **Tier 1 → Free**: Keep data read-only, no new uploads until next month

---

## 🎯 Feature Matrix

| Feature | Free | Tier 1 | Tier 2 |
|---------|------|--------|--------|
| PDFs per month | 1 | Unlimited | Unlimited |
| Page limit | 10 | None | None |
| Multi-chapter PDFs | ❌ | ❌ | ✅ |
| Multiple sources | ❌ | ❌ | ✅ |
| Chapter detection | ❌ | ❌ | ✅ |
| Content deduplication | ❌ | ❌ | ✅ |
| Vision model | Flash-Lite | Flash-Lite | Flash-Lite |
| Generation model | Flash-Lite | Flash-Lite | Flash (default) |
| "Faster Response" mode | ❌ | ❌ | ✅ (Flash-Lite) |
| Mastery tracking | ✅ | ✅ | ✅ |
| Multiple courses | ❌ | ✅ | ✅ |
| Chapter limit | N/A | N/A | 100/month |
| Overage pricing | N/A | N/A | $10/20 chapters |
| Export lessons | ❌ | Future | Future |
| Priority support | ❌ | ❌ | Future |

---

## 📈 Scaling Projections

### At 1,000 Users (Mixed Tiers)
**Breakdown:**
- 500 free users: $85/month
- 300 Tier 1 users: $114/month
- 200 Tier 2 users: $1,442/month

**Total Infrastructure: $1,641/month**
**Total Revenue: 300×$17 + 200×$40 = $13,100 CAD (~$9,420 USD)**
**Net Profit: ~$7,779 USD/month**

### At 10,000 Users (Mixed Tiers)
**Breakdown:**
- 5,000 free users: $850/month
- 3,000 Tier 1 users: $1,140/month
- 2,000 Tier 2 users: $14,420/month

**Total Infrastructure: $16,410/month**
**Total Revenue: 3,000×$17 + 2,000×$40 = $131,000 CAD (~$94,200 USD)**
**Net Profit: ~$77,790 USD/month**

---

## 🔒 Rate Limiting Strategy

### Free Tier
- 1 PDF per calendar month
- Page validation before upload
- Hard block after limit reached
- Reset on 1st of month

### Tier 1
- No hard limits (reasonable use policy)
- Soft limit: 50 PDFs/month (monitoring only)
- Alert if user hits 100 PDFs/month (potential abuse)

### Tier 2
- 100 chapters/month hard limit
- Overage: Prompt to purchase additional chapters
- Auto-billing for overages or require confirmation
- Monthly reset

### Implementation
```javascript
// Rate limit check before processing
async function checkRateLimit(userId, tier) {
  const usage = await getMonthlyUsage(userId);

  if (tier === 'free' && usage.pdfs >= 1) {
    throw new RateLimitError('Free tier: 1 PDF per month');
  }

  if (tier === 'tier2' && usage.chapters >= 100) {
    // Offer overage purchase
    return { requiresOverage: true, cost: 10 };
  }

  return { allowed: true };
}
```

---

## 🛠️ Technical Implementation Notes

### Database Schema Additions

```sql
-- User subscriptions
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tier1', 'tier2')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due')),
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Usage tracking
CREATE TABLE monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  month DATE NOT NULL,
  pdfs_uploaded INTEGER DEFAULT 0,
  chapters_generated INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- Chapter metadata for Tier 2
CREATE TABLE chapter_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  chapter_number INTEGER NOT NULL,
  chapter_title TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,
  source_pdf_url TEXT NOT NULL,
  markdown_content TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

**Tier 2 Specific:**
- `POST /api/documents/detect-chapters` - Detect chapters in multi-chapter PDF
- `POST /api/documents/extract-chapter` - Extract specific chapter by page range
- `POST /api/chapters/merge-sources` - Merge multiple sources for a chapter
- `GET /api/usage/current` - Get current month's usage stats

---

## 💡 Future Enhancements

### Tier 1
- Export lessons as PDF
- Spaced repetition scheduling
- Custom study schedules

### Tier 2
- Advanced chapter merging (AI-powered)
- Cross-reference detection between sources
- Annotation sync across sources
- Team collaboration (share chapters)

### All Tiers
- Mobile app
- Offline mode
- Chrome extension for web PDFs
- Integration with note-taking apps

---

## 📊 Metrics to Track

### User Metrics
- Conversion rate: Free → Tier 1
- Conversion rate: Tier 1 → Tier 2
- Churn rate per tier
- Average chapters/user (Tier 2)

### Cost Metrics
- AI cost per user per tier
- Infrastructure cost per user
- Overage revenue (Tier 2)
- LTV per tier

### Product Metrics
- PDF upload success rate
- Chapter detection accuracy
- Content deduplication effectiveness
- Average generation time per tier

---

## Related Documentation
- [PRODUCT_VISION.md](PRODUCT_VISION.md) - Product roadmap and features
- [SCALABILITY_GUIDE.md](SCALABILITY_GUIDE.md) - Scaling infrastructure
- [backend/PDF_EXTRACTION_GUIDE.md](backend/PDF_EXTRACTION_GUIDE.md) - PDF processing
- [TIER_2_ARCHITECTURE.md](TIER_2_ARCHITECTURE.md) - Multi-chapter technical design

---

## Changelog
- 2025-11-24: Initial pricing tiers documentation created
