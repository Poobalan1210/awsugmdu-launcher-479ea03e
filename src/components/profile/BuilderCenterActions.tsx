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
  /** Add or change their alias. */
  onAddAlias: () => void;
  onChanged: () => void;
  className?: string;
}

/** On the member's own profile: their Builder Center alias (change, remove) and suggestions. */
export function BuilderCenterActions({ content, reviewableCount, onReview, onAddAlias, onChanged, className }: BuilderCenterActionsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const verified = content.links.filter(l => l.status === 'verified');
  const added = content.links.filter(l => l.status === 'added');

  const handleUnlink = async (alias: string) => {
    const isAdded = added.some(l => l.alias === alias);
    if (!confirm(isAdded
      ? `Remove @${alias} from your profile?`
      : `Unlink @${alias}? Articles already on your profile stay, but new ones won't be added automatically.`)) return;
    setBusy(alias);
    try {
      await removeBuilderLink(alias);
      toast.success(isAdded ? `Removed @${alias}.` : `Unlinked @${alias}.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not unlink. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className ? `flex flex-col gap-2 ${className}` : 'flex flex-col items-start gap-2 sm:items-end'}>
      <div className="flex flex-wrap gap-2">
        {reviewableCount > 0 && (
          <Button variant="outline" size="sm" onClick={onReview}>
            Review suggestions ({reviewableCount})
          </Button>
        )}
        {verified.length === 0 && added.length === 0 && (
          <Button variant="outline" size="sm" onClick={onAddAlias}>
            <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
            Add Builder Center alias
          </Button>
        )}
      </div>
      {verified.length === 0 && added.map(l => (
        <div key={l.alias} className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
          <span>
            Builder Center alias{' '}
            <a href={builderProfileUrl(l.alias)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              @{l.alias}
            </a>
          </span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={onAddAlias} disabled={!!busy}>
            Change
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs text-muted-foreground"
            onClick={() => handleUnlink(l.alias)}
            disabled={!!busy}
          >
            {busy === l.alias ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
          </Button>
        </div>
      ))}
      {verified.map(l => (
        <div key={l.alias} className="flex items-center gap-2 text-xs text-muted-foreground">
          <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden="true" />
          <span>
            Linked to{' '}
            <a href={builderProfileUrl(l.alias)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              @{l.alias}
            </a>
            {content.settings.claimsOpen && ', synced weekly'}
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
