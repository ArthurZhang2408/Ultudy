# Subscription & Payment System Architecture

**Last Updated:** 2025-11-24
**Status:** Planning
**Purpose:** Complete technical implementation strategy for Stripe-based subscription system with tier management

---

## 💳 Stripe Pricing Analysis

### Transaction Fees

Based on current Stripe pricing ([Stripe Pricing](https://stripe.com/pricing), [Swipesum Guide](https://www.swipesum.com/insights/guide-to-stripe-fees-rates-for-2025)):

**Standard Pricing:**
- **Online card payments**: 2.9% + $0.30 per transaction
- **ACH payments** (bank transfer): 0.8% (max $5 per transaction)
- **International cards**: Additional 1.5% fee
- **Currency conversion**: Additional 1% fee
- **Chargebacks**: $15 fee

**No Monthly Fees:**
- No setup fees
- No monthly fees
- No hidden closure fees

### Cost Impact on Ultudy Tiers

**Tier 1: $17 CAD/month**
- Stripe fee: 2.9% × $17 + $0.30 = **$0.79 CAD**
- Our cost: $0.38 CAD (AI + infrastructure)
- **Net profit: $15.83 CAD/user/month (93% margin)**

**Tier 2: $40 CAD/month**
- Stripe fee: 2.9% × $40 + $0.30 = **$1.46 CAD**
- Our cost: $7.21 CAD (AI + infrastructure)
- **Net profit: $31.33 CAD/user/month (78% margin)**

**Free Tier: $0**
- No Stripe fees (no payment)
- Our cost: $0.17 CAD
- Sustainable up to 10k users

### Fee Optimization Strategies

1. **Encourage ACH payments** (0.8% vs 2.9%)
   - Add bank account payment option
   - Potential savings: ~2.1% per transaction

2. **Annual billing option**
   - Tier 1: $180/year (save $24 vs monthly)
   - Tier 2: $420/year (save $60 vs monthly)
   - Single transaction fee vs 12 monthly fees
   - Savings: 11 × $0.30 = $3.30 + lower churn

3. **Stripe Billing vs Payment Links**
   - Use Stripe Billing (automatic subscription management)
   - Handles proration, upgrades, downgrades automatically
   - Same pricing, better UX

---

## 🏗️ System Architecture

### High-Level Flow

```
┌─────────────┐
│   Frontend  │
│  (Next.js)  │
└──────┬──────┘
       │
       │ 1. User clicks "Upgrade to Tier 1"
       │
       ▼
┌─────────────────────────────────────┐
│  Backend API                        │
│  POST /api/subscriptions/checkout   │
└──────┬──────────────────────────────┘
       │
       │ 2. Create Stripe Checkout Session
       │
       ▼
┌─────────────────────────────────────┐
│  Stripe Checkout                    │
│  (Hosted Payment Page)              │
└──────┬──────────────────────────────┘
       │
       │ 3. User completes payment
       │
       ▼
┌─────────────────────────────────────┐
│  Stripe Webhook                     │
│  checkout.session.completed         │
└──────┬──────────────────────────────┘
       │
       │ 4. Webhook validates & updates DB
       │
       ▼
┌─────────────────────────────────────┐
│  Database                           │
│  subscriptions table                │
│  user tier = 'tier1'                │
└─────────────────────────────────────┘
```

---

## 📊 Database Schema

### New Tables

```sql
-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,  -- Clerk user ID

  -- Stripe data
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT NOT NULL,

  -- Tier information
  tier TEXT NOT NULL CHECK (tier IN ('free', 'tier1', 'tier2')),

  -- Status
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),

  -- Billing period
  current_period_start TIMESTAMP NOT NULL,
  current_period_end TIMESTAMP NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Usage tracking table
CREATE TABLE monthly_usage (
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

-- Payment history (for invoices, disputes)
CREATE TABLE payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Stripe data
  stripe_invoice_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,

  -- Payment details
  amount_total INTEGER NOT NULL,  -- In cents
  currency TEXT NOT NULL DEFAULT 'cad',
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'failed', 'refunded')),

  -- Metadata
  billing_reason TEXT,  -- 'subscription_create', 'subscription_cycle', 'subscription_update'
  invoice_pdf_url TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_monthly_usage_user_month ON monthly_usage(user_id, month);
CREATE INDEX idx_payment_history_user ON payment_history(user_id);
```

### Existing Table Updates

```sql
-- Add tier column to users if using custom user table
-- (Not needed if using Clerk metadata)

-- Add tier-specific limits to documents table (optional)
ALTER TABLE documents
ADD COLUMN requires_tier TEXT CHECK (requires_tier IN ('free', 'tier1', 'tier2'));
```

---

## 🔐 Environment Variables

### Backend `.env`

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_...                    # Test mode
STRIPE_PUBLISHABLE_KEY=pk_test_...               # Test mode (for frontend)
STRIPE_WEBHOOK_SECRET=whsec_...                  # Webhook signing secret

# Stripe Product/Price IDs (from Stripe Dashboard)
STRIPE_PRICE_TIER1_MONTHLY=price_tier1_monthly   # $17 CAD/month
STRIPE_PRICE_TIER1_YEARLY=price_tier1_yearly     # $180 CAD/year
STRIPE_PRICE_TIER2_MONTHLY=price_tier2_monthly   # $40 CAD/month
STRIPE_PRICE_TIER2_YEARLY=price_tier2_yearly     # $420 CAD/year

# Tier Limits (for enforcement)
FREE_TIER_PDF_LIMIT=1
FREE_TIER_PAGE_LIMIT=10
TIER1_PDF_LIMIT=-1                               # -1 = unlimited
TIER2_CHAPTER_LIMIT=100
TIER2_OVERAGE_PRICE=10                           # $10 per 20 extra chapters

# Feature Flags
ENABLE_SUBSCRIPTIONS=true                        # Toggle subscriptions on/off
ENABLE_ANNUAL_BILLING=false                      # Enable annual plans
ENABLE_ACH_PAYMENTS=false                        # Enable bank transfers

# Webhook Config
STRIPE_WEBHOOK_TOLERANCE=300                     # 5 minutes tolerance for timestamp
```

### Frontend `.env.local`

```bash
# Stripe Public Key (safe to expose)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Feature Flags
NEXT_PUBLIC_ENABLE_SUBSCRIPTIONS=true
NEXT_PUBLIC_SHOW_ANNUAL_OPTION=false
```

### Environment-Specific Configuration

**Development:**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Production:**
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Deployment Strategy:**
- Store secrets in Railway/Vercel environment variables
- Never commit `.env` files to git
- Use different Stripe accounts for dev/staging/prod
- Test webhooks with Stripe CLI in development

---

## 🔧 Backend Implementation

### 1. Stripe Client Setup

**File:** `backend/src/lib/stripe.js`

```javascript
const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',  // Use latest stable version
  typescript: true
});

