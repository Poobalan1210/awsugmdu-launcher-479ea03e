/**
 * Kiro University Build-Along — campaign client.
 *
 * Kiro University is Kiro's own challenge. This campaign runs alongside it: we
 * track community participation and award community rewards. We never imply we
 * run their challenge or that AWS endorses us, and entries are always submitted
 * by the participant on kiro.dev.
 *
 * Endpoints degrade rather than throw. The page must render usefully before the
 * campaign backend is deployed, so every read returns null/[] on failure and the
 * UI shows an explicit "not connected yet" state instead of an error boundary.
 */
import { callApi } from './api';

export const CAMPAIGN_ID = 'kiro-university-2026';

// ── Challenge constants ───────────────────────────────────────────
// Kiro's window opens Mon 21 Sep 2026 09:00 PT. September is PDT (UTC-7), so
// that is 16:00Z. Entries close Mon 5 Oct 23:59 PT = Tue 6 Oct 12:29 IST.
//
// These live in exactly one place because an hour of drift either wrongly tells
// someone their project is disqualified, or wrongly tells them it is fine.
export const WINDOW_START_ISO = '2026-09-21T16:00:00Z';
export const ENTRY_DEADLINE_ISO = '2026-10-06T06:59:00Z';

/** Always show Indian participants the IST deadline — the PT date is the day
 *  before in India and has cost people a full day in past challenges. */
export const ENTRY_DEADLINE_IST_LABEL = 'Tue 6 Oct, 12:29 PM IST';

/** Kiro requires the GitHub account to be at least 3 months old. The terms
 *  never state "3 months from when", so we band it rather than guess: anything
 *  before SAFE is fine under any reading, after FUZZY is excluded under any
 *  reading, and between the two is genuinely ambiguous. */
export const ACCOUNT_SAFE_BEFORE_ISO = '2026-06-21T00:00:00Z';
export const ACCOUNT_FUZZY_BEFORE_ISO = '2026-07-05T00:00:00Z';

/**
 * How we can tell a lesson is done. Must match LESSON_DEFS in the campaign
 * Lambda, which does the checking; this copy only picks the right control
 * before the member's status has loaded.
 *   repo          read from the repo; nothing to tick
 *   repo-or-self  read from the repo when we can, otherwise the member ticks it
 *   self          nothing in a repo shows it, so the member ticks it
 */
export type LessonCheck = 'repo' | 'repo-or-self' | 'self';

export interface Lesson {
  /** Same ids as the backend: '1'..'7', 'bonus1', 'bonus2'. */
  n: string;
  title: string;
  credits: number;
  bonus?: boolean;
  /** A restriction Kiro states for the lesson. */
  note?: string;
  check: LessonCheck;
  docsUrl: string;
  /** What the feature is, in one line, for someone who has never used it. */
  what: string;
  /** What to add, for someone who has not done it yet. */
  hint: string;
}

/**
 * Kiro University's lessons, as published on kiro.dev/2026/university. Credit
 * values are Kiro's; Kiro awards them, not us.
 */
