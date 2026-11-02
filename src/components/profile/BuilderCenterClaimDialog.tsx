import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ExternalLink, Heart, Link2, Loader2, MessageSquare, RotateCcw, UserX } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  anyPoints,
  claimBuilderArticles,
  dismissBuilderArticles,
  previewClaimPoints,
  rejectBuilderAlias,
  restoreBuilderAlias,
  restoreBuilderArticles,
  type ClaimResult,
  type ContentType,
  type MyBuilderContent,
  type OwnBuilderArticle,
} from '@/lib/builderCenter';

interface BuilderCenterClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: MyBuilderContent;
  /** After a claim, with the new point totals. */
  onClaimed: (result: ClaimResult) => void;
  /** After "not mine", restore, or rejecting a profile. */
  onChanged: () => void;
  /** Open the dialog that links their Builder Center account. */
  onLink: () => void;
}

const SKIP_REASONS: Record<string, string> = {
  already_on_platform: 'already submitted to a sprint or the Community Spotlight',
  claimed_elsewhere: 'claimed by another account',
};

const TYPE_LABEL: Record<ContentType, string> = { blog: 'Blog', project: 'Project' };

function articleDate(a: OwnBuilderArticle): string | null {
  if (!a.publishedAt) return null;
  try {
    return format(parseISO(a.publishedAt), 'MMM d, yyyy');
  } catch {
    return null;
  }
}

function pointsRule(content: MyBuilderContent): string | null {
  const s = content.settings;
  if (!anyPoints(s)) return null;
  // A UG Madurai rate of 0 means none is set: those articles earn the normal rate.
  const part = (normal: number, ugm: number, what: string) =>
    ugm > 0 && ugm !== normal
      ? `${normal.toLocaleString()} points per ${what} (${ugm.toLocaleString()} if it mentions AWS User Group Madurai)`
      : `${normal.toLocaleString()} points per ${what}`;
  const cap = s.maxPointsPerMember > 0 ? `, up to ${s.maxPointsPerMember.toLocaleString()} points in total` : '';
  return `${part(s.pointsPerArticle, s.pointsPerUGMaduraiArticle, 'blog')} and ${part(s.pointsPerProject, s.pointsPerUGMaduraiProject, 'project')}${cap}.`;
}

