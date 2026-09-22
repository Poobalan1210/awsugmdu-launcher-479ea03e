import { useEffect, useMemo, useState } from 'react';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  GraduationCap, Clock, Trophy, Terminal, Copy, Check, ExternalLink, Github,
  ShieldAlert, Loader2, LogIn, Sparkles, GitCommit, CircleCheck, CircleDashed,
  KeyRound, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  BASE_REWARD_BLURB, COMPLETION_AWARD_CREDITS, ENTRY_DEADLINE_IST_LABEL, LESSONS,
  MAX_CREDITS, PLATFORM_LABEL, REWARD_TIERS, detectPlatform, getCampaignLeaderboard,
  getMyCampaign, getValidatedCount, joinCampaign, mintSetupCode, rotateKironomicsKey,
  setupCommand, slotsRemaining, tierForPosition, timeLeftToDeadline,
  type Platform,
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
  code, minting, onMint, projectName, setProjectName,
}: {
  code: string;
  minting: boolean;
  onMint: () => void;
  projectName: string;
  setProjectName: (v: string) => void;
}) {
  const [platform, setPlatform] = useState<Platform>(() => detectPlatform());

  return (
    <Card className="glass-card">
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
      <CardContent className="space-y-5">
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
      </CardContent>
    </Card>
  );
}

function ChecklistRow({
  done, title, detail, action,
}: {
  done: boolean;
  title: string;
  detail?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-3">
      {done
        ? <CircleCheck className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
        : <CircleDashed className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? '' : 'text-foreground'}`}>{title}</p>
        {detail && <p className="text-sm text-muted-foreground mt-0.5">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
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

  const { data: me, refetch: refetchMe } = useQuery({
    queryKey: ['campaign-me', user?.id],
    queryFn: getMyCampaign,
    enabled: isAuthenticated,
  });

  const { data: leaderboard = [] } = useQuery({
    queryKey: ['campaign-leaderboard'],
    queryFn: getCampaignLeaderboard,
  });

  const { data: validatedCount = 0 } = useQuery({
    queryKey: ['campaign-validated-count'],
    queryFn: getValidatedCount,
  });

  const joined = Boolean(me);
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
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-background" />
          <div className="container relative mx-auto px-4 py-16 sm:py-20">
            <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.4 }}>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-4 py-1.5 text-sm font-medium mb-5">
                <GraduationCap className="h-4 w-4" />
                Build-Along
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
                Kiro University, <span className="gradient-text">built together</span>
              </h1>
              <p className="mt-4 text-muted-foreground max-w-2xl text-base sm:text-lg">
                Kiro University is Kiro&apos;s own challenge, with up to {MAX_CREDITS.toLocaleString()} credits
                on offer. AWS User Group Madurai is running a build-along beside it — we track your
                progress, award community rewards, and make sure nothing disqualifies your entry.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <DeadlineStrip />
                <a
                  href="https://kiro.dev/2026/university/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  Kiro&apos;s official page <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-4 text-xs text-muted-foreground max-w-2xl">
                Entries are submitted by you on kiro.dev. This page tracks your community
                participation, not your Kiro entry. Kiro awards the credits, not us.
              </p>
            </motion.div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-12 space-y-12">
          {/* Rewards */}
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Community rewards</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Tiers are assigned when your entry passes validation, not when you submit — so
              position reflects finished work. Everyone who submits a valid entry earns{' '}
              {BASE_REWARD_BLURB.toLowerCase()}
            </p>
            <RewardTiers validatedCount={validatedCount} />
          </section>

          {/* Join / dashboard */}
          <section className="space-y-5">
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

                  <Card className="glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Checklist</CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y divide-border/60">
                      <ChecklistRow done title="Joined the build-along" />
                      <ChecklistRow
                        done={Boolean(me?.repo?.fullName)}
                        title="Project created and repo registered"
                        detail={me?.repo?.fullName ?? 'Run the setup command below.'}
                        action={me?.repo?.repoUrl ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={me.repo.repoUrl} target="_blank" rel="noopener noreferrer">
                              <Github className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : undefined}
                      />
                      <ChecklistRow
                        done={Boolean(me?.kironomicsConnected)}
                        title="Kironomics tracking active"
                        detail={me?.kironomicsConnected
                          ? 'Counting your Kiro sessions.'
                          : 'Installed by the setup command. Reload Kiro afterwards.'}
                      />
                      <ChecklistRow
                        done={(me?.repo?.activeDays ?? 0) > 0}
                        title="Building"
                        detail={me?.repo
                          ? `${me.repo.activeDays} active day${me.repo.activeDays === 1 ? '' : 's'}, ${me.repo.commitCount} commits`
                          : 'Commit at least once a day so progress is visible.'}
                      />
                      <ChecklistRow
                        done={Boolean(me?.externalEntryConfirmedAt)}
                        title="Entry submitted on kiro.dev"
                        detail="You submit this yourself — one entry per person, to your own email."
                        action={
                          <Button size="sm" variant="outline" asChild>
                            <a href="https://kiro.dev/2026/university/" target="_blank" rel="noopener noreferrer">
                              Open form <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                            </a>
                          </Button>
                        }
                      />
                    </CardContent>
                  </Card>

                  <SetupSection
                    code={setupCode}
                    minting={minting}
                    onMint={handleMint}
                    projectName={projectName}
                    setProjectName={setProjectName}
                  />
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
                      <CardTitle className="text-base">Lessons recorded</CardTitle>
                      <CardDescription className="text-xs">
                        Self-reported and evidence-corroborated. Kiro scores the real thing at
                        judging.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {LESSONS.map((l) => {
                        const done = me?.lessonsRecorded?.includes(l.n as never);
                        return (
                          <div key={String(l.n)} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              {done
                                ? <CircleCheck className="h-3.5 w-3.5 text-green-600" />
                                : <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />}
                              {l.label}
                            </span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {l.credits.toLocaleString()}
                            </span>
                          </div>
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

          {/* Rules */}
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">The three rules that disqualify people</h2>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl">
              None of these appear on Kiro&apos;s landing page, which is exactly why they get
              missed. All three are in{' '}
              <a
                href="https://kiro.dev/2026/university/terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                their terms
              </a>
              .
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                {
                  title: 'A brand new repo',
                  body: 'No commit before 21 Sep, 09:00 PT. Deleting files does not fix it — the history is the problem. Never fork or clone an existing project. The setup command creates a fresh repo, so this cannot go wrong.',
                },
                {
                  title: 'GitHub account 3+ months old',
                  body: 'Nobody can fix this before the deadline, so check it on day one. You can still build with us and earn community rewards.',
                },
                {
                  title: 'The .kiro folder must be committed',
                  body: 'It is what reviewers read to score each lesson. Never add a bare .kiro line to .gitignore — that is the most common way a finished entry scores zero.',
                },
              ].map((r, i) => (
                <motion.div
                  key={r.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: i * 0.06 }}
                >
                  <Card className="h-full glass-card">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{r.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">{r.body}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
