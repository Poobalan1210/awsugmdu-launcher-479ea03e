import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Strikethrough, Heading2, Link2,
  List, ListOrdered, Quote, Code, SquareCode, Eye, Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichText, type RichTextVariant } from '@/components/ui/rich-text';

/* -------------------------------------------------------------------------- */
/* Markdown transforms                                                        */
/* -------------------------------------------------------------------------- */

/** A textarea's value plus its selection range. */
interface EditorState {
  value: string;
  start: number;
  end: number;
}

/** Wraps (or unwraps, when already applied) the selection in a marker. */
function toggleWrap(state: EditorState, marker: string, placeholder: string): EditorState {
  const { value, start, end } = state;
  const selected = value.slice(start, end);
  const len = marker.length;

  // Markers sit inside the selection: **bold** selected whole.
  if (selected.length >= len * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  // Markers sit just outside the selection: **[bold]**.
  if (start >= len && value.slice(start - len, start) === marker && value.slice(end, end + len) === marker) {
    return {
      value: value.slice(0, start - len) + selected + value.slice(end + len),
      start: start - len,
      end: end - len,
    };
  }

  const body = selected || placeholder;
  return {
    value: value.slice(0, start) + marker + body + marker + value.slice(end),
    start: start + len,
    end: start + len + body.length,
  };
}

/** Adds or removes a per-line prefix across every line the selection touches. */
function toggleLinePrefix(
  state: EditorState,
  prefixFor: (index: number) => string,
  matcher: RegExp,
): EditorState {
  const { value, start, end } = state;
  const blockStart = value.lastIndexOf('\n', start - 1) + 1;
  const newlineAfter = value.indexOf('\n', end);
  const blockEnd = newlineAfter === -1 ? value.length : newlineAfter;

  const lines = value.slice(blockStart, blockEnd).split('\n');
  const meaningful = lines.filter((line) => line.trim() !== '');
  const allPrefixed = meaningful.length > 0 && meaningful.every((line) => matcher.test(line));

  const updated = lines.map((line, index) => {
    if (allPrefixed) return line.replace(matcher, '');
    if (line.trim() === '' && lines.length > 1) return line;
    return prefixFor(index) + line;
  });

  const block = updated.join('\n');
  const nextValue = value.slice(0, blockStart) + block + value.slice(blockEnd);

  // Collapsed caret: keep it where the user left it, shifted by the edit.
  if (start === end) {
    const delta = updated[0].length - lines[0].length;
    const caret = Math.max(blockStart, start + delta);
    return { value: nextValue, start: caret, end: caret };
  }

  return { value: nextValue, start: blockStart, end: blockStart + block.length };
}

const URL_PATTERN = /^(https?:\/\/|mailto:|www\.)\S+$/i;

/** Builds a markdown link, putting the caret wherever input is still needed. */
function insertLink(state: EditorState): EditorState {
  const { value, start, end } = state;
  const selected = value.slice(start, end).trim();

  if (URL_PATTERN.test(selected)) {
    const label = 'link text';
    const snippet = `[${label}](${selected})`;
    return {
      value: value.slice(0, start) + snippet + value.slice(end),
      start: start + 1,
      end: start + 1 + label.length,
    };
  }

  const label = selected || 'link text';
  const url = 'https://';
  const snippet = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  };
}

/** Fences the selection as a block of code on its own lines. */
function toggleCodeBlock(state: EditorState): EditorState {
  const { value, start, end } = state;
  const selected = value.slice(start, end) || 'code';
  const prefix = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const suffix = end < value.length && value[end] !== '\n' ? '\n' : '';
  const snippet = `${prefix}\`\`\`\n${selected}\n\`\`\`${suffix}`;
  const bodyStart = start + prefix.length + 4;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    start: bodyStart,
    end: bodyStart + selected.length,
  };
}

