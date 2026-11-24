import { useEffect, useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, UserRound } from 'lucide-react';
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
  checkBuilderAlias,
  parseBuilderAlias,
  saveBuilderAlias,
  type AliasCheckResult,
  type AliasSaveResult,
} from '@/lib/builderCenter';

interface BuilderCenterAliasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Points for adding an alias, or 0 if they already got them. */
  points: number;
  /** Their current alias, to start from when changing it. */
  currentAlias?: string | null;
  onSaved: (result: AliasSaveResult) => void;
}

type Step =
  | { kind: 'enter' }
  | { kind: 'confirm'; profile: AliasCheckResult }
  | { kind: 'done'; result: AliasSaveResult };

/** Add a Builder Center alias: enter it, confirm the profile we found is theirs, save. */
export function BuilderCenterAliasDialog({ open, onOpenChange, points, currentAlias, onSaved }: BuilderCenterAliasDialogProps) {
  const [step, setStep] = useState<Step>({ kind: 'enter' });
  const [aliasInput, setAliasInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep({ kind: 'enter' });
    setAliasInput(currentAlias || '');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCheck = async () => {
    const alias = parseBuilderAlias(aliasInput);
    if (!alias) {
      setError('Enter your Builder Center alias or profile link, like builder.aws.com/community/@yourname.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setStep({ kind: 'confirm', profile: await checkBuilderAlias(alias) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not find that profile. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (alias: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveBuilderAlias(alias);
      setStep({ kind: 'done', result });
      onSaved(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your alias. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your AWS Builder Center alias</DialogTitle>
          <DialogDescription>
            {points > 0
              ? `Add the alias of your Builder Center profile and earn ${points.toLocaleString()} points.`
              : 'Add the alias of your Builder Center profile.'}
          </DialogDescription>
        </DialogHeader>

        {step.kind === 'enter' && (
          <div className="grid gap-2">
            <Label htmlFor="bc-alias-input">Builder Center alias or profile link</Label>
            <Input
              id="bc-alias-input"
              placeholder="yourname or builder.aws.com/community/@yourname"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCheck(); }}
              disabled={busy}
              autoComplete="off"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              It's on your Builder Center profile page, after <span className="font-mono">@</span> in the address.
            </p>
          </div>
        )}

        {step.kind === 'confirm' && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Is this you?</p>
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-4">
              <span className="rounded-full bg-primary/10 p-2 text-primary" aria-hidden="true">
                <UserRound className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold">{step.profile.profileName || `@${step.profile.alias}`}</p>
                <p className="truncate text-sm text-muted-foreground">@{step.profile.alias}</p>
                {step.profile.headline && (
                  <p className="truncate text-xs text-muted-foreground">{step.profile.headline}</p>
                )}
              </div>
            </div>
            <a
              href={step.profile.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              Open this profile on Builder Center <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        )}

        {step.kind === 'done' && (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle className="h-5 w-5 text-green-600" aria-hidden="true" />
              @{step.result.alias} is added to your profile.
            </p>
            {step.result.linkPoints > 0 && (
              <p className="font-medium text-primary">+{step.result.linkPoints.toLocaleString()} points</p>
            )}
          </div>
        )}

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          {step.kind === 'enter' && (
            <Button onClick={handleCheck} disabled={busy || !aliasInput.trim()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Check
            </Button>
          )}
          {step.kind === 'confirm' && (
            <>
              <Button
                variant="ghost"
                onClick={() => { setAliasInput(step.profile.alias); setStep({ kind: 'enter' }); setError(null); }}
                disabled={busy}
              >
                No, change it
              </Button>
              <Button onClick={() => handleSave(step.profile.alias)} disabled={busy}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, that's me. Add it
              </Button>
            </>
          )}
          {step.kind === 'done' && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
