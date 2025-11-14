import { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, padding = 'md', hover = true, className = '', children, ...props }, ref) => {
    const baseStyles = 'bg-white rounded-xl border border-neutral-200 transition-all duration-200 dark:bg-neutral-800 dark:border-neutral-700';
    const interactiveStyles = interactive ? 'hover:border-primary-300 hover:-translate-y-0.5 cursor-pointer dark:hover:border-primary-600' : '';
    const hoverStyles = hover ? 'hover:shadow-medium dark:hover:shadow-dark-medium' : '';
    const shadowStyles = 'shadow-soft dark:shadow-dark-soft';

    const paddingStyles = {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${shadowStyles} ${hoverStyles} ${interactiveStyles} ${paddingStyles[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