export const LESSONS: Lesson[] = [
  {
    n: '1', title: 'Spec-driven development', credits: 250, check: 'repo',
    docsUrl: 'https://kiro.dev/docs/specs/',
    what: 'Plan a feature as requirements, a design and a task list, then have Kiro build it from that plan.',
    hint: 'Create a spec in Kiro and commit .kiro/specs/<feature>/: requirements.md (or bugfix.md), design.md and tasks.md.',
  },
  {
    n: '2', title: 'Steering documents', credits: 250, check: 'repo',
    docsUrl: 'https://kiro.dev/docs/steering/',
    what: "Markdown files with your project's rules and context, like your stack and conventions, which Kiro follows in every chat.",
    hint: "Add markdown rules in .kiro/steering/, or an AGENTS.md. Steering in ~/.kiro/steering/ stays on your machine, where reviewers can't see it.",
  },
  {
    n: '3', title: 'Hooks', credits: 250, check: 'repo',
    docsUrl: 'https://kiro.dev/docs/hooks/',
    what: 'Automations Kiro runs when something happens, like checking a file every time you save it.',
    hint: "Add a hook in .kiro/hooks/ that does something for your project. The Kironomics tracking hook our setup added doesn't count.",
  },
  {
    n: '4', title: 'Property-based testing', credits: 500, note: 'IDE only', check: 'repo-or-self',
    docsUrl: 'https://kiro.dev/docs/specs/correctness/',
    what: 'Tests that check a rule holds for hundreds of generated inputs, instead of a few examples you pick by hand.',
    hint: "In the Kiro IDE, a spec's design step suggests property-based tests as optional tasks. Run them and commit the tests.",
  },
  {
    n: '5', title: 'Powers', credits: 500, check: 'self',
    docsUrl: 'https://kiro.dev/docs/powers/',
    what: 'Add-ons that give Kiro the tools and know-how for a service or framework, loaded only when you need them.',
    hint: 'Install a power and use it in your build. Powers install on your machine, not in your repo, so name the power in your entry and show it in your video.',
  },
  {
    n: '6', title: 'Model Context Protocol (MCP)', credits: 1000, check: 'repo',
    docsUrl: 'https://kiro.dev/docs/mcp/',
    what: 'Connects Kiro to outside tools and data, like docs, databases or APIs, through MCP servers.',
    hint: "Add at least one server to .kiro/settings/mcp.json. Servers in your user-level config stay on your machine, where reviewers can't see them.",
  },
  {
    n: '7', title: 'Custom agents', credits: 1000, check: 'repo',
    docsUrl: 'https://kiro.dev/docs/custom-agents/',
    what: 'Your own agent for a specific job, with its own instructions, tools and permissions.',
    hint: 'Add an agent config to .kiro/agents/ as a .json or .md file.',
  },
  {
    n: 'bonus1', title: 'Kiro Web and cloud sessions', credits: 250, bonus: true, note: 'Paid plans', check: 'self',
    docsUrl: 'https://kiro.dev/blog/agentic-engineering-in-the-cloud/',
    what: 'Work with Kiro from the browser, or run sessions in the cloud instead of on your own machine.',
    hint: "Use Kiro Web, a cloud session or cloud configuration for your build. A repo doesn't show this, so tick it when you have.",
  },
  {
    n: 'bonus2', title: 'Package a Kiro power', credits: 250, bonus: true, check: 'repo-or-self',
    docsUrl: 'https://kiro.dev/docs/powers/create/',
    what: 'Bundle your own skills or MCP servers as a power that other people can install.',
    hint: 'Build your own power (a plugin.json with skills or an mcp.json) and include it in your submission. A separate repo is fine.',
  },
];

export const COMPLETION_AWARD_CREDITS = 1000;
export const MAX_CREDITS = 5250;

/** One lesson's standing for the signed-in member, as the backend reports it. */
export interface LessonState {
  id: string;
  check: LessonCheck;
  /** False until their repo has been read under the current rules. */
  repoChecked: boolean;
  /** Evidence found in the repo. */
  found: boolean;
  /** What was found, or why nothing counted. */
  detail: string;
  ticked: boolean;
  /** found or ticked, whichever this lesson allows. */
  counted: boolean;
}

// ── What Kiro's entry form requires ───────────────────────────────

export const ENTRY_FORM_URL = 'https://kiro.dev/2026/university/';
export const TERMS_URL = 'https://kiro.dev/2026/university/terms/';

/** Judging concludes by this date; Kiro's terms bar committing until then. */
export const JUDGING_ENDS_LABEL = '19 Oct 2026';

export type RequirementStatus =
  /** We checked it and it holds. */
  | 'verified'
  /** We checked it and it is disqualifying as-is. */
  | 'blocked'
  /** Only the participant can confirm this — we must not claim otherwise. */
  | 'confirm'
  /** Not checkable yet, usually because no repo is linked. */
  | 'unknown';

