# Tier-Based UI Architecture

**Last Updated:** 2025-11-25
**Purpose:** Modular UI system that adapts based on user's subscription tier

---

## 🏗️ Architecture Overview

The app has **two distinct UI experiences**:

### Current UI (Free & Tier 1)
- Simple single-chapter PDF workflow
- Upload PDF → Extract sections → Study
- No multi-chapter or multi-source features

### Tier 2 UI (Pro)
- Multi-chapter PDF support
- Chapter detection and selection
- Multiple sources per chapter with merging
- Enhanced document management

---

## 📦 Core Components

### 1. TierProvider (Context)
**Location:** `frontend/src/contexts/TierContext.tsx`

Provides global tier state throughout the app.

```tsx
import { TierProvider } from '@/contexts/TierContext';

// Already added to layout.tsx
<TierProvider>
  {children}
</TierProvider>
```

### 2. useTier Hook
Access tier data and helper functions anywhere:

```tsx
import { useTier } from '@/contexts/TierContext';

function MyComponent() {
  const {
    tierData,         // Full tier data with limits and usage
    isLoading,        // Loading state
    refreshTier,      // Refresh function
    isTier,           // Check exact tier
    hasTier,          // Check minimum tier
    hasFeature        // Check specific feature
  } = useTier();

  // Examples:
  if (isTier('tier2')) {
    // User is on Tier 2 (Pro)
  }

  if (hasTier('tier1')) {
    // User is Tier 1 or higher (Student or Pro)
  }

  if (hasFeature('multi_chapter_support')) {
    // User can upload multi-chapter PDFs
  }
}
```

### 3. TierGate Component
**Location:** `frontend/src/components/tier/TierGate.tsx`

Conditionally render components based on tier:

```tsx
import { TierGate } from '@/components/tier/TierGate';

// Show component only for Tier 2 users
<TierGate requiredTier="tier2">
  <ChapterDetectionUI />
</TierGate>

// Show upgrade prompt if user doesn't have access
<TierGate requiredTier="tier2" showUpgradePrompt={true}>
  <AdvancedFeature />
</TierGate>

// Custom fallback
<TierGate
  requiredTier="tier2"
  fallback={<BasicFeature />}
>
  <AdvancedFeature />
</TierGate>
```

### 4. TierBadge Component
Display tier visually:

```tsx
import { TierBadge } from '@/components/tier/TierGate';

// Show user's current tier
<TierBadge />

// Show specific tier
<TierBadge tier="tier2" />
```

---

## 🎯 Usage Patterns

### Pattern 1: Conditional Features

```tsx
import { useTier } from '@/contexts/TierContext';
import { TierGate } from '@/components/tier/TierGate';

function DocumentView({ document }) {
  const { hasFeature } = useTier();

  return (
    <div>
      <h1>{document.title}</h1>

      {/* Always show for all tiers */}
      <DocumentSections document={document} />

      {/* Only show for Tier 2 */}
      <TierGate requiredTier="tier2">
        <ChapterManager documentId={document.id} />
      </TierGate>
    </div>
  );
}
```

### Pattern 2: Different UI Components

```tsx
import { useIsTier2 } from '@/contexts/TierContext';

function UploadInterface() {
  const isTier2 = useIsTier2();

  return isTier2 ? (
    <Tier2UploadFlow />  // Multi-chapter support
  ) : (
    <StandardUploadFlow />  // Simple single-chapter
  );
}
```

### Pattern 3: Feature Flags

```tsx
import { useTier } from '@/contexts/TierContext';

function UploadButton() {
  const { tierData } = useTier();

  return (
    <button onClick={handleUpload}>
      Upload PDF
      {tierData?.limits.max_pages > 0 && (
        <span className="text-xs">
          (max {tierData.limits.max_pages} pages)
        </span>
      )}
    </button>
  );
}
```

### Pattern 4: Inline Feature Checks

```tsx
import { useHasMultiChapterSupport } from '@/contexts/TierContext';

function DocumentList() {
  const hasMultiChapter = useHasMultiChapterSupport();

  return (
    <div>
      <h2>Documents</h2>
      {documents.map(doc => (
        <DocumentCard
          key={doc.id}
          document={doc}
          showChapterCount={hasMultiChapter}  // Only show if tier supports it
        />
      ))}
    </div>
  );
}
```

---

## 🔧 Tier-Specific Components

### Free & Tier 1 Components (Current)
**Already implemented:**
- ✅ `UploadModal` - Simple PDF upload
- ✅ Document view with sections
- ✅ Study interface
- ✅ Course management

### Tier 2 Components (New)
**Already created:**
- ✅ `ChapterManager` - Multi-chapter detection/extraction
- ✅ `UsageDashboard` - Usage tracking

**To create (examples):**

```tsx
// frontend/src/components/tier2/MultiSourceManager.tsx
import { TierGate } from '@/components/tier/TierGate';

export function MultiSourceManager({ chapterId }) {
  return (
    <TierGate requiredTier="tier2">
      <div className="bg-white rounded-lg shadow p-6">
        <h3>Multiple Sources</h3>
        {/* UI for managing multiple sources per chapter */}
        <SourceList chapterId={chapterId} />
        <AddSourceButton chapterId={chapterId} />
      </div>
    </TierGate>
  );
}

// frontend/src/components/tier2/ChapterSelector.tsx
export function ChapterSelector({ documentId }) {
  const { hasFeature } = useTier();

  if (!hasFeature('multi_chapter_support')) {
    return null; // Don't show for Free/Tier1
  }

  return (
    <div>
      {/* Chapter selection UI */}
    </div>
  );
}
```

---

## 🚀 Integration Examples

### Example 1: Enhanced Document View

