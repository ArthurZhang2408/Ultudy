'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBackendUrl } from '@/lib/api';

interface Usage {
  pdfs_uploaded: number;
  chapters_generated: number;
  pages_processed: number;
}

interface Limits {
  pdfs_per_month: number;
  max_pages: number;
  chapters_per_month: number;
  multi_chapter_support: boolean;
  multi_source_support: boolean;
}

interface SubscriptionData {
  tier: string;
  status: string;
  current_period_end?: string;
  limits: Limits;
  usage: Usage;
}

export default function UsageDashboard() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  async function fetchSubscriptionData() {
    try {
      const res = await fetch(`${getBackendUrl()}/subscriptions/current`, {
        headers: {
          'Authorization': 'Bearer dev-token' // Replace with actual token
        }
      });
      const data = await res.json();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600">Failed to load subscription data</p>
      </div>
    );
  }

  const { tier, usage, limits } = subscription;

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'tier1':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'tier2':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getTierName = (tier: string) => {
    switch (tier) {
      case 'free':
        return 'Free';
      case 'tier1':
        return 'Student';
      case 'tier2':
        return 'Pro';
      default:
        return tier;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-600';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-blue-600';
  };

  const renderUsageBar = (used: number, limit: number, label: string) => {
    if (limit === -1) {
      return (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-sm text-gray-500">Unlimited</span>
          </div>
          <div className="text-xs text-gray-500">{used} used this month</div>
        </div>
      );
    }

    const percentage = (used / limit) * 100;

    return (
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <span className="text-sm text-gray-600">
            {used} / {limit}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`${getProgressColor(percentage)} h-2 rounded-full transition-all duration-300`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Subscription</h2>
          <div
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getTierColor(
              tier
            )}`}
          >
            {getTierName(tier)} Plan
          </div>
        </div>
        <Link
          href="/pricing"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
        >
          {tier === 'free' ? 'Upgrade' : 'Change Plan'}
        </Link>
      </div>

      <div className="space-y-4">
        {/* PDF Upload Usage */}
        {limits.pdfs_per_month !== 0 && renderUsageBar(usage.pdfs_uploaded, limits.pdfs_per_month, 'PDFs Uploaded')}

        {/* Chapter Usage (Tier 2 only) */}
        {tier === 'tier2' && limits.chapters_per_month > 0 && (
          renderUsageBar(usage.chapters_generated, limits.chapters_per_month, 'Chapters Generated')
        )}

        {/* Pages Processed (informational) */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-gray-700">Total Pages Processed</span>
            <span className="text-sm text-gray-600">{usage.pages_processed}</span>
          </div>
          <div className="text-xs text-gray-500">This month</div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Your Features</h3>
          <div className="space-y-2">
            <div className="flex items-center text-sm text-gray-600">
              {limits.multi_chapter_support ? (
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              Multi-chapter PDF support
            </div>
            <div className="flex items-center text-sm text-gray-600">
              {limits.multi_source_support ? (
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              Multiple sources per chapter
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Concept mastery tracking
            </div>
          </div>
        </div>

        {/* Upgrade CTA for Free Tier */}
        {tier === 'free' && usage.pdfs_uploaded >= limits.pdfs_per_month && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800 mb-2">
              You've reached your monthly limit. Upgrade to continue uploading!
            </p>
            <Link
              href="/pricing"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Upgrade Now
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
