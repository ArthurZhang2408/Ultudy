'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options as RehypeSanitizeOptions } from 'rehype-sanitize';
import 'katex/dist/katex.min.css';
import { decodeNamedCharacterReference } from 'decode-named-character-reference';
import { decodeNumericCharacterReference } from 'micromark-util-decode-numeric-character-reference';
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { Plugin } from 'unified';

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

type HastLikeChild = {
  type?: string;
  value?: string;
  children?: HastLikeChild[];
} & Record<string, unknown>;

type MathNode = {
  type: 'math' | 'inlineMath';
  value: string;
  data?: {
    hChildren?: HastLikeChild[];
    hProperties?: Record<string, unknown>;
  };
};

const unescapeBackslashQuotes = (value: string): string =>
  value.replace(/\\(["'])/g, '$1');

const decodeHtmlEntitiesOnce = (value: string): string =>
  value.replace(/&(#x?[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const hex = entity.slice(2);
      if (hex) {
        try {
          return decodeNumericCharacterReference(hex, 16);
        } catch {
          // Fall through to return the original match.
        }
      }
    } else if (entity.startsWith('#')) {
      const decimal = entity.slice(1);
      if (decimal) {
        try {
          return decodeNumericCharacterReference(decimal, 10);
        } catch {
          // Fall through to return the original match.
        }
      }
    } else {
      const decoded = decodeNamedCharacterReference(entity);
      if (decoded !== false) {
        return decoded;
      }
    }

    return match;
  });

const decodeHtmlEntities = (value: string): string => {
  let previous = value;
  let decoded = decodeHtmlEntitiesOnce(previous);

  while (decoded !== previous) {
    previous = decoded;
    decoded = decodeHtmlEntitiesOnce(previous);
  }

  return decoded;
};

const normalizeMathText = (value: string): string => unescapeBackslashQuotes(decodeHtmlEntities(value));

const decodeTextChildren = (children: HastLikeChild[]): HastLikeChild[] =>
  children.map(child => {
    if (!child || typeof child !== 'object') {
      return child;
    }

    const nextChild = { ...child };

    if (typeof nextChild.value === 'string') {
      nextChild.value = normalizeMathText(nextChild.value);
    }

    if (Array.isArray(nextChild.children)) {
      nextChild.children = decodeTextChildren(nextChild.children);
    }

    return nextChild;
  });

const remarkDecodeMathEntities: Plugin<[], Root> = () => tree => {
  visit(tree, ['inlineMath', 'math'], node => {
    const mathNode = node as MathNode;

    if (typeof mathNode.value !== 'string') {
      return;
    }

    const decoded = normalizeMathText(mathNode.value);

    if (decoded === mathNode.value) {
      return;
    }

    mathNode.value = decoded;

    if (!mathNode.data) {
      mathNode.data = {};
    }

    if (mathNode.data && typeof mathNode.data === 'object') {
      if (Array.isArray(mathNode.data.hChildren)) {
        mathNode.data.hChildren = decodeTextChildren(mathNode.data.hChildren);
      } else {
        mathNode.data.hChildren = [{ type: 'text', value: decoded }];
      }

      if (mathNode.data.hProperties && typeof mathNode.data.hProperties === 'object') {
        const properties = mathNode.data.hProperties as Record<string, unknown>;

        Object.keys(properties).forEach(key => {
          const propertyValue = properties[key];

          if (typeof propertyValue === 'string') {
            properties[key] = normalizeMathText(propertyValue);
          } else if (Array.isArray(propertyValue)) {
            properties[key] = propertyValue.map(item =>
              typeof item === 'string' ? normalizeMathText(item) : item,
            );
          }
        });
      }
    }
  });
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
        remarkPlugins={[remarkMath, remarkGfm, remarkDecodeMathEntities]}
        rehypePlugins={[rehypeKatex, [rehypeSanitize, mathEnabledSanitizeSchema]]}
        components={{
          // Style paragraph elements
          p: ({ node, ...props }) => (
            <p className="mb-2 last:mb-0" {...props} />
          ),
          // Style code blocks (wrapped in pre tags)
          pre: ({ node, ...props }) => (
            <pre className="my-3 p-4 bg-slate-900 text-slate-100 rounded-lg overflow-x-auto" {...props} />
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

            // Inline code
            return (
              <code className="px-1.5 py-0.5 bg-slate-100 text-slate-900 rounded text-sm font-mono" {...props}>
                {children}
              </code>
            );
          },
          // Style strong (bold) elements
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-slate-900" {...props} />
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
