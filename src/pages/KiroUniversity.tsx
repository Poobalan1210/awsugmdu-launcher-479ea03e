import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import {
  GraduationCap, Clock, Trophy, Terminal, Copy, Check, ExternalLink, Github,
  ShieldAlert, Loader2, LogIn, Sparkles, GitCommit, CircleCheck, CircleDashed,
  KeyRound, AlertTriangle, ArrowRight, ClipboardList, ChevronDown, Rocket,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  BASE_REWARD_BLURB, COMPLETION_AWARD_CREDITS, ENTRY_DEADLINE_IST_LABEL, ENTRY_FORM_URL,
  CAMPAIGN_ID, LESSONS, MAX_CREDITS, PLATFORM_LABEL,
  SUBMISSION_REQUIREMENTS, TERMS_URL, detectPlatform,
  getCampaignLeaderboard, getCampaignStats, getMyCampaign, joinCampaign,
  mintSetupCode, requirementStatus, rotateKironomicsKey, setLessons,
  setupCommand, slotsRemaining, socialPostTemplate, tierForPosition, timeLeftToDeadline,
  type Lesson, type LessonState, type Platform, type RepoStats, type RequirementStatus, type RewardTier,
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

/**
 * One compact row in the lessons card or the checklist: a status control on
 * the left, a one-line summary that opens to the detail on the right. Keeps
 * both lists scannable at a glance, with the explanation one click away.
 *
 * The control sits outside the trigger, so a checkbox never ends up inside a
 * button.
 */
function ChecklistRow({
  value, control, title, badge, status, tone, aside, children,
}: {
  value: string;
  control: ReactNode;
  title: string;
  badge?: string;
  status: string;
  tone: 'good' | 'bad' | 'muted';
  aside?: ReactNode;
  children: ReactNode;
}) {
  const toneCls = {
    good: 'text-green-700 dark:text-green-400',
    bad: 'text-destructive',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <AccordionItem value={value} className="border-border/60">
      <div className="-mx-2 flex items-start gap-3 rounded-md px-2 transition-colors hover:bg-muted/40">
        <div className="mt-3 flex h-5 w-5 shrink-0 items-center justify-center">{control}</div>
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="gap-3 rounded-sm py-3 text-left hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:text-muted-foreground">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium">{title}</span>
                {badge && (
                  <span className="rounded-full border border-border px-1.5 text-[10px] font-normal leading-4 text-muted-foreground">
                    {badge}
                  </span>
                )}
              </span>
              <span className={`mt-0.5 block text-xs font-normal line-clamp-2 ${toneCls}`}>{status}</span>
            </span>
            {aside}
          </AccordionTrigger>
          <AccordionContent className="space-y-2 pb-4 pr-2 text-muted-foreground">{children}</AccordionContent>
        </div>
      </div>
    </AccordionItem>
  );
}

// The theme's large radius renders checkboxes as circles, which in these lists
// look like the status icons beside them. Square and neutral until ticked, so
// "you can tick this" is obvious and unticked rows don't read as warnings.
const ROW_CHECKBOX = 'rounded-[4px] border-muted-foreground/60 data-[state=checked]:border-primary';

/** Group heading shared by the lessons card and the checklist. */
function GroupLabel({ title, note, first = false }: { title: string; note: string; first?: boolean }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 pb-1 ${first ? '' : 'pt-5'}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function DocsLink({ href, topic }: { href: string; topic: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
    >
      Kiro docs
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only"> for {topic} (opens in a new tab)</span>
    </a>
  );
}

/**
 * Ticks for checklist items only the member can confirm. Kept in this browser:
 * they are the member's own notes, not something we verify or score.
 * Remount with a new `key` when storageKey changes.
 */
function useStoredTicks(storageKey: string | null) {
  const [ticks, setTicks] = useState<string[]>(() => {
    if (!storageKey) return [];
    try {
      const v: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(ticks));
    } catch {
      // Storage blocked or full: the ticks still work for this visit.
    }
  }, [storageKey, ticks]);
  const setTick = (id: string, on: boolean) =>
    setTicks((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id)));
  return [ticks, setTick] as const;
}

const REQ_GROUPS = [
  { id: 'eligibility', title: 'Eligibility', note: 'We check most of these for you' },
  { id: 'entry', title: 'Your entry', note: 'Tick each one as you go', readOnlyNote: 'Only you can confirm these' },
] as const;

