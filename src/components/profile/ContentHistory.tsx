import type { ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Heart, Loader2, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ContentEntry } from '@/lib/builderCenter';

interface ContentHistoryProps {
  entries: ContentEntry[];
  loading: boolean;
  emptyIcon: ReactNode;
  emptyText: string;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return null;
  }
}

/** A member's blogs or projects, newest first, each linking to where it lives. */
export function ContentHistory({ entries, loading, emptyIcon, emptyText }: ContentHistoryProps) {
  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-4 flex justify-center text-muted-foreground">{emptyIcon}</div>
        <p className="text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map(entry => {
        const date = formatDate(entry.date);
        const statsDate = formatDate(entry.statsAsOf);
        const hasStats = entry.likes !== undefined || entry.comments !== undefined;
        return (
          <li key={entry.key}>
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50"
            >
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt=""
                  loading="lazy"
                  className="hidden h-20 w-32 shrink-0 rounded object-cover sm:block"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {entry.sources.map(s => (
                    <Badge key={`${s.kind}-${s.label}`} variant={s.kind === 'builder_center' ? 'default' : 'outline'} className="text-xs">
                      {s.label}
                    </Badge>
                  ))}
                  {date && <span className="text-sm text-muted-foreground">{date}</span>}
                </div>
                <h4 className="flex items-start gap-1 font-semibold">
                  <span className="line-clamp-2 break-words">{entry.title}</span>
                  <ExternalLink className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                </h4>
                {entry.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{entry.description}</p>
                )}
                {hasStats && (
                  <div
                    className="mt-2 flex items-center gap-3 text-xs text-muted-foreground"
                    title={statsDate ? `Counted on ${statsDate}` : undefined}
                  >
                    <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden="true" />{(entry.likes ?? 0).toLocaleString()}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" aria-hidden="true" />{(entry.comments ?? 0).toLocaleString()}</span>
                    {statsDate && <span>as of {statsDate}</span>}
                  </div>
                )}
              </div>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
