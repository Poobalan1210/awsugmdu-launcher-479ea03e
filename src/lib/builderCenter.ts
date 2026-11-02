import { callApi } from './api';
import type { SpotlightSubmission, Submission } from '@/data/mockData';

/**
 * Builder Center backfill: AWS Builder Center blogs and projects members
 * wrote, added to their profile. Members claim suggestions, or link their
 * Builder Center account with a bio code so their articles are added
 * automatically, and a weekly sync keeps both current. Served by the
 * builder-center-crud Lambda. Challenge wins will be added here later.
 */

export type ContentType = 'blog' | 'project';

export type BuilderArticleStatus =
  | 'suggested'
  | 'claimed'
  | 'dismissed'
  /** Submitted to a sprint or the Community Spotlight after it was suggested. */
  | 'already_on_platform'
  /** Claimed by another account matched to the same Builder Center author. */
  | 'claimed_elsewhere';

export interface BuilderArticle {
  contentId: string;
  /** Builder Center doesn't mark projects; this is a guess the member can change before claiming. */
  type: ContentType;
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  tags: string[];
  /** YYYY-MM-DD. */
  publishedAt: string | null;
  likes: number;
  comments: number;
  /** The day likes and comments were counted. */
  statsAsOf: string | null;
  claimedAt: string | null;
}

/** The member's own view of an article, with what they did with it. */
export interface OwnBuilderArticle extends BuilderArticle {
  status: BuilderArticleStatus;
  builderAlias: string | null;
  mentionsUGMadurai: boolean;
  pointsAwarded: number;
  /** Added by a linked account rather than claimed by hand. */
  autoAdded: boolean;
}

export type BuilderLinkStatus = 'matched' | 'verified' | 'rejected';

export interface BuilderLink {
  alias: string;
  /**
   * matched: we think this Builder Center account is theirs.
   * verified: they proved it with a bio code; new articles are added automatically.
   * rejected: they said it isn't theirs.
   */
  status: BuilderLinkStatus;
  source: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  lastSyncedAt: string | null;
  profileUrl: string;
}

export interface BuilderCenterSettings {
  /** Members see suggestions, claim them and link accounts only while this is on. */
  claimsOpen: boolean;
  /** Points per blog. */
  pointsPerArticle: number;
  /** Used instead of pointsPerArticle when the blog names AWS UG Madurai. 0 means use pointsPerArticle. */
  pointsPerUGMaduraiArticle: number;
  pointsPerProject: number;
  /** Used instead of pointsPerProject when the project names AWS UG Madurai. 0 means use pointsPerProject. */
  pointsPerUGMaduraiProject: number;
  /** Most points one member can get from Builder Center, blogs and projects together. 0 means no limit. */
  maxPointsPerMember: number;
}

