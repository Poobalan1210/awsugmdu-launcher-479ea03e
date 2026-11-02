import { useState } from 'react';
import { CheckCircle, Link2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { builderProfileUrl, removeBuilderLink, type MyBuilderContent } from '@/lib/builderCenter';

interface BuilderCenterActionsProps {
  content: MyBuilderContent;
  /** Suggestions waiting or marked not mine. */
  reviewableCount: number;
  onReview: () => void;
  onLink: () => void;
  onChanged: () => void;
}

/** On the member's own Blogs and Projects tabs: their Builder Center link and suggestions. */
export function BuilderCenterActions({ content, reviewableCount, onReview, onLink, onChanged }: BuilderCenterActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const verified = content.links.filter(l => l.status === 'verified');

  const handleUnlink = async (alias: string) => {
    if (!confirm(`Unlink @${alias}? Articles already on your profile stay, but new ones won't be added automatically.`)) return;
    setBusy(alias);
    try {
      await removeBuilderLink(alias);
      toast.success(`Unlinked @${alias}.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unlink. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {reviewableCount > 0 && (
          <Button variant="outline" size="sm" onClick={onReview}>
            Review suggestions ({reviewableCount})
          </Button>
        )}
        {verified.length === 0 && (
          <Button variant="outline" size="sm" onClick={onLink}>
            <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Link Builder Center account
          </Button>
        )}
      </div>
      {verified.map(l => (
        <div key={l.alias} className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
          <span>
            Linked to{' '}
            <a href={builderProfileUrl(l.alias)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              @{l.alias}
            </a>
            , synced weekly
          </span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => handleUnlink(l.alias)}
            disabled={!!busy}
          >
            {busy === l.alias ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Unlink'}
          </Button>
        </div>
      ))}
    </div>
  );
}