const LIST_ITEM = /^(\s*)([-*+])(\s+\[[ xX]\])?\s+(.*)$/;
const ORDERED_ITEM = /^(\s*)(\d+)\.\s+(.*)$/;
const QUOTE_LINE = /^(\s*)>\s?(.*)$/;

/**
 * Enter inside a list/quote continues it; Enter on an empty item ends it.
 * Returns null when the keypress should behave normally.
 */
function continueBlock(state: EditorState): EditorState | null {
  const { value, start, end } = state;
  if (start !== end) return null;

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const line = value.slice(lineStart, start);

  const bullet = line.match(LIST_ITEM);
  if (bullet) {
    const [, indent, marker, task, content] = bullet;
    if (!content.trim()) {
      // Empty item: drop the marker and exit the list.
      return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
    }
    const nextMarker = `\n${indent}${marker}${task ? ' [ ]' : ''} `;
    const caret = start + nextMarker.length;
    return { value: value.slice(0, start) + nextMarker + value.slice(start), start: caret, end: caret };
  }

  const ordered = line.match(ORDERED_ITEM);
  if (ordered) {
    const [, indent, number, content] = ordered;
    if (!content.trim()) {
      return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
    }
    const nextMarker = `\n${indent}${Number(number) + 1}. `;
    const caret = start + nextMarker.length;
    return { value: value.slice(0, start) + nextMarker + value.slice(start), start: caret, end: caret };
  }

  const quote = line.match(QUOTE_LINE);
  if (quote) {
    const [, indent, content] = quote;
    if (!content.trim()) {
      return { value: value.slice(0, lineStart) + value.slice(start), start: lineStart, end: lineStart };
    }
    const nextMarker = `\n${indent}> `;
    const caret = start + nextMarker.length;
    return { value: value.slice(0, start) + nextMarker + value.slice(start), start: caret, end: caret };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Toolbar definition                                                         */
/* -------------------------------------------------------------------------- */

interface ToolbarAction {
  id: string;
  label: string;
  icon: typeof Bold;
  shortcut?: string;
  /** Hidden in the condensed reply toolbar. */
  secondary?: boolean;
  apply: (state: EditorState) => EditorState;
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { id: 'bold', label: 'Bold', icon: Bold, shortcut: '⌘B', apply: (s) => toggleWrap(s, '**', 'bold text') },
  { id: 'italic', label: 'Italic', icon: Italic, shortcut: '⌘I', apply: (s) => toggleWrap(s, '_', 'italic text') },
  {
    id: 'strike', label: 'Strikethrough', icon: Strikethrough, secondary: true,
    apply: (s) => toggleWrap(s, '~~', 'strikethrough'),
  },
  {
    id: 'heading', label: 'Heading', icon: Heading2, secondary: true,
    apply: (s) => toggleLinePrefix(s, () => '## ', /^\s{0,3}#{1,6}\s+/),
  },
  { id: 'link', label: 'Link', icon: Link2, shortcut: '⌘K', apply: insertLink },
  {
    id: 'bullet', label: 'Bulleted list', icon: List,
    apply: (s) => toggleLinePrefix(s, () => '- ', /^\s*[-*+]\s+/),
  },
  {
    id: 'ordered', label: 'Numbered list', icon: ListOrdered,
    apply: (s) => toggleLinePrefix(s, (i) => `${i + 1}. `, /^\s*\d+\.\s+/),
  },
  {
    id: 'quote', label: 'Quote', icon: Quote, secondary: true,
    apply: (s) => toggleLinePrefix(s, () => '> ', /^\s*>\s?/),
  },
  { id: 'code', label: 'Inline code', icon: Code, shortcut: '⌘E', apply: (s) => toggleWrap(s, '`', 'code') },
  { id: 'codeblock', label: 'Code block', icon: SquareCode, secondary: true, apply: toggleCodeBlock },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Fires on ⌘/Ctrl + Enter. */
  onSubmit?: () => void;
  disabled?: boolean;
  /** Condensed toolbar + shorter box, for reply boxes. */
  compact?: boolean;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  onSubmit,
  disabled = false,
  compact = false,
  minHeight,
  maxHeight = 420,
  autoFocus = false,
  className,
  ariaLabel = 'Message',
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');

  const resolvedMinHeight = minHeight ?? (compact ? 64 : 96);
  const previewVariant: RichTextVariant = compact ? 'compact' : 'default';

  // Restore the caret after a toolbar edit round-trips through parent state.
  useEffect(() => {
    if (!pendingSelection.current || !textareaRef.current) return;
    const [start, end] = pendingSelection.current;
    pendingSelection.current = null;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(start, end);
  }, [value]);

  // Grow with content instead of scrolling a fixed box.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || mode !== 'write') return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, resolvedMinHeight), maxHeight)}px`;
  }, [value, mode, resolvedMinHeight, maxHeight]);

  const commit = useCallback(
    (next: EditorState) => {
      pendingSelection.current = [next.start, next.end];
      onChange(next.value);
    },
    [onChange],
  );

  const readState = useCallback((): EditorState | null => {
    const el = textareaRef.current;
    if (!el) return null;
    return { value: el.value, start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 };
  }, []);

  const runAction = useCallback(
    (action: ToolbarAction) => {
      if (disabled) return;
      if (mode === 'preview') setMode('write');
      const state = readState();
      if (!state) return;
      commit(action.apply(state));
    },
    [commit, disabled, mode, readState],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key === 'Enter') {
      event.preventDefault();
      onSubmit?.();
      return;
    }

    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      const shortcut = { b: 'bold', i: 'italic', k: 'link', e: 'code' }[key];
      if (shortcut) {
        const action = TOOLBAR_ACTIONS.find((a) => a.id === shortcut);
        if (action) {
          event.preventDefault();
          runAction(action);
          return;
        }
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !mod) {
      const state = readState();
      const next = state && continueBlock(state);
      if (next) {
        event.preventDefault();
        commit(next);
      }
    }
  };

  // Pasting a URL onto selected text produces a link instead of clobbering it.
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text/plain').trim();
    const state = readState();
    if (!state || state.start === state.end || !URL_PATTERN.test(pasted)) return;

    event.preventDefault();
    const label = state.value.slice(state.start, state.end);
    const snippet = `[${label}](${pasted})`;
    commit({
      value: state.value.slice(0, state.start) + snippet + state.value.slice(state.end),
      start: state.start + snippet.length,
      end: state.start + snippet.length,
    });
  };

  const actions = compact ? TOOLBAR_ACTIONS.filter((a) => !a.secondary) : TOOLBAR_ACTIONS;
  const hasContent = value.trim().length > 0;

  return (
    <div
      className={cn(
        'rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
        disabled && 'opacity-50',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => runAction(action)}
            disabled={disabled}
            title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label}
            aria-label={action.label}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none"
          >
            <action.icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}

        <button
          type="button"
          onClick={() => setMode(mode === 'write' ? 'preview' : 'write')}
          disabled={disabled || !hasContent}
          title={mode === 'write' ? 'Preview' : 'Continue writing'}
          aria-label={mode === 'write' ? 'Preview formatted message' : 'Back to editing'}
          aria-pressed={mode === 'preview'}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          {mode === 'write' ? (
            <>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              Preview
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </>
          )}
        </button>
      </div>

      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          spellCheck
          style={{ minHeight: resolvedMinHeight, maxHeight }}
          className="w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      ) : (
        <div
          className="overflow-y-auto px-3 py-2"
          style={{ minHeight: resolvedMinHeight, maxHeight }}
          aria-live="polite"
        >
          <RichText content={value} variant={previewVariant} />
        </div>
      )}

      <p className="px-3 pb-1.5 text-[11px] text-muted-foreground">
        Markdown supported{onSubmit ? ' · ⌘/Ctrl + Enter to post' : ''}
      </p>
    </div>
  );
}
