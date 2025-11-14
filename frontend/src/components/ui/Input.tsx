import { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    label,
    error,
    helperText,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className = '',
    ...props
  }, ref) => {
    const baseStyles = 'rounded-lg border px-4 py-2.5 bg-white focus:outline-none focus:ring-2 transition-all duration-200 placeholder:text-neutral-400';
    const normalStyles = 'border-neutral-300 focus:ring-primary-500 focus:border-transparent';
    const errorStyles = 'border-danger-500 focus:ring-danger-500';
    const widthStyles = fullWidth ? 'w-full' : '';
    const iconPaddingLeft = leftIcon ? 'pl-10' : '';
    const iconPaddingRight = rightIcon ? 'pr-10' : '';

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={`${baseStyles} ${error ? errorStyles : normalStyles} ${widthStyles} ${iconPaddingLeft} ${iconPaddingRight} ${className}`}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1 text-sm text-danger-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

// Textarea Component
export interface TextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  rows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({
    label,
    error,
    helperText,
    fullWidth = false,
    rows = 4,
    className = '',
    ...props
  }, ref) => {
    const baseStyles = 'rounded-lg border px-4 py-2.5 bg-white focus:outline-none focus:ring-2 transition-all duration-200 placeholder:text-neutral-400';
    const normalStyles = 'border-neutral-300 focus:ring-primary-500 focus:border-transparent';
    const errorStyles = 'border-danger-500 focus:ring-danger-500';
    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          rows={rows}
          className={`${baseStyles} ${error ? errorStyles : normalStyles} ${widthStyles} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-sm text-danger-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

// Select Component
export interface SelectProps extends InputHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({
    label,
    error,
    helperText,
    fullWidth = false,
    options,
    className = '',
    ...props
  }, ref) => {
    const baseStyles = 'rounded-lg border px-4 py-2.5 bg-white focus:outline-none focus:ring-2 transition-all duration-200';
    const normalStyles = 'border-neutral-300 focus:ring-primary-500 focus:border-transparent';
    const errorStyles = 'border-danger-500 focus:ring-danger-500';
    const widthStyles = fullWidth ? 'w-full' : '';

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`${baseStyles} ${error ? errorStyles : normalStyles} ${widthStyles} ${className}`}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1 text-sm text-danger-600">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-1 text-sm text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
