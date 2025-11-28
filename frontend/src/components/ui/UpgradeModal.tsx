'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '@/contexts/ModalContext';
import { useRouter } from 'next/navigation';
import { getBackendUrl } from '@/lib/api';
import { useAuth } from '@clerk/nextjs';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Tier {
  id: string;
  name: string;
  price: number;
  currency: string;
  period: string;
  features: string[];
  popular?: boolean;
}

interface Subscription {
  tier: string;
  status: string;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { getToken } = useAuth();

  useModal(isOpen, 'upgrade-modal');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchTiers();
      fetchSubscription();
    }
  }, [isOpen]);

  async function fetchTiers() {
    try {
      const res = await fetch(`${getBackendUrl()}/subscriptions/tiers`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      setTiers(data.tiers);
      setError(null);
    } catch (error: any) {
      console.error('Failed to fetch tiers:', error);
      setError(error.message || 'Failed to connect to backend. Check Railway deployment.');
    } finally {
      setFetchingData(false);
    }
  }

  async function fetchSubscription() {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`${getBackendUrl()}/subscriptions/current`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      setSubscription(data);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
    }
  }

  async function handleUpgrade(tier: string) {
    setLoading(tier);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      // TEST MODE: Directly upgrade tier without payment
      const res = await fetch(`${getBackendUrl()}/subscriptions/upgrade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tier })
      });

      const data = await res.json();

      if (data.success) {
        alert(`Successfully upgraded to ${tier}! (Test Mode)`);
        await fetchSubscription();
        // Refresh the page to update UI
        window.location.reload();
      } else {
        throw new Error(data.error || 'Failed to upgrade');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      alert('Failed to upgrade subscription. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  if (fetchingData) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading plans...</p>
        </div>
      </div>,
      document.body
    );
  }

  if (error) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-neutral-900 flex items-center justify-center">
        <div className="max-w-md mx-auto p-8 text-center">
          <div className="mb-4">
            <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Backend Not Running
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            {error}
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-500 mb-6">
            Check your <code className="bg-neutral-200 dark:bg-neutral-800 px-2 py-1 rounded">NEXT_PUBLIC_BACKEND_URL</code> environment variable points to your Railway backend.
          </p>
          <button
            onClick={onClose}
            className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const modalContent = (
    <div className="fixed inset-0 z-[9999] bg-white dark:bg-neutral-900 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="relative px-8 pt-8 pb-6 bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20 border-b border-primary-200 dark:border-primary-800 shrink-0">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-white/50 dark:hover:bg-neutral-800/50 rounded-lg transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6 text-neutral-600 dark:text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="text-center">
          <h2 className="text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
            Upgrade Your Learning
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-400">
            Choose the perfect plan for your study needs
          </p>
          {subscription && (
            <div className="mt-3 inline-block bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300 px-4 py-1.5 rounded-full text-sm font-semibold">
              Current Plan: <span className="capitalize">{subscription.tier === 'tier1' ? 'Student' : subscription.tier === 'tier2' ? 'Pro' : 'Free'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex flex-col rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                tier.popular
                  ? 'border-primary-500 dark:border-primary-600 shadow-lg scale-105'
                  : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-500 dark:to-primary-600 text-white text-center text-sm font-semibold py-2">
                  Most Popular
                </div>
              )}

              <div className={`flex-1 p-6 ${tier.popular ? 'pt-14' : ''}`}>
                {/* Plan Header */}
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
                      ${tier.price}
                    </span>
                    {tier.price > 0 && (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        /{tier.period}
                      </span>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <svg
                        className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                          tier.popular
                            ? 'text-primary-600 dark:text-primary-400'
                            : 'text-green-600 dark:text-green-400'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* CTA Button */}
              <div className="p-6 pt-0">
                {subscription?.tier === tier.id ? (
                  <button
                    disabled
                    className="w-full py-3 px-4 rounded-lg font-semibold bg-neutral-300 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 cursor-not-allowed"
                  >
                    Current Plan
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier.id)}
                    disabled={loading === tier.id}
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                      tier.popular
                        ? 'bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg hover:shadow-xl'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {loading === tier.id ? (
                      <span className="flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Upgrading...
                      </span>
                    ) : tier.price === 0 ? (
                      'Downgrade to Free'
                    ) : (
                      `Upgrade to ${tier.name}`
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Additional Info */}
        <div className="mt-12 text-center">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
            🧪 Test Mode: Upgrades bypass payment processing
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500">
            All features are fully functional for testing
          </p>
          <div className="flex items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-500 mt-4">
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Switch anytime
            </span>
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Instant activation
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
