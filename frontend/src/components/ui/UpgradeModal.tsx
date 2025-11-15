'use client';

import { useEffect } from 'react';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
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

  if (!isOpen) return null;

  const plans = [
    {
      name: 'Free',
      price: 0,
      description: 'Perfect for getting started',
      features: [
        'Up to 5 document uploads',
        'Basic AI study guides',
        'Limited searches (10/day)',
        'Community support',
        'Basic analytics',
      ],
      buttonText: 'Current Plan',
      buttonStyle: 'border-2 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800',
      popular: false,
    },
    {
      name: 'Plus',
      price: 29.99,
      description: 'For serious learners',
      features: [
        'Unlimited document uploads',
        'Advanced AI features',
        'Unlimited searches',
        'Priority support',
        'Advanced analytics',
        'Custom study plans',
        'Offline access',
        'Export capabilities',
      ],
      buttonText: 'Upgrade to Plus',
      buttonStyle: 'bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600 shadow-lg hover:shadow-xl',
      popular: true,
    },
    {
      name: 'Pro',
      price: 199.99,
      description: 'For teams and institutions',
      features: [
        'Everything in Plus',
        'Team collaboration (up to 50 users)',
        'Admin dashboard',
        'Custom integrations',
        'API access',
        'Dedicated support',
        'Custom branding',
        'SLA guarantee',
        'Advanced security',
        'Training sessions',
      ],
      buttonText: 'Contact Sales',
      buttonStyle: 'bg-gradient-to-r from-primary-600 to-primary-800 dark:from-primary-500 dark:to-primary-700 text-white hover:shadow-xl',
      popular: false,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-6xl min-h-[600px] max-h-[90vh] my-auto bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
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
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                  plan.popular
                    ? 'border-primary-500 dark:border-primary-600 shadow-lg scale-105'
                    : 'border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {plan.popular && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary-600 to-primary-700 dark:from-primary-500 dark:to-primary-600 text-white text-center text-sm font-semibold py-2">
                    Most Popular
                  </div>
                )}

                <div className={`flex-1 p-6 ${plan.popular ? 'pt-14' : ''}`}>
                  {/* Plan Header */}
                  <div className="mb-6">
                    <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mb-2">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
                      {plan.description}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
                        ${plan.price}
                      </span>
                      {plan.price > 0 && (
                        <span className="text-neutral-500 dark:text-neutral-400">
                          /month
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Features List */}
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            plan.popular
                              ? 'text-primary-600 dark:text-primary-400'
                              : 'text-neutral-600 dark:text-neutral-400'
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
                  <button
                    className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${plan.buttonStyle}`}
                  >
                    {plan.buttonText}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
              All plans include a 14-day money-back guarantee
            </p>
            <div className="flex items-center justify-center gap-6 text-xs text-neutral-500 dark:text-neutral-500">
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure payment
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Cancel anytime
              </span>
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                24/7 support
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
