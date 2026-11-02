import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { FileText, Loader2, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseCsvObjects } from '@/lib/csv';
import { profilePath } from '@/lib/profileSlug';
import {
  MAX_IMPORT_ROWS,
  REQUIRED_IMPORT_COLUMNS,
  adminRemoveBuilderLink,
  builderProfileUrl,
  getBuilderCenterSummary,
  importBuilderCenterArticles,
  startBuilderSync,
  updateBuilderCenterSettings,
  type BuilderCenterSettings,
  type BuilderLinkStatus,
  type BuilderSyncState,
  type ImportSummary,
} from '@/lib/builderCenter';

const MAX_POINTS_SETTING = 100000;

const SKIP_LABELS: Record<string, string> = {
  no_platform_account: 'No platform account in the row',
  unknown_user: 'Platform account not found',
  invalid_user_id: 'Invalid platform user id',
  invalid_url: 'Not a Builder Center article link',
  missing_title: 'No title',
  invalid_row: 'Unreadable row',
  duplicate_row: 'Duplicate of an earlier row',
  already_on_platform: 'Already on the platform (sprint or Spotlight)',
  alias_rejected: 'The member said that Builder Center profile isn\'t theirs',
};

const STATUS_LABELS: { key: 'suggested' | 'claimed' | 'dismissed' | 'already_on_platform' | 'claimed_elsewhere'; label: string }[] = [
  { key: 'suggested', label: 'Waiting to be claimed' },
  { key: 'claimed', label: 'On profiles' },
  { key: 'dismissed', label: 'Not mine' },
  { key: 'already_on_platform', label: 'Submitted elsewhere since' },
  { key: 'claimed_elsewhere', label: 'Claimed by another account' },
];

const LINK_BADGE: Record<BuilderLinkStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  verified: { label: 'Linked', variant: 'default' },
  matched: { label: 'Matched', variant: 'secondary' },
  rejected: { label: 'Not theirs', variant: 'destructive' },
};

type PointsForm = Record<Exclude<keyof BuilderCenterSettings, 'claimsOpen'>, string>;

const POINT_INPUTS: { key: keyof PointsForm; label: string; hint?: string }[] = [
  { key: 'pointsPerArticle', label: 'Points per blog' },
  { key: 'pointsPerUGMaduraiArticle', label: 'Per blog that mentions AWS UG Madurai', hint: 'Used instead of the points per blog. 0 means the same as the points per blog.' },
  { key: 'pointsPerProject', label: 'Points per project' },
  { key: 'pointsPerUGMaduraiProject', label: 'Per project that mentions AWS UG Madurai', hint: 'Used instead of the points per project. 0 means the same as the points per project.' },
  { key: 'maxPointsPerMember', label: 'Most points per member', hint: 'Blogs and projects together. 0 means no limit.' },
];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '';
  try {
    return format(parseISO(value), 'MMM d, yyyy h:mm a');
  } catch {
    return '';
  }
}

function syncRunning(sync: BuilderSyncState | null | undefined): boolean {
  return !!sync && (sync.status === 'crawling' || sync.status === 'applying');
}

