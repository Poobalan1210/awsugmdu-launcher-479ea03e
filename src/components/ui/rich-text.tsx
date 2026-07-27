import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';

export type RichTextVariant = 'default' | 'compact';

interface RichTextProps {
  /** Markdown source (plain text is valid input). */
  content: string;
  /** `compact` is tuned for replies and other dense, secondary content. */
  variant?: RichTextVariant;
  className?: string;
}

/**
 * Typography shared by both variants. Tailwind Typography gives us the
 * structural styles (list markers, table borders, spacing rhythm); these
 * overrides pull colors and sizes back onto the app's design tokens.
 */
const baseProse = [
  'prose max-w-none dark:prose-invert break-words',
  // Headings
  'prose-headings:font-semibold prose-headings:text-foreground prose-headings:mb-1 prose-headings:mt-3',
  'prose-h1:text-lg prose-h2:text-base prose-h3:text-sm prose-h4:text-sm prose-h5:text-sm prose-h6:text-sm',
  // Links
  'prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:break-all',
  // Inline emphasis
  'prose-strong:text-foreground prose-strong:font-semibold',
  // Lists
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:marker:text-muted-foreground prose-ul:pl-5 prose-ol:pl-5',
  // Quotes
  'prose-blockquote:my-2 prose-blockquote:border-l-2 prose-blockquote:border-primary/40',
  'prose-blockquote:pl-3 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-muted-foreground',
  // Inline code
  "prose-code:rounded prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:font-medium prose-code:text-primary prose-code:before:content-[''] prose-code:after:content-['']",
  // Code blocks (reset the inline-code overrides inside <pre>)
  'prose-pre:my-2 prose-pre:rounded-md prose-pre:bg-muted prose-pre:p-3 prose-pre:text-foreground',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  // Misc block elements
  'prose-hr:my-3 prose-hr:border-border prose-img:my-2 prose-img:rounded-md',
  'prose-table:my-2 prose-th:text-foreground prose-td:text-muted-foreground',
  // Never let the first/last block push the card layout around
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
].join(' ');

const variantProse: Record<RichTextVariant, string> = {
  default: 'prose-sm prose-p:my-2 prose-p:leading-relaxed prose-p:text-foreground prose-li:text-foreground',
  compact:
    'prose-sm prose-p:my-1 prose-p:leading-relaxed prose-p:text-muted-foreground prose-li:text-muted-foreground prose-headings:text-sm prose-headings:mt-2',
};

/**
 * Renders stored markdown as formatted, sanitized HTML.
 *
 * Sanitization happens in `renderMarkdown`, so this component never trusts
 * the string it is handed.
 */
export function RichText({ content, variant = 'default', className }: RichTextProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  if (!html) return null;

  return (
    <div
      className={cn(baseProse, variantProse[variant], className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
