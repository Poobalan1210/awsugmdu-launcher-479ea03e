import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import {
  AlertTriangle, CheckCircle2, Gift, Github, Loader2, Mail, RefreshCw, RotateCcw, Send, UserMinus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ENTRY_DEADLINE_IST_LABEL, LESSON_GATE_PLACES, PRIZE_PLACES, PRIZE_TIERS, emailPrizeWinners, getAdminPrizes, issuePrizes,
  prizeTierById, refreshStandings, sendTestPrizeEmail, setPrizeExclusion,
  type AdminPrizeRow, type ParticipantStage,
} from '@/lib/campaign';
import { fulfillmentOf, getOrders, type Order } from '@/lib/store';

// Header cells stay in view while the table scrolls (see KiroUniversityTab).
const STICKY_HEAD = 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]';

// Each request sends one batch; this caps the loop well above the 6 or so a
// full prize list needs, in case the backend keeps reporting work left.
const MAX_EMAIL_ROUNDS = 20;

const STAGE_LABEL: Record<ParticipantStage, string> = {
  validated: 'Validated',
  submitted: 'Submitted on kiro.dev',
  building: 'Did not confirm a kiro.dev entry',
  'setup-stopped': 'Setup stopped',
  'command-generated': 'Not set up',
  'not-started': 'Not set up',
};

type Busy = null | 'issue' | 'email' | 'test' | 'refresh' | `exclude:${string}`;

const when = (iso: string | null) => {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'd MMM, h:mm a');
  } catch {
    return '';
  }
};

/** A winner's prize order, once they have claimed it. */
function claimFor(row: AdminPrizeRow, orders: Order[]): Order | undefined {
  const orderId = row.coupon?.orderId;
  return orderId ? orders.find((o) => o.id === orderId) : undefined;
}

