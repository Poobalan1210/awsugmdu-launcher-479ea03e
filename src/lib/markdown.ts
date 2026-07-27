import { Marked } from 'marked';
import DOMPurify from 'dompurify';

/**
 * Shared markdown pipeline for user-authored and agent-authored content.
 *
 * Content is stored as markdown (a plain string), which keeps it backward
 * compatible with the thousands of plain-text posts already in DynamoDB:
 * plain text is valid markdown, and `breaks: true` means the line breaks
 * people actually typed are preserved instead of collapsing into one blob.
 *
 * A dedicated `Marked` instance is used instead of the global `marked`
 * singleton so page-level `marked.setOptions` calls elsewhere can't change
 * how discussion content renders.
 */
const markdown = new Marked({
  gfm: true,      // tables, strikethrough, task lists, autolinked URLs
  breaks: true,   // single newline -> <br>, which is what chat users expect
});

/**
 * Tags markdown can legitimately produce. Anything else (script, iframe,
 * style, form, event handlers) is stripped, because this HTML comes from
 * community members and is rendered with dangerouslySetInnerHTML.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'span', 'div',
  'strong', 'b', 'em', 'i', 'u', 'del', 's', 'mark', 'sup', 'sub',
  'a', 'img',
  'ul', 'ol', 'li', 'input',
  'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
];

const ALLOWED_ATTR = [
  'href', 'title', 'alt', 'src',
  'start', 'reversed', 'value',
  'type', 'checked', 'disabled',
  'colspan', 'rowspan', 'align',
  'lang', 'dir', 'class',
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Force every link to open in a new tab without leaking the referrer or
 * passing link equity to arbitrary user-submitted URLs.
 */
function hardenLinks(html: string): string {
  if (typeof window === 'undefined' || typeof window.DOMParser === 'undefined') return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('a[href]').forEach((anchor) => {
    anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer nofollow');
  });
  // Task-list checkboxes are decorative in rendered output.
  doc.querySelectorAll('input').forEach((input) => {
    input.setAttribute('disabled', 'disabled');
  });
  return doc.body.innerHTML;
}

/**
 * Markdown -> sanitized HTML string, safe to hand to dangerouslySetInnerHTML.
 */
export function renderMarkdown(content: string): string {
  if (!content) return '';

  const raw = markdown.parse(content, { async: false }) as string;

  // DOMPurify needs a real DOM. Without one (SSR / node scripts) fall back to
  // escaped text rather than shipping unsanitized HTML.
  if (typeof window === 'undefined' || typeof DOMPurify.sanitize !== 'function') {
    return escapeHtml(content);
  }

  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
  });

  return hardenLinks(clean);
}

/**
 * Strips markdown down to readable text. Used for previews, truncated
 * headlines and anywhere formatting would be noise.
 */
export function markdownToPlainText(content: string): string {
  if (!content) return '';

  return content
    .replace(/```[\s\S]*?```/g, ' ')          // fenced code blocks
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // links -> label
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')       // headings
    .replace(/^\s{0,3}>\s?/gm, '')            // blockquotes
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')    // list markers
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')      // emphasis / inline code
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the string contains markdown syntax worth previewing. Lets the
 * composer stay quiet for one-line messages.
 */
export function hasMarkdownFormatting(content: string): boolean {
  return /(\*\*|__|~~|`|^\s{0,3}#{1,6}\s|^\s*([-*+]|\d+\.)\s|^\s{0,3}>\s|\[[^\]]*\]\([^)]*\))/m.test(content);
}
