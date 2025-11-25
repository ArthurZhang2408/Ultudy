'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { getBackendUrl } from '@/lib/api';

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

export default function PricingPage() {
  const { userId, getToken } = useAuth();
  const router = useRouter();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [fetchingData, setFetchingData] = useState(true);

  useEffect(() => {
    fetchTiers();
    fetchSubscription();
  }, []);

  async function fetchTiers() {
    try {
      const res = await fetch(`${getBackendUrl()}/subscriptions/tiers`);
      const data = await res.json();
      setTiers(data.tiers);
    } catch (error) {
      console.error('Failed to fetch tiers:', error);
    } finally {
      setFetchingData(false);
    }
  }

  async function fetchSubscription() {
    if (!userId) return;

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
    if (!userId) {
      router.push('/sign-in?redirect_url=/pricing');
      return;
    }

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
        alert(`Successfully upgraded to ${tier}! (Test Mode - No payment required)`);
        await fetchSubscription();
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

  if (fetchingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading pricing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Choose Your Plan</h1>
          <p className="text-xl text-gray-600">
            Upgrade anytime. All plans include core learning features.
          </p>
          {subscription && (
            <div className="mt-4 inline-block bg-blue-100 text-blue-800 px-4 py-2 rounded-full">
              Current Plan: <span className="font-semibold capitalize">{subscription.tier}</span>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className={`bg-white rounded-lg shadow-md p-8 relative ${
                tier.popular ? 'border-2 border-blue-500' : ''
              }`}
            >
              {tier.popular && (
                <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <span className="bg-blue-500 text-white text-sm font-bold px-4 py-1 rounded-full">
                    POPULAR
                  </span>
                </div>
              )}

              <h3 className="text-2xl font-bold mb-4">{tier.name}</h3>
              <div className="mb-6">
                <span className="text-4xl font-bold">${tier.price}</span>
                <span className="text-lg text-gray-500">/{tier.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {tier.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start">
                    <svg
                      className="w-5 h-5 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              {subscription?.tier === tier.id ? (
                <button
                  disabled
                  className="w-full py-3 bg-gray-300 text-gray-600 rounded-lg font-semibold cursor-not-allowed"
                >
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleUpgrade(tier.id)}
                  disabled={loading === tier.id}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    tier.popular
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading === tier.id ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin h-5 w-5 mr-2"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Upgrading...
                    </span>
                  ) : tier.price === 0 ? (
                    'Free'
                  ) : (
                    `Upgrade to ${tier.name}`
                  )}
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 text-center text-gray-600">
          <p className="mb-2">Test Mode: Upgrades bypass payment processing</p>
          <p className="text-sm">All features are fully functional for testing</p>
        </div>
      </div>
    </div>
  );
}
