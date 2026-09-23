import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  GraduationCap, Clock, Trophy, Terminal, Copy, Check, ExternalLink, Github,
  ShieldAlert, Loader2, LogIn, Sparkles, GitCommit, CircleCheck, CircleDashed,
  KeyRound, AlertTriangle, ArrowRight, ClipboardList, ChevronDown, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  BASE_REWARD_BLURB, COMPLETION_AWARD_CREDITS, ENTRY_DEADLINE_IST_LABEL, ENTRY_FORM_URL,
  KIRO_ARTIFACTS, LESSONS, MAX_CREDITS, PLATFORM_LABEL, REWARD_TIERS,
  SUBMISSION_REQUIREMENTS, TERMS_URL, artifactGaps, detectPlatform,
  getCampaignLeaderboard, getCampaignStats, getMyCampaign, joinCampaign,
  lessonsWithEvidence, mintSetupCode, requirementStatus, rotateKironomicsKey, setLessons,
  setupCommand, slotsRemaining, socialPostTemplate, tierForPosition, timeLeftToDeadline,
  type Platform, type RepoStats, type RequirementStatus,
} from '@/lib/campaign';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(label ? `${label} copied` : 'Copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — select the text manually');
    }
  };
  return (
    <div className="relative group">
      <pre className="rounded-lg bg-muted/60 border border-border/60 p-4 pr-12 text-xs sm:text-sm overflow-x-auto font-mono leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        onClick={copy}
        aria-label={label ? `Copy ${label}` : 'Copy to clipboard'}
        className="absolute top-2 right-2 h-8 w-8"
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function DeadlineStrip() {
  const [left, setLeft] = useState(() => timeLeftToDeadline());
  useEffect(() => {
    const t = setInterval(() => setLeft(timeLeftToDeadline()), 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full border border-border/60 bg-card/70 backdrop-blur px-4 py-2 text-sm">
      <Clock className="h-4 w-4 text-primary shrink-0" />
      {left.passed ? (
        <span className="font-medium">Entries have closed</span>
      ) : (
        <>
          <span className="font-semibold tabular-nums">
            {left.days}d {left.hours}h {left.minutes}m
          </span>
          <span className="text-muted-foreground">left —</span>
          <span className="font-medium">{ENTRY_DEADLINE_IST_LABEL}</span>
        </>
      )}
    </div>
  );
}

function RewardTiers({ validatedCount }: { validatedCount: number }) {
  const rows = useMemo(() => slotsRemaining(validatedCount), [validatedCount]);
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {rows.map(({ tier, size, left }, i) => (
        <motion.div
          key={tier.id}
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: i * 0.06 }}
        >
          <Card className={`h-full glass-card bg-gradient-to-br ${tier.accent}`}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{tier.name}</CardTitle>
                <Badge variant={left > 0 ? 'default' : 'secondary'} className="shrink-0">
                  {left > 0 ? `${left} left` : 'full'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{tier.blurb}</p>
              <Progress value={((size - left) / size) * 100} className="h-1.5" />
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function SetupSection({
  code, minting, onMint, projectName, setProjectName, bare = false,
}: {
  code: string;
  minting: boolean;
  onMint: () => void;
  projectName: string;
  setProjectName: (v: string) => void;
  /** Render without the Card shell, for embedding inside another card. */
  bare?: boolean;
}) {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  const Shell = bare ? 'div' : Card;
  const Body = bare ? 'div' : CardContent;

  return (
    <Shell className={bare ? '' : 'glass-card'}>
      {!bare && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5 text-primary" />
            One command sets everything up
          </CardTitle>
          <CardDescription>
            Creates your project, installs Kironomics, and registers your repo so your
            progress is tracked. You will not need to paste anything back here.
          </CardDescription>
        </CardHeader>
      )}
      <Body className="space-y-5">
        <div className="grid gap-2 sm:max-w-sm">
          <Label htmlFor="projectName">Project folder name</Label>
          <Input
            id="projectName"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="my-kiro-project"
          />
          <p className="text-xs text-muted-foreground">
            Pick something a reviewer will understand. You can rename it later.
          </p>
        </div>

        {!code ? (
          <Button onClick={onMint} disabled={minting}>
            {minting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
            {minting ? 'Generating…' : 'Generate my setup command'}
          </Button>
        ) : (
          <Tabs value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
            <TabsList>
              {(['macos', 'linux', 'windows'] as Platform[]).map((p) => (
                <TabsTrigger key={p} value={p}>{PLATFORM_LABEL[p]}</TabsTrigger>
              ))}
            </TabsList>
            {(['macos', 'linux', 'windows'] as Platform[]).map((p) => (
              <TabsContent key={p} value={p} className="mt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Run this from the folder where you keep your projects.
                  {p === 'windows' && ' PowerShell blocks unsigned downloaded scripts by default, which is why the policy flag is there.'}
                </p>
                <CopyBlock code={setupCommand(p, code, projectName)} label="Command" />
              </TabsContent>
            ))}
          </Tabs>
        )}

        {code && (
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>This code is single-use and expires shortly</AlertTitle>
            <AlertDescription className="text-sm">
              It is not your API key. The script exchanges it for your key and writes that
              outside your project, so the key can never be committed to a public repo.
            </AlertDescription>
          </Alert>
        )}

        <Separator />
        <p className="text-sm text-muted-foreground">
          Requires <span className="font-mono text-xs">git</span>,{' '}
          <span className="font-mono text-xs">python3</span> and the{' '}
          <a href="https://cli.github.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
            GitHub CLI
          </a>
          . After it finishes, reload Kiro so the hooks register.
        </p>
      </Body>
    </Shell>
  );
}

/**
 * The flow, in three steps.
 *
 * This was the missing piece: the page listed rewards and requirements but never
 * said what taking part actually involves. "Two checkboxes, one command, then
 * build" is the thing that converts someone who is on the fence.
 */
function HowItWorks({ onJoin, joined }: { onJoin: () => void; joined: boolean }) {
  const steps = [
    {
      icon: CircleCheck,
      title: 'Join',
      time: '30 seconds',
      body: 'Confirm you are 18 or over. That is the whole form — we pick up your GitHub account and repo automatically.',
    },
    {
      icon: Terminal,
      title: 'Run one command',
      time: '2 minutes',
      body: 'Creates your project, installs Kironomics tracking, and links your repo. Built so your repo cannot fail the no-prior-commits rule.',
    },
    {
      icon: Rocket,
      title: 'Build, then submit',
      time: 'until 6 Oct',
      body: 'Commit as you go — we track it. Submit your entry on kiro.dev and your community reward unlocks.',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.08 }}
              className="relative"
            >
              <Card className="h-full glass-card">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        {s.title}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.time}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
      {!joined && (
        <Button size="lg" onClick={onJoin}>
          Start step 1
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      )}
    </div>
  );
}

const REQ_STATUS_STYLE: Record<RequirementStatus, { icon: typeof CircleCheck; cls: string; note: string }> = {
  verified: { icon: CircleCheck, cls: 'text-green-600', note: 'Checked for you' },
  blocked: { icon: ShieldAlert, cls: 'text-destructive', note: 'Needs fixing' },
  confirm: { icon: CircleDashed, cls: 'text-muted-foreground', note: 'You confirm' },
  unknown: { icon: CircleDashed, cls: 'text-muted-foreground/60', note: 'Link a repo first' },
};

/**
 * What Kiro's entry form and terms require.
 *
 * Statuses are honest about provenance: three are derived from the repo sweep,
 * the rest only the participant can confirm. A green tick we have not actually
 * verified would be worse than no tick, because they would stop checking.
 */
function SubmissionRequirements({
  repo, bare = false,
}: {
  repo?: RepoStats | null;
  /** Render without the Card shell, for embedding inside another card. */
  bare?: boolean;
}) {
  const blocked = SUBMISSION_REQUIREMENTS.filter(
    (r) => requirementStatus(r.id, repo) === 'blocked',
  );

  const Shell = bare ? 'div' : Card;
  const Body = bare ? 'div' : CardContent;

  return (
    <Shell className={bare ? '' : 'glass-card'}>
      {!bare && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="h-5 w-5 text-primary" />
            What you need to submit
          </CardTitle>
          <CardDescription>
            Kiro&apos;s requirements, not ours. Several of these appear only in{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              the terms
            </a>{' '}
            rather than on their landing page, which is why they get missed.
          </CardDescription>
        </CardHeader>
      )}
      <Body className={bare ? 'p-6 space-y-4' : 'space-y-4'}>
        {blocked.length > 0 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>
              {blocked.length === 1
                ? 'One requirement would disqualify your entry'
                : `${blocked.length} requirements would disqualify your entry`}
            </AlertTitle>
            <AlertDescription className="text-sm">
              {blocked.map((b) => b.label).join('; ')}. Fix before submitting.
            </AlertDescription>
          </Alert>
        )}

        <ul className="divide-y divide-border/60">
          {SUBMISSION_REQUIREMENTS.map((r) => {
            const status = requirementStatus(r.id, repo);
            const s = REQ_STATUS_STYLE[status];
            const Icon = s.icon;
            return (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${s.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{r.label}</p>
                    <Badge
                      variant={status === 'verified' ? 'secondary' : 'outline'}
                      className="text-[10px] px-1.5 py-0 shrink-0"
                    >
                      {s.note}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{r.detail}</p>

                  {/* What is actually in .kiro/ belongs to this requirement
                      rather than a separate card — it is the detail of "is the
                      folder committed", and reviewers score exactly this. */}
                  {r.id === 'kiro_folder' && repo?.fullName && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={(artifactGaps(repo.artifacts).found.length / KIRO_ARTIFACTS.length) * 100}
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {artifactGaps(repo.artifacts).found.length}/{KIRO_ARTIFACTS.length}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {KIRO_ARTIFACTS.map((a) => {
                          const present = Boolean(repo.artifacts?.[a.key]);
                          return (
                            <span
                              key={a.key}
                              title={present ? `${a.label} committed` : a.hint}
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                                present
                                  ? 'border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400'
                                  : 'border-border bg-muted/50 text-muted-foreground'
                              }`}
                            >
                              {present
                                ? <Check className="h-3 w-3" />
                                : <CircleDashed className="h-3 w-3" />}
                              {a.label}
                            </span>
                          );
                        })}
                      </div>
                      {artifactGaps(repo.artifacts).missing.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Each one you add and commit is more of the rubric covered. Hover a
                          greyed item to see what it is.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Your social post, ready to paste</p>
          <p className="text-xs text-muted-foreground">
            The tags and both hashtags are required. Missing one is a listed reason for
            disqualification, so start from this rather than writing it from memory.
          </p>
          <CopyBlock code={socialPostTemplate(repo?.repoUrl)} label="Post template" />
        </div>

        <Button asChild className="w-full sm:w-auto">
          <a href={ENTRY_FORM_URL} target="_blank" rel="noopener noreferrer">
            Open Kiro&apos;s entry form
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          You submit this yourself — one entry per person, to your own email, because that is
          where Kiro sends credits. Due {ENTRY_DEADLINE_IST_LABEL}.
        </p>
      </Body>
    </Shell>
  );
}

/**
 * Where you stand, as numbers rather than a second list of ticks.
 *
 * The submission requirements section is the one checklist on this page. This
 * shows the things that are measurements, not pass/fail: how much you have
 * built, and whether tracking is running.
 */
function ProgressStrip({
  repo, kironomicsConnected,
}: {
  repo?: RepoStats | null;
  kironomicsConnected: boolean;
}) {
  const tiles = [
    { label: 'Active days', value: repo?.activeDays ?? 0, hint: 'Distinct days you committed, in IST' },
    { label: 'Commits', value: repo?.commitCount ?? 0, hint: 'Inside the challenge window only' },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Your progress</CardTitle>
          {repo?.repoUrl ? (
            <a
              href={repo.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Github className="h-3.5 w-3.5" />
              {repo.fullName}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">No repo linked yet</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!repo?.fullName ? (
          <p className="text-sm text-muted-foreground">
            Run the setup command below. It creates your project, starts tracking, and links
            the repo — nothing to paste back here.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
                  <p className="text-xs font-medium mt-0.5">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{t.hint}</p>
                </div>
              ))}
            </div>
            {repo.unreachable && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>We could not reach your repo</AlertTitle>
                <AlertDescription className="text-sm">
                  It may have been renamed, deleted or made private. It must be public to be
                  judged.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        <div className="flex items-center gap-2 text-sm">
          {kironomicsConnected
            ? <CircleCheck className="h-4 w-4 text-green-600 shrink-0" />
            : <CircleDashed className="h-4 w-4 text-muted-foreground shrink-0" />}
          <span className={kironomicsConnected ? '' : 'text-muted-foreground'}>
            {kironomicsConnected
              ? 'Kironomics is counting your Kiro sessions'
              : 'Kironomics not connected — the setup command handles it, then reload Kiro'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function KiroUniversity() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [consent, setConsent] = useState(false);
  const [joining, setJoining] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [minting, setMinting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotatedKey, setRotatedKey] = useState('');
  const [savingLessons, setSavingLessons] = useState(false);

  const { data: me, refetch: refetchMe } = useQuery({
    queryKey: ['campaign-me', user?.id],
    queryFn: getMyCampaign,
    enabled: isAuthenticated,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['campaign-leaderboard'],
    queryFn: getCampaignLeaderboard,
  });

  const { data: stats = { validatedCount: 0, joinedCount: 0, withRepoCount: 0 } } = useQuery({
    queryKey: ['campaign-stats'],
    queryFn: getCampaignStats,
  });

  const joined = Boolean(me);

  // "Set up" means the command has actually done its job: a repo is registered
  // and Kironomics is reporting. Until both are true the command is the only
  // thing that matters; once they are, it should get out of the way.
  const isSetUp = Boolean(me?.repo?.fullName) && Boolean(me?.kironomicsConnected);

  // The hero's primary button jumps to whatever the next real action is: the
  // join form when they have not joined, their status board when they have.
  const actionRef = useRef<HTMLElement>(null);
  const scrollToAction = () =>
    actionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const myTier = tierForPosition(me?.validatedPosition);

  const handleJoin = async () => {
    if (!ageConfirmed) {
      toast.error('Kiro requires participants to be 18 or over.');
      return;
    }
    setJoining(true);
    try {
      await joinCampaign({ ageConfirmed, consentToShowcase: consent, projectName });
      toast.success("You're in. Next: run the setup command.");
      await refetchMe();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join — try again');
    } finally {
      setJoining(false);
    }
  };

  const handleMint = async () => {
    setMinting(true);
    try {
      const { code } = await mintSetupCode();
      setSetupCode(code);
    } catch {
      toast.error('Could not generate a setup code. The campaign API may not be live yet.');
    } finally {
      setMinting(false);
    }
  };

  // Lessons we have file evidence for that are not ticked yet. The mapping from
  // artifact to lesson number is still provisional, so this offers rather than
  // asserts — the participant confirms with one click.
  const evidenceToApply = useMemo(() => {
    const already = new Set(me?.lessonsRecorded ?? []);
    return lessonsWithEvidence(me?.repo?.artifacts).filter((id) => !already.has(id));
  }, [me?.lessonsRecorded, me?.repo?.artifacts]);

  const saveLessons = async (next: Set<string>) => {
    setSavingLessons(true);
    try {
      await setLessons([...next]);
      await refetchMe();
    } catch {
      toast.error('Could not save that — try again');
    } finally {
      setSavingLessons(false);
    }
  };

  const applyDetected = async () => {
    const next = new Set([...(me?.lessonsRecorded ?? []), ...evidenceToApply]);
    await saveLessons(next);
  };

  const toggleLesson = async (id: string, next: boolean) => {
    // Send only what was ticked here. The backend unions this with the manifest
    // in their repo, so unticking cannot silently erase a manifest entry —
    // it will reappear on the next sweep, which is the honest behaviour.
    const current = new Set(me?.lessonsRecorded ?? []);
    next ? current.add(id) : current.delete(id);
    // Sends the complete desired set. The server treats anything the repo
    // manifest claims but this omits as a deliberate removal, so unticking
    // sticks instead of reappearing on the next sweep.
    await saveLessons(current);
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const { apiKey } = await rotateKironomicsKey();
      setRotatedKey(apiKey);
      toast.success('Key rotated. Update it on your machine.');
      await refetchMe();
    } catch {
      toast.error('Could not rotate the key — try again');
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero — leads with the reward, the deadline and one action. Everything
            else on the page is secondary to those three facts. */}
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          <div className="container relative mx-auto px-4 py-14 sm:py-20">
            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.4 }}>
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide">
                  <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  Live now
                </span>
                <DeadlineStrip />
              </div>

              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
                Build one project.{' '}
                <span className="gradient-text">Earn up to {MAX_CREDITS.toLocaleString()} Kiro credits.</span>
              </h1>

              <p className="mt-4 text-muted-foreground max-w-2xl text-base sm:text-lg">
                Kiro University is Kiro&apos;s own challenge. We run it together — one command sets
                you up, we track your progress, and community swag is on top of whatever Kiro awards.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {joined ? (
                  <Button size="lg" onClick={scrollToAction}>
                    Go to my progress
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                ) : (
                  <Button size="lg" onClick={scrollToAction}>
                    {isAuthenticated ? 'Join the build-along' : 'Sign in and join'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                )}
                <Button size="lg" variant="outline" asChild>
                  <a href={ENTRY_FORM_URL} target="_blank" rel="noopener noreferrer">
                    Kiro&apos;s official page
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </a>
                </Button>
              </div>

              <dl className="mt-9 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  { k: 'Max credits', v: MAX_CREDITS.toLocaleString(), s: 'from Kiro, per person' },
                  { k: 'Entries close', v: '6 Oct', s: '12:29 PM IST' },
                  { k: 'Builders joined', v: stats.joinedCount.toLocaleString(), s: 'from our community' },
                ].map((x) => (
                  <div key={x.k}>
                    <dd className="text-2xl font-bold tabular-nums">{x.v}</dd>
                    <dt className="text-sm font-medium">{x.k}</dt>
                    <dd className="text-xs text-muted-foreground">{x.s}</dd>
                  </div>
                ))}
              </dl>

              <p className="mt-8 text-xs text-muted-foreground max-w-2xl">
                Kiro awards the credits, not us — you submit your own entry on kiro.dev. This page
                tracks your community participation and rewards.
              </p>
            </motion.div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-12 space-y-12">
          {/* A newcomer and a participant need opposite things first, so the
              order is state-dependent rather than fixed:
                not joined -> how it works, what you earn, then join
                joined     -> status and next action first, marketing gone */}
          {!joined && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">How it works</h2>
              </div>
              <HowItWorks onJoin={scrollToAction} joined={joined} />
            </section>
          )}

          {!joined && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">What you earn from us</h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                On top of Kiro&apos;s credits. Tiers go by validated position, not submission
                time, so they reflect finished work. Everyone with a valid entry earns{' '}
                {BASE_REWARD_BLURB.toLowerCase()}
              </p>
              <RewardTiers validatedCount={stats.validatedCount} />
            </section>
          )}

          {/* Join / dashboard */}
          <section ref={actionRef} className="space-y-5 scroll-mt-20">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">
                {joined ? 'Your progress' : 'Join the build-along'}
              </h2>
            </div>

            {isLoading ? (
              <Card className="glass-card">
                <CardContent className="py-12 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : !isAuthenticated ? (
              <Card className="glass-card">
                <CardContent className="py-10 text-center space-y-4">
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Sign in with your AWS User Group Madurai account to join, get your setup
                    command and appear on the leaderboard.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button asChild>
                      <Link to="/login?redirect=%2Fkiro">
                        <LogIn className="h-4 w-4 mr-2" /> Sign in
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/signup?redirect=%2Fkiro">Create an account</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : !joined ? (
              <Card className="glass-card max-w-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Two things to confirm</CardTitle>
                  <CardDescription>
                    That is all we need. Your GitHub account and repo are picked up
                    automatically by the setup command.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="age"
                      checked={ageConfirmed}
                      onCheckedChange={(v) => setAgeConfirmed(v === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="age" className="text-sm font-normal leading-relaxed cursor-pointer">
                      I am 18 or over.{' '}
                      <span className="text-muted-foreground">
                        Required by Kiro&apos;s terms to receive credits.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="consent"
                      checked={consent}
                      onCheckedChange={(v) => setConsent(v === true)}
                      className="mt-0.5"
                    />
                    <Label htmlFor="consent" className="text-sm font-normal leading-relaxed cursor-pointer">
                      You can feature my project in the showcase and community blog.
                    </Label>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Not 18, or GitHub account under 3 months old?</AlertTitle>
                    <AlertDescription className="text-sm">
                      You can still join, build, appear on the leaderboard and earn every
                      community reward. Only Kiro&apos;s credits are out of reach — their
                      terms, not ours.
                    </AlertDescription>
                  </Alert>

                  <Button onClick={handleJoin} disabled={joining || !ageConfirmed}>
                    {joining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Join the build-along
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3 space-y-6">
                  {me?.kironomicsKeyExposed && (
                    <Alert variant="destructive">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertTitle>Your Kironomics key is public</AlertTitle>
                      <AlertDescription className="space-y-3 text-sm">
                        <p>
                          We found the old reporter script committed in your public repo. Older
                          setups stored the key in plain text inside it. Rotate now — the old key
                          keeps working until you do.
                        </p>
                        <Button size="sm" variant="secondary" onClick={handleRotate} disabled={rotating}>
                          {rotating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
                          Rotate my key
                        </Button>
                        {rotatedKey && <CopyBlock code={rotatedKey} label="New key" />}
                      </AlertDescription>
                    </Alert>
                  )}

                  <ProgressStrip
                    repo={me?.repo}
                    kironomicsConnected={Boolean(me?.kironomicsConnected)}
                  />

                  {/* Before setup, the command is the only thing that matters.
                      After setup it is reference material — re-running it for a
                      second project or a rotated key — so it collapses and the
                      readiness board takes its place. */}
                  {!isSetUp ? (
                    <SetupSection
                      code={setupCode}
                      minting={minting}
                      onMint={handleMint}
                      projectName={projectName}
                      setProjectName={setProjectName}
                    />
                  ) : (
                    <SubmissionRequirements repo={me?.repo} />
                  )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <Card className="glass-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Your reward</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {myTier ? (
                        <>
                          <Badge className="mb-1">Position #{me?.validatedPosition}</Badge>
                          <p className="font-medium text-sm">{myTier.name}</p>
                          <p className="text-sm text-muted-foreground">{myTier.blurb}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Your tier is assigned once your entry passes validation.
                          Everyone valid earns {BASE_REWARD_BLURB.toLowerCase()}
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="glass-card">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Lessons</CardTitle>
                      <CardDescription className="text-xs">
                        Self-reported, for our records. Kiro scores the real thing at judging.
                        A tick in your repo&apos;s{' '}
                        <span className="font-mono">.kiro/ugmdu.json</span> counts too.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {evidenceToApply.length > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full mb-2"
                          disabled={savingLessons}
                          onClick={applyDetected}
                        >
                          {savingLessons
                            ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                            : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                          Tick the {evidenceToApply.length} we found evidence for
                        </Button>
                      )}
                      {LESSONS.map((l) => {
                        const claimed = (me?.lessonsRecorded ?? []).includes(l.n);
                        const evidence = l.artifact
                          ? Boolean(me?.repo?.artifacts?.[l.artifact])
                          : false;
                        return (
                          <label
                            key={l.n}
                            className="flex items-center gap-2.5 text-sm py-1.5 cursor-pointer rounded hover:bg-muted/40 px-1 -mx-1"
                          >
                            <Checkbox
                              checked={claimed}
                              disabled={savingLessons}
                              onCheckedChange={(v) => toggleLesson(l.n, v === true)}
                            />
                            <span className="flex-1 min-w-0 truncate">{l.label}</span>
                            {evidence && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 shrink-0"
                                title={`A ${l.artifact} artifact is committed in your repo`}
                              >
                                {l.artifact} found
                              </Badge>
                            )}
                            <span className="text-muted-foreground text-xs tabular-nums shrink-0">
                              {l.credits.toLocaleString()}
                            </span>
                          </label>
                        );
                      })}
                      <Separator className="my-2" />
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>All 7 completion award</span>
                        <span className="tabular-nums">{COMPLETION_AWARD_CREDITS.toLocaleString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </section>

          {/* Leaderboard */}
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Leaderboard</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Ranked by distinct days with at least one commit, counted in IST. Days, not
              commit count — so a hundred pushes in one afternoon still counts as one day.
            </p>
            <Card className="glass-card overflow-hidden">
              {leaderboard.length === 0 ? (
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No entries yet. The board fills in as people start committing.
                </CardContent>
              ) : (
                <div className="divide-y divide-border/60">
                  <div className="grid grid-cols-[3rem_1fr_5rem_5rem] gap-3 px-4 py-2.5 bg-muted/40 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Rank</span><span>Builder</span>
                    <span className="text-right">Days</span>
                    <span className="text-right">Commits</span>
                  </div>
                  {leaderboard.map((row) => (
                    <div
                      key={row.userId}
                      className="grid grid-cols-[3rem_1fr_5rem_5rem] gap-3 px-4 py-3 items-center text-sm"
                    >
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}
                      </span>
                      <span className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-7 w-7 shrink-0">
                          <AvatarImage src={row.avatar} alt="" />
                          <AvatarFallback>{row.displayName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium">{row.displayName}</span>
                        {row.validated && (
                          <Badge variant="secondary" className="shrink-0 text-xs">validated</Badge>
                        )}
                      </span>
                      <span className="text-right tabular-nums font-semibold">{row.activeDays}</span>
                      <span className="text-right tabular-nums text-muted-foreground">{row.commitCount}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {/* Rewards move below the fold once someone has joined — they have
              already seen them, and their status matters more. */}
          {joined && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Community reward tiers</h2>
              </div>
              <RewardTiers validatedCount={stats.validatedCount} />
            </section>
          )}

          {/* Once set up, the command moves down here, collapsed. Still needed
              occasionally — a second project, or after rotating a leaked key —
              but it should not occupy the main column for two weeks. */}
          {joined && isSetUp && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <Terminal className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Set up another project</h2>
              </div>
              <div className="max-w-3xl">
                <Collapsible>
                  <Card className="glass-card">
                    <CollapsibleTrigger asChild>
                      <button className="flex w-full items-center justify-between gap-3 p-6 text-left">
                        <span>
                          <span className="block text-sm font-medium">Show the setup command</span>
                          <span className="block text-sm text-muted-foreground mt-0.5">
                            For a second project, a new machine, or after rotating your
                            Kironomics key. Safe to re-run.
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border/60 p-6">
                        <SetupSection
                          code={setupCode}
                          minting={minting}
                          onMint={handleMint}
                          projectName={projectName}
                          setProjectName={setProjectName}
                          bare
                        />
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              </div>
            </section>
          )}

          {/* Submission requirements. Collapsed for a newcomer — a ten-item
              rulebook before they have decided to join reads as ten obstacles,
              not as help. Skipped entirely for a set-up participant, because it
              is already promoted into their main column above. */}
          {!(joined && isSetUp) && (
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">
                {joined ? 'Are you ready to submit?' : 'Before you submit'}
              </h2>
            </div>
            <div className="max-w-3xl">
              {joined ? (
                <SubmissionRequirements repo={me?.repo} />
              ) : (
                <Collapsible>
                  <Card className="glass-card">
                    <CollapsibleTrigger asChild>
                      <button className="flex w-full items-center justify-between gap-3 p-6 text-left">
                        <span>
                          <span className="block text-sm font-medium">
                            Kiro&apos;s {SUBMISSION_REQUIREMENTS.length} requirements
                          </span>
                          <span className="block text-sm text-muted-foreground mt-0.5">
                            We check three of them for you automatically. Worth a read before
                            deadline day, not before joining.
                          </span>
                        </span>
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t border-border/60">
                        <SubmissionRequirements repo={me?.repo} bare />
                      </div>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}
            </div>
          </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