/** Admin: points and the claims switch, the import, the weekly sync, and who has what. */
export default function BuilderCenterTab() {
  const queryClient = useQueryClient();
  const { data: summary, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['builder-center-summary'],
    queryFn: getBuilderCenterSummary,
    // Follow a running sync.
    refetchInterval: (q) => (syncRunning(q.state.data?.sync) ? 10000 : false),
  });

  // ── Settings ──
  const [claimsOpen, setClaimsOpen] = useState(false);
  const [points, setPoints] = useState<PointsForm>({
    pointsPerArticle: '0', pointsPerUGMaduraiArticle: '0', pointsPerProject: '0', pointsPerUGMaduraiProject: '0', maxPointsPerMember: '0',
  });
  const [saving, setSaving] = useState(false);
  const loadedAt = useRef<string | null | undefined>(undefined);

  // Fill the form from the server once, and again after each save.
  useEffect(() => {
    const s = summary?.settings;
    if (!s || loadedAt.current === s.updatedAt) return;
    loadedAt.current = s.updatedAt;
    setClaimsOpen(s.claimsOpen);
    setPoints({
      pointsPerArticle: String(s.pointsPerArticle ?? 0),
      pointsPerUGMaduraiArticle: String(s.pointsPerUGMaduraiArticle ?? 0),
      pointsPerProject: String(s.pointsPerProject ?? 0),
      pointsPerUGMaduraiProject: String(s.pointsPerUGMaduraiProject ?? 0),
      maxPointsPerMember: String(s.maxPointsPerMember ?? 0),
    });
  }, [summary?.settings]);

  const parsePoints = (): BuilderCenterSettings | null => {
    const out: Partial<Record<keyof PointsForm, number>> = {};
    for (const [key, value] of Object.entries(points) as [keyof PointsForm, string][]) {
      const n = Number(value);
      if (value.trim() === '' || !Number.isInteger(n) || n < 0 || n > MAX_POINTS_SETTING) {
        toast.error(`Points must be whole numbers from 0 to ${MAX_POINTS_SETTING.toLocaleString()}.`);
        return null;
      }
      out[key] = n;
    }
    return { claimsOpen, ...(out as Record<keyof PointsForm, number>) };
  };

  const handleSave = async () => {
    const next = parsePoints();
    if (!next) return;
    if (next.claimsOpen && !summary?.settings.claimsOpen
      && !confirm('Open claims? Members will see their suggestions, can claim them and link their Builder Center accounts straight away.')) {
      return;
    }
    setSaving(true);
    try {
      await updateBuilderCenterSettings(next);
      toast.success('Builder Center settings saved');
      await queryClient.invalidateQueries({ queryKey: ['builder-center-summary'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  };

  // ── Sync ──
  const [startingSync, setStartingSync] = useState(false);
  const sync = summary?.sync || null;
  const running = syncRunning(sync);

  const handleSync = async () => {
    if (!confirm('Read the whole Builder Center feed now? It takes about 20 minutes. Linked members get their new articles added automatically.')) return;
    setStartingSync(true);
    try {
      await startBuilderSync();
      toast.success('Sync started. Progress shows here.');
      setTimeout(() => refetch(), 3000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the sync');
    } finally {
      setStartingSync(false);
    }
  };

  // ── Unlink ──
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const handleUnlink = async (userId: string, alias: string, name: string | null) => {
    if (!confirm(`Unlink @${alias} from ${name || 'this member'}? Their articles stay, but new ones won't be added automatically, and another account can link @${alias}.`)) return;
    setUnlinking(`${userId}|${alias}`);
    try {
      await adminRemoveBuilderLink(userId, alias);
      toast.success(`Unlinked @${alias}`);
      await queryClient.invalidateQueries({ queryKey: ['builder-center-summary'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not unlink');
    } finally {
      setUnlinking(null);
    }
  };

  // ── Import ──
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [statsAsOf, setStatsAsOf] = useState(today());
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState<null | 'preview' | 'import'>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    setPreview(null);
    setLastImport(null);
    if (!file) return;
    try {
      const { headers, rows: parsed } = parseCsvObjects(await file.text());
      const missing = REQUIRED_IMPORT_COLUMNS.filter(c => !headers.includes(c));
      if (missing.length) {
        toast.error(`This file has no ${missing.join(', ')} column. Use spotlight-candidates-platform-members.csv.`);
        setRows(null);
        setFileName(null);
        return;
      }
      if (!parsed.length) {
        toast.error('The file has no rows.');
        return;
      }
      if (parsed.length > MAX_IMPORT_ROWS) {
        toast.error(`The file has ${parsed.length.toLocaleString()} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString()} at a time.`);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch {
      toast.error('Could not read that file as CSV.');
    }
  };

  const runImport = async (dryRun: boolean) => {
    if (!rows) return;
    setImporting(dryRun ? 'preview' : 'import');
    try {
      const result = await importBuilderCenterArticles(rows, { dryRun, statsAsOf });
      if (dryRun) {
        setPreview(result);
      } else {
        setLastImport(result);
        setPreview(null);
        setRows(null);
        setFileName(null);
        if (result.failureCount) toast.error(`${result.failureCount} rows could not be written. Import the file again to retry them.`);
        else toast.success(`Imported: ${result.created} new suggestions, ${result.updated} refreshed`);
        await queryClient.invalidateQueries({ queryKey: ['builder-center-summary'] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The import failed');
    } finally {
      setImporting(null);
    }
  };

  const shownImport = lastImport || preview;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileText className="h-6 w-6 text-primary" />
            Builder Center
          </h2>
          <p className="text-muted-foreground">
            AWS Builder Center blogs and projects matched to members. Members claim theirs, or link their account
            to have them added automatically.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="shrink-0 gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : 'Could not load Builder Center data.'}
          </CardContent>
        </Card>
      )}

      {/* Settings */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Claims and points</CardTitle>
          <CardDescription>
            Points are added when an article is claimed or added from a linked account, at the rates set at that
            moment and by the type it was claimed as. Changing them later does not change points already given.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="bc-claims-open" className="text-base">Members can claim and link</Label>
              <p className="text-sm text-muted-foreground">
                While this is off, members don't see their suggestions, nothing can be claimed or linked, and the
                weekly sync only adds suggestions.
              </p>
            </div>
            <Switch id="bc-claims-open" checked={claimsOpen} onCheckedChange={setClaimsOpen} disabled={isLoading} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {POINT_INPUTS.map(f => (
              <div key={f.key} className="grid content-start gap-2">
                <Label htmlFor={`bc-${f.key}`}>{f.label}</Label>
                <Input
                  id={`bc-${f.key}`}
                  type="number"
                  min={0}
                  max={MAX_POINTS_SETTING}
                  step={1}
                  value={points[f.key]}
                  onChange={(e) => setPoints(p => ({ ...p, [f.key]: e.target.value }))}
                />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {summary?.settings.updatedAt ? `Last saved ${formatDateTime(summary.settings.updatedAt)}` : 'Not saved yet'}
            </p>
            <Button onClick={handleSave} disabled={saving || isLoading}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Sync */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Weekly sync</CardTitle>
          <CardDescription>
            Every Monday at 02:00 IST the whole public Builder Center feed is read. Members who matched get new
            suggestions, linked members get new articles added, and likes and comments are refreshed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!sync ? (
            <p className="text-muted-foreground">No sync has run yet.</p>
          ) : (
            <div className="space-y-1">
              <p>
                {running ? (
                  <span className="inline-flex items-center gap-2 font-medium">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {sync.status === 'crawling'
                      ? `Reading the feed: ${sync.pages.toLocaleString()} pages, ${sync.articles.toLocaleString()} articles so far`
                      : 'Updating members\' articles'}
                  </span>
                ) : sync.status === 'failed' ? (
                  <span className="font-medium text-destructive">Last sync failed {formatDateTime(sync.finishedAt)}: {sync.error}</span>
                ) : (
                  <span className="font-medium">Last sync finished {formatDateTime(sync.finishedAt)}</span>
                )}
              </p>
              {sync.stats && (
                <p className="text-muted-foreground">
                  {sync.articles.toLocaleString()} articles read · {sync.stats.newSuggestions.toLocaleString()} new suggestions ·{' '}
                  {sync.stats.autoAdded.toLocaleString()} added for linked members ({sync.stats.pointsAwarded.toLocaleString()} points) ·{' '}
                  {sync.stats.refreshed.toLocaleString()} refreshed
                </p>
              )}
            </div>
          )}
          <Button variant="outline" onClick={handleSync} disabled={running || startingSync || isLoading}>
            {(running || startingSync) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run sync now
          </Button>
        </CardContent>
      </Card>

      {/* Import */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Import articles</CardTitle>
          <CardDescription>
            Upload spotlight-candidates-platform-members.csv from the Builder Center collector. Each row becomes a
            blog or project suggestion for its member, and for their other accounts in otherPlatformUserIds, and
            their Builder Center profile is recorded as matched for the weekly sync. Articles already on the
            platform are skipped. Importing again refreshes titles, types, likes and comments, and never changes
            what members claimed or marked not mine.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label>CSV file</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={!!importing} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Choose file
                </Button>
                <span className="truncate text-sm text-muted-foreground">
                  {fileName ? `${fileName}, ${rows?.length.toLocaleString()} rows` : 'No file chosen'}
                </span>
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bc-stats-date">Likes and comments counted on</Label>
              <Input
                id="bc-stats-date"
                type="date"
                value={statsAsOf}
                max={today()}
                onChange={(e) => { setStatsAsOf(e.target.value); setPreview(null); }}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => runImport(true)} disabled={!rows || !!importing}>
              {importing === 'preview' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Preview
            </Button>
            <Button onClick={() => runImport(false)} disabled={!rows || !preview || !!importing}>
              {importing === 'import' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import
            </Button>
            {rows && !preview && <span className="self-center text-xs text-muted-foreground">Preview first to see what will change.</span>}
          </div>

          {shownImport && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="mb-2 font-medium">
                {shownImport.dryRun ? 'Preview: nothing has been written yet' : 'Import finished'}
              </p>
              <ul className="space-y-1">
                <li>{shownImport.rows.toLocaleString()} rows read</li>
                <li>
                  {shownImport.created.toLocaleString()} new suggestions for {shownImport.membersWithNewSuggestions.toLocaleString()} members
                  {shownImport.byType && ` (${shownImport.byType.blog.toLocaleString()} blogs, ${shownImport.byType.project.toLocaleString()} projects)`}
                </li>
                <li>{shownImport.updated.toLocaleString()} existing articles refreshed</li>
                {!!shownImport.linksMatched && (
                  <li>{shownImport.linksMatched.toLocaleString()} Builder Center profiles recorded as matched</li>
                )}
                {shownImport.markedOnPlatform > 0 && (
                  <li>{shownImport.markedOnPlatform.toLocaleString()} suggestions withdrawn because they are now on the platform</li>
                )}
                {Object.entries(shownImport.skipped).map(([reason, n]) => (
                  <li key={reason} className="text-muted-foreground">
                    Skipped {n.toLocaleString()}: {SKIP_LABELS[reason] || reason}
                  </li>
                ))}
                {!!shownImport.failureCount && (
                  <li className="text-destructive">{shownImport.failureCount.toLocaleString()} could not be written</li>
                )}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {summary
              ? `${summary.totals.articles.toLocaleString()} articles (${summary.totals.byType.blog.toLocaleString()} blogs, ${summary.totals.byType.project.toLocaleString()} projects) for ${summary.members.length.toLocaleString()} members. `
                + `${summary.totals.links.verified.toLocaleString()} linked accounts. ${summary.totals.pointsAwarded.toLocaleString()} points given so far.`
              : 'Suggestions and claims per member.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : summary && summary.members.length > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {STATUS_LABELS.map(s => (
                  <div key={s.key} className="rounded-lg bg-muted/50 p-3 text-center">
                    <div className="text-2xl font-bold text-primary">{(summary.totals[s.key] || 0).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="max-h-[60vh] overflow-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Builder Center</TableHead>
                      <TableHead className="text-right">Waiting</TableHead>
                      <TableHead className="text-right">On profile</TableHead>
                      <TableHead className="text-right">Not mine</TableHead>
                      <TableHead className="text-right">Other</TableHead>
                      <TableHead className="text-right">Blogs / projects</TableHead>
                      <TableHead className="text-right" title="Articles whose type the member changed before claiming">Retyped</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.members.map(m => {
                      const links = m.links.length ? m.links : (m.builderAlias ? [{ alias: m.builderAlias, status: 'matched' as const, verifiedAt: null }] : []);
                      return (
                        <TableRow key={m.userId}>
                          <TableCell className="font-medium">
                            {m.name ? (
                              <Link to={profilePath(m.name, m.userId)} className="hover:underline">{m.name}</Link>
                            ) : (
                              <span className="text-muted-foreground">Unknown ({m.userId.slice(0, 8)})</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {links.map(l => (
                                <div key={l.alias} className="flex flex-wrap items-center gap-1.5">
                                  <a
                                    href={builderProfileUrl(l.alias)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-primary hover:underline"
                                  >
                                    @{l.alias}
                                  </a>
                                  <Badge variant={LINK_BADGE[l.status]?.variant || 'secondary'} className="text-[10px]">
                                    {LINK_BADGE[l.status]?.label || l.status}
                                  </Badge>
                                  {l.status === 'verified' && (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-xs"
                                      disabled={unlinking === `${m.userId}|${l.alias}`}
                                      onClick={() => handleUnlink(m.userId, l.alias, m.name)}
                                    >
                                      Unlink
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{m.counts.suggested || 0}</TableCell>
                          <TableCell className="text-right">{m.counts.claimed || 0}</TableCell>
                          <TableCell className="text-right">{m.counts.dismissed || 0}</TableCell>
                          <TableCell className="text-right">{(m.counts.already_on_platform || 0) + (m.counts.claimed_elsewhere || 0)}</TableCell>
                          <TableCell className="text-right">{m.byType.blog} / {m.byType.project}</TableCell>
                          <TableCell className="text-right">{m.relabelled || ''}</TableCell>
                          <TableCell className="text-right">{m.pointsAwarded.toLocaleString()}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No articles imported yet. Import the collector's CSV above, or wait for the weekly sync.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
