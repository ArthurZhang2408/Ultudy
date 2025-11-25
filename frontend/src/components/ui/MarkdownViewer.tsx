'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize from 'rehype-sanitize';
import 'katex/dist/katex.min.css';

interface MarkdownViewerProps {
  markdown: string;
  title?: string;
  onClose?: () => void;
}

export default function MarkdownViewer({ markdown, title, onClose }: MarkdownViewerProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'rendered'>('rendered');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <div className="flex items-center gap-4">
          {title && (
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              {title}
            </h2>
          )}

          {/* Toggle Button */}
          <div className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('rendered')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'rendered'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              Rendered
            </button>
            <button
              onClick={() => setViewMode('raw')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'raw'
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              Raw
            </button>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'raw' ? (
          <pre className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 overflow-x-auto">
            <code className="text-sm text-neutral-800 dark:text-neutral-200 font-mono">
              {markdown}
            </code>
          </pre>
        ) : (
          <div className="prose prose-neutral dark:prose-invert max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkGfm]}
              rehypePlugins={[rehypeKatex, rehypeSanitize]}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