```tsx
// frontend/src/app/documents/[id]/page.tsx
import { useTier } from '@/contexts/TierContext';
import { TierGate } from '@/components/tier/TierGate';
import { ChapterManager } from '@/components/ChapterManager';

export default function DocumentPage({ params }) {
  const { isTier } = useTier();

  return (
    <div>
      <DocumentHeader />

      {/* Standard view for Free & Tier 1 */}
      {(isTier('free') || isTier('tier1')) && (
        <SingleChapterView documentId={params.id} />
      )}

      {/* Enhanced view for Tier 2 */}
      <TierGate requiredTier="tier2">
        <div className="space-y-6">
          <ChapterManager
            documentId={params.id}
            onChaptersExtracted={() => {
              // Refresh document list
            }}
          />
          <MultiSourceManager documentId={params.id} />
        </div>
      </TierGate>
    </div>
  );
}
```

### Example 2: Conditional Upload Flow

```tsx
// frontend/src/components/ui/UploadModal.tsx
import { useHasMultiChapterSupport } from '@/contexts/TierContext';

export function UploadModal({ isOpen, onClose }) {
  const hasMultiChapter = useHasMultiChapterSupport();
  const [uploadedDoc, setUploadedDoc] = useState(null);

  async function handleUpload(file) {
    // Standard upload
    const result = await uploadPDF(file);
    setUploadedDoc(result);

    // If Tier 2, show chapter detection
    if (hasMultiChapter) {
      setShowChapterDetection(true);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {!uploadedDoc ? (
        <UploadForm onUpload={handleUpload} />
      ) : (
        <>
          {hasMultiChapter && showChapterDetection ? (
            <ChapterDetectionStep
              documentId={uploadedDoc.id}
              onComplete={onClose}
            />
          ) : (
            <UploadSuccess onClose={onClose} />
          )}
        </>
      )}
    </Modal>
  );
}
```

### Example 3: Usage Limits Display

```tsx
// frontend/src/components/dashboard/QuickStats.tsx
import { useTier } from '@/contexts/TierContext';
import { TierBadge } from '@/components/tier/TierGate';

export function QuickStats() {
  const { tierData } = useTier();

  if (!tierData) return null;

  const { usage, limits } = tierData;

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard
        title="PDFs This Month"
        value={usage.pdfs_uploaded}
        limit={limits.pdfs_per_month}
        tier={tierData.tier}
      />

      {limits.chapters_per_month > 0 && (
        <StatCard
          title="Chapters Extracted"
          value={usage.chapters_generated}
          limit={limits.chapters_per_month}
          tier={tierData.tier}
        />
      )}

      <div className="flex items-center justify-center">
        <TierBadge />
      </div>
    </div>
  );
}
```

---

## 🎨 Styling Conventions

### Tier-Specific Colors

```css
/* Free Tier */
.tier-free {
  @apply bg-gray-100 text-gray-800 border-gray-300;
}

/* Tier 1 (Student) */
.tier-student {
  @apply bg-blue-100 text-blue-800 border-blue-300;
}

/* Tier 2 (Pro) */
.tier-pro {
  @apply bg-purple-100 text-purple-800 border-purple-300;
}
```

### Feature Indicators

```tsx
// Show "Pro" badge on features
function FeatureCard({ title, description, requiredTier }) {
  return (
    <div className="relative">
      {requiredTier === 'tier2' && (
        <div className="absolute top-2 right-2">
          <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded">
            PRO
          </span>
        </div>
      )}
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
```

---

## ✅ Best Practices

### 1. Always Check Features, Not Tiers
```tsx
// ❌ Bad - tightly coupled to tier names
if (tier === 'tier2') {
  showChapterDetection();
}

// ✅ Good - checks feature availability
if (hasFeature('multi_chapter_support')) {
  showChapterDetection();
}
```

### 2. Graceful Degradation
```tsx
// ✅ Provide fallback for lower tiers
<TierGate
  requiredTier="tier2"
  fallback={<BasicFeature />}
>
  <AdvancedFeature />
</TierGate>
```

### 3. Clear Upgrade Prompts
```tsx
// ✅ Help users understand what they're missing
<TierGate requiredTier="tier2" showUpgradePrompt={true}>
  <PremiumFeature />
</TierGate>
```

### 4. Refresh After Tier Change
```tsx
// ✅ Refresh tier data after upgrade
const { refreshTier } = useTier();

async function handleUpgrade(tier) {
  await upgradeTier(tier);
  await refreshTier();  // Updates UI immediately
}
```

---

## 🧪 Testing Tier Switching

1. Start on **Free tier**
2. Click avatar → Upgrade
3. Upgrade to **Student (Tier 1)**
   - UI should remain the same (single-chapter workflow)
4. Upgrade to **Pro (Tier 2)**
   - New components should appear (ChapterManager, etc.)
   - Usage dashboard shows chapter quota
5. Downgrade back to **Free**
   - Tier 2 features should hide
   - Upgrade prompts should appear

---

## 📝 Summary

**Modular Architecture Benefits:**
- ✅ Clear separation between Free/Tier1 and Tier2 UIs
- ✅ Easy to add new tier-specific features
- ✅ Automatic upgrade prompts for premium features
- ✅ Centralized tier logic via context
- ✅ Type-safe with TypeScript

**Key Files:**
- `contexts/TierContext.tsx` - Global tier state
- `components/tier/TierGate.tsx` - Conditional rendering
- `components/ChapterManager.tsx` - Tier 2 feature example
- `components/UsageDashboard.tsx` - Usage tracking UI

**Next Steps:**
1. Run database migration on Railway
2. Test tier switching in production
3. Add more Tier 2-specific UI components as needed
4. Monitor usage metrics to optimize tier features

---

All UI components are now **modular and tier-aware**! 🎉