/**
 * What Kiro's entry form and terms require, as a checklist.
 *
 * Statuses are honest about provenance: three are read from the repo sweep and
 * shown as "Checked for you". The rest only the member can confirm, so they
 * tick those themselves and the row says so. A tick we had not verified would
 * be worse than none, because they would stop checking.
 *
 * Without a storageKey (a visitor who has not joined) it is read-only.
 */
function SubmissionRequirements({
  repo, storageKey = null, bare = false,
}: {
  repo?: RepoStats | null;
  /** Where this member's ticks are kept. */
  storageKey?: string | null;
  /** Render without the Card shell, for embedding inside another card. */
  bare?: boolean;
}) {
  const [ticks, setTick] = useStoredTicks(storageKey);
  const interactive = storageKey !== null;

  const rows = SUBMISSION_REQUIREMENTS.map((r) => {
    const status: RequirementStatus = requirementStatus(r.id, repo);
    const ticked = interactive && status === 'confirm' && ticks.includes(r.id);
    return { r, status, ticked, done: status === 'verified' || ticked };
  });
  const doneCount = rows.filter((x) => x.done).length;
  const blocked = rows.filter((x) => x.status === 'blocked');

  const renderRow = ({ r, status, ticked }: (typeof rows)[number]) => {
    let control: ReactNode;
    let text: string;
    let tone: 'good' | 'bad' | 'muted' = 'muted';
    if (!interactive) {
      control = <CircleDashed className="h-5 w-5 text-muted-foreground/70" aria-hidden="true" />;
      text = r.source === 'auto' ? 'We check this for you' : 'You confirm this';
    } else if (status === 'verified') {
      control = <CircleCheck className="h-5 w-5 text-green-600" aria-hidden="true" />;
      text = 'Checked for you';
      tone = 'good';
    } else if (status === 'blocked') {
      control = <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />;
      text = 'Needs fixing. Open for how';
      tone = 'bad';
    } else if (status === 'unknown') {
      control = <CircleDashed className="h-5 w-5 text-muted-foreground/70" aria-hidden="true" />;
      text = repo?.unreachable ? "Couldn't reach your repo on the last check" : 'Checked once your repo is linked';
    } else {
      control = (
        <Checkbox
          checked={ticked}
          onCheckedChange={(v) => setTick(r.id, v === true)}
          aria-label={`Mark "${r.label}" as done`}
          className={ROW_CHECKBOX}
        />
      );
      text = ticked ? 'Done, ticked by you' : r.tickPrompt ?? 'Tick when done';
      tone = ticked ? 'good' : 'muted';
    }

    return (
      <ChecklistRow key={r.id} value={r.id} control={control} title={r.label} status={text} tone={tone}>
        <p>{r.detail}</p>
        {r.id === 'social_post' && (
          <div className="space-y-2 pt-1">
            <p>Start from this, so the tags and hashtags can&apos;t be missed:</p>
            <CopyBlock code={socialPostTemplate(repo?.repoUrl)} label="Post template" />
          </div>
        )}
        {r.id === 'entry_form' && (
          <p>
            Due {ENTRY_DEADLINE_IST_LABEL}.{' '}
            <a
              href={ENTRY_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Open the entry form
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        )}
      </ChecklistRow>
    );
  };

  const Shell = bare ? 'div' : Card;
  const Body = bare ? 'div' : CardContent;
  const total = SUBMISSION_REQUIREMENTS.length;

  return (
    <Shell className={bare ? '' : 'glass-card'}>
      {!bare && (
        <CardHeader className="space-y-3 pb-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardList className="h-5 w-5 text-primary" />
              Submission checklist
            </CardTitle>
            {interactive && (
              <span className="text-sm font-semibold tabular-nums">
                {doneCount}
                <span className="font-normal text-muted-foreground"> / {total}</span>
                <span className="sr-only"> done</span>
              </span>
            )}
          </div>
          <CardDescription>
            What your entry needs before Kiro will judge it. These are Kiro&apos;s rules, and a few
            appear only in{' '}
            <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              their terms
            </a>
            .
          </CardDescription>
          {interactive && (
            <Progress
              value={(doneCount / total) * 100}
              className="h-1.5"
              aria-label={`${doneCount} of ${total} checklist items done`}
            />
          )}
        </CardHeader>
      )}
      <Body className={bare ? 'p-6' : ''}>
        {blocked.length > 0 && (
          <Alert variant="destructive" className="mb-3">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>
              {blocked.length === 1
                ? 'One item would disqualify your entry'
                : `${blocked.length} items would disqualify your entry`}
            </AlertTitle>
            <AlertDescription className="text-sm">
              {blocked.map((b) => b.r.label).join('; ')}. Fix before submitting.
            </AlertDescription>
          </Alert>
        )}

        <Accordion type="single" collapsible>
          {REQ_GROUPS.map((g, i) => (
            <div key={g.id}>
              <GroupLabel
                title={g.title}
                note={!interactive && 'readOnlyNote' in g ? g.readOnlyNote : g.note}
                first={i === 0}
              />
              {rows.filter((x) => x.r.group === g.id).map(renderRow)}
            </div>
          ))}
        </Accordion>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
          <Button asChild size="sm">
            <a href={ENTRY_FORM_URL} target="_blank" rel="noopener noreferrer">
              Open Kiro&apos;s entry form
              <ExternalLink className="h-4 w-4 ml-2" aria-hidden="true" />
            </a>
          </Button>
          <span className="text-xs text-muted-foreground">
            You submit it yourself on kiro.dev. Due {ENTRY_DEADLINE_IST_LABEL}.
          </span>
        </div>
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
  repo, kironomicsConnected, tier, position,
}: {
  repo?: RepoStats | null;
  kironomicsConnected: boolean;
  tier: RewardTier | null;
  position?: number | null;
}) {
  const tiles: { label: string; value: string; hint: string; tone?: 'good' | 'muted' }[] = [
    { label: 'Active days', value: String(repo?.activeDays ?? 0), hint: 'Days you committed, in IST' },
    { label: 'Commits', value: String(repo?.commitCount ?? 0), hint: 'Inside the challenge window' },
    {
      label: 'Session tracking',
      value: kironomicsConnected ? 'On' : 'Off',
      hint: kironomicsConnected ? 'Kironomics counts your Kiro sessions' : 'Run setup again, then reload Kiro',
      tone: kironomicsConnected ? 'good' : 'muted',
    },
    {
      label: 'Community reward',
      value: position ? `#${position}` : 'Pending',
      hint: position ? (tier ? tier.name : 'Points, badge and showcase') : 'Your tier is set when your entry is validated',
      tone: position ? undefined : 'muted',
    },
  ];

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {repo?.repoUrl ? (
            <a
              href={repo.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Github className="h-4 w-4" aria-hidden="true" />
              {repo.fullName}
            </a>
          ) : (
            <CardTitle className="text-base">No repo linked yet</CardTitle>
          )}
          {repo?.fullName && (
            <span className="text-xs text-muted-foreground">Refreshed every 6 hours</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!repo?.fullName && kironomicsConnected ? (
          // Kironomics only connects once the command has run, so this member
          // ran it and it stopped before the last step. Re-running is the fix,
          // and they need to hear that it is safe.
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Your setup stopped before your repo was linked</AlertTitle>
            <AlertDescription className="text-sm space-y-2">
              <p>
                The command ran, but it never linked a repo, so nothing is tracked yet and
                you are not on the leaderboard. Run it again from the same folder. It picks up
                where it stopped and is safe to run more than once.
              </p>
              <p>
                If it said the GitHub CLI was not found, install it from{' '}
                <a
                  href="https://cli.github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  cli.github.com
                </a>{' '}
                and run <span className="font-mono text-xs">gh auth login</span> first.
              </p>
            </AlertDescription>
          </Alert>
        ) : !repo?.fullName ? (
          // The largest drop-off group: joined, never ran the command. They are
          // absent from the leaderboard and, without this, have no way to know
          // why — so state the consequence rather than just the instruction.
          <Alert>
            <Terminal className="h-4 w-4" />
            <AlertTitle>You are not on the leaderboard yet</AlertTitle>
            <AlertDescription className="text-sm">
              Nothing is being tracked until a repo is linked. Run the setup command below —
              it creates your project, starts tracking and links the repo, with nothing to
              paste back here.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                  <p
                    className={`text-2xl font-semibold tabular-nums ${
                      t.tone === 'good' ? 'text-green-600' : t.tone === 'muted' ? 'text-muted-foreground' : ''
                    }`}
                  >
                    {t.value}
                  </p>
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
                  It may have been renamed, deleted or made private, or your GitHub profile may
                  not be publicly visible. Open the repo in a private browser window to check.
                  It must be public to be judged.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}

        {/* Once a repo is linked this is one of the tiles above. */}
        {!repo?.fullName && (
          <div className="flex items-center gap-2 text-sm">
            {kironomicsConnected
              ? <CircleCheck className="h-4 w-4 text-green-600 shrink-0" aria-hidden="true" />
              : <CircleDashed className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />}
            <span className={kironomicsConnected ? '' : 'text-muted-foreground'}>
              {kironomicsConnected
                ? 'Kironomics is counting your Kiro sessions'
                : 'Kironomics not connected — the setup command handles it, then reload Kiro'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A lesson's standing in a few words, for the collapsed row. */
function lessonStatusLine(
  l: Lesson, s: LessonState | undefined, hasRepo: boolean, repoUnreachable: boolean,
): { text: string; done: boolean } {
  const check = s?.check ?? l.check;
  if (s?.found) return { text: s.detail || 'Found in your repo', done: true };
  if (s?.ticked) return { text: 'Done, ticked by you', done: true };
  if (check === 'self') return { text: "Tick it when you've done it", done: false };
  if (!hasRepo) {
    return {
      text: check === 'repo-or-self' ? 'Checked once your repo is linked, or tick it' : 'Checked once your repo is linked',
      done: false,
    };
  }
  if (!s?.repoChecked) {
    return { text: repoUnreachable ? "Couldn't read your repo on the last check" : 'Checking your repo…', done: false };
  }
  if (check === 'repo-or-self') {
    return { text: s.detail || 'Not in your repo. Tick it if you did it elsewhere', done: false };
  }
  return { text: s.detail || 'Not in your repo yet', done: false };
}

/**
 * The seven scored lessons and the two bonuses, with where the member stands
 * on each. Most are read from the repo by the sweep, since the committed repo
 * is what Kiro's reviewers score. Lessons a repo can't show are ticked by the
 * member. Detection shows a file exists, not that the lesson was done well.
 */
function LessonsCard({
  lessons, hasRepo, repoUnreachable, saving, onToggle,
}: {
  lessons?: LessonState[];
  hasRepo: boolean;
  repoUnreachable: boolean;
  saving: boolean;
  onToggle: (id: string, next: boolean) => void;
}) {
  const byId = new Map((lessons ?? []).map((l) => [l.id, l]));
  const requiredDone = LESSONS.filter((l) => !l.bonus && byId.get(l.n)?.counted).length;
  // A count before the repo has been read would say 0 of 7 for work that exists.
  const showCount = (lessons ?? []).some((l) => l.repoChecked || l.ticked);

  const row = (l: Lesson) => {
    const s = byId.get(l.n);
    const check = s?.check ?? l.check;
    const found = Boolean(s?.found);
    const tickable = check !== 'repo' && !found;
    const status = lessonStatusLine(l, s, hasRepo, repoUnreachable);

    const control = found ? (
      <CircleCheck className="h-5 w-5 text-green-600" aria-hidden="true" />
    ) : tickable ? (
      <Checkbox
        checked={Boolean(s?.ticked)}
        disabled={saving || !s}
        onCheckedChange={(v) => onToggle(l.n, v === true)}
        aria-label={`Mark ${l.title} as done`}
        className={ROW_CHECKBOX}
      />
    ) : (
      <CircleDashed className="h-5 w-5 text-muted-foreground/70" aria-hidden="true" />
    );

    return (
      <ChecklistRow
        key={l.n}
        value={l.n}
        control={control}
        title={l.title}
        badge={l.note}
        status={status.text}
        tone={status.done ? 'good' : 'muted'}
        aside={
          <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
            {l.credits.toLocaleString()}
            <span className="sr-only"> credits</span>
          </span>
        }
      >
        <p className="text-foreground">{l.what}</p>
        <p>{found ? "Found in your repo. Kiro's reviewers judge how well you used it." : l.hint}</p>
        <DocsLink href={l.docsUrl} topic={l.title} />
      </ChecklistRow>
    );
  };

  return (
    <Card className="glass-card">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            Lessons Kiro scores
          </CardTitle>
          {showCount && (
            <span className="text-sm font-semibold tabular-nums">
              {requiredDone}
              <span className="font-normal text-muted-foreground"> / 7</span>
              <span className="sr-only"> lessons done</span>
            </span>
          )}
        </div>
        <CardDescription>
          What Kiro awards credits for. We check most of them in your repo, and Kiro&apos;s
          reviewers make the final call.
        </CardDescription>
        {showCount && (
          <Progress value={(requiredDone / 7) * 100} className="h-1.5" aria-label={`${requiredDone} of 7 lessons done`} />
        )}
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible>
          <GroupLabel
            title="Core lessons"
            note={`All seven add a ${COMPLETION_AWARD_CREDITS.toLocaleString()}-credit bonus`}
            first
          />
          {LESSONS.filter((l) => !l.bonus).map(row)}
          <GroupLabel title="Bonus" note="Extra credits on top" />
          {LESSONS.filter((l) => l.bonus).map(row)}
        </Accordion>
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

  // Only lessons a repo can't show are tickable. Sends the full set of ticks;
  // the other lessons are read from the repo by the sweep.
  const toggleLesson = async (id: string, next: boolean) => {
    const ticks = new Set((me?.lessons ?? []).filter((l) => l.ticked).map((l) => l.id));
    if (next) ticks.add(id);
    else ticks.delete(id);
    setSavingLessons(true);
    try {
      await setLessons([...ticks]);
      await refetchMe();
    } catch {
      toast.error('Could not save that — try again');
    } finally {
      setSavingLessons(false);
    }
  };

  // Checklist ticks are per member, kept in this browser.
  const checklistKey = user?.id ? `${CAMPAIGN_ID}:checklist:${user.id}` : null;

  const lessonsCard = (
    <LessonsCard
      lessons={me?.lessons}
      hasRepo={Boolean(me?.repo?.fullName)}
      repoUnreachable={Boolean(me?.repo?.unreachable)}
      saving={savingLessons}
      onToggle={toggleLesson}
    />
  );

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
              <div className="space-y-6">
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
                  tier={myTier}
                  position={me?.validatedPosition}
                />

                {/* Before setup, the command is the next step, so it comes first.
                    After setup it is reference material (a second project, a
                    rotated key) and moves to the bottom of the page, collapsed. */}
                {!isSetUp && (
                  <SetupSection
                    code={setupCode}
                    minting={minting}
                    onMint={handleMint}
                    projectName={projectName}
                    setProjectName={setProjectName}
                  />
                )}

                {/* Side by side on wide screens. They answer different questions,
                    "what earns credits" and "what makes the entry count", and
                    together they are the member's whole to-do list. */}
                <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                  {lessonsCard}
                  <SubmissionRequirements
                    key={checklistKey ?? 'anonymous'}
                    repo={me?.repo}
                    storageKey={checklistKey}
                  />
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

            {/* Without this, a board of 13 under a hero reading "38 builders
                joined" looks broken. Only people with a linked repo can be
                ranked — there is nothing to measure otherwise — so say so
                rather than leaving the gap unexplained. */}
            {stats.joinedCount > stats.withRepoCount && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm max-w-2xl">
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {stats.withRepoCount} of {stats.joinedCount}
                  </span>{' '}
                  builders have linked a repo. Only linked repos can be ranked.
                </span>
                {joined && !me?.repo?.fullName && (
                  <button
                    onClick={scrollToAction}
                    className="font-medium text-primary hover:underline"
                  >
                    Run the setup command to appear here
                  </button>
                )}
              </div>
            )}

            <Card className="glass-card overflow-hidden">
              {leaderboard.length === 0 ? (
                <CardContent className="py-12 text-center text-sm text-muted-foreground">
                  No repos linked yet. The board fills in once people run the setup command
                  and start committing.
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

          {/* Submission requirements, for visitors only: members have the
              checklist beside their lessons. Collapsed, because a ten-item
              rulebook before someone has decided to join reads as ten
              obstacles, not as help. */}
          {!joined && (
            <section className="space-y-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">Before you submit</h2>
              </div>
              <div className="max-w-3xl">
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
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