module.exports = { stripe };
```

### 2. Subscription Routes

**File:** `backend/src/routes/subscriptions.js`

```javascript
const express = require('express');
const router = express.Router();
const { stripe } = require('../lib/stripe');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');

// POST /api/subscriptions/checkout
// Create Stripe Checkout Session
router.post('/checkout', requireAuth, async (req, res) => {
  const userId = req.userId;  // From Clerk auth
  const { tier, billingPeriod } = req.body;  // 'tier1' | 'tier2', 'monthly' | 'yearly'

  // Validate tier
  if (!['tier1', 'tier2'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    // Check if user already has subscription
    const existing = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: 'You already have an active subscription. Please upgrade/downgrade instead.'
      });
    }

    // Get or create Stripe customer
    let customer = await getOrCreateStripeCustomer(userId);

    // Get price ID based on tier and billing period
    const priceId = getPriceId(tier, billingPeriod);

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],  // Add 'us_bank_account' for ACH
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: `${process.env.FRONTEND_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing`,
      metadata: {
        user_id: userId,
        tier: tier
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          tier: tier
        }
      }
    });

    return res.json({
      sessionId: session.id,
      url: session.url
    });
  } catch (error) {
    console.error('[subscriptions] Checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// GET /api/subscriptions/current
// Get current user's subscription
router.get('/current', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const result = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        tier: 'free',
        status: 'active',
        limits: {
          pdfs_per_month: 1,
          max_pages: 10,
          chapters_per_month: 0
        }
      });
    }

    const subscription = result.rows[0];

    return res.json({
      tier: subscription.tier,
      status: subscription.status,
      current_period_end: subscription.current_period_end,
      cancel_at_period_end: subscription.cancel_at_period_end,
      limits: getTierLimits(subscription.tier)
    });
  } catch (error) {
    console.error('[subscriptions] Get current error:', error);
    return res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// POST /api/subscriptions/cancel
// Cancel subscription at period end
router.post('/cancel', requireAuth, async (req, res) => {
  const userId = req.userId;

  try {
    const subscription = await db.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 AND status = $2',
      [userId, 'active']
    );

    if (subscription.rows.length === 0) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    const sub = subscription.rows[0];

    // Cancel at period end (not immediately)
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    // Update database
    await db.query(
      'UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1',
      [sub.id]
    );

    return res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period'
    });
  } catch (error) {
    console.error('[subscriptions] Cancel error:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// Helper functions
async function getOrCreateStripeCustomer(userId) {
  // Check if customer exists in DB
  const existing = await db.query(
    'SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1',
    [userId]
  );

  if (existing.rows.length > 0 && existing.rows[0].stripe_customer_id) {
    return stripe.customers.retrieve(existing.rows[0].stripe_customer_id);
  }

  // Get user email from Clerk
  const userEmail = await getUserEmail(userId);

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: userEmail,
    metadata: {
      user_id: userId
    }
  });

  return customer;
}

