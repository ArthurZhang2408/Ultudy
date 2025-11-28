-- Migration: Subscription System and Tier Management
-- Created: 2025-11-25
-- Purpose: Add tables for subscription management, usage tracking, and Tier 2 chapter features

-- ============================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================
-- Stores user subscription information and tier status
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,  -- Clerk user ID

  -- Tier information
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'tier1', 'tier2')),

  -- Status (for future Stripe integration, currently just 'active')
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),

  -- Billing period (set to far future for testing without payment)
  current_period_start TIMESTAMP NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- MONTHLY USAGE TRACKING TABLE
-- ============================================================
-- Tracks user usage per month for tier limits enforcement
CREATE TABLE IF NOT EXISTS monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  month DATE NOT NULL,  -- First day of month: '2025-11-01'

  -- Tier-specific metrics
  pdfs_uploaded INTEGER DEFAULT 0,
  chapters_generated INTEGER DEFAULT 0,
  pages_processed INTEGER DEFAULT 0,

  -- Reset tracking
  last_reset_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, month)
);

-- ============================================================
-- CHAPTER METADATA TABLE (Tier 2)
-- ============================================================
-- Stores detected chapters from multi-chapter PDFs
CREATE TABLE IF NOT EXISTS chapter_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,  -- References documents table
  course_id UUID,  -- References courses table

  -- Chapter information
  chapter_number INTEGER NOT NULL,
  chapter_title TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL,

  -- Extracted content (cached)
  markdown_content TEXT,

  -- Ownership
  owner_id TEXT NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(document_id, chapter_number)
);

-- ============================================================
-- LESSON SOURCES TABLE (Tier 2 - Multi-source support)
-- ============================================================
-- Links lessons to multiple source chapters
CREATE TABLE IF NOT EXISTS lesson_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL,  -- References lessons table
  chapter_metadata_id UUID,  -- References chapter_metadata table (optional)
  document_id UUID,  -- Direct document reference for Tier 1

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_month ON monthly_usage(user_id, month);
CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_id ON monthly_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_chapter_metadata_document ON chapter_metadata(document_id);
CREATE INDEX IF NOT EXISTS idx_chapter_metadata_course ON chapter_metadata(course_id, chapter_number);
CREATE INDEX IF NOT EXISTS idx_chapter_metadata_owner ON chapter_metadata(owner_id);

CREATE INDEX IF NOT EXISTS idx_lesson_sources_lesson ON lesson_sources(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sources_chapter ON lesson_sources(chapter_metadata_id);

-- ============================================================
-- INITIAL DATA
-- ============================================================
-- Create default free tier subscription for all existing users
-- This will be handled by the API when users first access the system

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
