import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  builderProfileUrl,
  parseBuilderAlias,
  startBuilderLink,
  verifyBuilderLink,
  type LinkVerifyResult,
  type MyBuilderContent,
} from '@/lib/builderCenter';

interface BuilderCenterLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: MyBuilderContent;
  /** After linking, with what was added and the new point totals. */
  onLinked: (result: LinkVerifyResult) => void;
}

type Step =
  | { kind: 'enter' }
  | { kind: 'code'; alias: string; code: string; expiresAt: string; profileName: string | null }
  | { kind: 'done'; result: LinkVerifyResult };

function expiryTime(iso: string): string {
  try {
    return format(parseISO(iso), 'h:mm a');
  } catch {
    return '';
  }
}

/**
 * Link a Builder Center account: the member puts a one-time code in their
 * Builder Center bio, which only the account's owner can edit, and we check
 * it. Then their articles are added to their profile, and new ones weekly.
 */
export function BuilderCenterLinkDialog({ open, onOpenChange, content, onLinked }: BuilderCenterLinkDialogProps) {
  const [step, setStep] = useState<Step>({ kind: 'enter' });
  const [aliasInput, setAliasInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start where they left off: an unexpired code, or the profile we matched them to.
  useEffect(() => {
    if (!open) return;
    setError(null);
    const p = content.pendingVerification;
    if (p && Date.parse(p.expiresAt) > Date.now()) {
      setStep({ kind: 'code', alias: p.alias, code: p.code, expiresAt: p.expiresAt, profileName: p.profileName });
      return;
    }
    setStep({ kind: 'enter' });
    const matched = content.links.filter(l => l.status === 'matched');
    setAliasInput(matched.length === 1 ? matched[0].alias : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleStart = async () => {
    const alias = parseBuilderAlias(aliasInput);
    if (!alias) {
      setError('Enter your Builder Center alias or profile link, like builder.aws.com/community/@yourname.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await startBuilderLink(alias);
      setStep({ kind: 'code', alias: r.alias, code: r.code, expiresAt: r.expiresAt, profileName: r.profileName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start linking. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await verifyBuilderLink();
      setStep({ kind: 'done', result });
      onLinked(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check your Builder Center profile. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy. Select the code and copy it yourself.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link your AWS Builder Center account</DialogTitle>
          <DialogDescription>
            Once it's linked, your Builder Center blogs and projects are added to your profile, and new ones every
            week. To show the account is yours, you put a one-time code in your Builder Center bio.
          </DialogDescription>
        </DialogHeader>

        {step.kind === 'enter' && (
          <div className="grid gap-2">
            <Label htmlFor="bc-alias">Your Builder Center alias or profile link</Label>
            <Input
              id="bc-alias"
              placeholder="builder.aws.com/community/@yourname"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
              disabled={busy}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Find it on your Builder Center profile page, after <span className="font-mono">@</span> in the address.
            </p>
          </div>
        )}

        {step.kind === 'code' && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="mb-2 text-xs text-muted-foreground">
                Your code for{' '}
                <span className="font-medium text-foreground">@{step.alias}</span>
                {step.profileName ? ` (${step.profileName})` : ''}
              </p>
              <div className="flex items-center justify-center gap-2">
                <code className="select-all rounded bg-background px-3 py-1.5 font-mono text-lg font-semibold tracking-wide">
                  {step.code}
                </code>
                <Button variant="outline" size="icon" onClick={() => copyCode(step.code)} aria-label="Copy code">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Works until {expiryTime(step.expiresAt)}.</p>
            </div>
            <ol className="list-inside list-decimal space-y-1 text-sm">
              <li>
                Open{' '}
                <a
                  href={builderProfileUrl(step.alias)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  your Builder Center profile <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>{' '}
                and edit it.
              </li>
              <li>Paste the code anywhere in your bio, and save.</li>
              <li>Come back here and click Verify.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              You can remove the code from your bio once the account is linked.
            </p>
          </div>
        )}

        {step.kind === 'done' && (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
              @{step.result.alias} is linked to your profile.
            </p>
            <p className="text-muted-foreground">
              {step.result.added > 0
                ? `We added ${step.result.added} ${step.result.added === 1 ? 'article' : 'articles'}`
                  + (step.result.pointsAdded ? ` and ${step.result.pointsAdded.toLocaleString()} points.` : '.')
                : 'There was nothing new to add.'}
              {!step.result.feedIndexed && ' We add the rest of your articles in the next weekly sync.'}
              {' '}New articles are added every week. You can remove the code from your Builder Center bio now.
            </p>
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          {step.kind === 'enter' && (
            <Button onClick={handleStart} disabled={busy || !aliasInput.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Get my code
            </Button>
          )}
          {step.kind === 'code' && (
            <>
              <Button variant="ghost" onClick={() => { setStep({ kind: 'enter' }); setAliasInput(step.alias); setError(null); }} disabled={busy}>
                Use another account
              </Button>
              <Button onClick={handleVerify} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verify
              </Button>
            </>
          )}
          {step.kind === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
