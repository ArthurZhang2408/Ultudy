import { queryWrite, queryRead } from '../db/index.js';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getFirstDayOfMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month, 1).toISOString().split('T')[0];
}

// ============================================================
// USAGE TRACKING FUNCTIONS
// ============================================================

/**
 * Track PDF upload
 * Increments PDF count and page count for the current month
 */
export async function trackPdfUpload(userId, pageCount = 0) {
  const month = getFirstDayOfMonth();

  try {
    await queryWrite(
      `INSERT INTO monthly_usage (user_id, month, pdfs_uploaded, pages_processed)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (user_id, month)
       DO UPDATE SET
         pdfs_uploaded = monthly_usage.pdfs_uploaded + 1,
         pages_processed = monthly_usage.pages_processed + $3`,
      [userId, month, pageCount]
    );

    console.log(`[usageTracking] Tracked PDF upload for user ${userId}: ${pageCount} pages`);
  } catch (error) {
    console.error('[usageTracking] Error tracking PDF upload:', error);
    throw error;
  }
}

/**
 * Track chapter generation
 * Increments chapter count for the current month (Tier 2)
 */
export async function trackChapterGeneration(userId, chapterCount = 1) {
  const month = getFirstDayOfMonth();

  try {
    await queryWrite(
      `INSERT INTO monthly_usage (user_id, month, chapters_generated)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, month)
       DO UPDATE SET
         chapters_generated = monthly_usage.chapters_generated + $3`,
      [userId, month, chapterCount]
    );

    console.log(`[usageTracking] Tracked ${chapterCount} chapter(s) for user ${userId}`);
  } catch (error) {
    console.error('[usageTracking] Error tracking chapter generation:', error);
    throw error;
  }
}

/**
 * Get current month's usage for a user
 */
export async function getUsage(userId) {
  const month = getFirstDayOfMonth();

  try {
    const result = await queryRead(
      `SELECT * FROM monthly_usage WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    if (result.rows.length === 0) {
      return {
        pdfs_uploaded: 0,
        chapters_generated: 0,
        pages_processed: 0
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error('[usageTracking] Error getting usage:', error);
    throw error;
  }
}

/**
 * Reset usage for a specific user (admin function)
 */
export async function resetUsage(userId) {
  const month = getFirstDayOfMonth();

  try {
    await queryWrite(
      `UPDATE monthly_usage
       SET pdfs_uploaded = 0, chapters_generated = 0, pages_processed = 0, last_reset_at = NOW()
       WHERE user_id = $1 AND month = $2`,
      [userId, month]
    );

    console.log(`[usageTracking] Reset usage for user ${userId}`);
  } catch (error) {
    console.error('[usageTracking] Error resetting usage:', error);
    throw error;
  }
}

/**
 * Get usage statistics for all users (admin function)
 */
export async function getAllUsageStats() {
  const month = getFirstDayOfMonth();

  try {
    const result = await queryRead(
      `SELECT
         COUNT(*) as total_users,
         SUM(pdfs_uploaded) as total_pdfs,
         SUM(chapters_generated) as total_chapters,
         SUM(pages_processed) as total_pages,
         AVG(pdfs_uploaded) as avg_pdfs_per_user,
         AVG(chapters_generated) as avg_chapters_per_user
       FROM monthly_usage
       WHERE month = $1`,
      [month]
    );

    return result.rows[0];
  } catch (error) {
    console.error('[usageTracking] Error getting all usage stats:', error);
    throw error;
  }
}

export default {
  trackPdfUpload,
  trackChapterGeneration,
  getUsage,
  resetUsage,
  getAllUsageStats
};
