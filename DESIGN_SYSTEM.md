# Ultudy Design System Documentation

## Overview

Ultudy is an AI-powered adaptive learning platform with a modern, clean, and accessible design language. This comprehensive design system ensures visual consistency, usability, and brand coherence across all components and pages. The design draws inspiration from modern educational platforms like Khan Academy, Coursera, and Brilliant.org while maintaining its unique identity.

**Last Updated:** 2025-11-19

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Dark Mode](#dark-mode)
7. [Animations & Transitions](#animations--transitions)
8. [Accessibility](#accessibility)
9. [Implementation Guidelines](#implementation-guidelines)

---

## Design Philosophy

### Core Principles

1. **Clarity**: Information hierarchy is always clear. Users should never be confused about what to do next.
2. **Efficiency**: Minimize friction in the learning flow. Every interaction should feel purposeful.
3. **Delight**: Subtle animations and polish make the experience enjoyable without being distracting.
4. **Accessibility**: WCAG 2.1 AA compliance minimum. Design for all users regardless of ability.
5. **Consistency**: Patterns should be reused. Similar actions should look similar.

### Visual Language

- **Modern & Clean**: Use ample white space, clean lines, and subtle shadows
- **Gradients**: Strategic use of gradients for emphasis (primary brand elements, CTAs)
- **Rounded Corners**: Consistent border-radius creates a friendly, approachable feel
- **Depth**: Layering with shadows and blur creates visual hierarchy
- **Motion**: Purposeful animations guide attention and provide feedback

---

## Color System

### Brand Colors

The color system is semantic and comprehensive, with both light and dark mode variants.

#### Primary (Brand Blue)

Used for: Primary actions, links, brand elements, interactive components

```css
primary-50:  #f0f9ff  /* Lightest - backgrounds */
primary-100: #e0f2fe
primary-200: #bae6fd
primary-300: #7dd3fc
primary-400: #38bdf8  /* Dark mode primary */
primary-500: #0ea5e9  /* Dark mode bright */
primary-600: #0284c7  /* Light mode primary */
primary-700: #0369a1
primary-800: #075985
primary-900: #0c4a6e
primary-950: #082f49  /* Darkest */
```

**Usage:**
- Light mode: Use 600 for buttons, 700 for hover states
- Dark mode: Use 500 for buttons, 400 for text/borders
- Gradients: Combine 500→600 (light) or 400→500 (dark)

#### Success (Green)

Used for: Completed states, positive feedback, correct answers

```css
success-50:  #f0fdf4
success-100: #dcfce7
success-200: #bbf7d0
success-300: #86efac
success-400: #4ade80  /* Dark mode success */
success-500: #22c55e  /* Dark mode bright */
success-600: #16a34a  /* Light mode success */
success-700: #15803d
success-800: #166534
success-900: #14532d
```

#### Warning (Yellow/Amber)

Used for: In-progress states, caution messages, review needed

```css
warning-50:  #fefce8
warning-100: #fef9c3
warning-200: #fef08a
warning-300: #fde047
warning-400: #facc15  /* Dark mode warning */
warning-500: #eab308  /* Dark mode bright */
warning-600: #ca8a04  /* Light mode warning */
warning-700: #a16207
warning-800: #854d0e
warning-900: #713f12
```

#### Danger (Red)

Used for: Errors, destructive actions, incorrect answers

```css
danger-50:  #fef2f2
danger-100: #fee2e2
danger-200: #fecaca
danger-300: #fca5a5
danger-400: #f87171  /* Dark mode danger */
danger-500: #ef4444  /* Dark mode bright */
danger-600: #dc2626  /* Light mode danger */
danger-700: #b91c1c
danger-800: #991b1b
danger-900: #7f1d1d
```

#### Neutral (Gray)

Used for: Text, backgrounds, borders, neutral UI elements

```css
neutral-50:  #fafafa  /* Light mode background */
neutral-100: #f5f5f5  /* Light mode subtle backgrounds */
neutral-200: #e5e5e5  /* Light mode borders */
neutral-300: #d4d4d4
neutral-400: #a3a3a3
neutral-500: #737373
neutral-600: #525252
neutral-700: #404040  /* Light mode text */
neutral-800: #262626  /* Dark mode cards */
neutral-900: #171717  /* Dark mode text */
neutral-950: #0a0a0a  /* Dark mode background */
```

### Color Usage Patterns

#### Text Colors

**Light Mode:**
- Primary text: `text-neutral-900`
- Secondary text: `text-neutral-600`
- Disabled text: `text-neutral-400`
- Links: `text-primary-600 hover:text-primary-700`

**Dark Mode:**
- Primary text: `dark:text-neutral-100`
- Secondary text: `dark:text-neutral-300`
- Disabled text: `dark:text-neutral-500`
- Links: `dark:text-primary-400 dark:hover:text-primary-300`

#### Background Colors

**Light Mode:**
- Page background: `bg-gradient-to-br from-neutral-50 via-primary-50/30 to-neutral-50`
- Card background: `bg-white`
- Subtle background: `bg-neutral-50`

**Dark Mode:**
- Page background: `dark:bg-gradient-to-br dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950`
- Card background: `dark:bg-neutral-800`
- Subtle background: `dark:bg-neutral-900`

#### Border Colors

**Light Mode:**
- Default border: `border-neutral-200`
- Interactive border: `border-neutral-300`
- Active border: `border-primary-500`

**Dark Mode:**
- Default border: `dark:border-neutral-700`
- Interactive border: `dark:border-neutral-600`
- Active border: `dark:border-primary-400`

---

## Typography

### Font Families

```css
sans: 'var(--font-inter)', 'system-ui', sans-serif   /* Body text, UI */
display: 'var(--font-cal-sans)', 'system-ui', sans-serif  /* Headings (optional) */
```

### Type Scale

```css
/* Headings */
h1: text-4xl md:text-5xl lg:text-6xl  /* 2.25rem / 3rem / 3.75rem */
h2: text-3xl md:text-4xl              /* 1.875rem / 2.25rem */
h3: text-2xl md:text-3xl              /* 1.5rem / 1.875rem */
h4: text-xl md:text-2xl               /* 1.25rem / 1.5rem */

/* Body */
text-base: 1rem (16px)      /* Default body text */
text-lg: 1.125rem (18px)    /* Large body text */
text-sm: 0.875rem (14px)    /* Small text, captions */
text-xs: 0.75rem (12px)     /* Extra small, labels */
```

### Font Weights

```css
font-medium:   500  /* UI elements */
font-semibold: 600  /* Headings, emphasis */
font-bold:     700  /* Strong emphasis */
```

### Typography Rules

1. **Headings** are always `font-semibold` with `text-neutral-900 dark:text-neutral-100`
2. **Body text** should have sufficient line-height: `leading-relaxed` (1.625)
3. **Links** use `text-primary-600 dark:text-primary-400` with underline on hover
4. **All text** must meet WCAG AA contrast requirements (4.5:1 for normal, 3:1 for large)

---

## Spacing & Layout

### Spacing Scale

Ultudy uses Tailwind's default spacing scale (0.25rem base):

```css
1  = 0.25rem (4px)    /* Tight spacing */
2  = 0.5rem (8px)     /* Very small gaps */
3  = 0.75rem (12px)   /* Small gaps */
4  = 1rem (16px)      /* Default spacing */
6  = 1.5rem (24px)    /* Medium spacing */
8  = 2rem (32px)      /* Large spacing */
12 = 3rem (48px)      /* Extra large */
16 = 4rem (64px)      /* Section spacing */
20 = 5rem (80px)      /* Major sections */
```

### Layout Patterns

#### Container

```tsx
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  {/* Content */}
</div>
```

- Max width: `max-w-7xl` (80rem / 1280px)
- Responsive padding: `px-4 sm:px-6 lg:px-8`

#### Grid Layouts

**Feature Grid (3 columns):**
```tsx
<div className="grid gap-8 md:grid-cols-3">
  {/* Cards */}
</div>
```

**Form Grid (2 columns):**
```tsx
<div className="grid gap-4 md:grid-cols-2">
  {/* Form fields */}
</div>
```

#### Flex Layouts

**Space between:**
```tsx
<div className="flex items-center justify-between">
  {/* Content */}
</div>
```

**Centered:**
```tsx
<div className="flex items-center justify-center gap-4">
  {/* Content */}
</div>
```

### Border Radius

```css
rounded-lg:    0.5rem (8px)   /* Default for most UI */
rounded-xl:    0.75rem (12px)  /* Cards */
rounded-2xl:   1rem (16px)     /* Large cards */
rounded-3xl:   1.5rem (24px)   /* Hero sections */
rounded-full:  9999px          /* Pills, avatars */
```

**Rule:** Larger elements get larger border radius. Maintain visual hierarchy.

---

## Components

### Button

**Anatomy:**
```tsx
<button className="
  inline-flex items-center justify-center gap-2
  px-4 py-2.5              /* Size: md */
  rounded-lg
  font-medium
  transition-all duration-200
  focus:outline-none focus:ring-2 focus:ring-offset-2
  dark:focus:ring-offset-neutral-900
  disabled:cursor-not-allowed disabled:opacity-50
  /* Variant styles here */
">
  {children}
</button>
```

**Variants:**

1. **Primary** (Default action):
```css
bg-primary-600 text-white
hover:bg-primary-700
focus:ring-primary-500
shadow-sm hover:shadow-md
/* Dark mode: */
dark:bg-primary-500 dark:hover:bg-primary-600
dark:focus:ring-primary-400
dark:shadow-dark-soft dark:hover:shadow-dark-medium
```

2. **Secondary** (Alternative action):
```css
bg-white text-neutral-700
border border-neutral-300
hover:bg-neutral-50 hover:border-neutral-400
/* Dark mode: */
dark:bg-neutral-800 dark:text-neutral-200
dark:border-neutral-700
dark:hover:bg-neutral-700 dark:hover:border-neutral-600
```

3. **Success** (Positive action):
```css
bg-success-600 text-white
hover:bg-success-700
/* Dark mode: */
dark:bg-success-500 dark:hover:bg-success-600
```

4. **Danger** (Destructive action):
```css
bg-danger-600 text-white
hover:bg-danger-700
/* Dark mode: */
dark:bg-danger-500 dark:hover:bg-danger-600
```

5. **Ghost** (Subtle action):
```css
text-neutral-700 hover:bg-neutral-100
/* Dark mode: */
dark:text-neutral-300 dark:hover:bg-neutral-800
```

6. **Outline**:
```css
border-2 border-primary-600 text-primary-600
hover:bg-primary-50
/* Dark mode: */
dark:border-primary-400 dark:text-primary-400
dark:hover:bg-primary-900/20
```

**Sizes:**
```css
sm:  px-3 py-1.5 text-sm
md:  px-4 py-2.5 text-base  /* Default */
lg:  px-6 py-3 text-lg
```

### Card

**Anatomy:**
```tsx
<div className="
  bg-white dark:bg-neutral-800
  rounded-xl
  border border-neutral-200 dark:border-neutral-700
  shadow-soft dark:shadow-dark-soft
  hover:shadow-medium dark:hover:shadow-dark-medium
  transition-all duration-200
  p-6  /* padding variant: md */
">
  {children}
</div>
```

**Interactive Cards:**
Add for clickable cards:
```css
hover:border-primary-300 dark:hover:border-primary-600
hover:-translate-y-0.5
cursor-pointer
```

**Padding Variants:**
```css
none: ''
sm:   p-4
md:   p-6   /* Default */
lg:   p-8
```

### Input

**Anatomy:**
```tsx
<input className="
  rounded-lg
  border px-4 py-2.5
  bg-white dark:bg-neutral-800
  dark:text-neutral-100
  border-neutral-300 dark:border-neutral-700
  focus:outline-none focus:ring-2
  focus:ring-primary-500 dark:focus:ring-primary-400
  focus:border-transparent
  transition-all duration-200
  placeholder:text-neutral-400 dark:placeholder:text-neutral-500
" />
```

**With Label:**
```tsx
<div>
  <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
    Label Text
  </label>
  <input {...props} />
</div>
```

**Error State:**
```css
border-danger-500 dark:border-danger-400
focus:ring-danger-500 dark:focus:ring-danger-400
```

**Error Message:**
```tsx
<p className="mt-1 text-sm text-danger-600 dark:text-danger-400">
  Error message
</p>
```

### Badge

**Anatomy:**
```tsx
<span className="
  inline-flex items-center
  px-2.5 py-0.5
  rounded-full
  text-sm font-medium
  /* Variant colors */
">
  {children}
</span>
```

**Variants:**

1. **Primary:**
```css
bg-primary-100 text-primary-800
dark:bg-primary-900/40 dark:text-primary-300
```

2. **Success:**
```css
bg-success-100 text-success-800
dark:bg-success-900/40 dark:text-success-300
```

3. **Warning:**
```css
bg-warning-100 text-warning-800
dark:bg-warning-900/40 dark:text-warning-300
```

4. **Danger:**
```css
bg-danger-100 text-danger-800
dark:bg-danger-900/40 dark:text-danger-300
```

5. **Neutral:**
```css
bg-neutral-100 text-neutral-800
dark:bg-neutral-800 dark:text-neutral-300
```

### Modal

**Backdrop:**
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
  <div className="absolute inset-0 bg-neutral-900/50 backdrop-blur-sm" onClick={onClose} />
  {/* Modal content */}
</div>
```

**Modal Content:**
```tsx
<div className="
  relative
  bg-white dark:bg-neutral-800
  rounded-2xl
  shadow-large dark:shadow-dark-large
  max-w-lg w-full
  max-h-[90vh]
  overflow-hidden
  animate-scale-in
">
  {/* Header */}
  <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700">
    <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
      {title}
    </h2>
  </div>

  {/* Body */}
  <div className="px-6 py-4 overflow-y-auto">
    {children}
  </div>
</div>
```

### Progress Bar

**Linear:**
```tsx
<div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
  <div className="
    h-full
    bg-gradient-to-r from-primary-500 to-primary-600
    dark:from-primary-400 dark:to-primary-500
    rounded-full
    transition-all duration-500 ease-out
  " style={{ width: `${percentage}%` }} />
</div>
```

**With Label:**
```tsx
<div className="flex justify-between items-center mb-1">
  <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
    {percentage}%
  </span>
</div>
```

---

## Dark Mode

### Implementation Strategy

Ultudy uses **class-based dark mode** with Tailwind CSS:

```typescript
// tailwind.config.ts
darkMode: 'class'
```

The `dark` class is toggled on the `<html>` element via the ThemeToggle component, which:
1. Reads user preference from localStorage
2. Falls back to system preference (`prefers-color-scheme`)
3. Persists the choice across sessions

### Dark Mode Principles

1. **Not just inverted colors:** Dark mode has its own carefully chosen palette
2. **Reduce contrast, increase readability:** Avoid pure white text on pure black
3. **Maintain brand identity:** Primary colors should feel consistent across themes
4. **Elevate with shadows:** Use darker shadows that create depth without harshness

### Color Adjustments

**Backgrounds:**
- Light mode cards: `bg-white`
- Dark mode cards: `dark:bg-neutral-800` (not pure black!)
- Light mode page: `bg-neutral-50`
- Dark mode page: `dark:bg-neutral-950`

**Text:**
- Light mode: `text-neutral-900` (near-black)
- Dark mode: `dark:text-neutral-100` (near-white, not pure white)

**Borders:**
- Light mode: `border-neutral-200`
- Dark mode: `dark:border-neutral-700` (subtle, not too bright)

**Shadows:**
```css
/* Light mode */
shadow-soft: 0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)
shadow-medium: 0 4px 16px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.06)
shadow-large: 0 8px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.08)

/* Dark mode */
dark-soft: 0 2px 8px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.4)
dark-medium: 0 4px 16px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.5)
dark-large: 0 8px 32px rgba(0,0,0,0.5), 0 4px 8px rgba(0,0,0,0.6)
```

### Testing Dark Mode

When designing components, **always test in both modes:**

1. Toggle dark mode in the app
2. Check color contrast (aim for WCAG AA)
3. Verify shadows are visible but not harsh
4. Ensure interactive states are clear
5. Check that brand colors maintain their identity

---

## Animations & Transitions

### Transition Duration

```css
duration-200:  200ms  /* Default for most UI */
duration-300:  300ms  /* Modal open/close */
duration-500:  500ms  /* Progress bars, major changes */
```

### Transition Timing

```css
ease-in-out:  Default, smooth both ways
ease-out:     Best for enter animations
ease-in:      Best for exit animations
```

### Standard Animations

**Fade In:**
```css
@keyframes fadeIn {
  0%   { opacity: 0 }
  100% { opacity: 1 }
}
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}
```

**Slide Up (Enter from bottom):**
```css
@keyframes slideUp {
  0%   { transform: translateY(10px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.animate-slide-up {
  animation: slideUp 0.3s ease-out;
}
```

**Scale In (Modal entrance):**
```css
@keyframes scaleIn {
  0%   { transform: scale(0.95); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.animate-scale-in {
  animation: scaleIn 0.2s ease-out;
}
```

### Hover States

**Standard hover pattern:**
```css
transition-all duration-200
hover:shadow-md
hover:-translate-y-0.5
```

**Interactive cards:**
```css
hover:shadow-medium dark:hover:shadow-dark-medium
hover:-translate-y-1
hover:border-primary-300 dark:hover:border-primary-600
```

**Buttons:**
```css
hover:bg-primary-700 dark:hover:bg-primary-600
hover:shadow-md dark:hover:shadow-dark-medium
```

### Animation Rules

1. **Keep it subtle:** Animations should enhance, not distract
2. **Be consistent:** Same types of actions should animate similarly
3. **Respect motion preferences:** Consider `prefers-reduced-motion`
4. **Performance:** Use `transform` and `opacity` (GPU-accelerated)

---

## Accessibility

### WCAG 2.1 AA Requirements

1. **Color Contrast:**
   - Normal text: 4.5:1 minimum
   - Large text (18px+): 3:1 minimum
   - UI components: 3:1 minimum

2. **Focus States:**
   - All interactive elements must have visible focus indicators
   - Use `focus:ring-2 focus:ring-primary-500`

3. **Keyboard Navigation:**
   - All functionality accessible via keyboard
   - Logical tab order
   - Skip links where appropriate

4. **Screen Readers:**
   - Use semantic HTML (`<button>`, `<nav>`, `<main>`)
   - Provide `aria-label` for icon-only buttons
   - Use `alt` text for images

### Implementation Checklist

- [ ] All colors meet contrast requirements
- [ ] Focus states are visible and consistent
- [ ] Interactive elements have accessible names
- [ ] Form inputs have associated labels
- [ ] Error messages are programmatically associated
- [ ] Modal can be closed with Escape key
- [ ] Loading states are announced to screen readers

---

## Implementation Guidelines

### Creating New Components

When creating a new component, follow this checklist:

1. **Start with the base component class:**
   ```tsx
   const baseStyles = 'rounded-lg transition-all duration-200';
   ```

2. **Add dark mode styles immediately:**
   ```tsx
   'bg-white dark:bg-neutral-800'
   'text-neutral-900 dark:text-neutral-100'
   ```

3. **Implement variants:**
   ```tsx
   const variants = {
     primary: '...',
     secondary: '...'
   };
   ```

4. **Add interactive states:**
   ```tsx
   'hover:...'
   'focus:...'
   'disabled:...'
   ```

5. **Test in both light and dark mode**

6. **Verify accessibility**

### Component Template

```tsx
import { forwardRef, HTMLAttributes } from 'react';

export interface MyComponentProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
}

const MyComponent = forwardRef<HTMLDivElement, MyComponentProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseStyles = 'rounded-lg transition-all duration-200';

    const variantStyles = {
      primary: 'bg-primary-600 text-white dark:bg-primary-500 hover:bg-primary-700 dark:hover:bg-primary-600',
      secondary: 'bg-white text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200',
    };

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2.5 text-base',
      lg: 'px-6 py-3 text-lg',
    };

    return (
      <div
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

MyComponent.displayName = 'MyComponent';

export default MyComponent;
```

### Page Layout Template

```tsx
export default function MyPage() {
  return (
    <div className="space-y-8">
      {/* Hero/Header Section */}
      <section className="space-y-4">
        <h1 className="text-4xl font-bold text-neutral-900 dark:text-neutral-100">
          Page Title
        </h1>
        <p className="text-lg text-neutral-600 dark:text-neutral-300">
          Page description
        </p>
      </section>

      {/* Main Content */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Cards or content */}
      </section>

      {/* Secondary Content */}
      <section className="space-y-6">
        {/* Additional sections */}
      </section>
    </div>
  );
}
```

### Form Pattern

```tsx
<form onSubmit={handleSubmit} className="space-y-4">
  <Input
    label="Field Label"
    placeholder="Placeholder text"
    value={value}
    onChange={onChange}
    error={error}
    fullWidth
  />

  <Textarea
    label="Description"
    rows={4}
    fullWidth
  />

  <Select
    label="Category"
    options={options}
    fullWidth
  />

  <div className="flex gap-3 justify-end">
    <Button variant="secondary" onClick={onCancel}>
      Cancel
    </Button>
    <Button variant="primary" type="submit">
      Submit
    </Button>
  </div>
</form>
```

---

## Best Practices

### DO:
- ✅ Use semantic color names (`primary`, `success`, `danger`)
- ✅ Test every component in light AND dark mode
- ✅ Use the spacing scale consistently
- ✅ Leverage existing components before creating new ones
- ✅ Add loading and error states to all data-driven components
- ✅ Use transitions for state changes
- ✅ Provide keyboard navigation
- ✅ Include proper ARIA attributes

### DON'T:
- ❌ Use arbitrary color values outside the system
- ❌ Create one-off spacing values
- ❌ Forget dark mode classes
- ❌ Use pure white (`#FFF`) or pure black (`#000`) for text/backgrounds
- ❌ Animate layout properties (width, height, top, left)
- ❌ Rely solely on color to convey information
- ❌ Skip focus states

---

## Conclusion

This design system is a living document. As new patterns emerge and components are created, update this documentation to maintain consistency and help future developers (both human and AI) create cohesive, accessible, and beautiful experiences.

**For Future LLM Agents:**

When creating new components or pages for Ultudy:
1. Read this entire document first
2. Use the templates provided
3. Match the established patterns
4. Always include both light and dark mode styles
5. Test for accessibility
6. Maintain the visual language and brand identity

Remember: Consistency is key to a great user experience.
