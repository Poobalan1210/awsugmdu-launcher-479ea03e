import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ExternalLink, Loader2, RefreshCw, Search } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getCampaignAdminParticipants, type AdminParticipant, type ParticipantStage } from '@/lib/campaign';

const STAGES: Record<ParticipantStage, { label: string; rank: number; cls: string }> = {
  validated: { label: 'Validated', rank: 5, cls: 'bg-green-600 text-white hover:bg-green-600 border-transparent' },
  submitted: { label: 'Submitted', rank: 4, cls: 'bg-primary text-primary-foreground border-transparent hover:bg-primary' },
  building: { label: 'Building', rank: 3, cls: 'bg-secondary text-secondary-foreground border-transparent hover:bg-secondary' },
  'setup-stopped': { label: 'Setup stopped', rank: 2, cls: 'border-amber-500/60 text-amber-600 dark:text-amber-400 bg-transparent hover:bg-transparent' },
  'command-generated': { label: 'Command generated', rank: 1, cls: 'bg-transparent text-foreground hover:bg-transparent' },
  'not-started': { label: 'Not started', rank: 0, cls: 'bg-transparent text-muted-foreground hover:bg-transparent' },
};

type TypeFilter = 'all' | 'student' | 'professional' | 'none';

/** Today's date in IST, as YYYY-MM-DD, to match lastActiveDay. */
function istDay(offsetDays = 0): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

const shortDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM');
  } catch {
    return '—';
  }
};

// What the table shows for each column, as text. The row renders from these
// and search matches against them, so anything you can see you can search for.
const typeLabel = (p: AdminParticipant) =>
  !p.profile ? 'No profile'
    : p.profile.type === 'student' ? 'Student'
      : p.profile.type === 'professional' ? 'Professional'
        : 'Not set';
const placeLabel = (p: AdminParticipant) => [p.profile?.city, p.profile?.country].filter(Boolean).join(', ');
const isBuilding = (p: AdminParticipant) => STAGES[p.stage].rank >= STAGES.building.rank;

function searchText(p: AdminParticipant): string {
  const building = isBuilding(p);
  return [
    p.name || 'Unnamed member',
    p.repoFullName,
    typeLabel(p),
    p.profile?.organisation,
    p.profile?.designation,
    placeLabel(p),
    STAGES[p.stage].label,
    p.repoUnreachable && 'Repo not reachable',
    // Cell values only, not column names, so "joined" doesn't match every row.
    // Dates also go in as YYYY-MM-DD.
    building && String(p.activeDays),
    building && p.lastActiveDay && `last ${shortDate(p.lastActiveDay)} ${p.lastActiveDay}`,
    building && `${p.lessonsDone}/7`,
    `${shortDate(p.joinedAt)} ${p.joinedAt?.slice(0, 10) ?? ''}`,
  ]
    .filter(Boolean)
    .join(' \u0001 ') // a separator no search term contains, so terms can't match across columns
    .toLowerCase();
}

// Header cells stay in view while the table scrolls. The line under them is a
// shadow, because a border on a sticky cell stays behind in a collapsed table.
const STICKY_HEAD = 'sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]';

