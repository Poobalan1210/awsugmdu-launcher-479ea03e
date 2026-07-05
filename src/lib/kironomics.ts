// Kironomics leaderboard client.
//
// The Kironomics API now lives in the main website's AWS backend (Lambda +
// DynamoDB) under /kironomics, so we call it through the shared callApi() helper
// (which targets VITE_API_ENDPOINT and attaches the Cognito token). When the API
// endpoint is not configured or is unreachable, we fall back to demo data so the
// page still looks alive.

import { callApi } from './api';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT as string | undefined;

export type LeaderboardWindow = 'daily' | 'weekly' | 'all-time';

export interface KironomicsBadge {
  name: string;
  icon: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  compositeScore: number;
  title: string;
  titleIcon: string;
  plan: string;
  streakDays: number;
  totalSessions: number;
  totalMcpCalls: number;
  totalHookTriggers: number;
  creditsConsumedTotal: number;
  badges: KironomicsBadge[];
  awsVerified: boolean;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  window: LeaderboardWindow;
  /** True when the data is locally generated demo data (backend not configured/reachable). */
  isDemo: boolean;
}

export const KIRONOMICS_CONFIGURED = Boolean(API_ENDPOINT);

// --- Demo data ---------------------------------------------------------------
// Shown when the backend is not yet deployed. Clearly flagged as demo in the UI.
const DEMO_ENTRIES: Omit<LeaderboardEntry, 'rank'>[] = [
  {
    userId: 'demo-1', displayName: 'pixel_wizard', compositeScore: 58420, title: 'Session Immortal',
    titleIcon: '🏆', plan: 'Power', streakDays: 34, totalSessions: 212, totalMcpCalls: 9821,
    totalHookTriggers: 1840, creditsConsumedTotal: 540.2,
    badges: [{ name: 'Monthly Master', icon: '🌟' }, { name: 'Token Titan', icon: '💎' }], awsVerified: true,
  },
  {
    userId: 'demo-2', displayName: 'ghost_dev', compositeScore: 21340, title: 'Token Legend',
    titleIcon: '👑', plan: 'Pro+', streakDays: 18, totalSessions: 98, totalMcpCalls: 4210,
    totalHookTriggers: 730, creditsConsumedTotal: 198.4,
    badges: [{ name: 'Week Warrior', icon: '🔥' }, { name: 'Century Club', icon: '💯' }], awsVerified: true,
  },
  {
    userId: 'demo-3', displayName: 'cloud_ninja', compositeScore: 8720, title: 'Session Warrior',
    titleIcon: '⚔️', plan: 'Pro', streakDays: 9, totalSessions: 61, totalMcpCalls: 2104,
    totalHookTriggers: 402, creditsConsumedTotal: 71.8,
    badges: [{ name: 'Century Club', icon: '💯' }], awsVerified: false,
  },
  {
    userId: 'demo-4', displayName: 'madurai_maker', compositeScore: 3120, title: 'Tool Wielder',
    titleIcon: '🔧', plan: 'Pro', streakDays: 5, totalSessions: 33, totalMcpCalls: 980,
    totalHookTriggers: 210, creditsConsumedTotal: 24.5,
    badges: [{ name: 'Hook Hero', icon: '🦸' }], awsVerified: false,
  },
  {
    userId: 'demo-5', displayName: 'serverless_sam', compositeScore: 940, title: 'Hook Wrangler',
    titleIcon: '🪝', plan: 'Free', streakDays: 3, totalSessions: 14, totalMcpCalls: 320,
    totalHookTriggers: 88, creditsConsumedTotal: 6.1,
    badges: [{ name: 'First Session', icon: '🎯' }], awsVerified: false,
  },
  {
    userId: 'demo-6', displayName: 'kiro_rookie', compositeScore: 180, title: 'Prompt Apprentice',
    titleIcon: '📝', plan: 'Free', streakDays: 1, totalSessions: 4, totalMcpCalls: 52,
    totalHookTriggers: 19, creditsConsumedTotal: 0.9,
    badges: [{ name: 'First Session', icon: '🎯' }], awsVerified: false,
  },
];

