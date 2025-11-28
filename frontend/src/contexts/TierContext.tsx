'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { getBackendUrl } from '@/lib/api';

export type TierId = 'free' | 'tier1' | 'tier2';

interface TierLimits {
  pdfs_per_month: number;
  max_pages: number;
  chapters_per_month: number;
  multi_chapter_support: boolean;
  multi_source_support: boolean;
}

interface TierUsage {
  pdfs_uploaded: number;
  chapters_generated: number;
  pages_processed: number;
}

interface TierData {
  tier: TierId;
  status: string;
  limits: TierLimits;
  usage: TierUsage;
  current_period_end?: string;
}

interface TierContextValue {
  tierData: TierData | null;
  isLoading: boolean;
  refreshTier: () => Promise<void>;

  // Helper functions
  isTier: (tier: TierId) => boolean;
  hasTier: (minTier: TierId) => boolean;
  hasFeature: (feature: keyof TierLimits) => boolean;
}

const TierContext = createContext<TierContextValue | undefined>(undefined);

const tierHierarchy: Record<TierId, number> = {
  free: 0,
  tier1: 1,
  tier2: 2
};

export function TierProvider({ children }: { children: React.ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const [tierData, setTierData] = useState<TierData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchTierData() {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      const res = await fetch(`${getBackendUrl()}/subscriptions/current`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        setTierData(data);
      }
    } catch (error) {
      console.error('Failed to fetch tier data:', error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchTierData();
  }, [isSignedIn]);

  const value: TierContextValue = {
    tierData,
    isLoading,
    refreshTier: fetchTierData,

    // Check if user is on exact tier
    isTier: (tier: TierId) => tierData?.tier === tier,

    // Check if user has at least this tier (tier1 includes tier1+)
    hasTier: (minTier: TierId) => {
      if (!tierData) return false;
      return tierHierarchy[tierData.tier] >= tierHierarchy[minTier];
    },

    // Check if user has a specific feature
    hasFeature: (feature: keyof TierLimits) => {
      if (!tierData) return false;
      return Boolean(tierData.limits[feature]);
    }
  };

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}

export function useTier() {
  const context = useContext(TierContext);
  if (context === undefined) {
    throw new Error('useTier must be used within a TierProvider');
  }
  return context;
}

// Convenience hooks
export function useIsTier2() {
  const { isTier } = useTier();
  return isTier('tier2');
}

export function useHasMultiChapterSupport() {
  const { hasFeature } = useTier();
  return hasFeature('multi_chapter_support');
}

export function useHasMultiSourceSupport() {
  const { hasFeature } = useTier();
  return hasFeature('multi_source_support');
}
