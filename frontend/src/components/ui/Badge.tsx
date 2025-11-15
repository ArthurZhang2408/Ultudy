import { HTMLAttributes, forwardRef } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'neutral', size = 'md', dot = false, className = '', children, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center font-medium rounded-full';

    const variantStyles = {
      primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300',
      success: 'bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-300',
      warning: 'bg-warning-100 text-warning-800 dark:bg-warning-900/40 dark:text-warning-300',
      danger: 'bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-300',
      neutral: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300',
    };

    const sizeStyles = {
      sm: 'px-2 py-0.5 text-xs',
      md: 'px-2.5 py-0.5 text-sm',
      lg: 'px-3 py-1 text-base',
    };

    const dotColors = {
      primary: 'bg-primary-600 dark:bg-primary-400',
      success: 'bg-success-600 dark:bg-success-400',
      warning: 'bg-warning-600 dark:bg-warning-400',
      danger: 'bg-danger-600 dark:bg-danger-400',
      neutral: 'bg-neutral-600 dark:bg-neutral-400',
    };

    return (
      <span
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {dot && (
          <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]} mr-1.5`} />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export default Badge;