function getPriceId(tier, billingPeriod) {
  const priceMap = {
    tier1: {
      monthly: process.env.STRIPE_PRICE_TIER1_MONTHLY,
      yearly: process.env.STRIPE_PRICE_TIER1_YEARLY
    },
    tier2: {
      monthly: process.env.STRIPE_PRICE_TIER2_MONTHLY,
      yearly: process.env.STRIPE_PRICE_TIER2_YEARLY
    }
  };

  return priceMap[tier][billingPeriod];
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

module.exports = router;
```

### 3. Webhook Handler

**File:** `backend/src/routes/webhooks.js`

```javascript
const express = require('express');
const router = express.Router();
const { stripe } = require('../lib/stripe');
const db = require('../db');

// POST /api/webhooks/stripe
// Handle Stripe webhook events
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      default:
        console.log(`[webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[webhook] Handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Event handlers
async function handleCheckoutComplete(session) {
  const userId = session.metadata.user_id;
  const tier = session.metadata.tier;

  // Get subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  // Create or update subscription in DB
  await db.query(`
    INSERT INTO subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      tier,
      status,
      current_period_start,
      current_period_end
    ) VALUES ($1, $2, $3, $4, $5, $6, to_timestamp($7), to_timestamp($8))
    ON CONFLICT (user_id)
    DO UPDATE SET
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      tier = EXCLUDED.tier,
      status = EXCLUDED.status,
      current_period_start = EXCLUDED.current_period_start,
      current_period_end = EXCLUDED.current_period_end,
      updated_at = NOW()
  `, [
    userId,
    session.customer,
    subscription.id,
    subscription.items.data[0].price.id,
    tier,
    subscription.status,
    subscription.current_period_start,
    subscription.current_period_end
  ]);

  console.log(`[webhook] Subscription created for user ${userId}, tier: ${tier}`);
}

async function handleSubscriptionUpdate(subscription) {
  await db.query(`
    UPDATE subscriptions
    SET
      status = $1,
      current_period_start = to_timestamp($2),
      current_period_end = to_timestamp($3),
      cancel_at_period_end = $4,
      updated_at = NOW()
    WHERE stripe_subscription_id = $5
  `, [
    subscription.status,
    subscription.current_period_start,
    subscription.current_period_end,
    subscription.cancel_at_period_end,
    subscription.id
  ]);

  console.log(`[webhook] Subscription updated: ${subscription.id}`);
}

async function handleSubscriptionDeleted(subscription) {
  await db.query(`
    UPDATE subscriptions
    SET
      status = 'canceled',
      updated_at = NOW()
    WHERE stripe_subscription_id = $1
  `, [subscription.id]);

  console.log(`[webhook] Subscription canceled: ${subscription.id}`);
}

async function handleInvoicePaid(invoice) {
  const userId = invoice.subscription_details?.metadata?.user_id;

  if (!userId) return;

  // Record payment history
  await db.query(`
    INSERT INTO payment_history (
      user_id,
      stripe_invoice_id,
      stripe_payment_intent_id,
      amount_total,
      currency,
      status,
      billing_reason,
      invoice_pdf_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [
    userId,
    invoice.id,
    invoice.payment_intent,
    invoice.amount_paid,
    invoice.currency,
    'paid',
    invoice.billing_reason,
    invoice.invoice_pdf
  ]);

  console.log(`[webhook] Invoice paid for user ${userId}: ${invoice.amount_paid / 100} ${invoice.currency}`);
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;

  // Update subscription status to past_due
  await db.query(`
    UPDATE subscriptions
    SET status = 'past_due', updated_at = NOW()
    WHERE stripe_subscription_id = $1
  `, [subscriptionId]);

  console.log(`[webhook] Payment failed for subscription: ${subscriptionId}`);
}

