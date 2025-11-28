import express from 'express';
import { queryRead, queryWrite } from '../db/index.js';

const router = express.Router();

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getTierLimits(tier) {
  const limits = {
    free: {
      pdfs_per_month: 1,
      max_pages: 10,
      chapters_per_month: 0,
      multi_chapter_support: false,
      multi_source_support: false
    },
    tier1: {
      pdfs_per_month: -1,  // unlimited
      max_pages: -1,
      chapters_per_month: 0,
      multi_chapter_support: false,
      multi_source_support: false
    },
    tier2: {
      pdfs_per_month: -1,
      max_pages: -1,
      chapters_per_month: 100,
      multi_chapter_support: true,
      multi_source_support: true
    }
  };

  return limits[tier] || limits.free;
}

async function getOrCreateSubscription(userId) {
  // Try to get existing subscription
  const result = await queryRead(
    'SELECT * FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  // Create default free tier subscription
  const createResult = await queryWrite(
    `INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end)
     VALUES ($1, 'free', 'active', NOW(), NOW() + INTERVAL '1 year')
     RETURNING *`,
    [userId]
  );

  return createResult.rows[0];
}

// ============================================================
// API ENDPOINTS
// ============================================================

/**
 * GET /api/subscriptions/current
 * Get current user's subscription and limits
 */
router.get('/current', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';

    const subscription = await getOrCreateSubscription(userId);

    // Get current month's usage
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    const usageResult = await queryRead(
      `SELECT * FROM monthly_usage WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    const usage = usageResult.rows.length > 0 ? usageResult.rows[0] : {
      pdfs_uploaded: 0,
      chapters_generated: 0,
      pages_processed: 0
    };

    res.json({
      tier: subscription.tier,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      limits: getTierLimits(subscription.tier),
      usage: {
        pdfs_uploaded: usage.pdfs_uploaded,
        chapters_generated: usage.chapters_generated,
        pages_processed: usage.pages_processed
      }
    });
  } catch (error) {
    console.error('[subscriptions] Get current error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

/**
 * POST /api/subscriptions/upgrade
 * Upgrade user to a new tier (TEST MODE - bypasses payment)
 */
router.post('/upgrade', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { tier } = req.body;

    // Validate tier
    if (!['free', 'tier1', 'tier2'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Get current subscription
    const subscription = await getOrCreateSubscription(userId);

    // Update tier (in test mode, we bypass payment and directly set the tier)
    await queryWrite(
      `UPDATE subscriptions
       SET tier = $1, status = 'active', updated_at = NOW()
       WHERE user_id = $2`,
      [tier, userId]
    );

    console.log(`[subscriptions] User ${userId} upgraded to ${tier} (TEST MODE)`);

    res.json({
      success: true,
      tier: tier,
      message: `Successfully upgraded to ${tier} (test mode)`
    });
  } catch (error) {
    console.error('[subscriptions] Upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade subscription' });
  }
});

/**
 * POST /api/subscriptions/downgrade
 * Downgrade user to a lower tier (TEST MODE)
 */
router.post('/downgrade', async (req, res) => {
  try {
    const userId = req.userId || 'dev-user-001';
    const { tier } = req.body;

    // Validate tier
    if (!['free', 'tier1', 'tier2'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    // Update tier
    await queryWrite(
      `UPDATE subscriptions
       SET tier = $1, updated_at = NOW()
       WHERE user_id = $2`,
      [tier, userId]
    );

    console.log(`[subscriptions] User ${userId} downgraded to ${tier} (TEST MODE)`);

    res.json({
      success: true,
      tier: tier,
      message: `Successfully downgraded to ${tier} (test mode)`
    });
  } catch (error) {
    console.error('[subscriptions] Downgrade error:', error);
    res.status(500).json({ error: 'Failed to downgrade subscription' });
  }
});

// Note: /tiers endpoint is now served directly from app.js (before auth middleware)
// to make it publicly accessible without authentication

export default router;
