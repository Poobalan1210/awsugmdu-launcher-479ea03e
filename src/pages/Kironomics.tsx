import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  Trophy, Star, Gift, Copy, Check, Terminal, ShieldCheck, Zap,
  Flame, Globe, Cpu, Lock, Eye, Download, KeyRound, LogIn, Loader2,
  X, Clock, Calendar, TrendingUp, Award, MessageSquare, Wrench, CreditCard, Activity,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { callApi } from '@/lib/api';
import {
  PixelGhost, RoamingGhost, GhostFog, FloatingSpirits, PixelSkyline, CursorGhost,
} from '@/components/kironomics/PixelGhost';
import { KironomicsNav, KironomicsFooter } from '@/components/kironomics/KironomicsChrome';
import { KironomicsIntro } from '@/components/kironomics/KironomicsIntro';
import {
  getKironomicsLeaderboard, getKironomicsUserMetrics, getKironomicsUserHeatmap,
  type LeaderboardWindow, type HeatmapDay, type KironomicsMetrics,
} from '@/lib/kironomics';

// Scoped retro theme. Press Start 2P for headings, VT323 for body copy.
const KIRO_STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap');
.kiro-scope { --kx-bg:#0a0612; --kx-violet:#8b5cf6; --kx-violet-soft:#a78bfa; --kx-ink:#ede9fe; }
.kiro-scope .font-pixel { font-family:'Press Start 2P', monospace; }
.kiro-scope .font-retro { font-family:'VT323', monospace; }
.kiro-pixel-border { box-shadow:0 0 0 2px #2a1c4d, 0 0 0 4px var(--kx-violet), 0 0 22px rgba(139,92,246,0.35); }
.kiro-scanlines::before {
  content:''; position:absolute; inset:0; pointer-events:none; z-index:1;
  background:repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0 1px, transparent 1px 3px);
  mix-blend-mode:overlay;
}
@keyframes kiro-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
.kiro-float { animation:kiro-float 3.2s ease-in-out infinite; }
@keyframes kiro-blink { 0%,92%,100%{opacity:1} 95%{opacity:0.25} }
.kiro-blink { animation:kiro-blink 4s steps(1) infinite; }
@keyframes kiro-twinkle { 0%,100%{opacity:0.15} 50%{opacity:0.9} }
.kiro-pulse-ring { animation:kiro-pulse-ring 3s ease-out infinite; }
@keyframes kiro-pulse-ring { 0%{transform:scale(0.85);opacity:0.6} 70%{transform:scale(1.25);opacity:0} 100%{opacity:0} }
.kiro-text-glow { text-shadow:0 0 8px rgba(139,92,246,0.9), 0 4px 0 #4c1d95; }
.kiro-vignette { background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%); }
@keyframes kiro-shadow { 0%,100%{transform:translateX(-50%) scaleX(1);opacity:0.7} 50%{transform:translateX(-50%) scaleX(0.7);opacity:0.4} }
.kiro-shadow { animation:kiro-shadow 3.2s ease-in-out infinite; }
.kiro-scope ::selection { background:rgba(139,92,246,0.4); color:#fff; }
`;

function Starfield() {
  const stars = useMemo(
    () => Array.from({ length: 60 }, () => ({
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      size: Math.random() > 0.8 ? 3 : 2,
      delay: `${Math.random() * 3}s`,
      dur: `${2 + Math.random() * 3}s`,
    })),
    [],
  );
  return (
    <div className="absolute inset-0 overflow-hidden">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute bg-violet-200"
          style={{
            left: s.left, top: s.top, width: s.size, height: s.size,
            animation: `kiro-twinkle ${s.dur} ease-in-out ${s.delay} infinite`,
          }}
        />
      ))}
    </div>
  );
}

function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <div className="relative group">
      {label && (
        <div className="font-pixel text-[9px] text-violet-300/70 mb-1.5 uppercase">{label}</div>
      )}
      <pre className="font-retro text-base sm:text-lg leading-relaxed text-violet-100 bg-black/50 border border-violet-500/30 rounded-md p-3 pr-12 overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded bg-violet-500/20 hover:bg-violet-500/40 text-violet-200 transition-colors"
        aria-label="Copy"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

const RANK_STYLES: Record<number, string> = {
  1: 'text-amber-300',
  2: 'text-slate-200',
  3: 'text-orange-300',
};

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const HEAT_LEVELS = [
  'bg-violet-500/10',
  'bg-violet-500/30',
  'bg-violet-500/50',
  'bg-violet-400/70',
  'bg-violet-300',
];

function ProfileHeatmap({ days }: { days: HeatmapDay[] }) {
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px]">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {w.map((d) => (
              <span
                key={d.date}
                title={`${d.date}: ${d.count} ${d.count === 1 ? 'session' : 'sessions'}`}
                className={`h-2.5 w-2.5 rounded-[2px] ${HEAT_LEVELS[d.level] ?? HEAT_LEVELS[0]}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value }: { icon: typeof Wrench; label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-black/40 border border-violet-500/20 p-3 text-center">
      <Icon className="h-4 w-4 mx-auto mb-1 text-violet-300" />
      <div className="font-pixel text-[11px] text-violet-50">{value}</div>
      <div className="font-retro text-sm text-violet-400/80">{label}</div>
    </div>
  );
}