export interface AdminBuilderCenterSettings extends BuilderCenterSettings {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PendingVerification {
  alias: string;
  code: string;
  expiresAt: string;
  profileName: string | null;
}

export interface MyBuilderContent {
  settings: BuilderCenterSettings;
  /** Points already given for this member's claimed articles. */
  awardedPoints: number;
  articles: OwnBuilderArticle[];
  links: BuilderLink[];
  pendingVerification: PendingVerification | null;
  lastSyncAt: string | null;
}

export interface ClaimResult {
  results: { contentId: string; status: 'claimed' | 'skipped'; reason?: string; points?: number }[];
  claimed: number;
  pointsAdded: number;
  points: number | null;
  redeemablePoints: number | null;
}

export interface LinkStartResult {
  alias: string;
  code: string;
  expiresAt: string;
  profileName: string | null;
  profileUrl: string;
}

export interface LinkVerifyResult {
  alias: string;
  added: number;
  pointsAdded: number;
  /** False until the first weekly sync has read the feed: then only suggestions were added. */
  feedIndexed: boolean;
  points: number | null;
  redeemablePoints: number | null;
}

export type StatusCounts = Record<BuilderArticleStatus, number>;

export interface BuilderSyncState {
  status: 'crawling' | 'applying' | 'done' | 'failed' | null;
  trigger: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  finishedAt: string | null;
  lastCompletedAt: string | null;
  pages: number;
  articles: number;
  stats: { refreshed: number; newSuggestions: number; autoAdded: number; pointsAwarded: number; linksMatched: number } | null;
  error: string | null;
}

export interface BuilderCenterSummary {
  settings: AdminBuilderCenterSettings;
  totals: StatusCounts & {
    articles: number;
    pointsAwarded: number;
    byType: Record<ContentType, number>;
    links: Record<BuilderLinkStatus, number>;
  };
  members: {
    userId: string;
    name: string | null;
    avatar: string | null;
    builderAlias: string | null;
    links: { alias: string; status: BuilderLinkStatus; verifiedAt: string | null }[];
    counts: StatusCounts;
    byType: Record<ContentType, number>;
    /** Articles whose type the member changed before claiming. */
    relabelled: number;
    pointsAwarded: number;
    lastClaimedAt: string | null;
  }[];
  sync: BuilderSyncState | null;
}

export interface ImportSummary {
  dryRun: boolean;
  statsAsOf: string;
  rows: number;
  created: number;
  updated: number;
  markedOnPlatform: number;
  membersWithNewSuggestions: number;
  byType?: Record<ContentType, number>;
  linksMatched?: number;
  skipped: Record<string, number>;
  failureCount?: number;
  failures?: { userId: string; contentId?: string; alias?: string; error: string }[];
}

// ── Member ────────────────────────────────────────────────────────

export async function getMyBuilderContent(): Promise<MyBuilderContent> {
  const r = await callApi<MyBuilderContent>('/builder-center/me');
  return { ...r, links: r.links || [], pendingVerification: r.pendingVerification || null };
}

/** Claimed articles of any member, for their public profile. */
export async function getMemberBuilderArticles(userId: string): Promise<BuilderArticle[]> {
  const r = await callApi<{ articles: BuilderArticle[] }>(`/builder-center/users/${encodeURIComponent(userId)}/articles`);
  return (r.articles || []).map(a => ({ ...a, type: a.type === 'project' ? 'project' : 'blog' }));
}

/** The API takes at most this many ids per request. */
export const MAX_IDS_PER_REQUEST = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Claim suggestions. `types` holds the member's choice where they switched blog/project. */
export async function claimBuilderArticles(
  contentIds: string[],
  types: Record<string, ContentType> = {},
): Promise<ClaimResult> {
  const total: ClaimResult = { results: [], claimed: 0, pointsAdded: 0, points: null, redeemablePoints: null };
  for (const ids of chunks(contentIds, MAX_IDS_PER_REQUEST)) {
    const chunkTypes = Object.fromEntries(ids.filter(id => types[id]).map(id => [id, types[id]]));
    const r = await callApi<ClaimResult>('/builder-center/me/claim', {
      method: 'POST',
      body: JSON.stringify({ contentIds: ids, types: chunkTypes }),
    });
    total.results.push(...r.results);
    total.claimed += r.claimed;
    total.pointsAdded += r.pointsAdded;
    total.points = r.points;
    total.redeemablePoints = r.redeemablePoints;
  }
  return total;
}

async function move(action: 'dismiss' | 'restore', contentIds: string[]): Promise<string[]> {
  const moved: string[] = [];
  for (const ids of chunks(contentIds, MAX_IDS_PER_REQUEST)) {
    const r = await callApi<{ moved: string[] }>(`/builder-center/me/${action}`, {
      method: 'POST',
      body: JSON.stringify({ contentIds: ids }),
    });
    moved.push(...(r.moved || []));
  }
  return moved;
}

/** Mark suggestions as "not mine". */
export const dismissBuilderArticles = (contentIds: string[]) => move('dismiss', contentIds);
/** Undo "not mine". */
export const restoreBuilderArticles = (contentIds: string[]) => move('restore', contentIds);

/** "This isn't my Builder Center profile": hides its suggestions and skips it from now on. */
export async function rejectBuilderAlias(alias: string): Promise<{ alias: string; dismissed: number }> {
  return callApi('/builder-center/me/aliases/reject', { method: 'POST', body: JSON.stringify({ alias }) });
}

export async function restoreBuilderAlias(alias: string): Promise<{ alias: string; restored: number }> {
  return callApi('/builder-center/me/aliases/restore', { method: 'POST', body: JSON.stringify({ alias }) });
}

/** Step 1 of linking: a code to put in the Builder Center bio. */
export async function startBuilderLink(alias: string): Promise<LinkStartResult> {
  return callApi('/builder-center/me/link/start', { method: 'POST', body: JSON.stringify({ alias }) });
}

/** Step 2 of linking: we check the bio and add the account's articles. */
export async function verifyBuilderLink(): Promise<LinkVerifyResult> {
  return callApi('/builder-center/me/link/verify', { method: 'POST', body: '{}' });
}

export interface AddArticleResult {
  article: OwnBuilderArticle | null;
  pointsAdded: number;
  points: number | null;
  redeemablePoints: number | null;
}

/**
 * Add one of a linked account's Builder Center articles by its link, as a blog
 * or a project, without waiting for the weekly sync.
 */
export async function addBuilderArticle(url: string, type: ContentType): Promise<AddArticleResult> {
  return callApi('/builder-center/me/articles/add', { method: 'POST', body: JSON.stringify({ url, type }) });
}

/** Whether a link points at a Builder Center article. */
export function isBuilderArticleUrl(url: string): boolean {
  return /^https:\/\/builder\.aws\.com\/content\/[A-Za-z0-9]{10,40}(\/\S*)?$/.test(url.trim());
}

/** Stop adding new articles automatically. Articles already added stay. */
export async function removeBuilderLink(alias: string): Promise<{ alias: string; removed: boolean }> {
  return callApi('/builder-center/me/link/remove', { method: 'POST', body: JSON.stringify({ alias }) });
}

/** A Builder Center alias from "alias", "@alias" or a profile link; null if it isn't one. */
export function parseBuilderAlias(input: string): string | null {
  let s = input.trim();
  const fromUrl = /builder\.aws\.com\/community\/@([^/?#\s]+)/i.exec(s);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
  return /^[a-z0-9._-]{1,60}$/.test(s) ? s : null;
}

export function builderProfileUrl(alias: string): string {
  return `https://builder.aws.com/community/@${encodeURIComponent(alias)}`;
}

// ── Admin ─────────────────────────────────────────────────────────

export async function getBuilderCenterSettings(): Promise<AdminBuilderCenterSettings> {
  const r = await callApi<{ settings: AdminBuilderCenterSettings }>('/builder-center/admin/settings');
  return r.settings;
}

export async function updateBuilderCenterSettings(settings: BuilderCenterSettings): Promise<AdminBuilderCenterSettings> {
  const r = await callApi<{ settings: AdminBuilderCenterSettings }>('/builder-center/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  return r.settings;
}

export async function getBuilderCenterSummary(): Promise<BuilderCenterSummary> {
  return callApi<BuilderCenterSummary>('/builder-center/admin/summary');
}

export async function importBuilderCenterArticles(
  rows: Record<string, string>[],
  options: { dryRun: boolean; statsAsOf: string },
): Promise<ImportSummary> {
  return callApi<ImportSummary>('/builder-center/admin/import', {
    method: 'POST',
    body: JSON.stringify({ rows, ...options }),
  });
}

/** Start a sync now instead of waiting for the weekly one. */
export async function startBuilderSync(): Promise<{ started: boolean }> {
  return callApi('/builder-center/admin/sync', { method: 'POST', body: '{}' });
}

export async function adminRemoveBuilderLink(userId: string, alias: string): Promise<{ removed: boolean }> {
  return callApi('/builder-center/admin/links/remove', { method: 'POST', body: JSON.stringify({ userId, alias }) });
}

/** Columns the import needs; the rest of the collector's columns are optional. */
export const REQUIRED_IMPORT_COLUMNS = ['platformUserId', 'url', 'title'];
export const MAX_IMPORT_ROWS = 3000;

// ── Points ────────────────────────────────────────────────────────

/**
 * Points per article of one type before the member's cap. The UG Madurai rate
 * replaces the normal one when it is set; at 0 those articles earn the normal rate.
 */
export function basePoints(type: ContentType, mentionsUGMadurai: boolean, s: BuilderCenterSettings): number {
  const normal = type === 'project' ? s.pointsPerProject : s.pointsPerArticle;
  const ugmRate = type === 'project' ? s.pointsPerUGMaduraiProject : s.pointsPerUGMaduraiArticle;
  const pts = mentionsUGMadurai && ugmRate > 0 ? ugmRate : normal;
  return pts > 0 ? pts : 0;
}

export function anyPoints(s: BuilderCenterSettings): boolean {
  return s.pointsPerArticle > 0 || s.pointsPerUGMaduraiArticle > 0
    || s.pointsPerProject > 0 || s.pointsPerUGMaduraiProject > 0;
}

/**
 * Points each article would earn if claimed in this order, as the type given,
 * after the member's cap. Mirrors pointsFor in the Lambda, which decides for real.
 */
export function previewClaimPoints(
  articles: Pick<OwnBuilderArticle, 'contentId' | 'mentionsUGMadurai' | 'type'>[],
  settings: BuilderCenterSettings,
  alreadyAwarded: number,
  types: Record<string, ContentType> = {},
): { perArticle: Map<string, number>; total: number } {
  const perArticle = new Map<string, number>();
  let awarded = alreadyAwarded;
  let total = 0;
  for (const a of articles) {
    let pts = basePoints(types[a.contentId] || a.type, a.mentionsUGMadurai, settings);
    if (pts && settings.maxPointsPerMember) {
      pts = Math.max(0, Math.min(pts, settings.maxPointsPerMember - awarded));
    }
    perArticle.set(a.contentId, pts);
    awarded += pts;
    total += pts;
  }
  return { perArticle, total };
}

/** Most points a member can still get from their suggestions. */
export function remainingClaimPoints(content: MyBuilderContent): number {
  const suggested = content.articles.filter(a => a.status === 'suggested');
  return previewClaimPoints(suggested, content.settings, content.awardedPoints).total;
}

// ── Blog and project history ──────────────────────────────────────

const BUILDER_CONTENT_IN_LINK = /builder\.aws\.com\/content\/([A-Za-z0-9]{10,40})/i;

/** Builder Center's id for an article link, or null for any other link. */
export function builderContentId(link: string | null | undefined): string | null {
  const m = BUILDER_CONTENT_IN_LINK.exec(String(link || ''));
  return m ? m[1] : null;
}

export type ContentSource = 'builder_center' | 'sprint' | 'spotlight';

export interface ContentEntry {
  key: string;
  type: ContentType;
  title: string;
  url: string;
  /** ISO date or date-time. */
  date: string | null;
  description?: string;
  imageUrl?: string | null;
  tags?: string[];
  likes?: number;
  comments?: number;
  statsAsOf?: string | null;
  /** Where the platform knows it from, e.g. "Skill Sprint: OpenClaw Month". */
  sources: { kind: ContentSource; label: string }[];
}

/**
 * A member's blogs and projects:
 * - claimed Builder Center articles, by the type they were claimed as;
 * - approved Community Spotlight entries of type blog or project;
 * - their sprint submissions that were not rejected: blog links as blogs,
 *   GitHub repos as projects.
 * Something listed in several places shows once, with each place named.
 */
export function buildContentHistory(input: {
  claimed: BuilderArticle[];
  sprintSubmissions: Submission[];
  sprintTitle: (sprintId: string) => string | undefined;
  spotlight: SpotlightSubmission[];
}): { blogs: ContentEntry[]; projects: ContentEntry[] } {
  const entries = new Map<string, ContentEntry>();
  const keyFor = (url: string) => {
    const id = builderContentId(url);
    return id ? `bc:${id}` : `url:${url.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/, '').toLowerCase()}`;
  };
  const add = (entry: ContentEntry) => {
    const existing = entries.get(entry.key);
    if (!existing) {
      entries.set(entry.key, entry);
      return;
    }
    for (const s of entry.sources) {
      if (!existing.sources.some(x => x.kind === s.kind && x.label === s.label)) existing.sources.push(s);
    }
  };

  for (const a of input.claimed) {
    add({
      key: `bc:${a.contentId}`,
      type: a.type,
      title: a.title,
      url: a.url,
      date: a.publishedAt,
      description: a.description,
      imageUrl: a.imageUrl,
      tags: a.tags,
      likes: a.likes,
      comments: a.comments,
      statsAsOf: a.statsAsOf,
      sources: [{ kind: 'builder_center', label: 'AWS Builder Center' }],
    });
  }

  for (const s of input.spotlight) {
    if (s.status !== 'approved' || !s.url) continue;
    const type: ContentType | null = s.type === 'project' ? 'project'
      : s.type === 'blog' || builderContentId(s.url) ? 'blog' : null;
    if (!type) continue;
    add({
      key: keyFor(s.url),
      type,
      title: s.title,
      url: s.url,
      date: s.submittedAt,
      description: s.description,
      imageUrl: s.imageUrl,
      tags: s.tags,
      sources: [{ kind: 'spotlight', label: 'Community Spotlight' }],
    });
  }

  for (const sub of input.sprintSubmissions) {
    if (sub.status === 'rejected') continue;
    const sprintTitle = input.sprintTitle(sub.sprintId);
    const source = { kind: 'sprint' as const, label: sprintTitle ? `Skill Sprint: ${sprintTitle}` : 'Skill Sprint' };
    if (sub.blogUrl) {
      add({
        key: keyFor(sub.blogUrl),
        type: 'blog',
        title: sprintTitle ? `Blog for ${sprintTitle}` : 'Sprint blog',
        url: sub.blogUrl,
        date: sub.submittedAt,
        description: sub.comments || sub.description,
        sources: [source],
      });
    }
    const repo = sub.githubUrl || sub.repoUrl;
    if (repo) {
      const name = /github\.com\/([^/?#]+\/[^/?#]+)/i.exec(repo)?.[1]?.replace(/\.git$/, '');
      add({
        key: keyFor(repo),
        type: 'project',
        title: name || (sprintTitle ? `Project for ${sprintTitle}` : 'Sprint project'),
        url: repo,
        date: sub.submittedAt,
        description: sub.description || sub.comments,
        sources: [source],
      });
    }
  }

  const all = [...entries.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return { blogs: all.filter(e => e.type === 'blog'), projects: all.filter(e => e.type === 'project') };
}