function demoResult(window: LeaderboardWindow): LeaderboardResult {
  // Scale scores down a little for shorter windows so each tab feels distinct.
  const factor = window === 'all-time' ? 1 : window === 'weekly' ? 0.35 : 0.08;
  const entries = DEMO_ENTRIES
    .map((e) => ({
      ...e,
      compositeScore: Math.round(e.compositeScore * factor),
      creditsConsumedTotal: Math.round(e.creditsConsumedTotal * factor * 10) / 10,
    }))
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  return { entries, window, isDemo: true };
}

/**
 * Fetch the leaderboard for a time window. Never throws — on any failure it
 * returns demo data flagged with `isDemo: true` so the UI can render gracefully.
 */
export async function getKironomicsLeaderboard(
  window: LeaderboardWindow = 'all-time',
): Promise<LeaderboardResult> {
  if (!API_ENDPOINT) {
    return demoResult(window);
  }

  try {
    const json = await callApi<{ data?: { entries?: unknown[] } }>(
      `/kironomics/leaderboard?window=${window}`,
    );
    const entries: LeaderboardEntry[] = (json?.data?.entries ?? []).map((e: any) => ({
      rank: e.rank,
      userId: e.userId,
      displayName: e.displayName,
      compositeScore: e.compositeScore ?? 0,
      title: e.title ?? 'Kiro Novice',
      titleIcon: e.titleIcon ?? '🌱',
      plan: e.plan ?? 'Auto-Auto',
      streakDays: e.streakDays ?? 0,
      totalSessions: e.totalSessions ?? 0,
      totalMcpCalls: e.totalMcpCalls ?? 0,
      totalHookTriggers: e.totalHookTriggers ?? 0,
      creditsConsumedTotal: e.creditsConsumedTotal ?? 0,
      badges: e.badges ?? [],
      awsVerified: e.awsVerified ?? false,
    }));
    return { entries, window, isDemo: false };
  } catch {
    // Backend not reachable — degrade to demo data instead of breaking the page.
    return demoResult(window);
  }
}

// --- Per-user profile data ---------------------------------------------------

export interface KironomicsMetrics {
  userId: string;
  displayName: string;
  compositeScore: number;
  title: string;
  titleIcon: string;
  totalMcpCalls: number;
  totalHookTriggers: number;
  totalSessions: number;
  totalDuration: number;
  streakDays: number;
  longestStreak: number;
  badges: KironomicsBadge[];
  plan: string;
  // Private (owner-only): the backend returns null for these unless you're the owner.
  planPrice: number | null;
  monthlyLimit: number | null;
  currentUsage: number | null;
  percentageUsed: number | null;
  creditsRemaining: number | null;
  creditsConsumedTotal: number | null;
  resetDate: string | null;
  daysUntilReset: number | null;
  dailyBurnRate: number | null;
  daysRemaining: number | null;
  isOwner?: boolean;
}

export interface HeatmapDay {
  date: string;
  count: number;
  level: number;
}

/** Fetch a single user's full metrics. Returns null if unavailable (demo/unreachable/404). */
export async function getKironomicsUserMetrics(userId: string): Promise<KironomicsMetrics | null> {
  if (!API_ENDPOINT) return null;
  try {
    const json = await callApi<{ data?: KironomicsMetrics }>(
      `/kironomics/users/${encodeURIComponent(userId)}/metrics`,
    );
    return json?.data ?? null;
  } catch {
    return null;
  }
}

/** Fetch a user's 365-day activity heatmap. Returns [] if unavailable. */
export async function getKironomicsUserHeatmap(userId: string): Promise<HeatmapDay[]> {
  if (!API_ENDPOINT) return [];
  try {
    const json = await callApi<{ data?: HeatmapDay[] }>(
      `/kironomics/users/${encodeURIComponent(userId)}/heatmap`,
    );
    return json?.data ?? [];
  } catch {
    return [];
  }
}