function StatTile({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-sm font-medium">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Admin view of the Kiro University build-along: where every participant is
 * in the challenge, and from their profile, where they are from.
 */
export default function KiroUniversityTab() {
  const { data = [], isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['admin-kiro-participants'],
    queryFn: getCampaignAdminParticipants,
    staleTime: 60_000,
  });

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [stageFilter, setStageFilter] = useState<'all' | ParticipantStage>('all');

  const summary = useMemo(() => {
    const recentFrom = istDay(-2); // today and the two days before
    const students = data.filter((p) => p.profile?.type === 'student');
    const pros = data.filter((p) => p.profile?.type === 'professional');
    const building = data.filter((p) => STAGES[p.stage].rank >= STAGES.building.rank);
    return {
      total: data.length,
      building: building.length,
      activeRecently: building.filter((p) => p.lastActiveDay && p.lastActiveDay >= recentFrom).length,
      students: students.length,
      professionals: pros.length,
      noProfile: data.length - students.length - pros.length,
    };
  }, [data]);

  const searchIndex = useMemo(() => new Map(data.map((p) => [p.userId, searchText(p)])), [data]);

  const rows = useMemo(() => {
    // Every word has to appear somewhere in the row, in any column, so
    // "student madurai" finds students in Madurai.
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return data
      .filter((p) => {
        const type = p.profile?.type ?? null;
        if (typeFilter === 'none' ? type !== null : typeFilter !== 'all' && type !== typeFilter) return false;
        if (stageFilter !== 'all' && p.stage !== stageFilter) return false;
        const text = searchIndex.get(p.userId) ?? '';
        return terms.every((t) => text.includes(t));
      })
      .sort(
        (a, b) =>
          STAGES[b.stage].rank - STAGES[a.stage].rank ||
          b.activeDays - a.activeDays ||
          b.lessonsDone - a.lessonsDone ||
          a.name.localeCompare(b.name),
      );
  }, [data, searchIndex, query, typeFilter, stageFilter]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading builders" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Could not load the builders</AlertTitle>
        <AlertDescription className="text-sm">
          {error instanceof Error ? error.message : 'Try again in a moment.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Kiro University builders</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Where each builder is in the challenge, and where they&apos;re from. Progress comes
            from the GitHub check every 6 hours; college and company come from each member&apos;s
            own profile.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={summary.total} label="Joined" />
        <StatTile
          value={summary.building}
          label="Building"
          hint={`Repo linked. ${summary.activeRecently} committed in the last 3 days`}
        />
        <StatTile value={summary.students} label="Students" />
        <StatTile
          value={summary.professionals}
          label="Working professionals"
          hint={summary.noProfile ? `${summary.noProfile} without a profile` : undefined}
        />
      </div>

      <Card className="glass-card">
        <CardHeader className="space-y-4 pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Builders</CardTitle>
            <CardDescription>
              Showing {rows.length} of {data.length}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search every column, e.g. student madurai"
                aria-label="Search builders in every column"
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="w-[11rem]" aria-label="Filter by student or professional">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="student">Students</SelectItem>
                <SelectItem value="professional">Professionals</SelectItem>
                <SelectItem value="none">No profile</SelectItem>
              </SelectContent>
            </Select>
            <Select value={stageFilter} onValueChange={(v) => setStageFilter(v as 'all' | ParticipantStage)}>
              <SelectTrigger className="w-[11rem]" aria-label="Filter by stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {(Object.keys(STAGES) as ParticipantStage[]).map((s) => (
                  <SelectItem key={s} value={s}>{STAGES[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {rows.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">No builders match these filters.</p>
          ) : (
            // Scrolls both ways inside the card, with the header pinned. A plain
            // <table> rather than the ui Table, whose own overflow wrapper
            // would stop the header sticking. Focusable so the keyboard can
            // scroll it.
            <div
              className="max-h-[65vh] overflow-auto rounded-b-lg border-t border-border/60"
              role="region"
              aria-label="Builders table"
              tabIndex={0}
            >
              <table className="w-full min-w-[56rem] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={`${STICKY_HEAD} pl-6`}>Builder</TableHead>
                    <TableHead className={STICKY_HEAD}>From</TableHead>
                    <TableHead className={STICKY_HEAD}>City</TableHead>
                    <TableHead className={STICKY_HEAD}>Stage</TableHead>
                    <TableHead className={`${STICKY_HEAD} text-right`}>Active days</TableHead>
                    <TableHead className={`${STICKY_HEAD} text-right`}>Lessons</TableHead>
                    <TableHead className={`${STICKY_HEAD} pr-6 text-right`}>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <BuilderRow key={p.userId} p={p} />
                  ))}
                </TableBody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BuilderRow({ p }: { p: AdminParticipant }) {
  const stage = STAGES[p.stage];
  const building = isBuilding(p);
  const place = placeLabel(p);

  return (
    <TableRow>
      <TableCell className="pl-6 py-3">
        <p className="font-medium">{p.name || 'Unnamed member'}</p>
        {p.repoUrl && (
          <a
            href={p.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-[16rem] items-center gap-1 truncate text-xs text-primary hover:underline"
          >
            {p.repoFullName}
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </TableCell>
      <TableCell className="py-3">
        {!p.profile ? (
          <span className="text-sm text-muted-foreground">No profile</span>
        ) : (
          <>
            <p className="text-sm">
              <span className="text-muted-foreground">{typeLabel(p)}</span>
              {p.profile.organisation && <> · <span className="font-medium">{p.profile.organisation}</span></>}
            </p>
            {p.profile.designation && <p className="text-xs text-muted-foreground">{p.profile.designation}</p>}
          </>
        )}
      </TableCell>
      <TableCell className="py-3 text-sm">{place || <span className="text-muted-foreground">—</span>}</TableCell>
      <TableCell className="py-3">
        <Badge variant="outline" className={`whitespace-nowrap ${stage.cls}`}>{stage.label}</Badge>
        {p.repoUnreachable && <p className="mt-1 text-xs text-destructive">Repo not reachable</p>}
      </TableCell>
      <TableCell className="py-3 text-right">
        {building ? (
          <>
            <p className="font-semibold tabular-nums">{p.activeDays}</p>
            {p.lastActiveDay && <p className="text-xs text-muted-foreground">last {shortDate(p.lastActiveDay)}</p>}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="py-3 text-right tabular-nums">
        {building ? `${p.lessonsDone}/7` : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="py-3 pr-6 text-right text-sm tabular-nums">{shortDate(p.joinedAt)}</TableCell>
    </TableRow>
  );
}
