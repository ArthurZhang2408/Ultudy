'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';
import 'katex/dist/katex.min.css';

type DefaultAttributes = NonNullable<typeof defaultSchema.attributes>;
type PropertyDefinition = DefaultAttributes[keyof DefaultAttributes] extends Array<infer T>
  ? T
  : never;

const defaultAttributesFor = (tagName: string): PropertyDefinition[] =>
  (defaultSchema.attributes?.[tagName] as PropertyDefinition[] | undefined) ?? [];

const mathMlTagNames = [
  'annotation',
  'math',
  'menclose',
  'merror',
  'mfenced',
  'mfrac',
  'mi',
  'mlabeledtr',
  'mmultiscripts',
  'mn',
  'mo',
  'mover',
  'mpadded',
  'mphantom',
  'mroot',
  'mrow',
  'ms',
  'mscarries',
  'mscarry',
  'msgroup',
  'mspace',
  'msqrt',
  'mstyle',
  'msub',
  'msubsup',
  'msup',
  'mtable',
  'mtd',
  'mtext',
  'mtr',
  'munder',
  'munderover',
  'none',
  'semantics',
];

const mathEnabledSanitizeSchema: RehypeSanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), ...mathMlTagNames],
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...defaultAttributesFor('code'),
      ['className', 'math-inline'],
      ['className', 'math-display'],
      ['className', 'language-math'],
    ],
    span: [
      ...defaultAttributesFor('span'),
      ['className', /^[-_a-zA-Z0-9\s]+$/],
      'style',
    ],
    div: [
      ...defaultAttributesFor('div'),
      ['className', /^[-_a-zA-Z0-9\s]+$/],
      'style',
    ],
    '*': [
      ...defaultAttributesFor('*'),
      'ariaHidden',
    ],
    math: [
      ...defaultAttributesFor('math'),
      ['xmlns', 'http://www.w3.org/1998/Math/MathML'],
      ['display', 'block'],
      ['display', 'inline'],
    ],
    annotation: [
      ...defaultAttributesFor('annotation'),
      ['encoding', 'application/x-tex'],
    ],
    mo: [
      ...defaultAttributesFor('mo'),
      'mathvariant',
      'stretchy',
      'movablelimits',
      'form',
    ],
    mpadded: [
      ...defaultAttributesFor('mpadded'),
      'width',
      'height',
      'depth',
      'voffset',
    ],
    menclose: [
      ...defaultAttributesFor('menclose'),
      'notation',
    ],
    mstyle: [
      ...defaultAttributesFor('mstyle'),
      'scriptlevel',
      'displaystyle',
      'mathsize',
    ],
    mfrac: [
      ...defaultAttributesFor('mfrac'),
      'linethickness',
    ],
    mover: [
      ...defaultAttributesFor('mover'),
      'accent',
      'align',
    ],
    munder: [
      ...defaultAttributesFor('munder'),
      'accentunder',
      'align',
    ],
    munderover: [
      ...defaultAttributesFor('munderover'),
      'accent',
      'accentunder',
      'align',
    ],
    mtable: [
      ...defaultAttributesFor('mtable'),
      'rowspacing',
      'columnspacing',
      'rowlines',
      'columnlines',
      'displaystyle',
      'align',
    ],
    mtd: [
      ...defaultAttributesFor('mtd'),
      'columnalign',
      'rowalign',
    ],
    mtr: [
      ...defaultAttributesFor('mtr'),
      'rowalign',
    ],
    mi: [
      ...defaultAttributesFor('mi'),
      'mathvariant',
    ],
    mn: [
      ...defaultAttributesFor('mn'),
      'mathvariant',
    ],
    mtext: [
      ...defaultAttributesFor('mtext'),
      'mathvariant',
    ],
    ms: [
      ...defaultAttributesFor('ms'),
      'lquote',
      'rquote',
    ],
    msub: [
      ...defaultAttributesFor('msub'),
      'displaystyle',
    ],
    msup: [
      ...defaultAttributesFor('msup'),
      'displaystyle',
    ],
    msubsup: [
      ...defaultAttributesFor('msubsup'),
      'displaystyle',
    ],
    mmultiscripts: [
      ...defaultAttributesFor('mmultiscripts'),
      'displaystyle',
    ],
    mspace: [
      ...defaultAttributesFor('mspace'),
      'width',
      'height',
      'depth',
    ],
  },
};