function StatTile({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function EmailState({ coupon }: { coupon: NonNullable<AdminPrizeRow['coupon']> }) {
  switch (coupon.emailStatus) {
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Sent {when(coupon.emailedAt)}
        </span>
      );
    case 'failed':
      return <span className="text-xs text-destructive">Failed: {coupon.emailError || 'unknown error'}</span>;
    case 'sending':
      return <span className="text-xs text-muted-foreground">Sending…</span>;
    default:
      return <span className="text-xs text-muted-foreground">Not sent yet</span>;
  }
}

/** Where a winner is with their prize: coupon unused, or claimed and how. */
function ClaimState({ row, claim }: { row: AdminPrizeRow; claim?: Order }) {
  const c = row.coupon;
  if (!c) return <span className="text-xs text-muted-foreground">No coupon</span>;
  if (c.status === 'claimed') {
    const method = claim ? fulfillmentOf(claim) : null;
    return (
      <span className="text-xs">
        <Badge className="border-transparent bg-green-600 text-white hover:bg-green-600">Claimed {when(c.claimedAt)}</Badge>
        {claim && (
          <span className="text-muted-foreground">
            {' '}{method === 'pickup' ? 'collect at event' : 'ship'} · {claim.status}
          </span>
        )}
        {c.claimEmailStatus === 'sent' && (
          <span className="mt-0.5 block text-muted-foreground">Confirmation emailed</span>
        )}
        {c.claimEmailStatus === 'failed' && (
          <span className="mt-0.5 block text-destructive">
            Confirmation email failed{c.claimEmailError ? `: ${c.claimEmailError}` : ''}
          </span>
        )}
      </span>
    );
  }
  return <Badge variant="outline">Not claimed yet</Badge>;
}

/**
 * Kiro University prizes: preview the winners from the final leaderboard,
 * issue their coupons, and email them. Each coupon claims one store item, the
 * winner's prize; the claim becomes an order in Admin → Store → Orders.
 */
export default function KiroPrizesPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-kiro-prizes'],
    queryFn: getAdminPrizes,
    staleTime: 30_000,
  });
  const issued = Boolean(data?.issued);
  // Every order, to show how each claimed prize is reaching its winner.
  const { data: orders = [] } = useQuery({
    queryKey: ['admin-store-orders'],
    queryFn: () => getOrders(),
    enabled: issued,
    staleTime: 60_000,
  });

  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState<{ sent: number; failed: number; remaining: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const claims = useMemo(() => new Map(rows.map((r) => [r.userId, claimFor(r, orders)])), [rows, orders]);

  const summary = useMemo(() => {
    const coupons = rows.flatMap((r) => (r.coupon ? [r.coupon] : []));
    return {
      coupons: coupons.length,
      missing: issued ? rows.filter((r) => !r.coupon).length : 0,
      claimed: coupons.filter((c) => c.status === 'claimed').length,
      sent: coupons.filter((c) => c.emailStatus === 'sent').length,
      failed: coupons.filter((c) => c.emailStatus === 'failed').length,
      waiting: coupons.filter((c) => c.emailStatus === 'pending' || c.emailStatus === 'sending').length,
      noEmail: rows.filter((r) => !r.email).length,
      earlyCommits: rows.filter((r) => r.repoEligible === false).length,
    };
  }, [rows, issued]);

  // The store item each prize is claimed as, from the backend: fixed once
  // issued, until then the store item matching the prize's name.
  const stock = useMemo(() => PRIZE_TIERS.map((tier) => {
    const winners = rows.filter((r) => r.tier === tier.id);
    // Before issuing every winner needs one. After, only those still to claim.
    const needed = issued ? winners.filter((r) => r.coupon?.status !== 'claimed').length : winners.length;
    const item = data?.tierItems?.find((t) => t.tier === tier.id) ?? null;
    const problems: string[] = [];
    if (!item?.itemId) {
      if (winners.length) problems.push(`No store item named like "${tier.item}". Add one: winners claim their prize as it.`);
    } else {
      const left = !item.inStock ? 0 : item.quantity;
      if (left !== null && left < needed) {
        problems.push(`${left} in stock for ${needed} ${issued ? 'winners still to claim' : 'winners'}. Claims still go through: restock to cover them.`);
      }
    }
    return { tier, winners: winners.length, needed, item, problems };
  }), [rows, data, issued]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-kiro-prizes'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-store-orders'] }),
  ]);

  /** Send batches until none are left. Only the first request retries failed sends. */
  const sendEmails = async (retryFailed: boolean) => {
    setBusy('email');
    setProgress(null);
    let sent = 0;
    let failed = 0;
    try {
      for (let round = 0; round < MAX_EMAIL_ROUNDS; round++) {
        const r = await emailPrizeWinners(retryFailed && round === 0);
        sent += r.sent;
        failed += r.failed;
        setProgress({ sent, failed, remaining: r.remaining });
        if (r.remaining === 0) break;
        if (r.sent + r.failed === 0) {
          toast.message('Another session is sending the rest. Refresh in a few minutes.');
          break;
        }
      }
      if (failed) toast.warning(`${sent} emails sent, ${failed} failed. The list shows why.`);
      else toast.success(`${sent} prize email${sent === 1 ? '' : 's'} sent`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sending stopped. Try again.');
    } finally {
      setBusy(null);
      setProgress(null);
      await refresh();
    }
  };

  /** Create coupons: the first time from the reviewed list, later only the missing ones. */
  const handleIssue = async () => {
    setConfirmOpen(false);
    setBusy('issue');
    try {
      const r = await issuePrizes(data?.fingerprint ?? null);
      toast.success(`${r.created} coupon${r.created === 1 ? '' : 's'} issued. Emailing the winners now.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not issue the prizes. Try again.');
      setBusy(null);
      await refresh();
      return;
    }
    await sendEmails(false);
  };

  const handleRefreshStandings = async () => {
    setBusy('refresh');
    try {
      const r = await refreshStandings();
      if (r.skipped) toast.message('Prizes are issued, so the standings are final.');
      else toast.success(`Leaderboard refreshed: ${r.updated ?? 0} repos read, ${r.unreachable ?? 0} unreachable`);
    } catch {
      // A long refresh outlasts the request, but keeps running on the server.
      toast.message('The refresh is still running. Reload this list in a few minutes.');
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const handleTest = async () => {
    setBusy('test');
    try {
      const r = await sendTestPrizeEmail();
      toast.success(`Test email sent to ${r.sentTo}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the test email.');
    } finally {
      setBusy(null);
    }
  };

  const setExcluded = async (member: { userId: string; name: string }, excluded: boolean) => {
    setBusy(`exclude:${member.userId}`);
    try {
      await setPrizeExclusion(member.userId, excluded);
      toast.success(excluded ? `${member.name} is out of the prizes` : `${member.name} is back in the prizes`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change that. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading prizes" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the prizes</AlertTitle>
        <AlertDescription className="text-sm">
          {error instanceof Error ? error.message : 'Try again in a moment.'}
        </AlertDescription>
      </Alert>
    );
  }

  const movedForLessons = data.movedForLessons ?? [];
  const incomplete = data.incomplete ?? [];
  const warnings = !issued && (
    data.ties.length > 0 || summary.noEmail > 0 || summary.earlyCommits > 0 ||
    data.unreachable.length > 0 || data.inactive.length > 0 ||
    movedForLessons.length > 0 || incomplete.length > 0
  );
  const missingItems = data.missingItems ?? [];
  const canIssue = !issued && data.deadlinePassed && !data.sweepBlocker && missingItems.length === 0 &&
    rows.length > 0 && Boolean(data.fingerprint);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Kiro University prizes</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Ranks 1–{PRIZE_PLACES} on the final leaderboard win a prize, and ranks
            1–{LESSON_GATE_PLACES} go only to builders with at least one of the seven lessons, read
            from their repo as it stood when entries closed. Issuing freezes the
            standings and gives each winner a coupon, by email and in their profile. The coupon
            claims their prize item and nothing else: claims arrive as orders in Store → Orders,
            marked Prize, and add the prize&apos;s points to the winner&apos;s overall points.
          </p>
          {data.standingsAsOf && (
            <p className="mt-1 text-xs text-muted-foreground">
              {issued ? 'Final standings' : 'Standings'} as of {when(data.standingsAsOf)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!issued && data.deadlinePassed && (
            <Button variant="outline" size="sm" onClick={handleRefreshStandings} disabled={busy !== null}>
              {busy === 'refresh'
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Github className="mr-2 h-4 w-4" aria-hidden="true" />}
              {busy === 'refresh' ? 'Refreshing from GitHub…' : 'Refresh from GitHub'}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            Reload list
          </Button>
        </div>
      </div>

      {issued ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile
            value={summary.coupons}
            label="Coupons issued"
            hint={`${when(data.issuedAt)}${data.issuedByName ? ` by ${data.issuedByName}` : ''}`}
          />
          <StatTile
            value={summary.sent}
            label="Emails sent"
            hint={summary.waiting ? `${summary.waiting} still to send` : undefined}
          />
          <StatTile value={summary.failed} label="Emails failed" hint={summary.failed ? 'Retry below' : undefined} />
          <StatTile value={summary.claimed} label="Prizes claimed" hint="Orders in Store → Orders" />
          <StatTile value={summary.coupons - summary.claimed} label="Not claimed yet" />
        </div>
      ) : !data.deadlinePassed ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Entries are still open</AlertTitle>
          <AlertDescription className="text-sm">
            You can issue prizes after {ENTRY_DEADLINE_IST_LABEL}. Until then this list is a preview.
          </AlertDescription>
        </Alert>
      ) : data.sweepBlocker ? (
        <Alert>
          <Github className="h-4 w-4" />
          <AlertTitle>Refresh the leaderboard before issuing</AlertTitle>
          <AlertDescription className="text-sm">{data.sweepBlocker}</AlertDescription>
        </Alert>
      ) : missingItems.length > 0 ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Add these prizes to the store before issuing</AlertTitle>
          <AlertDescription className="text-sm">
            {missingItems.join(', ')}. Winners claim their prize as a store item, so each prize needs
            one with a matching name. Add it in Store → Store Items, then reload this list.
          </AlertDescription>
        </Alert>
      ) : null}

      {issued && summary.missing > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{summary.missing} winners have no coupon yet</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>Issuing stopped part-way. Issue the missing coupons: winners who already have one are not changed.</p>
            <Button size="sm" variant="secondary" onClick={handleIssue} disabled={busy !== null}>
              Issue missing coupons
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {warnings && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Check these before issuing</AlertTitle>
          <AlertDescription className="text-sm">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {data.unreachable.length > 0 && (
                <li>
                  GitHub would not show {data.unreachable.length === 1 ? 'this repo' : 'these repos'} on the
                  last refresh, so {data.unreachable.length === 1 ? 'it is' : 'they are'} not ranked and
                  cannot win:{' '}
                  {data.unreachable.map((u) => `${u.name} (${u.repoFullName})`).join(', ')}. A refresh may
                  bring them back. If a repo is now private or deleted, it stays out.
                </li>
              )}
              {data.ties.map((t) => (
                <li key={t.place}>
                  Ranks {t.place} and {t.place + 1} have the same days and commits. {t.aboveName} is
                  ahead of {t.belowName}{' '}
                  {t.decidedBy === 'lessons' ? 'on lessons.' : 'on member id order, because lessons are tied too.'}
                </li>
              ))}
              {incomplete.length > 0 && (
                <li>
                  The last refresh could only read part of{' '}
                  {incomplete.length === 1 ? 'this repo' : `these ${incomplete.length} repos`}, so their days,
                  commits or lessons may be short:{' '}
                  {incomplete.map((u) => `${u.name} (${u.repoFullName})`).join(', ')}. Refresh from GitHub
                  again before issuing.
                </li>
              )}
              {movedForLessons.length > 0 && (
                <li>
                  {movedForLessons.length === 1 ? 'This builder has' : `These ${movedForLessons.length} builders have`}{' '}
                  no lessons, so they rank below place {LESSON_GATE_PLACES}, lower than days and commits
                  alone would put them:{' '}
                  {movedForLessons.map((m) => `${m.name} (#${m.activityRank} on days and commits, now #${m.boardRank})`).join(', ')}.
                </li>
              )}
              {data.inactive.length > 0 && (
                <li>
                  {data.inactive.length} on the board {data.inactive.length === 1 ? 'has' : 'have'} no active
                  day in the challenge window, so {data.inactive.length === 1 ? 'wins' : 'win'} nothing.
                </li>
              )}
              {summary.noEmail > 0 && (
                <li>
                  {summary.noEmail} {summary.noEmail === 1 ? 'winner has' : 'winners have'} no email address.
                  The coupon still appears in their profile.
                </li>
              )}
              {summary.earlyCommits > 0 && (
                <li>
                  {summary.earlyCommits} {summary.earlyCommits === 1 ? 'winner has' : 'winners have'} commits
                  from before the challenge window, marked below. Kiro&apos;s terms disqualify these
                  entries: exclude anyone who should not win.
                </li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prizes and store stock</CardTitle>
          <CardDescription>
            The store item each prize is claimed as. {issued
              ? 'Fixed when the coupons were issued.'
              : 'Fixed when you issue the coupons, so rename or add items before then.'} Claiming takes
            one from stock, and a claim still goes through when stock runs out, so keep it topped up.
            Anyone with enough points can also buy these items.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stock.map(({ tier, winners, needed, item, problems }) => (
            <div
              key={tier.id}
              className={`rounded-lg border p-3 text-sm ${
                problems.length ? 'border-amber-500/50 bg-amber-500/5' : 'border-border/60 bg-muted/30'
              }`}
            >
              <p className="font-medium">
                <span aria-hidden="true">{tier.emoji}</span> {tier.item}
              </p>
              <p className="text-xs text-muted-foreground">
                Ranks {tier.from}–{tier.upTo} · {winners} {winners === 1 ? 'winner' : 'winners'}
                {issued ? `, ${needed} still to claim` : ''} · adds {tier.points.toLocaleString()} points
              </p>
              {item?.itemId && (
                <p className="mt-1 text-xs">
                  Claimed as: {item.itemName},{' '}
                  {!item.inStock ? 'out of stock' : item.quantity !== null ? `${item.quantity} in stock` : 'in stock'}
                </p>
              )}
              {problems.map((p) => (
                <p key={p} className="mt-1 flex gap-1 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                  {p}
                </p>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={handleTest} disabled={busy !== null}>
          {busy === 'test'
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Mail className="mr-2 h-4 w-4" aria-hidden="true" />}
          Send me a test email
        </Button>
        {!issued ? (
          <Button onClick={() => setConfirmOpen(true)} disabled={busy !== null || !canIssue || isFetching}>
            {busy === 'issue' || busy === 'email'
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Gift className="mr-2 h-4 w-4" aria-hidden="true" />}
            Issue {rows.length} coupons and email winners
          </Button>
        ) : (
          <>
            {summary.waiting > 0 && (
              <Button onClick={() => sendEmails(false)} disabled={busy !== null}>
                {busy === 'email'
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
                Send {summary.waiting} remaining {summary.waiting === 1 ? 'email' : 'emails'}
              </Button>
            )}
            {summary.failed > 0 && (
              <Button variant="outline" onClick={() => sendEmails(true)} disabled={busy !== null}>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                Retry {summary.failed} failed
              </Button>
            )}
          </>
        )}
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {busy === 'email' && progress
            ? `Sending: ${progress.sent} sent, ${progress.failed} failed, ${progress.remaining} to go`
            : busy === 'issue' ? 'Issuing coupons…' : ''}
        </p>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">{issued ? 'Winners' : 'Winners if you issue now'}</CardTitle>
            <CardDescription>
              {issued ? 'Frozen when the coupons were issued' : 'From the current leaderboard'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">Nobody is on the leaderboard yet.</p>
          ) : (
            <div
              className="max-h-[65vh] overflow-auto rounded-b-lg border-t border-border/60"
              role="region"
              aria-label="Prize winners table"
              tabIndex={0}
            >
              <table className="w-full min-w-[64rem] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${STICKY_HEAD} pl-6`}>Rank</TableHead>
                    <TableHead className={STICKY_HEAD}>Builder</TableHead>
                    <TableHead className={STICKY_HEAD}>Prize</TableHead>
                    <TableHead className={`${STICKY_HEAD} text-right`}>Days</TableHead>
                    <TableHead className={`${STICKY_HEAD} text-right`}>Commits</TableHead>
                    <TableHead className={`${STICKY_HEAD} text-right`}>Lessons</TableHead>
                    {issued ? (
                      <>
                        <TableHead className={STICKY_HEAD}>Coupon</TableHead>
                        <TableHead className={`${STICKY_HEAD} pr-6`}>Email</TableHead>
                      </>
                    ) : (
                      <TableHead className={`${STICKY_HEAD} pr-6 text-right`}>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const tier = prizeTierById(row.tier);
                    const c = row.coupon;
                    return (
                      <TableRow key={row.userId}>
                        <TableCell className="pl-6 py-3 font-semibold tabular-nums">
                          #{row.place}
                          {row.boardRank !== row.place && (
                            <p className="text-xs font-normal text-muted-foreground">board #{row.boardRank}</p>
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <p className="font-medium">{row.name}</p>
                          {row.email
                            ? <p className="text-xs text-muted-foreground">{row.email}</p>
                            : <p className="text-xs text-amber-700 dark:text-amber-400">No email address</p>}
                          {row.stage && <p className="text-xs text-muted-foreground">{STAGE_LABEL[row.stage]}</p>}
                          {row.repoEligible === false && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">Commits from before the window</p>
                          )}
                        </TableCell>
                        <TableCell className="py-3 whitespace-nowrap">
                          <span aria-hidden="true">{tier?.emoji}</span> {tier?.item ?? row.tier}
                          <span className="text-xs text-muted-foreground"> · {tier?.points.toLocaleString()} pts</span>
                        </TableCell>
                        <TableCell className="py-3 text-right font-semibold tabular-nums">{row.activeDays}</TableCell>
                        <TableCell className="py-3 text-right tabular-nums text-muted-foreground">{row.commitCount}</TableCell>
                        <TableCell className="py-3 text-right tabular-nums">
                          {row.lessonsDone}/7{row.bonusLessonsDone ? ` +${row.bonusLessonsDone}` : ''}
                        </TableCell>
                        {issued ? (
                          <>
                            <TableCell className="py-3">
                              {c ? (
                                <div className="space-y-1">
                                  <code className="font-mono text-xs">{c.code}</code>
                                  <div><ClaimState row={row} claim={claims.get(row.userId)} /></div>
                                </div>
                              ) : (
                                <span className="text-xs text-destructive">Not issued</span>
                              )}
                            </TableCell>
                            <TableCell className="py-3 pr-6">{c && <EmailState coupon={c} />}</TableCell>
                          </>
                        ) : (
                          <TableCell className="py-3 pr-6 text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setExcluded(row, true)}
                              disabled={busy !== null}
                              aria-label={`Exclude ${row.name} from prizes`}
                            >
                              {busy === `exclude:${row.userId}`
                                ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                                : <UserMinus className="mr-1.5 h-4 w-4" aria-hidden="true" />}
                              Exclude
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!issued && data.excluded.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Excluded from prizes</CardTitle>
            <CardDescription>
              They keep their leaderboard rank but get no prize. Everyone below them moves up one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.excluded.map((e) => (
              <div
                key={e.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{e.name}</span>
                  <span className="text-muted-foreground"> · board #{e.boardRank}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setExcluded(e, false)} disabled={busy !== null}>
                  {busy === `exclude:${e.userId}` && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Include again
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Issue prizes to {rows.length} winners?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  This freezes the final standings and the leaderboard, as of{' '}
                  {when(data.standingsAsOf) || 'the last refresh'}. Each winner gets a coupon worth their
                  prize&apos;s points, by email and in their profile. Nobody&apos;s prize can be changed afterwards.
                </p>
                {data.unreachable.length > 0 && (
                  <p className="font-medium text-amber-700 dark:text-amber-400">
                    {data.unreachable.length} {data.unreachable.length === 1 ? 'repo was' : 'repos were'} unreachable
                    on the last refresh and will not win.
                  </p>
                )}
                <p>If the list has changed since you loaded it, nothing is issued and you see the new list.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleIssue}>Issue and email winners</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