module.exports = router;
```

### 4. Tier Enforcement Middleware

**File:** `backend/src/middleware/tierCheck.js`

```javascript
const db = require('../db');

// Middleware: Require specific tier or higher
function requireTier(minTier) {
  const tierHierarchy = { free: 0, tier1: 1, tier2: 2 };

  return async (req, res, next) => {
    const userId = req.userId;  // From auth middleware

    try {
      // Get user's current tier
      const result = await db.query(
        'SELECT tier, status FROM subscriptions WHERE user_id = $1',
        [userId]
      );

      let userTier = 'free';
      if (result.rows.length > 0 && result.rows[0].status === 'active') {
        userTier = result.rows[0].tier;
      }

      // Check if user's tier is sufficient
      if (tierHierarchy[userTier] < tierHierarchy[minTier]) {
        return res.status(403).json({
          error: 'Insufficient subscription tier',
          required: minTier,
          current: userTier,
          upgrade_url: '/pricing'
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

// Middleware: Check usage limits
async function checkUsageLimit(req, res, next) {
  const userId = req.userId;
  const userTier = req.userTier || 'free';

  try {
    // Get current month's usage
    const now = new Date();
    const month = new Date(now.getFullYear(), now.getMonth(), 1);

    const usage = await db.query(`
      SELECT * FROM monthly_usage
      WHERE user_id = $1 AND month = $2
    `, [userId, month]);

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
    req.usage = currentUsage;
    req.limits = limits;

    next();
  } catch (error) {
    console.error('[checkUsageLimit] Error:', error);
    return res.status(500).json({ error: 'Failed to check usage limits' });
  }
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

module.exports = {
  requireTier,
  checkUsageLimit,
  getTierLimits
};
```

### 5. Usage Tracking

**File:** `backend/src/services/usageTracking.js`

```javascript
const db = require('../db');

// Increment PDF upload count
async function trackPdfUpload(userId, pageCount) {
  const month = getFirstDayOfMonth();

  await db.query(`
    INSERT INTO monthly_usage (user_id, month, pdfs_uploaded, pages_processed)
    VALUES ($1, $2, 1, $3)
    ON CONFLICT (user_id, month)
    DO UPDATE SET
      pdfs_uploaded = monthly_usage.pdfs_uploaded + 1,
      pages_processed = monthly_usage.pages_processed + $3
  `, [userId, month, pageCount]);
}

// Increment chapter generation count
async function trackChapterGeneration(userId, chapterCount = 1) {
  const month = getFirstDayOfMonth();

  await db.query(`
    INSERT INTO monthly_usage (user_id, month, chapters_generated)
    VALUES ($1, $2, $3)
    ON CONFLICT (user_id, month)
    DO UPDATE SET
      chapters_generated = monthly_usage.chapters_generated + $3
  `, [userId, month, chapterCount]);
}

// Get current month's usage
async function getUsage(userId) {
  const month = getFirstDayOfMonth();

  const result = await db.query(`
    SELECT * FROM monthly_usage
    WHERE user_id = $1 AND month = $2
  `, [userId, month]);

  if (result.rows.length === 0) {
    return {
      pdfs_uploaded: 0,
      chapters_generated: 0,
      pages_processed: 0
    };
  }

  return result.rows[0];
}

function getFirstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

module.exports = {
  trackPdfUpload,
  trackChapterGeneration,
  getUsage
};
```

---

## 🎨 Frontend Implementation

### 1. Pricing Page Component

**File:** `frontend/src/app/pricing/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { useAuth } from '@clerk/nextjs';

export default function PricingPage() {
  const { userId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: 'tier1' | 'tier2', billing: 'monthly' | 'yearly') {
    if (!userId) {
      window.location.href = '/sign-in?redirect_url=/pricing';
      return;
    }

    setLoading(tier);

    try {
      const res = await fetch('/api/subscriptions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, billingPeriod: billing })
      });

      const data = await res.json();

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (error) {
      console.error('Subscription error:', error);
      alert('Failed to start subscription. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-4xl font-bold text-center mb-12">Choose Your Plan</h1>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Free Tier */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <h3 className="text-2xl font-bold mb-4">Free</h3>
            <p className="text-4xl font-bold mb-6">$0<span className="text-lg text-gray-500">/month</span></p>
            <ul className="space-y-3 mb-8">
              <li>✓ 1 PDF per month</li>
              <li>✓ Max 10 pages</li>
              <li>✓ All core features</li>
              <li>✓ Mastery tracking</li>
            </ul>
            <button
              disabled
              className="w-full py-2 bg-gray-300 text-gray-600 rounded cursor-not-allowed"
            >
              Current Plan
            </button>
          </div>

          {/* Tier 1 */}
          <div className="bg-white rounded-lg shadow-md p-8 border-2 border-blue-500">
            <div className="bg-blue-500 text-white text-sm font-bold px-3 py-1 rounded-full inline-block mb-4">
              POPULAR
            </div>
            <h3 className="text-2xl font-bold mb-4">Student</h3>
            <p className="text-4xl font-bold mb-6">$17<span className="text-lg text-gray-500">/month</span></p>
            <ul className="space-y-3 mb-8">
              <li>✓ Unlimited PDFs</li>
              <li>✓ No page limit</li>
              <li>✓ Multiple courses</li>
              <li>✓ Priority support</li>
            </ul>
            <button
              onClick={() => handleSubscribe('tier1', 'monthly')}
              disabled={loading === 'tier1'}
              className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading === 'tier1' ? 'Loading...' : 'Subscribe'}
            </button>
          </div>

          {/* Tier 2 */}
          <div className="bg-white rounded-lg shadow-md p-8">
            <h3 className="text-2xl font-bold mb-4">Pro</h3>
            <p className="text-4xl font-bold mb-6">$40<span className="text-lg text-gray-500">/month</span></p>
            <ul className="space-y-3 mb-8">
              <li>✓ All Student features</li>
              <li>✓ Multi-chapter PDFs</li>
              <li>✓ Multiple sources</li>
              <li>✓ 100 chapters/month</li>
              <li>✓ Premium quality AI</li>
            </ul>
            <button
              onClick={() => handleSubscribe('tier2', 'monthly')}
              disabled={loading === 'tier2'}
              className="w-full py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading === 'tier2' ? 'Loading...' : 'Subscribe'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 2. Usage Dashboard Component

**File:** `frontend/src/components/UsageDashboard.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';

export default function UsageDashboard() {
  const [subscription, setSubscription] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  async function fetchSubscriptionData() {
    try {
      const res = await fetch('/api/subscriptions/current');
      const data = await res.json();
      setSubscription(data);

      const usageRes = await fetch('/api/usage/current');
      const usageData = await usageRes.json();
      setUsage(usageData);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">Your Subscription</h2>

      <div className="space-y-4">
        <div>
          <span className="text-gray-600">Current Plan:</span>
          <span className="ml-2 font-semibold capitalize">{subscription.tier}</span>
        </div>

        {subscription.tier === 'free' && (
          <div className="space-y-2">
            <div>
              <span className="text-gray-600">PDFs This Month:</span>
              <span className="ml-2">{usage.pdfs_uploaded} / 1</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${(usage.pdfs_uploaded / 1) * 100}%` }}
              />
            </div>
          </div>
        )}

        {subscription.tier === 'tier2' && (
          <div className="space-y-2">
            <div>
              <span className="text-gray-600">Chapters This Month:</span>
              <span className="ml-2">{usage.chapters_generated} / 100</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-purple-600 h-2 rounded-full"
                style={{ width: `${(usage.chapters_generated / 100) * 100}%` }}
              />
            </div>
          </div>
        )}

        {subscription.status === 'active' && subscription.tier !== 'free' && (
          <button
            onClick={handleCancelSubscription}
            className="text-red-600 hover:text-red-700 text-sm"
          >
            Cancel Subscription
          </button>
        )}
      </div>
    </div>
  );
}
```

---

## 🧪 Testing Strategy

### Unit Tests

```javascript
// Test tier validation
describe('Tier Middleware', () => {
  it('should allow tier1 users to access tier1 routes', async () => {
    // Mock user with tier1
    // Call requireTier('tier1')
    // Expect next() to be called
  });

  it('should block free users from tier1 routes', async () => {
    // Mock user with free tier
    // Call requireTier('tier1')
    // Expect 403 response
  });
});

// Test usage limits
describe('Usage Tracking', () => {
  it('should prevent free users from uploading >1 PDF', async () => {
    // Create user with 1 PDF uploaded this month
    // Attempt to upload another
    // Expect 403 with upgrade prompt
  });

  it('should allow tier1 users unlimited PDFs', async () => {
    // Create tier1 user with 50 PDFs uploaded
    // Attempt to upload another
    // Expect success
  });
});
```

### Integration Tests

```javascript
// Test full subscription flow
describe('Subscription Flow', () => {
  it('should complete checkout and activate subscription', async () => {
    // 1. Create checkout session
    // 2. Simulate webhook: checkout.session.completed
    // 3. Verify subscription in DB
    // 4. Verify user tier updated
  });

  it('should handle subscription cancellation', async () => {
    // 1. Create active subscription
    // 2. Call cancel endpoint
    // 3. Verify cancel_at_period_end = true
    // 4. User still has access until period end
  });
});
```

### Webhook Testing

**Use Stripe CLI:**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.deleted
```

---

## 🚨 Edge Cases & Error Handling

### 1. Payment Failed

**Scenario:** User's credit card declined

**Handling:**
- Stripe sends `invoice.payment_failed` webhook
- Update subscription status to `past_due`
- Send email notification (via Stripe)
- Allow grace period (3 days) before restricting access
- Downgrade to free tier after grace period

**Implementation:**
```javascript
async function handlePaymentFailed(invoice) {
  await db.query(`
    UPDATE subscriptions
    SET status = 'past_due', updated_at = NOW()
    WHERE stripe_subscription_id = $1
  `, [invoice.subscription]);

  // Schedule downgrade job for 3 days later
  await scheduleDowngrade(invoice.subscription, 3);
}
```

### 2. Subscription Upgrade/Downgrade

**Scenario:** User switches from Tier 1 to Tier 2 mid-cycle

**Handling:**
- Stripe handles proration automatically
- Charges prorated amount immediately
- Updates subscription in webhook
- User gets Tier 2 access immediately

**Implementation:**
```javascript
// POST /api/subscriptions/upgrade
router.post('/upgrade', requireAuth, async (req, res) => {
  const { newTier } = req.body;
  const userId = req.userId;

  const subscription = await getActiveSubscription(userId);

  // Update subscription with new price
  await stripe.subscriptions.update(subscription.stripe_subscription_id, {
    items: [{
      id: subscription.stripe_item_id,
      price: getPriceId(newTier, 'monthly')
    }],
    proration_behavior: 'create_prorations'  // Charge/credit difference
  });

  res.json({ success: true });
});
```

### 3. Duplicate Webhook Events

**Scenario:** Stripe sends same webhook twice

**Handling:**
- Use Stripe event ID as idempotency key
- Check if event already processed
- Return 200 OK without re-processing

**Implementation:**
```javascript
// Add events table
CREATE TABLE processed_webhooks (
  stripe_event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMP DEFAULT NOW()
);

// In webhook handler
async function handleWebhook(event) {
  // Check if already processed
  const exists = await db.query(
    'SELECT 1 FROM processed_webhooks WHERE stripe_event_id = $1',
    [event.id]
  );

  if (exists.rows.length > 0) {
    console.log(`[webhook] Event ${event.id} already processed`);
    return;
  }

  // Process event...

  // Mark as processed
  await db.query(
    'INSERT INTO processed_webhooks (stripe_event_id) VALUES ($1)',
    [event.id]
  );
}
```

### 4. Refund Handling

**Scenario:** User requests refund

**Handling:**
- Admin issues refund via Stripe Dashboard
- Stripe sends `charge.refunded` webhook
- Immediately cancel subscription
- Downgrade user to free tier

### 5. Account Deletion

**Scenario:** User deletes account

**Handling:**
- Cancel Stripe subscription immediately
- Delete customer from Stripe (GDPR compliance)
- Soft delete or anonymize user data in DB

**Implementation:**
```javascript
async function handleAccountDeletion(userId) {
  const subscription = await getActiveSubscription(userId);

  if (subscription) {
    // Cancel subscription
    await stripe.subscriptions.cancel(subscription.stripe_subscription_id);

    // Delete Stripe customer
    await stripe.customers.del(subscription.stripe_customer_id);
  }

  // Anonymize user data
  await db.query(`
    UPDATE subscriptions
    SET user_id = 'deleted_user', updated_at = NOW()
    WHERE user_id = $1
  `, [userId]);
}
```

---

## 📊 Monitoring & Analytics

### Metrics to Track

1. **Conversion Metrics**
   - Free → Tier 1 conversion rate
   - Tier 1 → Tier 2 upgrade rate
   - Checkout abandonment rate

2. **Churn Metrics**
   - Monthly churn rate per tier
   - Cancellation reasons (survey)
   - Lifetime value (LTV) per tier

3. **Usage Metrics**
   - Average PDFs per user per tier
   - Average chapters per Tier 2 user
   - Overage purchases (Tier 2)

4. **Financial Metrics**
   - Monthly Recurring Revenue (MRR)
   - Average Revenue Per User (ARPU)
   - Stripe fees as % of revenue

### Implementation

**Analytics Service:** Use Stripe Dashboard + Custom DB Queries

```sql
-- Conversion rate
SELECT
  COUNT(*) FILTER (WHERE tier = 'tier1') * 100.0 / COUNT(*) as tier1_conversion
FROM subscriptions;

-- Churn rate
SELECT
  COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at > NOW() - INTERVAL '30 days') * 100.0 /
  COUNT(*) FILTER (WHERE status = 'active')
  as monthly_churn_rate
FROM subscriptions;

-- MRR
SELECT
  SUM(CASE
    WHEN tier = 'tier1' THEN 17
    WHEN tier = 'tier2' THEN 40
    ELSE 0
  END) as mrr
FROM subscriptions
WHERE status = 'active';
```

---

## 🔐 Security Considerations

### 1. Webhook Security

- **Verify signature**: Always use `stripe.webhooks.constructEvent()`
- **HTTPS only**: Webhooks must use HTTPS in production
- **Timestamp tolerance**: Reject events older than 5 minutes
- **Idempotency**: Use event ID to prevent duplicate processing

### 2. API Key Management

- **Never expose secret key**: Only use in backend
- **Rotate keys**: Rotate API keys every 90 days
- **Use environment-specific keys**: Separate test/prod keys
- **Restrict key permissions**: Use restricted API keys where possible

### 3. User Data Protection

- **No PII in metadata**: Don't store sensitive data in Stripe metadata
- **Encrypt database**: Use encrypted database columns for payment history
- **PCI compliance**: Never store credit card numbers (let Stripe handle it)

---

## 📝 Deployment Checklist

### Stripe Setup

- [ ] Create Stripe account
- [ ] Create products in Stripe Dashboard:
  - [ ] Tier 1 Monthly ($17 CAD)
  - [ ] Tier 1 Yearly ($180 CAD)
  - [ ] Tier 2 Monthly ($40 CAD)
  - [ ] Tier 2 Yearly ($420 CAD)
- [ ] Copy price IDs to environment variables
- [ ] Set up webhook endpoint in Stripe Dashboard
- [ ] Copy webhook secret to environment variables
- [ ] Enable Stripe Billing in Dashboard
- [ ] Configure email notifications

### Database

- [ ] Run migration to create tables:
  - [ ] `subscriptions`
  - [ ] `monthly_usage`
  - [ ] `payment_history`
  - [ ] `processed_webhooks`
- [ ] Create indexes
- [ ] Set up RLS policies (if using Neon/Supabase)

### Backend

- [ ] Install Stripe SDK: `npm install stripe`
- [ ] Add subscription routes
- [ ] Add webhook handler
- [ ] Add tier middleware
- [ ] Add usage tracking service
- [ ] Deploy to Railway
- [ ] Set environment variables in Railway

### Frontend

- [ ] Create pricing page
- [ ] Create success page (`/subscription/success`)
- [ ] Add usage dashboard component
- [ ] Add tier gates to upload flows
- [ ] Deploy to Vercel
- [ ] Set environment variables in Vercel

### Testing

- [ ] Test checkout flow (test mode)
- [ ] Test webhooks with Stripe CLI
- [ ] Test tier restrictions
- [ ] Test usage limits
- [ ] Test upgrade/downgrade
- [ ] Test cancellation

### Production Launch

- [ ] Switch to live Stripe keys
- [ ] Update webhook endpoint to production URL
- [ ] Test live checkout with real card
- [ ] Monitor Stripe Dashboard
- [ ] Set up alerts for failed payments

---

## 💰 Cost Summary

### Stripe Fees (per transaction)

| Tier | Price | Stripe Fee | Net Revenue |
|------|-------|------------|-------------|
| Tier 1 | $17 CAD | $0.79 | $16.21 |
| Tier 2 | $40 CAD | $1.46 | $38.54 |

### Infrastructure Costs (per user/month)

| Tier | AI | Storage | DB | Total Cost | Net Profit | Margin |
|------|-----|---------|----|-----------|-----------| -------|
| Free | $0.02 | $0.002 | $0.15 | $0.17 | -$0.17 | N/A |
| Tier 1 | $0.11 | $0.002 | $0.25 | $0.38 | $15.83 | 93% |
| Tier 2 | $5.09 | $0.006 | $2.00 | $7.21 | $31.33 | 78% |

**Total Cost = Infrastructure + Stripe Fees**

- Tier 1: $0.38 + $0.79 = **$1.17 per user** → **Profit: $15.83 (93%)**
- Tier 2: $7.21 + $1.46 = **$8.67 per user** → **Profit: $31.33 (78%)**

---

## Related Documentation

- [PRICING_TIERS.md](PRICING_TIERS.md) - Pricing strategy and tier features
- [TIER_2_ARCHITECTURE.md](TIER_2_ARCHITECTURE.md) - Multi-chapter technical design
- [backend/ENV_CONFIGURATION.md](backend/ENV_CONFIGURATION.md) - Environment variables

---

## Changelog

- 2025-11-24: Initial subscription system architecture documentation created

---

## Sources

- [Stripe Pricing](https://stripe.com/pricing)
- [Swipesum Stripe Fees Guide](https://www.swipesum.com/insights/guide-to-stripe-fees-rates-for-2025)
- [Payment Cloud Stripe Fees](https://paymentcloudinc.com/blog/stripe-fees/)