/** The member reviews their suggested Builder Center blogs and projects and claims theirs. */
export function BuilderCenterClaimDialog({ open, onOpenChange, content, onClaimed, onChanged, onLink }: BuilderCenterClaimDialogProps) {
  const suggested = useMemo(() => content.articles.filter(a => a.status === 'suggested'), [content.articles]);
  const hidden = useMemo(() => content.articles.filter(a => a.status === 'dismissed'), [content.articles]);
  const rejectedAliases = content.links.filter(l => l.status === 'rejected').map(l => l.alias);
  const verified = content.links.some(l => l.status === 'verified');
  // Profiles their suggestions come from, so they can say one isn't theirs.
  const suggestedAliases = [...new Set(suggested.map(a => a.builderAlias).filter((x): x is string => !!x))];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [types, setTypes] = useState<Record<string, ContentType>>({});
  const [busy, setBusy] = useState<null | string>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [confirmAlias, setConfirmAlias] = useState<string | null>(null);

  // Everything starts selected, as Builder Center typed it, each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelected(new Set(suggested.map(a => a.contentId)));
      setTypes({});
      setShowHidden(false);
      setConfirmAlias(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Drop ids that are no longer suggestions (claimed, hidden, refetched).
  useEffect(() => {
    setSelected(prev => {
      const ids = new Set(suggested.map(a => a.contentId));
      const next = new Set([...prev].filter(id => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [suggested]);

  const typeOf = (a: OwnBuilderArticle): ContentType => types[a.contentId] || a.type;
  const groups: { type: ContentType; items: OwnBuilderArticle[] }[] = (['blog', 'project'] as ContentType[])
    .map(type => ({ type, items: suggested.filter(a => typeOf(a) === type) }))
    .filter(g => g.items.length > 0);
  // Claimed in display order, so the preview and the server apply any cap the same way.
  const chosen = groups.flatMap(g => g.items).filter(a => selected.has(a.contentId));
  const preview = previewClaimPoints(chosen, content.settings, content.awardedPoints, types);
  const showPoints = anyPoints(content.settings);
  const rule = pointsRule(content);

  const setMany = (ids: string[], on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const handleClaim = async () => {
    if (!chosen.length) return;
    setBusy('claim');
    try {
      const chosenTypes = Object.fromEntries(chosen.filter(a => types[a.contentId]).map(a => [a.contentId, types[a.contentId]]));
      const result = await claimBuilderArticles(chosen.map(a => a.contentId), chosenTypes);
      const parts: string[] = [];
      if (result.claimed) {
        parts.push(`Added ${result.claimed} to your profile`
          + (result.pointsAdded ? ` and earned ${result.pointsAdded.toLocaleString()} points.` : '.'));
      }
      const skipped = result.results.filter(r => r.status === 'skipped');
      if (skipped.length) {
        const why = [...new Set(skipped.map(r => SKIP_REASONS[r.reason || ''] || 'no longer available'))].join('; ');
        parts.push(`${skipped.length} could not be claimed: ${why}.`);
      }
      if (result.claimed) toast.success(parts.join(' '));
      else toast.error(parts.join(' ') || 'Nothing was claimed.');
      onClaimed(result);
      if (result.claimed === suggested.length) onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not claim your articles. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async () => {
    if (!chosen.length) return;
    setBusy('dismiss');
    try {
      const moved = await dismissBuilderArticles(chosen.map(a => a.contentId));
      toast.success(`Marked ${moved.length} as not yours.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your articles. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (contentId: string) => {
    setBusy(contentId);
    try {
      await restoreBuilderArticles([contentId]);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not restore the article. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleRejectAlias = async (alias: string) => {
    setBusy(`alias:${alias}`);
    try {
      const r = await rejectBuilderAlias(alias);
      toast.success(`Hidden ${r.dismissed} from @${alias}. We won't suggest that profile's articles to you again.`);
      setConfirmAlias(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update your suggestions. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleRestoreAlias = async (alias: string) => {
    setBusy(`alias:${alias}`);
    try {
      const r = await restoreBuilderAlias(alias);
      toast.success(`Restored ${r.restored} from @${alias}.`);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not restore that profile. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Your AWS Builder Center blogs and projects</DialogTitle>
          <DialogDescription>
            Claim the ones you wrote. Blogs show in the Blogs tab of your profile and projects in the Projects
            tab. Builder Center doesn't mark projects, so check each one's type before you claim it.
            {rule && <> {rule}</>}
          </DialogDescription>
        </DialogHeader>

        {!verified && suggested.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span>Link your Builder Center account to add all of these at once, and your new ones every week.</span>
            <Button variant="outline" size="sm" className="shrink-0" onClick={onLink} disabled={!!busy}>
              <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Link my account
            </Button>
          </div>
        )}

        {suggested.length > 0 ? (
          <div className="max-h-[50vh] space-y-5 overflow-y-auto pr-1">
            {groups.map(group => {
              const ids = group.items.map(a => a.contentId);
              const picked = ids.filter(id => selected.has(id)).length;
              return (
                <section key={group.type} aria-label={group.type === 'blog' ? 'Blogs' : 'Projects'}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {group.type === 'blog' ? 'Blogs' : 'Projects'}{' '}
                      <span className="font-normal text-muted-foreground">({picked} of {ids.length} selected)</span>
                    </h3>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => setMany(ids, true)} disabled={!!busy}>
                        Select all
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => setMany(ids, false)} disabled={!!busy}>
                        Clear
                      </Button>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {group.items.map(a => {
                      const date = articleDate(a);
                      const type = typeOf(a);
                      // Only selected articles have a figure: with a cap, what one earns
                      // depends on which others are claimed with it.
                      const pts = selected.has(a.contentId) ? preview.perArticle.get(a.contentId) ?? 0 : null;
                      return (
                        <li key={a.contentId} className="flex items-start gap-3 rounded-lg border p-3">
                          <Checkbox
                            className="mt-1"
                            checked={selected.has(a.contentId)}
                            onCheckedChange={(v) => setMany([a.contentId], v === true)}
                            aria-label={`Select ${a.title}`}
                            disabled={!!busy}
                          />
                          <div className="min-w-0 flex-1">
                            <a
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-start gap-1 font-medium hover:underline"
                            >
                              <span className="line-clamp-2 break-words">{a.title}</span>
                              <ExternalLink className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />
                            </a>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {date && <span>{date}</span>}
                              <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden="true" />{a.likes.toLocaleString()}</span>
                              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" aria-hidden="true" />{a.comments.toLocaleString()}</span>
                              {a.mentionsUGMadurai && <Badge variant="outline" className="text-xs">Mentions AWS UG Madurai</Badge>}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <div className="inline-flex rounded-md border p-0.5" role="group" aria-label={`Type of ${a.title}`}>
                              {(['blog', 'project'] as ContentType[]).map(t => (
                                <button
                                  key={t}
                                  type="button"
                                  disabled={!!busy}
                                  aria-pressed={type === t}
                                  onClick={() => setTypes(prev => {
                                    const next = { ...prev };
                                    if (t === a.type) delete next[a.contentId];
                                    else next[a.contentId] = t;
                                    return next;
                                  })}
                                  className={`rounded px-2 py-0.5 text-xs transition-colors ${type === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                >
                                  {TYPE_LABEL[t]}
                                </button>
                              ))}
                            </div>
                            {showPoints && pts !== null && (
                              <span className="text-sm font-semibold text-primary">+{pts.toLocaleString()}</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No articles left to review.
          </p>
        )}

        {(suggestedAliases.length > 0 || rejectedAliases.length > 0 || hidden.length > 0) && (
          <div className="space-y-2 border-t pt-3 text-sm">
            {suggestedAliases.map(alias => (
              confirmAlias === alias ? (
                <div key={alias} className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>Hide everything from @{alias} and stop suggesting that profile's articles to you?</span>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setConfirmAlias(null)} disabled={!!busy}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={() => handleRejectAlias(alias)} disabled={!!busy}>
                      {busy === `alias:${alias}` && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                      Not my profile
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={alias} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    Matched to{' '}
                    <a href={`https://builder.aws.com/community/@${alias}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      @{alias}
                    </a>
                  </span>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setConfirmAlias(alias)} disabled={!!busy}>
                    <UserX className="mr-1 h-3 w-3" aria-hidden="true" />
                    This isn't my Builder Center profile
                  </Button>
                </div>
              )
            ))}
            {rejectedAliases.map(alias => (
              <div key={alias} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">You said @{alias} isn't your profile.</span>
                <Button variant="ghost" size="sm" className="shrink-0" onClick={() => handleRestoreAlias(alias)} disabled={!!busy}>
                  {busy === `alias:${alias}`
                    ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    : <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />}
                  It is mine
                </Button>
              </div>
            ))}
            {hidden.length > 0 && (
              <div>
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowHidden(v => !v)}>
                  {showHidden ? 'Hide' : 'Show'} {hidden.length} marked not mine
                </Button>
                {showHidden && (
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                    {hidden.map(a => (
                      <li key={a.contentId} className="flex items-center justify-between gap-3">
                        <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-muted-foreground hover:underline">
                          {a.title}
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0"
                          disabled={!!busy}
                          onClick={() => handleRestore(a.contentId)}
                        >
                          {busy === a.contentId
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            : <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />}
                          It's mine
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {suggested.length > 0 && (
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={handleDismiss} disabled={!chosen.length || !!busy}>
              {busy === 'dismiss' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Not mine
            </Button>
            <Button onClick={handleClaim} disabled={!chosen.length || !!busy}>
              {busy === 'claim' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Claim {chosen.length}
              {showPoints && preview.total > 0 ? ` (+${preview.total.toLocaleString()} points)` : ''}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