export interface SubmissionRequirement {
  id: string;
  label: string;
  detail: string;
  /** 'auto' = derived from the repo sweep. 'you' = self-confirmed. */
  source: 'auto' | 'you';
  /**
   * 'eligibility' = rules about the repo and account, mostly checked for you.
   * 'entry' = what you hand in, which only you can confirm.
   */
  group: 'eligibility' | 'entry';
  /** Status line before it is ticked, when "Tick when done" doesn't fit. */
  tickPrompt?: string;
}

/**
 * Everything Kiro's entry form and terms require, in the order it bites.
 *
 * Several of these appear nowhere on Kiro's landing page — the account-age rule
 * and the no-prior-commits rule are terms-only, which is exactly why people miss
 * them until it is too late to fix.
 */
export const SUBMISSION_REQUIREMENTS: SubmissionRequirement[] = [
  {
    id: 'repo_public',
    label: 'Public GitHub repo that you own',
    detail: 'Private repos cannot be judged. It must be under your own account, not an organisation.',
    source: 'auto',
    group: 'eligibility',
  },
  {
    id: 'first_commit',
    label: 'No commits before 21 Sep, 09:00 PT',
    detail: 'Deleting files does not fix it — the history is the problem. Never fork or clone an existing project.',
    source: 'auto',
    group: 'eligibility',
  },
  {
    id: 'account_age',
    label: 'GitHub account at least 3 months old',
    detail: 'Nobody can fix this before the deadline. You can still earn every community reward with us.',
    source: 'you',
    group: 'eligibility',
    tickPrompt: 'Tick to confirm',
  },
  {
    id: 'kiro_folder',
    label: '.kiro folder committed',
    detail: 'This is what reviewers read to score each lesson. Never put a bare .kiro line in .gitignore.',
    source: 'auto',
    group: 'eligibility',
  },
  {
    id: 'working_project',
    label: 'A project that actually runs',
    detail: 'Functional, not a static mockup. If it cannot be demonstrated on screen, it is not done.',
    source: 'you',
    group: 'entry',
  },
  {
    id: 'demo_video',
    label: 'Demo video, 30 seconds to 3 minutes',
    detail: 'Publicly viewable while signed out. Anything past 3 minutes is not watched.',
    source: 'you',
    group: 'entry',
  },
  {
    id: 'social_post',
    label: 'Public post on X or LinkedIn',
    detail: 'Must carry #KiroUniversity and #BuildWithKiro, tag @kirodotdev on X or @kiro on LinkedIn, and include your repo link, a 2–3 sentence description and the video.',
    source: 'you',
    group: 'entry',
  },
  {
    id: 'lesson_writeup',
    label: 'One line per lesson, saying how you used it',
    detail: 'The entry form asks for this explicitly. Note each one down as you build — it is hard to reconstruct a week later.',
    source: 'you',
    group: 'entry',
  },
  {
    id: 'entry_form',
    label: 'Entry form submitted on kiro.dev',
    detail: 'With the correct email — that is where credits are sent. One entry per person, individual work only.',
    source: 'you',
    group: 'entry',
  },
  {
    id: 'stop_committing',
    label: 'Stop committing once you submit',
    detail: `Commits after submission, until judging concludes around ${JUDGING_ENDS_LABEL}, can disqualify the entry.`,
    source: 'you',
    group: 'entry',
    tickPrompt: 'Tick after you submit',
  },
];

/**
 * Status for the requirements we can actually derive. Everything else stays
 * 'confirm' — claiming a green tick we have not verified would be worse than
 * saying nothing, because the participant would stop checking.
 */
export function requirementStatus(
  id: string,
  repo: RepoStats | null | undefined,
): RequirementStatus {
  // Only the participant can confirm these, repo or no repo.
  if (SUBMISSION_REQUIREMENTS.find((r) => r.id === id)?.source === 'you') return 'confirm';
  if (!repo?.fullName) return 'unknown';
  switch (id) {
    case 'repo_public':
      return repo.unreachable ? 'unknown' : 'verified';
    case 'first_commit':
      if (repo.eligible === true) return 'verified';
      if (repo.eligible === false) return 'blocked';
      return 'unknown';
    case 'kiro_folder':
      return repo.hasKiroFolder ? 'verified' : 'blocked';
    default:
      return 'confirm';
  }
}