type FormattedTextProps = {
  children: string;
  className?: string;
};

/**
 * FormattedText component
 *
 * Renders text with Markdown and LaTeX support.
 *
 * The backend generates native LaTeX using $ delimiters for inline math
 * and $$ for display math, which are rendered by KaTeX via remark-math.
 *
 * Supports:
 * - **Bold** text
 * - *Italic* text
 * - `Inline code`
 * - Math expressions: $x^2 + y^2 = z^2$
 * - Code blocks with syntax highlighting
 * - Lists, links, and other Markdown features
 */
export function FormattedText({ children, className = '' }: FormattedTextProps) {

  return (
    <div className={`formatted-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex, [rehypeSanitize, mathEnabledSanitizeSchema]]}
        components={{
          // Style paragraph elements
          p: ({ node, ...props }) => (
            <p className="mb-2 last:mb-0" {...props} />
          ),
          // Style code blocks (wrapped in pre tags)
          // Light mode: Dark background like a terminal
          // Dark mode: Slightly darker than page background for distinction
          pre: ({ node, ...props }) => (
            <pre className="my-3 p-4 bg-slate-900 dark:bg-neutral-950 text-slate-100 dark:text-neutral-200 rounded-lg overflow-x-auto border border-slate-800 dark:border-neutral-800" {...props} />
          ),
          // Style inline code and code blocks
          code: ({ className, children, ...props }) => {
            // Code blocks have a language- className, inline code doesn't
            const isCodeBlock = className && className.startsWith('language-');

            if (isCodeBlock) {
              return (
                <code className="text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }

            // Inline code - subtle background contrast in both modes
            // Light mode: Light gray background like GitHub
            // Dark mode: Darker background with slight warmth
            return (
              <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-neutral-800 text-slate-900 dark:text-neutral-200 rounded text-sm font-mono border border-slate-200 dark:border-neutral-700" {...props}>
                {children}
              </code>
            );
          },
          // Style strong (bold) elements - use high contrast in both modes
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-slate-900 dark:text-neutral-100" {...props} />
          ),
          // Style emphasis (italic) elements
          em: ({ node, ...props }) => (
            <em className="italic text-slate-800 dark:text-neutral-300" {...props} />
          ),
          // Style lists
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-slate-700 dark:text-neutral-300" {...props} />
          ),
          // Style links - vibrant and accessible in both modes
          a: ({ node, ...props }) => (
            <a className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline" {...props} />
          ),
          // Style blockquotes - visually distinct with left border (like GitHub/Notion)
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-blue-500 dark:border-blue-600 pl-4 py-2 my-3 bg-blue-50/50 dark:bg-blue-950/20 text-slate-700 dark:text-neutral-300 italic" {...props} />
          ),
          // Style headings with proper hierarchy
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl font-bold text-slate-900 dark:text-neutral-100 mt-6 mb-3 first:mt-0" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold text-slate-900 dark:text-neutral-100 mt-5 mb-2 first:mt-0" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-semibold text-slate-900 dark:text-neutral-100 mt-4 mb-2 first:mt-0" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-base font-semibold text-slate-900 dark:text-neutral-100 mt-3 mb-1 first:mt-0" {...props} />
          ),
          // Style horizontal rules
          hr: ({ node, ...props }) => (
            <hr className="my-6 border-t border-slate-200 dark:border-neutral-700" {...props} />
          ),
          // Style tables with proper borders and alternating rows
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border border-slate-200 dark:border-neutral-700 rounded-lg" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-slate-100 dark:bg-neutral-800" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-slate-200 dark:divide-neutral-700" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-slate-50 dark:hover:bg-neutral-800/50" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-2 text-left text-sm font-semibold text-slate-900 dark:text-neutral-100" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-2 text-sm text-slate-700 dark:text-neutral-300" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default FormattedText;
