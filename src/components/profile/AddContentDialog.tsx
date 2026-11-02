import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  addBuilderArticle,
  isBuilderArticleUrl,
  type AddArticleResult,
  type ContentType,
  type MyBuilderContent,
} from '@/lib/builderCenter';

interface AddContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ContentType;
  /** The member's Builder Center data, when claims are open. */
  builder: MyBuilderContent | null;
  onAdded: (result: AddArticleResult) => void;
  onLink: () => void;
}

/**
 * Add a blog or project to your own profile: one of your Builder Center
 * articles by its link (with a linked account), or anything else through the
 * Community Spotlight, where an organiser reviews it first.
 */
export function AddContentDialog({ open, onOpenChange, type, builder, onAdded, onLink }: AddContentDialogProps) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const what = type === 'project' ? 'project' : 'blog';
  const linked = builder?.links.filter(l => l.status === 'verified') ?? [];

  useEffect(() => {
    if (open) {
      setUrl('');
      setError(null);
    }
  }, [open]);

  const handleAdd = async () => {
    if (!isBuilderArticleUrl(url)) {
      setError('Paste the link to your article, like https://builder.aws.com/content/...');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await addBuilderArticle(url.trim(), type);
      toast.success(`Added "${result.article?.title || `your ${what}`}" to your profile`
        + (result.pointsAdded ? ` and earned ${result.pointsAdded.toLocaleString()} points.` : '.'));
      onAdded(result);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not add your ${what}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a {what}</DialogTitle>
          <DialogDescription>
            Add a {what} you made to your profile.
          </DialogDescription>
        </DialogHeader>

        {builder?.settings.claimsOpen && (
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">On AWS Builder Center</h3>
            {linked.length > 0 ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="add-bc-url">Link to your {what}</Label>
                  <Input
                    id="add-bc-url"
                    placeholder="https://builder.aws.com/content/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
                    disabled={busy}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    It must be by your linked account, @{linked.map(l => l.alias).join(', @')}. It's added straight
                    away. Linked accounts also get new articles added every week.
                  </p>
                </div>
                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                <Button onClick={handleAdd} disabled={busy || !url.trim()}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add {what}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Link your Builder Center account to add your Builder Center {what}s. Once it's linked, all of them
                  are added, and new ones every week.
                </p>
                {/* Opening a dialog in the same frame another closes leaves Radix's
                    pointer-events lock on <body>, so wait for the close to settle. */}
                <Button variant="outline" onClick={() => { onOpenChange(false); window.setTimeout(onLink, 200); }}>
                  <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Link my account
                </Button>
              </>
            )}
          </section>
        )}

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">
            {type === 'project' ? 'Anywhere else: a GitHub repo, a demo or a video' : 'Anywhere else: Medium, dev.to, your own site'}
          </h3>
          <p className="text-sm text-muted-foreground">
            Submit it to the Community Spotlight. An organiser reviews it, and once it's approved it shows here on
            your profile.
          </p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => { onOpenChange(false); navigate(`/community-spotlight?submit=${type}`); }}
          >
            <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
            Submit to the Community Spotlight
          </Button>
        </section>
      </DialogContent>
    </Dialog>
  );
}
