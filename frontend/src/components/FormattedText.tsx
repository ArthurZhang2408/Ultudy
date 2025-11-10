'use client';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

type FormattedTextProps = {
  children: string;
  className?: string;
};

/**
 * FormattedText component
 *
 * Renders text with Markdown and LaTeX support, similar to ChatGPT's formatting.
 *
 * Supports:
 * - **Bold** text
 * - *Italic* text
 * - `Inline code`
 * - Inline LaTeX: $x^2 + y^2 = z^2$
 * - Display LaTeX: $$E = mc^2$$
 * - Lists, links, and other Markdown features
 */
export function FormattedText({ children, className = '' }: FormattedTextProps) {
  return (
    <div className={`formatted-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Style paragraph elements
          p: ({ node, ...props }) => (
            <p className="mb-2 last:mb-0" {...props} />
          ),
          // Style inline code
          code: ({ node, inline, ...props }) => (
            inline ? (
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-900 rounded text-sm font-mono" {...props} />
            ) : (
              <code className="block px-4 py-3 bg-slate-100 text-slate-900 rounded text-sm font-mono overflow-x-auto" {...props} />
            )
          ),
          // Style strong (bold) elements
          strong: ({ node, ...props }) => (
            <strong className="font-semibold text-slate-900" {...props} />
          ),
          // Style emphasis (italic) elements
          em: ({ node, ...props }) => (
            <em className="italic text-slate-800" {...props} />
          ),
          // Style lists
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-slate-700" {...props} />
          ),
          // Style links
          a: ({ node, ...props }) => (
            <a className="text-blue-600 hover:text-blue-800 underline" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default FormattedText;