/** Pre-filled social post so the required tags and hashtags cannot be forgotten. */
export function socialPostTemplate(repoUrl?: string, description?: string): string {
  const desc = description?.trim() || '[2–3 sentences on what you built and what it does]';
  const repo = repoUrl || '[your public repo link]';
  return [
    desc,
    '',
    `Repo: ${repo}`,
    'Demo: [your public video link]',
    '',
    'Built with @kirodotdev for the Kiro University Challenge 🎓',
    '#KiroUniversity #BuildWithKiro',
  ].join('\n');
}

// ── Reward tiers ──────────────────────────────────────────────────

export interface RewardTier {
  id: string;
  name: string;
  /** Inclusive upper bound on validated position. */
  upTo: number;
  blurb: string;
  /** Tailwind classes for the tier accent. */
  accent: string;
}

/**
 * Positional tiers, assigned on the validated position — NOT on raw submission.
 *
 * That ordering matters: if the tier were claimed the moment someone submits, an
 * empty repo could take the top prize and a real entry would be pushed down. We
 * assign when an entry passes validation, so position reflects finished work.
 *
 * Everyone past the last tier still earns points, the badge and the showcase —
 * a hard cutoff would remove any reason to submit late, and most submissions in
 * a two-week challenge land in the final 48 hours.
 */
export const REWARD_TIERS: RewardTier[] = [
  {
    id: 'tier-a',
    name: 'First 5 validated',
    upTo: 5,
    blurb: 'Premium swag — jacket or hoodie, plus the digital badge.',
    accent: 'from-amber-500/20 to-orange-500/10 border-amber-500/40',
  },
  {
    id: 'tier-b',
    name: 'Next 10',
    upTo: 15,
    blurb: 'T-shirt and sticker pack, plus the digital badge.',
    accent: 'from-slate-400/20 to-slate-500/10 border-slate-400/40',
  },
  {
    id: 'tier-c',
    name: 'Next 20',
    upTo: 35,
    blurb: 'Sticker pack and the digital badge.',
    accent: 'from-orange-700/20 to-amber-700/10 border-orange-700/40',
  },
];

export const BASE_REWARD_BLURB =
  'Community points, the digital badge and a place in the showcase.';

/** Which tier a validated position falls into, or null for the base reward. */
export function tierForPosition(position: number | null | undefined): RewardTier | null {
  if (!position || position < 1) return null;
  return REWARD_TIERS.find((t) => position <= t.upTo) ?? null;
}

/** Remaining slots in each tier, for the live "3 left" affordance. */
export function slotsRemaining(validatedCount: number) {
  const consumed = validatedCount;
  return REWARD_TIERS.map((tier, i) => {
    const start = i === 0 ? 0 : REWARD_TIERS[i - 1].upTo;
    const size = tier.upTo - start;
    const taken = Math.max(0, Math.min(size, consumed - start));
    return { tier, size, taken, left: Math.max(0, size - taken) };
  });
}

// ── Types ─────────────────────────────────────────────────────────

export type ParticipationStatus = 'joined' | 'building' | 'submitted' | 'validated';

export interface RepoStats {
  fullName?: string;
  repoUrl?: string;
  /** Distinct days with at least one commit, bucketed in Asia/Kolkata. */
  activeDays: number;
  commitCount: number;
  lastPushAt?: string | null;
  /** True when we could not reach the repo on the last sweep. */
  unreachable?: boolean;
  /** null when the repo is empty — expected on day one, not a failure. */
  eligible?: boolean | null;
  hasKiroFolder?: boolean;
  /** IST-bucketed days with at least one in-window commit. */
  activeDayList?: string[];
}

