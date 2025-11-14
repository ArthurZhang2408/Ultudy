import { HTMLAttributes, forwardRef } from 'react';

export interface ProgressProps extends HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  animated?: boolean;
}

const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({
    value,
    max = 100,
    size = 'md',
    showLabel = false,
    variant = 'primary',
    animated = false,
    className = '',
    ...props
  }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const sizeStyles = {
      sm: 'h-1',
      md: 'h-2',
      lg: 'h-3',
    };

    const variantStyles = {
      primary: 'bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500',
      success: 'bg-gradient-to-r from-success-500 to-success-600 dark:from-success-400 dark:to-success-500',
      warning: 'bg-gradient-to-r from-warning-500 to-warning-600 dark:from-warning-400 dark:to-warning-500',
      danger: 'bg-gradient-to-r from-danger-500 to-danger-600 dark:from-danger-400 dark:to-danger-500',
    };

    const animatedStyles = animated ? 'animate-pulse-soft' : '';

    return (
      <div ref={ref} className={className} {...props}>
        {showLabel && (
          <div className="flex justify-between items-center mb-1">
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {Math.round(percentage)}%
            </span>
          </div>
        )}
        <div className={`w-full bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden ${sizeStyles[size]}`}>
          <div
            className={`${sizeStyles[size]} ${variantStyles[variant]} rounded-full transition-all duration-500 ease-out ${animatedStyles}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export default Progress;

// Circular Progress Component
export interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  showLabel?: boolean;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function CircularProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  showLabel = true,
  variant = 'primary',
  className = '',
}: CircularProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  const lightColorStyles = {
    primary: '#0284c7',
    success: '#16a34a',
    warning: '#ca8a04',
    danger: '#dc2626',
  };

  const darkColorStyles = {
    primary: '#38bdf8',
    success: '#4ade80',
    warning: '#facc15',
    danger: '#f87171',
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-neutral-200 dark:text-neutral-700"
        />
        {/* Progress circle - light mode */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={lightColorStyles[variant]}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out dark:hidden"
        />
        {/* Progress circle - dark mode */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={darkColorStyles[variant]}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out hidden dark:block"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
    </div>
  );
}
