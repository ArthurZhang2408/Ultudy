'use client';

import { useTier, TierId } from '@/contexts/TierContext';
import Link from 'next/link';

interface TierGateProps {
  requiredTier: TierId;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
}

/**
 * Conditionally render content based on user's tier
 *
 * Usage:
 * <TierGate requiredTier="tier2">
 *   <Tier2FeatureComponent />
 * </TierGate>
 */
export function TierGate({ requiredTier, children, fallback, showUpgradePrompt = true }: TierGateProps) {
  const { hasTier, isLoading } = useTier();

  if (isLoading) {
    return null; // Or a loading skeleton
  }

  if (hasTier(requiredTier)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  if (showUpgradePrompt) {
    return (
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6 text-center">
        <div className="mb-4">
          <svg
            className="w-12 h-12 text-purple-600 dark:text-purple-400 mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Premium Feature
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This feature requires {requiredTier === 'tier2' ? 'Pro' : 'Student'} tier or higher.
        </p>
        <Link
          href="/pricing"
          className="inline-block bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors font-semibold"
        >
          Upgrade Now
        </Link>
      </div>
    );
  }

  return null;
}

interface TierBadgeProps {
  tier?: TierId;
  className?: string;
}

/**
 * Display a visual badge for a tier
 */
export function TierBadge({ tier, className = '' }: TierBadgeProps) {
  const { tierData } = useTier();
  const displayTier = tier || tierData?.tier || 'free';

  const styles: Record<TierId, string> = {
    free: 'bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600',
    tier1: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-600',
    tier2: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-600'
  };

  const names: Record<TierId, string> = {
    free: 'Free',
    tier1: 'Student',
    tier2: 'Pro'
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${styles[displayTier]} ${className}`}
    >
      {names[displayTier]}
    </span>
  );
}