export interface MyCampaign {
  status: ParticipationStatus;
  joinedAt: string;
  ageConfirmed: boolean;
  /** False when 18+/account-age rules exclude them from Kiro's credits. They
   *  still earn every community reward — we must never silently drop them. */
  eligibleForKiroCredits: boolean;
  githubLogin?: string;
  kironomicsConnected: boolean;
  /** Set when an older setup published the key into a public repo. */
  kironomicsKeyExposed?: boolean;
  repo?: RepoStats | null;
  /** Ids of the lessons that currently count. */
  lessonsRecorded: string[];
  /** Every lesson's standing, in LESSONS order. */
  lessons?: LessonState[];
  validatedPosition?: number | null;
  externalEntryConfirmedAt?: string | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  avatar?: string;
  activeDays: number;
  commitCount: number;
  lessonsRecorded: number;
  validated: boolean;
}

export interface JoinPayload {
  ageConfirmed: boolean;
  consentToShowcase: boolean;
  projectName?: string;
}

export interface SetupCode {
  code: string;
  expiresAt: string;
}

// ── Reads (degrade, never throw) ──────────────────────────────────

export async function getMyCampaign(): Promise<MyCampaign | null> {
  try {
    const res = await callApi<{ participation?: MyCampaign }>(`/campaign/${CAMPAIGN_ID}/me`);
    return res?.participation ?? null;
  } catch {
    return null;
  }
}

export async function getCampaignLeaderboard(): Promise<LeaderboardRow[]> {
  try {
    const res = await callApi<{ entries?: LeaderboardRow[] }>(
      `/campaign/${CAMPAIGN_ID}/leaderboard`,
    );
    return res?.entries ?? [];
  } catch {
    return [];
  }
}

export interface CampaignStats {
  validatedCount: number;
  joinedCount: number;
  withRepoCount: number;
}

export async function getCampaignStats(): Promise<CampaignStats> {
  try {
    const res = await callApi<Partial<CampaignStats>>(`/campaign/${CAMPAIGN_ID}/stats`);
    return {
      validatedCount: res?.validatedCount ?? 0,
      joinedCount: res?.joinedCount ?? 0,
      withRepoCount: res?.withRepoCount ?? 0,
    };
  } catch {
    return { validatedCount: 0, joinedCount: 0, withRepoCount: 0 };
  }
}

// ── Writes (throw, so the UI can surface a real failure) ──────────

