import { queryRead } from '../db/index.js';

// ============================================================
// TIER HIERARCHY
// ============================================================
const tierHierarchy = { free: 0, tier1: 1, tier2: 2 };

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function getUserTier(userId) {
  const result = await queryRead(
    'SELECT tier, status FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0 || result.rows[0].status !== 'active') {
    return 'free';
  }

  return result.rows[0].tier;
}

function getTierLimits(tier) {
  const limits = {
    free: {
      pdfs_per_month: 1,
      max_pages: 10,
      chapters_per_month: 0
    },
    tier1: {
      pdfs_per_month: -1,  // unlimited
      max_pages: -1,
      chapters_per_month: 0
    },
    tier2: {
      pdfs_per_month: -1,
      max_pages: -1,
      chapters_per_month: 100
    }
  };

  return limits[tier] || limits.free;
}

// ============================================================
// MIDDLEWARE
// ============================================================

/**
 * Middleware: Require specific tier or higher
 * Usage: router.post('/endpoint', requireTier('tier2'), handler)
 */
export function requireTier(minTier) {
  return async (req, res, next) => {
    try {
      const userId = req.userId || 'dev-user-001';

      // Get user's current tier
      const userTier = await getUserTier(userId);

      // Check if user's tier is sufficient
      if (tierHierarchy[userTier] < tierHierarchy[minTier]) {
        return res.status(403).json({
          error: 'Insufficient subscription tier',
          required: minTier,
          current: userTier,
          upgrade_url: '/pricing',
          message: `This feature requires ${minTier} or higher. You are currently on ${userTier}.`
        });
      }

      // Attach tier to request for downstream use
      req.userTier = userTier;
      next();
    } catch (error) {
      console.error('[tierCheck] Error:', error);
      return res.status(500).json({ error: 'Failed to verify subscription tier' });
    }
  };
}

/**
 * Middleware: Check usage limits and attach to request
 * Usage: router.post('/upload', checkUsageLimit, handler)
 */
export async function checkUsageLimit(req, res, next) {
  try {
    const userId = req.userId || 'dev-user-001';

    // Get user's tier
    const userTier = await getUserTier(userId);

    // Get current month's usage
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const usage = await queryRead(
      `SELECT * FROM monthly_usage WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    let currentUsage = {
      pdfs_uploaded: 0,
      chapters_generated: 0,
      pages_processed: 0
    };

    if (usage.rows.length > 0) {
      currentUsage = usage.rows[0];
    }

    // Get tier limits
    const limits = getTierLimits(userTier);

    // Attach to request
    req.userTier = userTier;
    req.usage = currentUsage;
    req.limits = limits;

    next();
  } catch (error) {
    console.error('[checkUsageLimit] Error:', error);
    return res.status(500).json({ error: 'Failed to check usage limits' });
  }
}

/**
 * Middleware: Enforce PDF upload limits
 * Usage: router.post('/upload', enforcePdfLimit, handler)
 */
export async function enforcePdfLimit(req, res, next) {
  try {
    const userId = req.userId || 'dev-user-001';

    // Get user's tier and usage (use checkUsageLimit first)
    if (!req.userTier || !req.usage || !req.limits) {
      // Run checkUsageLimit if not already run
      await checkUsageLimit(req, res, () => {});
    }

    const { userTier, usage, limits } = req;

    // Check PDF limit
    if (limits.pdfs_per_month !== -1 && usage.pdfs_uploaded >= limits.pdfs_per_month) {
      return res.status(403).json({
        error: 'PDF upload limit reached',
        tier: userTier,
        limit: limits.pdfs_per_month,
        used: usage.pdfs_uploaded,
        upgrade_url: '/pricing',
        message: `You've reached your monthly limit of ${limits.pdfs_per_month} PDF(s). Upgrade to upload more.`
      });
    }

    next();
  } catch (error) {
    console.error('[enforcePdfLimit] Error:', error);
    return res.status(500).json({ error: 'Failed to enforce PDF limit' });
  }
}

/**
 * Middleware: Enforce page limit (Free tier only)
 * Usage: router.post('/upload', enforcePageLimit, handler)
 */
export function enforcePageLimit(req, res, next) {
  try {
    const { userTier, limits } = req;

    // Only enforce for free tier
    if (userTier === 'free' && limits.max_pages !== -1) {
      // Page count should be in req.body or extracted from PDF
      const pageCount = req.body.page_count || 0;

      if (pageCount > limits.max_pages) {
        return res.status(403).json({
          error: 'Page limit exceeded',
          tier: userTier,
          limit: limits.max_pages,
          pages: pageCount,
          upgrade_url: '/pricing',
          message: `PDF has ${pageCount} pages, but free tier allows max ${limits.max_pages} pages. Upgrade to remove this limit.`
        });
      }
    }

    next();
  } catch (error) {
    console.error('[enforcePageLimit] Error:', error);
    return res.status(500).json({ error: 'Failed to enforce page limit' });
  }
}

/**
 * Middleware: Enforce chapter limit (Tier 2 only)
 * Usage: router.post('/chapter-extract', enforceChapterLimit, handler)
 */
export async function enforceChapterLimit(req, res, next) {
  try {
    const { userTier, usage, limits } = req;

    // Only enforce for tier2
    if (userTier === 'tier2' && limits.chapters_per_month !== -1) {
      const requestedChapters = req.body.chapter_count || 1;

      if (usage.chapters_generated + requestedChapters > limits.chapters_per_month) {
        return res.status(403).json({
          error: 'Chapter limit reached',
          tier: userTier,
          limit: limits.chapters_per_month,
          used: usage.chapters_generated,
          requested: requestedChapters,
          message: `You've used ${usage.chapters_generated}/${limits.chapters_per_month} chapters this month. This request would exceed your limit.`
        });
      }
    }

    next();
  } catch (error) {
    console.error('[enforceChapterLimit] Error:', error);
    return res.status(500).json({ error: 'Failed to enforce chapter limit' });
  }
}

export default {
  requireTier,
  checkUsageLimit,
  enforcePdfLimit,
  enforcePageLimit,
  enforceChapterLimit
};