function ProfileDetails({ m, heatmap, showCredits }: { m: KironomicsMetrics; heatmap: HeatmapDay[]; showCredits: boolean }) {
  return (
    <>
      <div className="flex items-center gap-3 mb-1 pr-8">
        <span className="text-3xl">{m.titleIcon}</span>
        <div className="min-w-0">
          <h3 className="font-retro text-2xl text-violet-50 truncate leading-none">{m.displayName}</h3>
          <p className="font-retro text-base text-violet-400/80">{m.title}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-5">
        <span className="font-pixel text-[8px] px-2 py-1 rounded bg-violet-500/20 text-violet-200">{m.plan}</span>
        <span className="font-pixel text-[11px] text-amber-200 ml-auto">{m.compositeScore.toLocaleString()} pts</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-5">
        <StatTile icon={Wrench} label="Tools" value={m.totalMcpCalls} />
        <StatTile icon={MessageSquare} label="Prompts" value={m.totalHookTriggers} />
        <StatTile icon={Activity} label="Sessions" value={m.totalSessions} />
        <StatTile icon={Clock} label="Time" value={fmtDuration(m.totalDuration)} />
        <StatTile icon={Flame} label="Streak" value={`${m.streakDays}d`} />
      </div>

      {showCredits && (
        m.monthlyLimit ? (
          <div className="rounded-lg bg-black/40 border border-violet-500/20 p-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="font-pixel text-[10px] text-violet-200 flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> CREDITS
                <span className="font-retro text-sm text-violet-400/70 normal-case">(private to you)</span>
              </span>
              <span className="font-retro text-base text-violet-300/80">
                {(m.currentUsage ?? 0).toLocaleString()} / {m.monthlyLimit.toLocaleString()}
              </span>
            </div>
            <div className="h-2 rounded bg-violet-500/15 overflow-hidden mb-3">
              <div className="h-full bg-violet-400" style={{ width: `${Math.min(100, m.percentageUsed ?? 0)}%` }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatTile icon={TrendingUp} label="Burn/day" value={m.dailyBurnRate ?? '—'} />
              <StatTile icon={CreditCard} label="Remaining" value={m.creditsRemaining ?? '—'} />
              <StatTile icon={Calendar} label="Resets in" value={m.daysUntilReset != null ? `${m.daysUntilReset}d` : '—'} />
              <StatTile icon={Clock} label="Runs out" value={m.daysRemaining != null ? `${m.daysRemaining}d` : '—'} />
            </div>
          </div>
        ) : (
          <p className="font-retro text-base text-violet-400/70 mb-5">
            Plan shows <span className="text-violet-200">Auto-Auto</span> — no credit data reported yet.
            It fills in once the reporter reads your Kiro usage.
          </p>
        )
      )}

      <div className="mb-5">
        <div className="font-pixel text-[10px] text-violet-200 mb-2 flex items-center gap-2">
          <Award className="h-4 w-4" /> BADGES
        </div>
        {m.badges.length ? (
          <div className="flex flex-wrap gap-2">
            {m.badges.map((b) => (
              <span key={b.name} className="font-retro text-base text-violet-100 bg-violet-500/15 border border-violet-500/25 rounded-full px-3 py-1">
                {b.icon} {b.name}
              </span>
            ))}
          </div>
        ) : (
          <p className="font-retro text-base text-violet-400/70">No badges yet.</p>
        )}
      </div>

      {heatmap.length > 0 && (
        <div>
          <div className="font-pixel text-[10px] text-violet-200 mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4" /> LAST 365 DAYS
          </div>
          <ProfileHeatmap days={heatmap} />
        </div>
      )}
    </>
  );
}

function UserProfileModal({
  userId, displayName, onClose,
}: { userId: string; displayName: string; onClose: () => void }) {
  const { data: m, isLoading } = useQuery({
    queryKey: ['kironomics-metrics', userId],
    queryFn: () => getKironomicsUserMetrics(userId),
  });
  const { data: heatmap = [] } = useQuery({
    queryKey: ['kironomics-heatmap', userId],
    queryFn: () => getKironomicsUserHeatmap(userId),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock page scroll while the modal is open so the background doesn't move behind it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="kiro-scope relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-lg kiro-pixel-border p-6"
        style={{ backgroundColor: '#0b0714' }}
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded bg-violet-500/20 hover:bg-violet-500/40 text-violet-200"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {isLoading ? (
          <div className="py-16 text-center font-retro text-xl text-violet-300/70">Loading profile…</div>
        ) : !m ? (
          <div className="py-16 text-center font-retro text-xl text-violet-300/70">
            No detailed stats for <span className="text-violet-100">{displayName}</span> yet.
          </div>
        ) : (
          <ProfileDetails m={m} heatmap={heatmap} showCredits={false} />
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function MyStatsSection() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id;
  const { data: m } = useQuery({
    queryKey: ['kironomics-my-metrics', userId],
    queryFn: () => getKironomicsUserMetrics(userId as string),
    enabled: !!userId,
  });
  const { data: heatmap = [] } = useQuery({
    queryKey: ['kironomics-my-heatmap', userId],
    queryFn: () => getKironomicsUserHeatmap(userId as string),
    enabled: !!userId,
  });

  if (!isAuthenticated) return null; // only the signed-in user sees their own stats

  return (
    <section id="my-stats" className="relative z-10 container mx-auto px-4 pt-14">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="font-pixel text-xl sm:text-2xl text-violet-200 kiro-text-glow">YOUR STATS</h2>
          <p className="font-retro text-lg text-violet-300/80 mt-2">
            Private to you — including credit usage no one else can see.
          </p>
        </div>
        <div className="rounded-lg bg-black/40 kiro-pixel-border p-6">
          {!m ? (
            <p className="py-8 text-center font-retro text-xl text-violet-300/70">
              No stats yet — generate your API key below, set up the Power, and your stats will show up here.
            </p>
          ) : (
            <ProfileDetails m={m} heatmap={heatmap} showCredits />
          )}
        </div>
      </div>
    </section>
  );
}

function LeaderboardSection() {
  const [window, setWindow] = useState<LeaderboardWindow>('all-time');
  const [selected, setSelected] = useState<{ userId: string; displayName: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['kironomics-leaderboard', window],
    queryFn: () => getKironomicsLeaderboard(window),
  });

  const windows: { key: LeaderboardWindow; label: string }[] = [
    { key: 'daily', label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'all-time', label: 'All Time' },
  ];

  return (
    <section id="leaderboard" className="relative z-10 container mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <h2 className="font-pixel text-xl sm:text-2xl text-violet-200 kiro-text-glow">LEADERBOARD</h2>
        <p className="font-retro text-lg text-violet-300/80 mt-2">Burn more tokens. Rank higher.</p>
      </div>

      {/* Window tabs */}
      <div className="flex justify-center gap-2 mb-6">
        {windows.map((w) => (
          <button
            key={w.key}
            onClick={() => setWindow(w.key)}
            className={`font-pixel text-[10px] px-3 py-2 rounded transition-all ${
              window === w.key
                ? 'bg-violet-500 text-white kiro-pixel-border'
                : 'bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {data?.isDemo && (
        <div className="max-w-3xl mx-auto mb-5 text-center font-retro text-base text-amber-200/90 bg-amber-500/10 border border-amber-400/30 rounded-md py-2 px-4">
          ⚠ Showing demo data — set{' '}
          <span className="text-amber-100">VITE_API_ENDPOINT</span> (and deploy the Kironomics API) to see real rankings.
        </div>
      )}

      <div className="max-w-3xl mx-auto rounded-lg bg-black/40 kiro-pixel-border overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[48px_1fr_auto] sm:grid-cols-[64px_1fr_120px_100px] gap-2 px-4 py-3 bg-violet-500/15 font-pixel text-[8px] sm:text-[9px] text-violet-200 uppercase">
          <span>Rank</span>
          <span>Builder</span>
          <span className="hidden sm:block text-right">Plan</span>
          <span className="text-right">Score</span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center font-retro text-xl text-violet-300/70">Loading rankings…</div>
        ) : (
          <ul>
            {data?.entries.map((e) => (
              <li
                key={e.userId}
                onClick={() => setSelected({ userId: e.userId, displayName: e.displayName })}
                title="View profile"
                className="grid grid-cols-[48px_1fr_auto] sm:grid-cols-[64px_1fr_120px_100px] gap-2 px-4 py-3 items-center border-t border-violet-500/15 hover:bg-violet-500/5 transition-colors cursor-pointer"
              >
                <span className={`font-pixel text-xs ${RANK_STYLES[e.rank] ?? 'text-violet-400'}`}>
                  {e.rank <= 3 ? ['🥇', '🥈', '🥉'][e.rank - 1] : `#${e.rank}`}
                </span>
                <span className="min-w-0">
                  <span className="font-retro text-xl text-violet-50 truncate block leading-none">
                    {e.titleIcon} {e.displayName}
                    {e.awsVerified && <span title="AWS verified" className="ml-1 text-sky-300">✔</span>}
                  </span>
                  <span className="font-retro text-sm text-violet-400/80 flex items-center gap-2">
                    {e.title}
                    {e.streakDays > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-orange-300">
                        <Flame className="h-3 w-3" />{e.streakDays}d
                      </span>
                    )}
                  </span>
                </span>
                <span className="hidden sm:block text-right">
                  <span className="font-pixel text-[8px] px-2 py-1 rounded bg-violet-500/20 text-violet-200">
                    {e.plan}
                  </span>
                </span>
                <span className="font-pixel text-[11px] sm:text-xs text-amber-200 text-right">
                  {e.compositeScore.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {selected && (
          <UserProfileModal
            userId={selected.userId}
            displayName={selected.displayName}
            onClose={() => setSelected(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

// --- Install instructions ----------------------------------------------------

const REPORTER_SNIPPET = `# In Kiro chat, after installing the Kironomics Power:
"Set up Kironomics"

# Kiro asks only for your API key (from the "Your API key" box above).
# The leaderboard endpoint is already baked into the Power.`;

const VERIFY_SNIPPET = `# After a few prompts, confirm the counters are ticking:
cat /tmp/kironomics_prompts
cat /tmp/kironomics_tools`;

function ApiKeyCard() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      // callApi attaches the Cognito token; the lambda derives the user from it
      // and returns (creating if needed) this user's Kironomics API key.
      const res = await callApi<{ data?: { apiKey?: string } }>('/kironomics/users/profile', {
        method: 'POST',
        body: JSON.stringify({ displayName: user?.name }),
      });
      if (res?.data?.apiKey) {
        setApiKey(res.data.apiKey);
        toast.success('Your API key is ready');
      } else {
        toast.error('The server did not return a key');
      }
    } catch {
      toast.error('Could not reach the Kironomics API — it may not be deployed yet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-black/40 kiro-pixel-border p-5 sm:p-6">
      <h3 className="font-pixel text-[11px] text-violet-100 flex items-center gap-2 mb-3">
        <KeyRound className="h-4 w-4 text-violet-300" /> YOUR API KEY
      </h3>

      {isLoading ? (
        <p className="font-retro text-lg text-violet-300/70">Checking your session…</p>
      ) : !isAuthenticated ? (
        <div className="font-retro text-lg text-violet-300/90">
          <p className="mb-3">
            Sign in with your AWS UG Madurai account to generate your personal Kironomics API key.
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 font-pixel text-[10px] bg-violet-500 hover:bg-violet-400 text-white kiro-pixel-border py-3 px-5 rounded"
          >
            <LogIn className="h-4 w-4" /> Sign in to get your key
          </Link>
        </div>
      ) : apiKey ? (
        <div>
          <p className="font-retro text-lg text-violet-300/90 mb-3">
            Signed in as <span className="text-violet-100">{user?.name || user?.email}</span>. Paste this
            into the Kironomics Power setup in Kiro. Keep it private — anyone with it can report as you.
          </p>
          <CopyBlock code={apiKey} label="API key" />
        </div>
      ) : (
        <div className="font-retro text-lg text-violet-300/90">
          <p className="mb-3">
            Signed in as <span className="text-violet-100">{user?.name || user?.email}</span>. Generate your
            key, then paste it into the Kironomics Power setup.
          </p>
          <button
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 font-pixel text-[10px] bg-violet-500 hover:bg-violet-400 disabled:opacity-60 text-white kiro-pixel-border py-3 px-5 rounded"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {loading ? 'Generating…' : 'Generate my API key'}
          </button>
        </div>
      )}
    </div>
  );
}

function InstallSection() {
  const steps = [
    {
      icon: Cpu,
      title: 'Check prerequisites',
      body: 'You need Python 3 (built in on macOS/Linux) and Kiro IDE. Verify Python with the command below.',
      code: 'python3 --version',
    },
    {
      icon: KeyRound,
      title: 'Grab your API key',
      body: 'Use the "Your API key" box above — sign in with your AWS UG Madurai account, generate your key, and copy it.',
    },
    {
      icon: Download,
      title: 'Install the Kironomics Power',
      body: 'In Kiro: Powers panel → Add Power → Import from GitHub, then paste the Kironomics repo URL.',
      code: 'https://github.com/Poobalan1210/Kironomics',
    },
    {
      icon: Terminal,
      title: 'Run setup in chat',
      body: 'Ask Kiro to set it up and paste your API key. It writes a reporter script and a hooks file (tool + prompt counters, session reporter) into .kiro/. Reload Kiro afterward so the hooks activate.',
      code: REPORTER_SNIPPET,
    },
    {
      icon: Eye,
      title: 'Verify it’s tracking',
      body: 'Send a few prompts, let Kiro use some tools, then check the temp counters. When the agent stops, your session is reported and you appear on the leaderboard.',
      code: VERIFY_SNIPPET,
    },
  ];

  return (
    <section id="install" className="relative z-10 container mx-auto px-4 py-16">
      <div className="text-center mb-10">
        <h2 className="font-pixel text-xl sm:text-2xl text-violet-200 kiro-text-glow">HOW TO JOIN</h2>
        <p className="font-retro text-lg text-violet-300/80 mt-2">
          Install once. Then just keep building — tracking is automatic and silent.
        </p>
      </div>

      <div className="max-w-3xl mx-auto space-y-4">
        <ApiKeyCard />
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="rounded-lg bg-black/40 border border-violet-500/25 p-5"
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 h-10 w-10 grid place-items-center rounded bg-violet-500/20 text-violet-200 font-pixel text-xs">
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-pixel text-[11px] text-violet-100 flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-violet-300" />
                    {s.title}
                  </h3>
                  <p className="font-retro text-lg text-violet-300/90 leading-snug mb-3">{s.body}</p>
                  {s.code && <CopyBlock code={s.code} />}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function PrivacySection() {
  const items = [
    { good: true, text: 'Counts of prompts and tool calls (just numbers)' },
    { good: true, text: 'Session length in seconds' },
    { good: true, text: 'Kiro credit usage read read-only from your local state.vscdb' },
    { good: true, text: 'A one-way hash of your hostname (not reversible)' },
    { good: false, text: 'Your prompt text or Kiro’s replies' },
    { good: false, text: 'Your source code or file contents' },
    { good: false, text: 'File names, paths, or anything you type' },
  ];
  return (
    <section id="privacy" className="relative z-10 container mx-auto px-4 py-16">
      <div className="max-w-3xl mx-auto rounded-lg bg-black/40 kiro-pixel-border p-6 sm:p-8">
        <h2 className="font-pixel text-lg text-violet-200 kiro-text-glow flex items-center gap-3 mb-2">
          <Lock className="h-5 w-5" /> YOUR DATA, YOUR RULES
        </h2>
        <p className="font-retro text-lg text-violet-300/85 mb-6">
          Kironomics is built to be privacy-safe. The hooks only count activity — they never read what
          you write or build. Here’s exactly what’s sent and what never leaves your machine:
        </p>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {items.map((it) => (
            <li key={it.text} className="flex items-start gap-2 font-retro text-lg">
              <span className={it.good ? 'text-emerald-300' : 'text-rose-300'}>
                {it.good ? '✓' : '✕'}
              </span>
              <span className={it.good ? 'text-violet-100' : 'text-violet-300/70 line-through'}>
                {it.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="font-retro text-base text-violet-400/70 mt-6 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          The credit database is opened with a read-only, immutable flag — Kironomics can never modify
          Kiro’s data. Uninstall any time by deleting the files in .kiro/hooks/.
        </p>
      </div>
    </section>
  );
}

function FeatureCards() {
  const cards = [
    { icon: Trophy, color: 'text-amber-300', title: 'Climb the\nLeaderboard', desc: 'Rank against builders across the user group.' },
    { icon: Star, color: 'text-violet-300', title: 'Earn User\nGroup Points', desc: 'Your Kiro usage converts into community points.' },
    { icon: Gift, color: 'text-pink-300', title: 'Win Exclusive\nKiro Swag', desc: 'Top builders take home hoodies, mugs & stickers.' },
  ];
  return (
    <section className="relative z-10 container mx-auto px-4 pb-4">
      <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-lg bg-black/40 kiro-pixel-border p-5 text-center hover:-translate-y-1 transition-transform"
            >
              <Icon className={`h-9 w-9 mx-auto mb-3 ${c.color}`} strokeWidth={1.5} />
              <h3 className="font-pixel text-[10px] text-violet-100 leading-relaxed whitespace-pre-line mb-2">
                {c.title}
              </h3>
              <p className="font-retro text-base text-violet-300/80 leading-snug">{c.desc}</p>
            </motion.div>
          );
        })}
      </div>

      {/* XP bar */}
      <div className="max-w-4xl mx-auto mt-5 rounded-lg bg-black/40 border border-violet-500/25 p-4 flex items-center gap-4">
        <span className="font-pixel text-[10px] text-violet-200 bg-violet-500/20 px-2 py-1 rounded">XP</span>
        <div className="flex-1 flex gap-1">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className={`h-4 flex-1 rounded-sm ${i < 9 ? 'bg-violet-400' : 'bg-violet-500/15'}`}
            />
          ))}
        </div>
        <span className="font-pixel text-[8px] text-violet-300/80 hidden sm:block">
          YOUR USAGE.<br />YOUR SCORE.
        </span>
      </div>
    </section>
  );
}

export default function Kironomics() {
  // Play the ghostly intro on every visit to the page.
  const [showIntro, setShowIntro] = useState(true);

  // Ensure we always land at the top when entering the arcade.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Lock background scroll while the intro is playing.
  useEffect(() => {
    if (!showIntro) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [showIntro]);

  const finishIntro = () => {
    setShowIntro(false);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="kiro-scope min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'var(--kx-bg)' }}>
      <style>{KIRO_STYLE}</style>

      <AnimatePresence>
        {showIntro && <KironomicsIntro onFinish={finishIntro} />}
      </AnimatePresence>

      {/* Atmosphere layers (behind everything) */}
      <div className="fixed inset-0 z-0 pointer-events-none" style={{
        background:
          'radial-gradient(circle at 50% -5%, rgba(139,92,246,0.22), transparent 55%), radial-gradient(circle at 85% 95%, rgba(76,29,149,0.28), transparent 50%)',
      }} />
      <div className="fixed inset-0 z-0 pointer-events-none kiro-vignette" />
      <GhostFog />
      <FloatingSpirits />
      <CursorGhost />

      {/* Roaming ghosts — they come and go across the screen */}
      <RoamingGhost top="14%" size={38} duration={19} delay={0} />
      <RoamingGhost top="34%" size={26} duration={27} delay={9} reverse />
      <RoamingGhost top="58%" size={48} duration={21} delay={3} />
      <RoamingGhost top="74%" size={22} duration={30} delay={13} reverse />
      <RoamingGhost top="90%" size={34} duration={24} delay={6} />

      <KironomicsNav />

      <main className="flex-1 relative">
        {/* HERO */}
        <section id="top" className="relative kiro-scanlines min-h-[88vh] flex items-center">
          <Starfield />
          <PixelSkyline />
          <div className="relative z-10 container mx-auto px-4 pt-8 pb-28 text-center">
            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
              className="font-pixel text-[9px] sm:text-[11px] text-violet-300/80 tracking-widest"
            >
              AWS USER GROUP MADURAI
            </motion.p>
            <p className="font-pixel text-[8px] text-violet-400/60 mt-2">· · ·　PRESENTS　· · ·</p>

            {/* Hero ghost with pulsing rings + ground shadow */}
            <div className="relative mx-auto my-8 grid place-items-center" style={{ height: 200 }}>
              <span className="absolute h-44 w-44 rounded-full border-2 border-violet-500/30 kiro-pulse-ring" />
              <span className="absolute h-44 w-44 rounded-full border-2 border-violet-500/20 kiro-pulse-ring" style={{ animationDelay: '1s' }} />
              <span className="absolute h-44 w-44 rounded-full border-2 border-violet-500/15 kiro-pulse-ring" style={{ animationDelay: '2s' }} />
              <div className="kiro-float relative">
                <div className="kiro-blink">
                  <PixelGhost size={140} />
                </div>
                {/* shadow on the ground */}
                <span className="kiro-shadow absolute left-1/2 -translate-x-1/2 -bottom-7 h-3 w-24 rounded-[50%] bg-violet-900/70 blur-md" />
              </div>
            </div>

            <motion.h1
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}
              className="font-pixel text-3xl sm:text-5xl md:text-6xl text-transparent bg-clip-text kiro-text-glow"
              style={{ backgroundImage: 'linear-gradient(180deg,#ede9fe 0%,#a78bfa 55%,#7c3aed 100%)' }}
            >
              KIRONOMICS
            </motion.h1>

            <div className="inline-block mt-5 font-pixel text-[9px] sm:text-xs text-violet-100 border border-violet-500/40 rounded px-4 py-2 bg-violet-500/10">
              THE KIRO USAGE LEADERBOARD
            </div>

            <p className="font-retro text-xl sm:text-2xl text-violet-300/90 mt-6">
              <span className="text-violet-100">BURN</span> more tokens.{' '}
              <span className="text-violet-100">RANK</span> higher.{' '}
              <span className="text-violet-100">EARN</span> more.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
              <Button
                onClick={() => scrollTo('leaderboard')}
                className="font-pixel text-[10px] bg-violet-500 hover:bg-violet-400 text-white kiro-pixel-border h-auto py-3 px-5"
              >
                <Trophy className="h-4 w-4 mr-2" /> View Leaderboard
              </Button>
              <Button
                onClick={() => scrollTo('install')}
                variant="outline"
                className="font-pixel text-[10px] bg-transparent border-violet-500/50 text-violet-200 hover:bg-violet-500/15 hover:text-violet-100 h-auto py-3 px-5"
              >
                <Zap className="h-4 w-4 mr-2" /> Install &amp; Compete
              </Button>
            </div>

            <p className="font-retro text-lg text-violet-400/70 mt-6 flex items-center justify-center gap-2">
              <Globe className="h-4 w-4" /> www.awsugmdu.in/kironomics
            </p>
          </div>
        </section>

        <FeatureCards />
        <MyStatsSection />
        <LeaderboardSection />
        <InstallSection />
        <PrivacySection />
      </main>

      <KironomicsFooter />
    </div>
  );
}