export async function joinCampaign(payload: JoinPayload): Promise<MyCampaign> {
  const res = await callApi<{ participation: MyCampaign }>(`/campaign/${CAMPAIGN_ID}/join`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.participation;
}

/**
 * Mint a short-lived, single-use code for the setup script. The script exchanges
 * it for the Kironomics token, so the permanent token never appears in a command
 * line, shell history, or a screenshot shared in a group chat.
 */
export async function mintSetupCode(): Promise<SetupCode> {
  return await callApi<SetupCode>(`/campaign/${CAMPAIGN_ID}/setup-code`, { method: 'POST' });
}

/** Rotate the Kironomics key. Needed by anyone whose older setup committed the
 *  key into a public repo — until now there was no way to replace it. */
export async function rotateKironomicsKey(): Promise<{ apiKey: string; rotated: boolean }> {
  const res = await callApi<{ data?: { apiKey: string; rotated: boolean } }>(
    '/kironomics/users/profile',
    { method: 'POST', body: JSON.stringify({ rotate: true }) },
  );
  return { apiKey: res?.data?.apiKey ?? '', rotated: Boolean(res?.data?.rotated) };
}

// ── Admin ─────────────────────────────────────────────────────────

/** How far a participant has got, from joining to a validated entry. */
export type ParticipantStage =
  | 'not-started' | 'command-generated' | 'setup-stopped' | 'building' | 'submitted' | 'validated';

export interface AdminParticipant {
  userId: string;
  name: string;
  joinedAt: string | null;
  stage: ParticipantStage;
  repoFullName: string | null;
  repoUrl: string | null;
  repoUnreachable: boolean;
  /** Distinct IST days with a commit inside the challenge window. */
  activeDays: number;
  /** Most recent of those days, YYYY-MM-DD in IST. */
  lastActiveDay: string | null;
  commitCount: number;
  /** Core lessons counted, out of 7. */
  lessonsDone: number;
  /** From their site profile; null when they have no profile record. */
  profile: {
    type: 'student' | 'professional' | null;
    /** College for students, company for professionals. */
    organisation: string;
    designation: string;
    city: string;
    country: string;
  } | null;
}

/** Every participant, with profile details. Admins only. */
export async function getCampaignAdminParticipants(): Promise<AdminParticipant[]> {
  const res = await callApi<{ participants?: AdminParticipant[] }>(
    `/campaign/${CAMPAIGN_ID}/admin/participants`,
  );
  return res.participants ?? [];
}

/**
 * Stop reminder emails, from the link in one. Needs no sign-in: the signature
 * in the link is the authorisation. `test` links, from the organisers' test
 * sends, are checked but change nothing.
 */
export async function unsubscribeFromReminders(link: {
  campaignId: string; userId: string; signature: string; test: boolean;
}): Promise<{ ok: boolean; test?: boolean }> {
  return callApi(`/campaign/${encodeURIComponent(link.campaignId)}/unsubscribe`, {
    method: 'POST',
    body: JSON.stringify({ u: link.userId, s: link.signature, test: link.test }),
  });
}

/**
 * Save the member's ticks: the full set, for the lessons a repo can't show.
 * Every other lesson is read from the repo and ignores ticks.
 *
 * `schema: 2` marks these as ticked against the real lesson titles. The
 * backend ignores ticks without it, which come from the earlier page that
 * labelled lessons under a wrong guessed mapping.
 */
export async function setLessons(ticks: string[]): Promise<LessonState[]> {
  const res = await callApi<{ lessons?: LessonState[] }>(`/campaign/${CAMPAIGN_ID}/lessons`, {
    method: 'POST',
    body: JSON.stringify({ schema: 2, lessons: ticks }),
  });
  return res.lessons ?? [];
}

export async function confirmExternalEntry(): Promise<void> {
  await callApi(`/campaign/${CAMPAIGN_ID}/confirm-entry`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true }),
  });
}

// ── Presentation helpers ──────────────────────────────────────────

export function timeLeftToDeadline(now: Date = new Date()) {
  const ms = Date.parse(ENTRY_DEADLINE_ISO) - now.getTime();
  if (ms <= 0) return { passed: true as const, days: 0, hours: 0, minutes: 0 };
  return {
    passed: false as const,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
  };
}

export type Platform = 'macos' | 'linux' | 'windows';

export function detectPlatform(): Platform {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'macos';
  return 'linux';
}

const SITE_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : 'https://www.awsugmdu.in';

/**
 * The command a participant copies. One line per platform.
 *
 * Downloaded and saved rather than piped into a shell: `curl | sh` gives the
 * member nothing to inspect, and this is a student community where we set the
 * habit. The setup code is single-use and short-lived.
 */
export function setupCommand(platform: Platform, code: string, projectName?: string): string {
  const name = projectName?.trim() ? ` ${projectName.trim()}` : '';
  const c = code || '<SETUP_CODE>';
  if (platform === 'windows') {
    return [
      `Invoke-WebRequest -UseBasicParsing ${SITE_ORIGIN}/kiro/setup.ps1 -OutFile "$env:TEMP\\ugmdu-setup.ps1"`,
      `powershell -ExecutionPolicy Bypass -File "$env:TEMP\\ugmdu-setup.ps1" ${c}${name}`,
    ].join('\n');
  }
  return [
    `curl -fsSL ${SITE_ORIGIN}/kiro/setup.sh -o /tmp/ugmdu-setup.sh`,
    `sh /tmp/ugmdu-setup.sh ${c}${name}`,
  ].join('\n');
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  macos: 'macOS',
  linux: 'Linux',
  windows: 'Windows',
};
