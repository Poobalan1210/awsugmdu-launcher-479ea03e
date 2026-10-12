/**
 * Kiro University Build-Along — campaign backend.
 *
 * One Lambda serving three entry points:
 *   • API Gateway  /campaign/{proxy+}   — participant and admin routes
 *   • EventBridge  (no httpMethod)      — the scheduled GitHub sweep
 *   • EventBridge  { task: 'reminders' } — the daily reminder email run
 *
 * Design notes that matter:
 *
 * 1. userId ALWAYS comes from the Cognito token, never the request body. The
 *    store and sprint Lambdas take it from the body, which is why anyone can
 *    currently act as anyone. This follows kironomics-crud instead.
 *
 * 2. Progress tracking is polling, not webhooks. Kiro requires a PUBLIC repo,
 *    so no elevated access is needed, onboarding stays at "run one command",
 *    and every question we ask ("first commit before the cutoff?", "moved in
 *    72 hours?") is a multi-day question that push events answer no better.
 *
 * 3. Active days are bucketed in Asia/Kolkata. GitHub returns UTC; bucketing by
 *    UTC date puts a 2am IST commit on the previous day, which on a public
 *    leaderboard in India is a visible, complaint-generating bug.
 *
 * 4. Validated positions come from an atomic counter. Reward tiers are
 *    positional, so two people validated in the same moment must not both
 *    receive position 5.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchGetCommand,
  ScanCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
// Mirrored from lambda/shared/email.js by deploy.sh — edit the master copy.
const { sendEmail, renderEmail, APP_URL } = require('./shared/email');
// Mirrored from lambda/shared/checkout.js by deploy.sh — edit the master copy.
// The store's own checkout uses the same checks.
const { validateCheckout } = require('./shared/checkout');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const PARTICIPATION_TABLE = process.env.PARTICIPATION_TABLE_NAME || 'awsug-campaign-participation';
const CODES_TABLE = process.env.SETUP_CODES_TABLE_NAME || 'awsug-campaign-setup-codes';
const KIRONOMICS_TABLE = process.env.KIRONOMICS_TABLE_NAME || 'awsug-kironomics';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
// A prize is claimed as a store order for the winner's prize item.
const STORE_ITEMS_TABLE = process.env.STORE_ITEMS_TABLE_NAME || 'awsug-store-items';
const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME || 'awsug-orders';
// Read by the admin builders list, for College Champs and Cloud Club colleges.
const COLLEGES_TABLE = process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';
const CLOUD_CLUBS_TABLE = process.env.CLOUD_CLUBS_TABLE_NAME || 'awsug-cloud_clubs';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ── Challenge constants ───────────────────────────────────────────
// 21 Sep 2026 09:00 PT. September is PDT (UTC-7), so 16:00Z. One definition,
// because an hour of drift wrongly disqualifies someone — or wrongly clears them.
const WINDOW_START_ISO = '2026-09-21T16:00:00Z';
// GitHub's `until` is inclusive, so query a second earlier: a commit landing
// exactly at 16:00:00Z is eligible and must not count as a violation.
const BEFORE_WINDOW_ISO = new Date(Date.parse(WINDOW_START_ISO) - 1000).toISOString();

// Entries close Mon 5 Oct 23:59 PT = Tue 6 Oct 12:29 IST. Commits after this
// do not count toward the challenge (and Kiro's own terms bar committing after
// submission until judging concludes).
const ENTRY_DEADLINE_ISO = '2026-10-06T06:59:00Z';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata, no DST
const SETUP_CODE_TTL_SECONDS = 15 * 60;
const STALE_AFTER_HOURS = 72;
const COUNTER_KEY = '__counter__';
// Holds the frozen prize allocation once prizes are issued (handleIssuePrizes).
const PRIZES_KEY = '__prizes__';
// When the GitHub sweep last started and finished, so prizes are never issued
// from a board that is halfway through a refresh.
const SWEEP_KEY = '__sweep__';

// Fallback only, when GitHub's GraphQL API is unavailable: 3 pages x 100 = 300
// in-window commits. Newest first, so a repo with more than 300 commits on its
// latest day lost every earlier day: one builder with 25 commits over 7 days
// showed 1 day after his history briefly ballooned to 8,000 commits.
const MAX_COMMIT_PAGES = 3;

// Branches counted besides the default one. Kiro Web and cloud sessions commit
// to a branch and open a pull request, so real work can sit on a branch for
// days before it is merged.
const MAX_EXTRA_BRANCHES = 10;

// Branches whose work counts in full, as the default branch's does: active
// days, commits, lesson files and the pre-window check. The setup script's
// `git init` names the first branch master or main depending on the member's
// git, and some members then pushed their work to the other one. One builder's
// default branch held only the setup commit while their work, specs included,
// was on main, so they showed 1 commit and none of their lessons. Other
// branches still count towards active days only (MAX_EXTRA_BRANCHES).
const PRIMARY_BRANCHES = ['main', 'master'];

// Listing a branch's in-window commits, to count main and master together
// without counting a commit twice: 100 per page.
const MAX_COMMIT_ID_PAGES = 10;

// Bump when the way repos are counted or read changes, so the next sweep
// recounts every repo instead of reusing results from the old rules, and
// prizes wait for that recount (sweepBlocker).
// 3: main and master both count in full (PRIMARY_BRANCHES).
// 4: lessons are read from each branch as it stood when entries closed, and
//    spec files outside a folder per spec count (SPEC_MARKDOWN).
const ACTIVITY_VERSION = 4;

const toGitHubTime = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// The deadline as GitHub's `until`, which is inclusive: the same end the
// window's last day is counted to, so a commit counted as in the window is
// also in the snapshot lessons are read from.
const DEADLINE_UNTIL = toGitHubTime(Date.parse(ENTRY_DEADLINE_ISO));

/** The challenge window as IST calendar days, each with a GitHub since/until pair. */
const WINDOW_DAYS = (() => {
  const start = Date.parse(WINDOW_START_ISO);
  const end = Date.parse(ENTRY_DEADLINE_ISO);
  const first = new Date(start + IST_OFFSET_MS);
  const days = [];
  let midnight = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()) - IST_OFFSET_MS;
  for (; midnight <= end; midnight += 24 * 60 * 60 * 1000) {
    days.push({
      day: new Date(midnight + IST_OFFSET_MS).toISOString().slice(0, 10),
      since: toGitHubTime(Math.max(midnight, start)),
      until: toGitHubTime(Math.min(midnight + 24 * 60 * 60 * 1000 - 1000, end)),
    });
  }
  return days;
})();

/** The lessons a participant may claim. Anything else in a manifest is ignored. */
const VALID_LESSONS = ['1', '2', '3', '4', '5', '6', '7', 'bonus1', 'bonus2'];

/**
 * Normalise a claimed lesson list from any source. Manifests are hand-editable,
 * so this tolerates numbers, strings and junk, and never lets an arbitrary
 * string into the stored record.
 */
function normaliseLessons(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const v of raw) {
    const s = String(v).trim().toLowerCase();
    if (VALID_LESSONS.includes(s) && !out.includes(s)) out.push(s);
  }
  return out.sort((a, b) => VALID_LESSONS.indexOf(a) - VALID_LESSONS.indexOf(b));
}

// ── HTTP helpers ──────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  };
}

function res(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return {};
  }
}

/**
 * Read the Cognito `sub` from the Authorization header. No signature check,
 * consistent with lambda/shared/auth.js and kironomics-crud across this stack.
 */
function extractUserId(authHeader) {
  const id = readUserId(authHeader);
  // Ids starting with "__" key the campaign's own records: the validation
  // counter, the prize lock and the sweep status. No member has one, and this
  // check does not verify the token, so refusing them here stops every member
  // route from writing over those records.
  return id && !isReservedId(id) ? id : null;
}

function readUserId(authHeader) {
  if (!authHeader) return null;
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (!token.includes('.')) return token;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    return payload.sub || payload['cognito:username'] || payload.userId || null;
  } catch {
    return null;
  }
}

/** Keys of the campaign's own records in the participation table, never a member's. */
function isReservedId(id) {
  return String(id).startsWith('__');
}

function extractEmail(authHeader) {
  if (!authHeader) return null;
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token.includes('.')) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')).email || null;
  } catch {
    return null;
  }
}

// ── Verified sign-in, for routes that return other members' data ──
// extractUserId and isAdmin read the token without checking its signature,
// like the rest of this stack, so a hand-made token passes them. Routes that
// hand out other members' profiles verify the Cognito ID token for real.
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const COGNITO_ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_USER_POOL_ID.split('_')[0]}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : '';
const JWKS_REFETCH_MS = 60 * 1000;
let jwksCache = null; // { keys, fetchedAt }

async function cognitoSigningKey(kid) {
  const find = () => (jwksCache ? jwksCache.keys.find((k) => k.kid === kid) : null) || null;
  let key = find();
  // An unknown key id usually means Cognito rotated its keys. Refetch, but at
  // most once a minute, so junk tokens cannot make us hammer the endpoint.
  if (!key && (!jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_REFETCH_MS)) {
    const r = await fetch(`${COGNITO_ISSUER}/.well-known/jwks.json`);
    if (!r.ok) return null;
    const body = await r.json();
    jwksCache = { keys: Array.isArray(body?.keys) ? body.keys : [], fetchedAt: Date.now() };
    key = find();
  }
  return key;
}

/** Claims of a genuine, unexpired ID token from this site's user pool, or null. */
async function verifyIdToken(authHeader) {
  if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) return null;
  const parts = String(authHeader || '').replace(/^Bearer\s+/i, '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const jwk = await cognitoSigningKey(header.kid);
    if (!jwk) return null;
    const signed = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    if (!signed) return null;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== COGNITO_ISSUER || claims.aud !== COGNITO_CLIENT_ID) return null;
    if (claims.token_use !== 'id' || typeof claims.sub !== 'string') return null;
    if (typeof claims.exp !== 'number' || now > claims.exp + 60) return null; // 60s clock skew
    return claims;
  } catch {
    return null;
  }
}

// Who the site treats as an admin (see AuthContext): the profile's `role`, or
// an admin or organiser role assigned in the Members tab, which is stored in
// the `roles` list instead. Checking only `role` locked out admins whose
// access was granted from the Members tab.
const ADMIN_ROLE_NAMES = ['admin', 'organiser'];

function hasAdminRole(user) {
  if (!user) return false;
  if (ADMIN_ROLE_NAMES.includes(String(user.role || '').toLowerCase())) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) =>
    ADMIN_ROLE_NAMES.includes(String((typeof r === 'string' ? r : r?.role) || '').toLowerCase()));
}

/**
 * isAdmin, on a verified token. Returns { userId } for an admin, otherwise
 * { status } with 401 (no valid sign-in) or 403 (signed in, not an admin).
 */
async function verifiedAdmin(event) {
  const claims = await verifyIdToken(event.headers?.Authorization || event.headers?.authorization);
  if (!claims) return { status: 401 };
  const email = String(claims.email || '').toLowerCase();
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (email && emailVerified && ADMIN_EMAILS.includes(email)) return { userId: claims.sub };
  try {
    const r = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId: claims.sub } }));
    if (hasAdminRole(r.Item)) return { userId: claims.sub };
  } catch {
    // treated as not an admin
  }
  return { status: 403 };
}

async function isAdmin(event) {
  const email = (extractEmail(event.headers?.Authorization || event.headers?.authorization) || '')
    .toLowerCase();
  if (email && ADMIN_EMAILS.includes(email)) return true;
  const userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (!userId) return false;
  try {
    const r = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    const role = r.Item?.role;
    return role === 'admin' || role === 'organiser';
  } catch {
    return false;
  }
}

// ── GitHub ────────────────────────────────────────────────────────
async function gh(path) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'awsugmdu-campaign',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const r = await fetch(`https://api.github.com${path}`, { headers });
  const remaining = r.headers.get('x-ratelimit-remaining');
  if (remaining !== null && Number(remaining) < 200) {
    console.warn(`GitHub rate limit low: ${remaining} remaining`);
  }
  let body = null;
  if (r.status !== 204) body = await r.json().catch(() => null);
  return { status: r.status, link: r.headers.get('link'), body };
}

/** GitHub GraphQL data, or null on any error. GraphQL needs a token. */
async function ghGraphql(query, variables) {
  if (!GITHUB_TOKEN) return null;
  try {
    const r = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'awsugmdu-campaign',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await r.json().catch(() => null);
    // A partial answer is treated as none, so the caller's fallback runs.
    if (r.status !== 200 || !body || !body.data || (body.errors && body.errors.length)) {
      console.warn(`GitHub GraphQL ${r.status}: ${body?.errors?.[0]?.message || 'no data'}`);
      return null;
    }
    return body.data;
  } catch (err) {
    console.warn('GitHub GraphQL failed:', err.message);
    return null;
  }
}

// One history count per IST day: exact however many commits there are, and
// one query per repo instead of a page per hundred commits.
const DAY_COUNT_FIELDS = WINDOW_DAYS
  .map((d, i) => `d${i}: history(since: "${d.since}", until: "${d.until}") { totalCount }`)
  .join(' ');
// A branch with its head commit, its last commit when entries closed (lessons
// are read from that one) and per-day counts.
const BRANCH_DAY_FIELDS = `name target { ... on Commit { oid
  atDeadline: history(first: 1, until: "${DEADLINE_UNTIL}") { nodes { oid } }
  ${DAY_COUNT_FIELDS} } }`;
const ACTIVITY_QUERY = `query($owner: String!, $name: String!, $branches: Int!) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { ${BRANCH_DAY_FIELDS} }
    ${PRIMARY_BRANCHES.map((b, i) => `p${i}: ref(qualifiedName: "refs/heads/${b}") { ${BRANCH_DAY_FIELDS} }`).join('\n    ')}
    refs(refPrefix: "refs/heads/", first: $branches) {
      totalCount
      nodes { name target { ... on Commit { ${DAY_COUNT_FIELDS} } } }
    }
  }
}`;

// A branch's commits inside the window, by id, a page at a time. The range is
// exactly the one the per-day counts cover, so the two always agree.
const WINDOW_COMMIT_IDS_QUERY = `query($owner: String!, $name: String!, $ref: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target { ... on Commit {
        history(first: 100, after: $after, since: "${WINDOW_DAYS[0].since}", until: "${WINDOW_DAYS[WINDOW_DAYS.length - 1].until}") {
          pageInfo { hasNextPage endCursor }
          nodes { oid }
        }
      } }
    }
  }
}`;

/** A branch's in-window commit ids, or null when they cannot all be listed. */
async function windowCommitIds(owner, name, branch) {
  const ids = new Set();
  let after = null;
  for (let page = 0; page < MAX_COMMIT_ID_PAGES; page++) {
    const data = await ghGraphql(WINDOW_COMMIT_IDS_QUERY, { owner, name, ref: `refs/heads/${branch}`, after });
    const history = data?.repository?.ref?.target?.history;
    if (!history) return null;
    for (const n of history.nodes || []) if (n && n.oid) ids.add(n.oid);
    if (!history.pageInfo?.hasNextPage) return ids;
    after = history.pageInfo.endCursor;
  }
  return null; // more than MAX_COMMIT_ID_PAGES pages
}

/** Whether two inspections read lessons from the same branches at the same commits. */
function sameLessonCommits(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length &&
    a.every((c, i) => c && c.branch === b[i].branch && (c.oid || null) === (b[i].oid || null));
}

/** Branches with their head commit, without a second entry for the same head. */
function distinctHeads(branches) {
  return branches.filter((b, i) => !b.oid || branches.findIndex((x) => x.oid === b.oid) === i);
}

/**
 * Commits per IST day in the window. A day counts if the default branch, main,
 * master or up to MAX_EXTRA_BRANCHES others has a commit on it. Commits are
 * those on the default branch, main and master, each counted once, so a branch
 * made from another is not counted twice. null when GraphQL is unavailable.
 */
async function countActivity(owner, name) {
  const data = await ghGraphql(ACTIVITY_QUERY, { owner, name, branches: MAX_EXTRA_BRANCHES + 1 });
  const repo = data && data.repository;
  const def = repo && repo.defaultBranchRef;
  if (!def || !def.target) return null;
  const perDay = (target) => WINDOW_DAYS.map((_, i) => Number(target?.[`d${i}`]?.totalCount) || 0);
  const total = (target) => perDay(target).reduce((a, b) => a + b, 0);

  // The default branch first, then main and master when they exist.
  const primary = [def, ...PRIMARY_BRANCHES.map((_, i) => repo[`p${i}`])]
    .filter((r) => r && r.name && r.target)
    .filter((r, i, all) => all.findIndex((x) => x.name === r.name) === i);
  const primaryNames = new Set(primary.map((r) => r.name));

  const days = new Set();
  const addDays = (target) => perDay(target).forEach((n, i) => { if (n > 0) days.add(WINDOW_DAYS[i].day); });
  addDays(def.target);
  const defaultDays = days.size;
  for (const r of primary) addDays(r.target);
  for (const ref of repo.refs?.nodes || []) {
    if (ref && ref.target && !primaryNames.has(ref.name)) addDays(ref.target);
  }

  // Commits on the default branch, main and master. When they point at
  // different commits, they are listed by id so shared history counts once.
  // deadlineOid is null for a branch with no commit by the deadline, and
  // undefined if GitHub left it out, so it is looked up again.
  const branches = primary.map((r) => ({
    name: r.name,
    oid: r.target.oid || null,
    deadlineOid: r.target.atDeadline ? r.target.atDeadline.nodes?.[0]?.oid || null : undefined,
    total: total(r.target),
  }));
  const withWork = distinctHeads(branches).filter((b) => b.total > 0);
  let commitCount = withWork.length ? withWork[0].total : 0;
  let commitsExact = true;
  if (withWork.length > 1) {
    const sets = await Promise.all(withWork.map((b) => windowCommitIds(owner, name, b.name)));
    if (sets.every(Boolean)) {
      commitCount = new Set(sets.flatMap((s) => [...s])).size;
    } else {
      // Could not list them all: the busiest branch's count, a lower bound.
      commitCount = Math.max(...withWork.map((b) => b.total));
      commitsExact = false;
    }
  }

  return {
    activeDayList: [...days].sort(),
    commitCount,
    commitsExact,
    branchOnlyDays: days.size - defaultDays,
    branchesTotal: repo.refs?.totalCount || 1,
    branches: branches.map(({ name: b, oid, deadlineOid }) => ({ name: b, oid, deadlineOid })),
  };
}

/**
 * A branch's last commit at or before the deadline, from the REST API, when
 * the activity query did not say. { ok, oid }: oid is null when the branch had
 * no commit by then, and ok is false when GitHub failed.
 */
async function restDeadlineCommit(owner, name, branch) {
  const r = await gh(
    `/repos/${owner}/${name}/commits?sha=${encodeURIComponent(branch)}` +
      `&until=${encodeURIComponent(DEADLINE_UNTIL)}&per_page=1`,
  );
  if (r.status === 200 && Array.isArray(r.body)) return { ok: true, oid: r.body[0]?.sha || null };
  if (r.status === 409) return { ok: true, oid: null }; // empty repo
  return { ok: false, oid: null };
}

/**
 * The default branch, main and master, with their head commits, from the REST
 * API when GraphQL is unavailable. `ok` is false when a lookup failed.
 */
async function restPrimaryBranches(owner, name, defaultBranch) {
  const branches = [];
  let ok = true;
  for (const b of [defaultBranch, ...PRIMARY_BRANCHES.filter((x) => x !== defaultBranch)]) {
    const r = await gh(`/repos/${owner}/${name}/branches/${encodeURIComponent(b)}`);
    if (r.status === 200 && r.body?.commit?.sha) branches.push({ name: b, oid: r.body.commit.sha });
    else if (b === defaultBranch) branches.push({ name: b, oid: null });
    if (r.status !== 200 && r.status !== 404) ok = false;
  }
  return { branches, ok };
}

/**
 * One evidence record from several branches' findings, default branch first.
 * A lesson counts if any of them has it, and says where when that is not the
 * default branch.
 */
function mergeEvidence(perBranch) {
  if (perBranch.length === 1) return perBranch[0].evidence;
  const merged = {};
  for (const key of new Set(perBranch.flatMap((b) => Object.keys(b.evidence)))) {
    const hit = perBranch.find((b) => b.evidence[key] && b.evidence[key].found);
    if (hit) {
      const { detail } = hit.evidence[key];
      merged[key] = { found: true, detail: hit.isDefault ? detail : `${detail || 'Found'} (on ${hit.branch})` };
    } else {
      const hint = perBranch.find((b) => b.evidence[key] && b.evidence[key].detail);
      merged[key] = { found: false, detail: hint ? hint.evidence[key].detail : '' };
    }
  }
  return merged;
}

function parseRepoUrl(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const m = s.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)(?:\/.*)?$/);
  return m ? { owner: m[1], name: m[2] } : null;
}

/** With per_page=1 the last page number is the total commit count. */
function commitCountFromLink(link, body) {
  const m = link && link.match(/[?&]page=(\d+)>;\s*rel="last"/);
  if (m) return Number(m[1]);
  return Array.isArray(body) ? body.length : 0;
}

function istDay(iso) {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// ── Lesson evidence ───────────────────────────────────────────────
/**
 * Kiro University's seven scored lessons and two bonus lessons, and how each
 * one shows up in a repo. Kiro's reviewers score the final entry from the
 * public repo and its committed .kiro/ folder, so "is it in the repo" is the
 * question worth answering, and the only one we can answer.
 *
 *   repo          Counted from the repo alone; ticks are ignored. If it is not
 *                 committed, reviewers cannot see it either.
 *   repo-or-self  Repo evidence, or the member's own tick. For property-based
 *                 testing, where detection is a heuristic, and for a packaged
 *                 power, which may live in a repo of its own.
 *   self          Nothing in a repo shows it: powers install per user, and Kiro
 *                 Web and cloud sessions leave no files. Only a tick counts.
 *
 * Detection proves a file exists, not that a lesson was demonstrated well.
 * Kiro's reviewers make that call.
 */
const LESSON_DEFS = [
  { id: '1', evidence: 'specs', check: 'repo' }, //              Spec-driven development
  { id: '2', evidence: 'steering', check: 'repo' }, //           Steering documents
  { id: '3', evidence: 'hooks', check: 'repo' }, //              Hooks
  { id: '4', evidence: 'pbt', check: 'repo-or-self' }, //        Property-based testing (IDE only)
  { id: '5', evidence: null, check: 'self' }, //                 Powers
  { id: '6', evidence: 'mcp', check: 'repo' }, //                Model Context Protocol
  { id: '7', evidence: 'agents', check: 'repo' }, //             Custom agents
  { id: 'bonus1', evidence: null, check: 'self' }, //            Kiro Web and cloud sessions
  { id: 'bonus2', evidence: 'powerPackage', check: 'repo-or-self' }, // Package a power
];
const TICKABLE_LESSONS = LESSON_DEFS.filter((d) => d.check !== 'repo').map((d) => d.id);

// Bump when stored evidence can no longer be shown as it is. lessonStatus
// ignores evidence from any other version, so every member's lessons read as
// missing until the next sweep reaches their repo. When the old evidence can
// stand in until then, bump ACTIVITY_VERSION instead: the next sweep re-reads
// every repo either way.
const EVIDENCE_VERSION = 2;

// File-content reads per repo, on top of the fixed calls. Bounds a sweep.
const MAX_FILE_FETCHES = 8;

// Other people's code, never the participant's work. Packages increasingly
// ship their own AGENTS.md, for instance.
const VENDORED_PATH = /(^|\/)(node_modules|vendor|bower_components|\.venv|venv|site-packages|dist|build|target|\.next|\.nuxt)\//i;

// Our setup script writes this hook into every participant's repo, so it says
// nothing about whether they learned hooks. Counting it was why 15 of 18 repos
// showed "hooks found".
const OUR_HOOK_FILE = /(^|\/)\.kiro\/hooks\/kironomics\.json$/i;

// Kiro reads the .kiro folder of whichever folder is opened as the workspace,
// so one repo can hold several: a folder per lesson, for instance, which is how
// at least one participant works. These match .kiro/ at any depth.
const IN_KIRO = /(^|\/)\.kiro\//;
const SPEC_DOC = /^((?:.*\/)?)\.kiro\/specs\/([^/]+)\/(requirements|bugfix|design|tasks)\.md$/i;
// Any Markdown file under .kiro/specs/. Kiro writes a folder per spec, but some
// members kept their spec documents straight in .kiro/specs/ or named them
// their own way. These count when a repo has no spec in Kiro's layout.
const SPEC_MARKDOWN = /^((?:.*\/)?)\.kiro\/specs\/(?:.+\/)?[^/]+\.md$/i;
// An index of the specs, not a spec.
const README_DOC = /(^|\/)readme\.md$/i;
const STEERING_DOC = /(^|\/)\.kiro\/steering\/.+\.md$/i;
const AGENTS_MD = /(^|\/)AGENTS\.md$/i;
// Hook files sit directly in .kiro/hooks/. Anything in a subfolder is a script
// or config a hook uses, not a hook.
const HOOK_FILE = /(^|\/)\.kiro\/hooks\/[^/]+\.(json|kiro\.hook)$/i;
const MCP_CONFIG = /(^|\/)\.kiro\/settings\/mcp\.json$/i;
const AGENT_FILE = /(^|\/)\.kiro\/agents\/(.+\/)?[^/]+\.(json|md)$/i;
const SKILL_FILE = /^\.kiro\/skills\/.+\/SKILL\.md$/i;
const PLUGIN_MANIFEST = /(^|\/)plugin\.json$/i;
const POWER_DOC = /(^|\/)POWER\.md$/;
const DEP_MANIFEST = /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|Pipfile|setup\.py|setup\.cfg|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|build\.sbt|Gemfile|composer\.json|mix\.exs|pubspec\.yaml|Package\.swift|[^/]+\.csproj)$/i;
const PBT_LIBRARY = /(?:^|["'\s/=@>:])(fast-check|@fast-check\/[a-z-]+|jsverify|testcheck|hypothesis|jqwik|junit-quickcheck|kotest-property|proptest|quickcheck|pgregory\.net\/rapid|gopter|fscheck|cscheck|rantly|propcheck|stream_data|scalacheck|swiftcheck)\b/im;
const JS_PBT_PACKAGE = /^(fast-check|@fast-check\/.+|jsverify|testcheck)$/i;
// Only explicit markers. "property" alone would match PropertyCard.test.tsx in
// a real-estate app, and at least one participant is building one.
const PBT_TEST_FILE = /(^|[._-])(pbt|property[-_]?based|prop[-_]?test)([._-]|$)/i;
// How Kiro names the property tests it writes: <module>.property.test.ts. The
// module name in front is required, since a bare property.test.ts is just as
// likely to test a Property model.
const KIRO_PBT_FILE = /^.+\.(property|properties)\.(test|spec)\.[cm]?[jt]sx?$/i;
const SPEC_PROPERTIES = /correctness propert|property[- ]based|\bproperty \d+\s*[:.\-–—]/i;

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Enabled and total MCP servers in an mcp.json or custom agent config. */
function countMcpServers(text) {
  if (!text) return { total: 0, enabled: 0 };
  try {
    const cfg = JSON.parse(text);
    const servers = cfg && cfg.mcpServers && typeof cfg.mcpServers === 'object'
      ? Object.values(cfg.mcpServers).filter((s) => s && typeof s === 'object')
      : [];
    return { total: servers.length, enabled: servers.filter((s) => s.disabled !== true).length };
  } catch {
    return { total: 0, enabled: 0 };
  }
}

/**
 * One file's text from a public repo. null when the file is missing or can't be
 * read as text (over 1 MB, for instance). Throws when GitHub itself fails, so a
 * rate-limited read is never mistaken for a repo without the file. Counts
 * against the rate limit.
 */
async function fetchRepoFile(owner, name, path, ref) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const r = await gh(`/repos/${owner}/${name}/contents/${encoded}${query}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GitHub ${r.status} reading ${path}`);
  if (!r.body || typeof r.body.content !== 'string' || r.body.encoding !== 'base64') return null;
  // Windows editors often save JSON with a byte-order mark, which JSON.parse
  // rejects. One participant's working mcp.json read as "no servers" because
  // of it.
  return Buffer.from(r.body.content, 'base64').toString('utf8').replace(/^\uFEFF/, '');
}

/**
 * Per-lesson evidence from a repo's file list. `readFile(path)` returns a
 * file's text or null. It is injected so the rules can be tested without
 * GitHub. Returns { key: { found, detail } } for each evidence key in
 * LESSON_DEFS.
 */
async function detectLessonEvidence(paths, readFile) {
  // Vendored code is judged by the folders above any .kiro/, so a spec that
  // happens to be named "build" still counts.
  const files = paths.filter((p) => {
    const m = p.match(IN_KIRO);
    return !VENDORED_PATH.test(m ? p.slice(0, m.index + m[1].length) : p);
  });
  const shallowFirst = (a, b) => a.split('/').length - b.split('/').length;
  let budget = MAX_FILE_FETCHES;
  const read = async (p) => {
    if (budget <= 0) return null;
    budget -= 1;
    try {
      return await readFile(p);
    } catch {
      return null;
    }
  };
  const ev = {};

  // Lesson 1: spec-driven development. Bugfix specs use bugfix.md. A spec is
  // its folder, so the same name in two lesson folders is two specs. Without
  // one in Kiro's layout, any spec document under .kiro/specs/ counts.
  const specs = new Map();
  for (const p of files) {
    const m = p.match(SPEC_DOC);
    if (m) specs.set(`${m[1]}${m[2]}`, m[1]);
  }
  const specsIn = (roots) => (roots.length === 1 ? `${roots[0]}.kiro/specs` : `${roots.length} .kiro folders`);
  const looseSpecs = specs.size ? [] : files.filter((p) => SPEC_MARKDOWN.test(p) && !README_DOC.test(p));
  if (specs.size) {
    ev.specs = { found: true, detail: `${plural(specs.size, 'spec')} in ${specsIn([...new Set(specs.values())])}` };
  } else if (looseSpecs.length) {
    const roots = [...new Set(looseSpecs.map((p) => p.match(SPEC_MARKDOWN)[1]))];
    ev.specs = { found: true, detail: `${plural(looseSpecs.length, 'spec file')} in ${specsIn(roots)}` };
  } else {
    ev.specs = { found: false, detail: '' };
  }

  // Lesson 2: steering. Kiro also reads AGENTS.md, at the root or in any folder.
  const steering = files.filter((p) => STEERING_DOC.test(p));
  const agentsMd = files.filter((p) => AGENTS_MD.test(p) && !IN_KIRO.test(p));
  const steeringFound = [];
  if (steering.length) steeringFound.push(plural(steering.length, 'steering file'));
  if (agentsMd.length) steeringFound.push('AGENTS.md');
  ev.steering = { found: steeringFound.length > 0, detail: steeringFound.join(' and ') };

  // Lesson 3: hooks, not counting the one our setup added.
  const hooks = files.filter((p) => HOOK_FILE.test(p));
  const ownHooks = hooks.filter((p) => !OUR_HOOK_FILE.test(p));
  ev.hooks = ownHooks.length
    ? { found: true, detail: plural(ownHooks.length, 'hook file') }
    : { found: false, detail: hooks.length ? 'Only the Kironomics tracking hook that setup added' : '' };

  // Lesson 7: custom agents, as .json or .md, in subfolders too.
  const agents = files.filter((p) => AGENT_FILE.test(p) && !/\/readme\.md$/i.test(p));
  ev.agents = { found: agents.length > 0, detail: agents.length ? plural(agents.length, 'custom agent') : '' };

  // Lesson 6: MCP. An enabled server in a workspace config, or failing that in
  // a custom agent's config. An empty mcp.json proves nothing.
  let servers = 0;
  let mcpNote = '';
  for (const p of files.filter((f) => MCP_CONFIG.test(f)).sort(shallowFirst).slice(0, 3)) {
    const n = countMcpServers(await read(p));
    if (n.enabled) {
      servers = n.enabled;
      mcpNote = '';
      break;
    }
    if (!mcpNote) mcpNote = n.total ? 'mcp.json only has disabled servers' : 'mcp.json has no servers';
  }
  if (!servers) {
    for (const p of agents.filter((a) => /\.json$/i.test(a)).slice(0, 2)) {
      const n = countMcpServers(await read(p));
      if (n.enabled) {
        servers = n.enabled;
        mcpNote = '';
        break;
      }
    }
  }
  ev.mcp = { found: servers > 0, detail: servers ? plural(servers, 'MCP server') : mcpNote };

  // Lesson 4: property-based testing. There is no fixed file, so look for a
  // property-based testing library in the project's dependencies, or a test
  // file explicitly named for it.
  let pbt = '';
  const pbtFile = files.find((p) => {
    if (IN_KIRO.test(p)) return false;
    const base = p.split('/').pop();
    return PBT_TEST_FILE.test(base) || KIRO_PBT_FILE.test(base);
  });
  if (pbtFile) pbt = `property tests in ${pbtFile}`;
  if (!pbt) {
    const manifests = files
      .filter((p) => DEP_MANIFEST.test(p) && p.split('/').length <= 3)
      .sort(shallowFirst)
      .slice(0, 4);
    for (const p of manifests) {
      const text = (await read(p)) || '';
      // package.json is parsed, so a word like "hypothesis" in its description
      // is not mistaken for the library. Other formats are matched as text.
      if (/(^|\/)package\.json$/i.test(p)) {
        let deps = [];
        try {
          const j = JSON.parse(text);
          deps = Object.keys({
            ...j.dependencies, ...j.devDependencies, ...j.peerDependencies, ...j.optionalDependencies,
          });
        } catch {
          // unreadable manifest: nothing to find
        }
        const hit = deps.find((d) => JS_PBT_PACKAGE.test(d));
        if (hit) {
          pbt = `${hit} in ${p}`;
          break;
        }
        continue;
      }
      const m = text.match(PBT_LIBRARY);
      if (m) {
        pbt = `${m[1]} in ${p}`;
        break;
      }
    }
  }

  // Bonus 2: a packaged power. plugin.json with skills or MCP beside it, or a
  // manifest that declares the Agent Plugins schema. Kiro still installs the
  // legacy POWER.md format too.
  let power = '';
  const pluginManifests = files.filter((p) => PLUGIN_MANIFEST.test(p));
  for (const m of pluginManifests) {
    const dir = m.slice(0, m.length - 'plugin.json'.length);
    const inside = files.filter((p) => p !== m && p.startsWith(dir)).map((p) => p.slice(dir.length));
    if (inside.some((r) => /^skills\/[^/]+\/SKILL\.md$/i.test(r) || /^mcp\.json$/i.test(r))) {
      power = `power in ${dir ? dir.replace(/\/$/, '') : 'the repo root'}`;
      break;
    }
  }
  if (!power && pluginManifests.length) {
    try {
      const j = JSON.parse((await read(pluginManifests[0])) || 'null');
      if (j && typeof j.name === 'string' && /agent-plugins/i.test(String(j.$schema || ''))) {
        power = `power manifest ${pluginManifests[0]}`;
      }
    } catch {
      // not a power manifest
    }
  }
  if (!power) {
    // A copy of the Kironomics power is ours, not something they packaged.
    const legacy = files.find((p) => POWER_DOC.test(p) && !/(^|\/)kironomics\//i.test(p));
    if (legacy) {
      const dir = legacy.slice(0, -'POWER.md'.length).replace(/\/$/, '');
      power = `power (POWER.md format) in ${dir || 'the repo root'}`;
    }
  }
  // A power Kiro could not install: worth saying, since it is easy to fix and
  // the member otherwise assumes it counts.
  let powerNote = '';
  if (!power) {
    // Only in a folder that is plainly meant as a power, so an app's own
    // data/power.json is left alone.
    const near = files.find((p) => /power[^/]*\/power\.json$/i.test(p)) ||
      files.find((p) => /(^|\/)\.kiro\/powers\/[^/]+\//.test(p));
    if (near) {
      const dir = /power\.json$/i.test(near)
        ? near.replace(/\/?power\.json$/i, '')
        : near.match(/^(.*?\.kiro\/powers\/[^/]+)\//)[1];
      powerNote = `${dir || 'Your power'} needs a plugin.json (or POWER.md) before Kiro can install it`;
    }
  }
  ev.powerPackage = { found: Boolean(power), detail: power || powerNote };

  // Hint only, never evidence: a spec that lists correctness properties
  // means the design step ran, but the lesson is about the tests.
  let pbtHint = '';
  if (!pbt) {
    const rank = (p) => (/\/design\.md$/i.test(p) ? 0 : 1);
    const docs = files
      .filter((p) => SPEC_DOC.test(p) && /\/(design|tasks)\.md$/i.test(p))
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 2);
    for (const p of docs) {
      if (SPEC_PROPERTIES.test((await read(p)) || '')) {
        pbtHint = 'Your spec lists correctness properties. Commit the property tests too.';
        break;
      }
    }
  }
  ev.pbt = { found: Boolean(pbt), detail: pbt || pbtHint };

  return ev;
}

// Older Kironomics setups wrote the API key as a literal into this file, and
// Kiro University requires committing .kiro/ — so its presence in a public tree
// means that member's key is public. Detected from a tree call we already make.
const LEAKED_KEY_PATH = /^\.kiro\/kironomics_report\.py$/i;

/**
 * Inspect one public repo. Returns a stats object; never throws. A GitHub
 * failure yields `unreachable`, which the UI shows as "couldn't check" rather
 * than as a disqualification.
 *
 * `prev` is the last stored inspection. If it was complete and nothing has
 * been pushed since, it is reused and only the repo metadata is refreshed.
 */
async function inspectRepo(fullName, prev = null) {
  const parsed = parseRepoUrl(`https://github.com/${fullName}`);
  if (!parsed) return { unreachable: true, checkedAt: new Date().toISOString() };
  const { owner, name } = parsed;

  const repo = await gh(`/repos/${owner}/${name}`);
  if (repo.status !== 200 || !repo.body) {
    return { unreachable: true, checkedAt: new Date().toISOString() };
  }

  const out = {
    fullName: repo.body.full_name,
    repoUrl: repo.body.html_url,
    repoNodeId: repo.body.node_id,
    isPrivate: Boolean(repo.body.private),
    lastPushAt: repo.body.pushed_at || null,
    defaultBranch: repo.body.default_branch,
    unreachable: false,
    checkedAt: new Date().toISOString(),
  };

  if (out.lastPushAt) {
    const hours = Math.floor((Date.now() - Date.parse(out.lastPushAt)) / 3600000);
    out.hoursSincePush = hours;
    out.stale = hours > STALE_AFTER_HOURS;
  }

  // Nothing in a repo changes without a push, so a quiet repo reuses its last
  // inspection: one GitHub call instead of a dozen. That matters now that
  // lessons are read from file contents as well as file names. Only a complete
  // one, though: an inspection cut short by a rate limit or a revoked token
  // would otherwise stick until the member next pushed.
  if (
    prev && prev.complete === true && !prev.unreachable &&
    prev.evidenceVersion === EVIDENCE_VERSION &&
    prev.activityVersion === ACTIVITY_VERSION &&
    prev.lastPushAt && prev.lastPushAt === out.lastPushAt &&
    prev.defaultBranch === out.defaultBranch
  ) {
    return { ...prev, ...out };
  }
  out.inspectedAt = out.checkedAt;

  // Cleared by any GitHub failure below, so the next sweep reads the repo again.
  let complete = true;

  // Eligibility: any commit before the window opened is disqualifying.
  const prior = await gh(
    `/repos/${owner}/${name}/commits?until=${encodeURIComponent(BEFORE_WINDOW_ISO)}&per_page=1`,
  );
  const emptyRepo = prior.status === 409;
  if (emptyRepo) {
    out.commitCount = 0;
    out.activeDays = 0;
    out.eligible = null; // empty repo — expected on day one, not a failure
  } else if (prior.status === 200 && Array.isArray(prior.body)) {
    out.eligible = prior.body.length === 0;
    if (!out.eligible) {
      const d = prior.body[0]?.commit?.committer?.date;
      if (d) out.preWindowCommitDate = d.slice(0, 10);
    }
  } else {
    out.eligible = null;
    complete = false;
  }

  // Distinct active days INSIDE the challenge window, bucketed IST.
  //
  // `since` and `until` are what make this a challenge metric rather than a
  // repo metric. Without them, work done before the window opened or after the
  // deadline passed counted toward a member's leaderboard position — and only
  // the most recent 100 commits were ever seen, so a heavy committer's earliest
  // days were silently dropped. Bounding the query fixes both: everything
  // returned is in-window by construction, and the result set shrinks.
  const activity = emptyRepo ? null : await countActivity(owner, name);

  // The branches that count in full: the default branch, main and master
  // (PRIMARY_BRANCHES), default first. From the activity query, or looked up
  // when GraphQL is unavailable. Each distinct head commit is read once.
  let primary = [{ name: out.defaultBranch, oid: null }];
  if (activity) {
    primary = activity.branches;
  } else if (!emptyRepo) {
    const looked = await restPrimaryBranches(owner, name, out.defaultBranch);
    primary = looked.branches;
    if (!looked.ok) complete = false;
  }
  const heads = distinctHeads(primary);
  out.primaryBranches = primary.map((b) => b.name);

  // Commits from before the window disqualify on main and master too.
  for (const b of emptyRepo ? [] : heads.slice(1)) {
    if (out.eligible === false) break;
    const pre = await gh(
      `/repos/${owner}/${name}/commits?sha=${encodeURIComponent(b.name)}` +
        `&until=${encodeURIComponent(BEFORE_WINDOW_ISO)}&per_page=1`,
    );
    if (pre.status === 200 && Array.isArray(pre.body)) {
      if (pre.body.length) {
        out.eligible = false;
        const d = pre.body[0]?.commit?.committer?.date;
        if (d) out.preWindowCommitDate = d.slice(0, 10);
        out.preWindowBranch = b.name;
      }
    } else {
      complete = false;
    }
  }

  if (activity) {
    out.activeDayList = activity.activeDayList;
    out.activeDays = activity.activeDayList.length;
    // Commits that count toward the challenge, not the repo's lifetime total.
    out.commitCount = activity.commitCount;
    out.branchOnlyDays = activity.branchOnlyDays;
    out.branchCount = activity.branchesTotal;
    out.activitySource = 'graphql';
    // A lower bound when the commits could not all be listed: count again.
    if (!activity.commitsExact) complete = false;
  } else {
    // Page by page, newest first, on the default branch, main and master, each
    // commit once. Capped per branch (see MAX_COMMIT_PAGES).
    const days = new Set();
    const ids = new Set();
    let capped = false;
    for (const b of heads) {
      for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
        const batch = await gh(
          `/repos/${owner}/${name}/commits` +
            `?sha=${encodeURIComponent(b.name)}` +
            `&since=${encodeURIComponent(WINDOW_START_ISO)}` +
            `&until=${encodeURIComponent(ENTRY_DEADLINE_ISO)}` +
            `&per_page=100&page=${page}`,
        );
        if (batch.status !== 200 || !Array.isArray(batch.body)) {
          if (batch.status !== 409) complete = false; // 409: empty repo
          break;
        }
        if (batch.body.length === 0) break;
        for (const c of batch.body) {
          if (c && c.sha) ids.add(c.sha);
          const d = c?.commit?.committer?.date || c?.commit?.author?.date;
          if (d) days.add(istDay(d));
        }
        if (batch.body.length < 100) break; // last page
        if (page === MAX_COMMIT_PAGES) capped = true;
      }
    }
    out.activeDays = days.size;
    out.activeDayList = [...days].sort();
    out.commitCount = ids.size;
    out.activitySource = 'rest';
    // Earlier days may be missing, so count again next sweep rather than reuse this.
    if (capped) complete = false;
  }
  out.activityVersion = ACTIVITY_VERSION;

  // Lifetime total kept separately: useful for spotting a repo that was busy
  // outside the window, without letting that inflate the leaderboard.
  const head = await gh(`/repos/${owner}/${name}/commits?per_page=1`);
  if (head.status === 200) out.totalCommitCount = commitCountFromLink(head.link, head.body);
  else if (head.status !== 409) complete = false;

  // Trees are read by commit, one call each, so a branch that has not moved
  // since entries closed is read once for both uses below. null when GitHub
  // failed. An empty repo has no tree, and nothing to find yet.
  const treeCache = new Map();
  const readTree = async (ref) => {
    if (!treeCache.has(ref)) {
      const tree = await gh(`/repos/${owner}/${name}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
      let result = null;
      if (tree.status === 200 && Array.isArray(tree.body?.tree)) {
        result = {
          truncated: Boolean(tree.body.truncated),
          paths: tree.body.tree.filter((n) => n.type === 'blob').map((n) => n.path),
        };
      } else if (tree.status === 409) {
        result = { truncated: false, paths: [] };
      }
      treeCache.set(ref, result);
    }
    return treeCache.get(ref);
  };
  // The last inspection, if it was of this same repo, for anything this one
  // could not read.
  const sameRepo = Boolean(prev && !prev.unreachable && (prev.repoNodeId && out.repoNodeId
    ? prev.repoNodeId === out.repoNodeId
    : String(prev.fullName || '').toLowerCase() === String(out.fullName || '').toLowerCase()));

  // Lessons: from each branch that counts in full as it stood when entries
  // closed, at its last commit by ENTRY_DEADLINE_ISO. Lessons decide places on
  // the leaderboard (LESSON_GATE_PLACES), so a file added after entries closed
  // must not count, and Kiro's terms bar committing after submission anyway.
  // A branch with no commit by then had nothing in it.
  const snapshots = [];
  let snapshotRead = emptyRepo;
  if (emptyRepo) {
    snapshots.push({ branch: out.defaultBranch, isDefault: true, oid: null, paths: [] });
  } else {
    const seen = new Set();
    for (const [i, b] of heads.entries()) {
      let oid = b.deadlineOid;
      if (oid === undefined) {
        const found = await restDeadlineCommit(owner, name, b.name);
        if (!found.ok) {
          complete = false;
          continue;
        }
        oid = found.oid;
      }
      // Branches that were at the same commit then are read once.
      if (seen.has(oid)) continue;
      seen.add(oid);
      const tree = oid ? await readTree(oid) : { truncated: false, paths: [] };
      if (!tree) {
        complete = false;
        continue;
      }
      snapshots.push({ branch: b.name, isDefault: i === 0, oid, ...tree });
      if (i === 0) snapshotRead = true;
    }
  }

  // Only once the default branch is read: a lesson must never show as missing
  // just because its tree could not be fetched. If main or master could not
  // be read, the default branch's findings stand and the next sweep retries.
  if (snapshotRead) {
    // The commits the lessons are read from: null for a branch with none yet.
    const lessonCommits = snapshots.map((s) => ({ branch: s.branch, oid: s.oid }));
    // Once entries close these commits stop changing, so evidence read in
    // full from the same ones under the same rules is kept, not read again.
    // A GitHub error while reading a file would otherwise drop a lesson found
    // last time, and with it the member's place among those needing one.
    const samePrevRead = sameRepo && prev.evidence &&
      prev.evidenceVersion === EVIDENCE_VERSION && prev.activityVersion === ACTIVITY_VERSION &&
      sameLessonCommits(prev.lessonCommits, lessonCommits);
    // Records from before evidenceComplete existed were read in full if the
    // whole inspection was.
    const prevReadInFull = prev?.evidenceComplete ?? prev?.complete === true;
    let readFailed = false;
    if (samePrevRead && prevReadInFull === true) {
      out.evidence = prev.evidence;
    } else {
      const perBranch = [];
      for (const s of snapshots) {
        const readFile = async (p) => {
          if (!s.oid) return null;
          try {
            return await fetchRepoFile(owner, name, p, s.oid);
          } catch (err) {
            complete = false;
            readFailed = true;
            throw err;
          }
        };
        perBranch.push({ ...s, evidence: await detectLessonEvidence(s.paths, readFile) });
      }
      // A lesson counts if any branch that counts in full had it.
      out.evidence = mergeEvidence(perBranch);
      // A file that could not be read this time cannot unfind a lesson an
      // earlier read of the same commits found.
      if (readFailed && samePrevRead) {
        for (const [key, e] of Object.entries(prev.evidence)) {
          if (e && e.found && !out.evidence[key]?.found) out.evidence[key] = e;
        }
      }
    }
    out.evidenceVersion = EVIDENCE_VERSION;
    // false when a file could not be read, so the evidence may be short.
    out.evidenceComplete = !readFailed;
    out.lessonCommits = lessonCommits;
    // The old shape, for the page version still deployed until the new one
    // ships. Derived from the evidence so both agree.
    const lessonPaths = [...new Set(snapshots.flatMap((s) => s.paths))];
    out.artifacts = {
      steering: out.evidence.steering.found,
      specs: out.evidence.specs.found,
      hooks: out.evidence.hooks.found,
      mcp: out.evidence.mcp.found,
      agents: out.evidence.agents.found,
      skills: lessonPaths.some((p) => SKILL_FILE.test(p)),
    };
  } else if (sameRepo && prev.evidence && prev.evidenceVersion === EVIDENCE_VERSION) {
    // Keep what the last read found rather than show every lesson as missing,
    // which would also move the member out of the places that need one.
    // `complete` is false, so the next sweep reads the repo again.
    out.evidence = prev.evidence;
    out.evidenceVersion = prev.evidenceVersion;
    if (prev.artifacts) out.artifacts = prev.artifacts;
    if (prev.lessonCommits) out.lessonCommits = prev.lessonCommits;
    if (typeof prev.evidenceComplete === 'boolean') out.evidenceComplete = prev.evidenceComplete;
    out.evidenceCarriedOver = true;
  }

  // The rest is about the repo as it is now: whether .kiro/ is committed, a
  // leaked key, and the setup manifest. A key committed on any public branch
  // is public, whenever it was committed.
  const current = [];
  let currentRead = emptyRepo;
  if (!emptyRepo) {
    for (const [i, b] of heads.entries()) {
      const ref = b.oid || b.name;
      const tree = await readTree(ref);
      if (!tree) {
        complete = false;
        continue;
      }
      current.push({ ref, ...tree });
      if (i === 0) currentRead = true;
    }
  }
  if (currentRead) {
    const allPaths = [...new Set(current.flatMap((t) => t.paths))];
    out.hasKiroFolder = allPaths.some((p) => p.startsWith('.kiro/'));
    out.kironomicsKeyExposed = allPaths.some((p) => LEAKED_KEY_PATH.test(p));

    const withManifest = current.find((t) => t.paths.includes('.kiro/ugmdu.json'));
    if (withManifest) {
      // Kept for its participantId, which says whose setup command made the
      // repo. Its `lessons` list no longer counts: nobody edits it by hand,
      // and the repo files are better evidence.
      let text = null;
      try {
        text = await fetchRepoFile(owner, name, '.kiro/ugmdu.json', withManifest.ref);
      } catch {
        complete = false;
      }
      try {
        out.manifest = text ? JSON.parse(text) : null;
      } catch {
        out.manifest = null;
      }
    }
  } else if (sameRepo) {
    for (const key of ['hasKiroFolder', 'kironomicsKeyExposed', 'manifest']) {
      if (key in prev) out[key] = prev[key];
    }
  }
  out.treeTruncated = [...snapshots, ...current].some((t) => t.truncated);

  out.complete = complete;

  return out;
}

// ── Participation storage ─────────────────────────────────────────
async function getParticipation(campaignId, userId) {
  const r = await docClient.send(
    new GetCommand({ TableName: PARTICIPATION_TABLE, Key: { campaignId, userId } }),
  );
  return r.Item || null;
}

async function listParticipants(campaignId) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await docClient.send(
      new QueryCommand({
        TableName: PARTICIPATION_TABLE,
        KeyConditionExpression: 'campaignId = :c',
        ExpressionAttributeValues: { ':c': campaignId },
        ExclusiveStartKey,
      }),
    );
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items.filter((i) => !isReservedId(i.userId));
}

/**
 * Return the participant's Kironomics token, creating their Kironomics record if
 * they have never had one. Schema matches kironomics-crud's newUser() so that
 * Lambda keeps reading it correctly.
 */
async function ensureKironomicsToken(userId, displayName) {
  const existing = await docClient.send(
    new GetCommand({ TableName: KIRONOMICS_TABLE, Key: { userId } }),
  );
  if (existing.Item?.token) return existing.Item.token;

  const token = crypto.randomBytes(32).toString('hex');
  await docClient.send(
    new PutCommand({
      TableName: KIRONOMICS_TABLE,
      Item: {
        userId,
        token,
        user_id: userId,
        display_name: displayName || userId,
        api_key: token,
        total_sessions: 0,
        total_prompts: 0,
        total_tool_calls: 0,
        total_elapsed_seconds: 0,
        score: 0,
        last_activity: null,
        sessions: [],
        daily_activity: {},
        machines: [],
        ips: [],
        flagged: false,
        flag_reasons: [],
        streak_days: 0,
        tool_breakdown: {},
        registered_at: new Date().toISOString(),
      },
      // Never clobber an existing record — that would destroy their stats.
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );
  return token;
}

/**
 * Where each lesson stands for one participant. Repo lessons come from the
 * last sweep; tickable lessons from the member's own ticks (see LESSON_DEFS).
 *
 * Ticks saved before the real lesson list was known are ignored. That version
 * of the page labelled the checkboxes "Lesson 1" to "Lesson 7" under a guessed
 * mapping that was wrong for every lesson, and its "tick what we found" button
 * ticked lessons from files mapped to the wrong numbers. Those ticks are still
 * stored, as lessonsDeclared, but say nothing reliable.
 */
function lessonStatus(p) {
  const repo = p && p.repo;
  const ev = repo && repo.evidenceVersion === EVIDENCE_VERSION && repo.evidence ? repo.evidence : null;
  const ticks = new Set(normaliseLessons(p && p.lessonTicks));
  return LESSON_DEFS.map((d) => {
    const e = d.evidence && ev ? ev[d.evidence] || { found: false, detail: '' } : null;
    const found = Boolean(e && e.found);
    const ticked = d.check !== 'repo' && ticks.has(d.id);
    return {
      id: d.id,
      check: d.check,
      // false until the repo has been read under the current rules
      repoChecked: Boolean(ev),
      found,
      detail: (e && e.detail) || '',
      ticked,
      counted: found || ticked,
    };
  });
}

/** Lesson ids that currently count, in lesson order. */
function mergedLessons(p) {
  return lessonStatus(p).filter((l) => l.counted).map((l) => l.id);
}

function publicView(p) {
  if (!p) return null;
  return {
    status: p.status || 'joined',
    joinedAt: p.joinedAt,
    ageConfirmed: Boolean(p.ageConfirmed),
    eligibleForKiroCredits: p.eligibleForKiroCredits !== false,
    githubLogin: p.githubLogin || undefined,
    kironomicsConnected: Boolean(p.kironomicsConnected),
    kironomicsKeyExposed: Boolean(p.repo?.kironomicsKeyExposed),
    repo: p.repo
      ? {
          // A failed check stores no name. Fall back to the registered one so
          // one bad GitHub response doesn't make the page ask for setup again.
          fullName: p.repo.fullName || p.repoFullName,
          repoUrl: p.repo.repoUrl || (p.repoFullName ? `https://github.com/${p.repoFullName}` : undefined),
          activeDays: p.repo.activeDays || 0,
          commitCount: p.repo.commitCount || 0,
          lastPushAt: p.repo.lastPushAt || null,
          unreachable: Boolean(p.repo.unreachable),
          eligible: p.repo.eligible ?? null,
          hasKiroFolder: Boolean(p.repo.hasKiroFolder),
          artifacts: p.repo.artifacts || {},
          activeDayList: p.repo.activeDayList || [],
        }
      : null,
    lessonsRecorded: mergedLessons(p),
    lessons: lessonStatus(p),
    validatedPosition: p.validatedPosition ?? null,
    externalEntryConfirmedAt: p.externalEntryConfirmedAt || null,
    prize: publicPrize(p.prize),
    // So their page does not promise a prize an organiser has ruled out.
    prizeExcluded: p.prizeExcluded === true,
  };
}

// ── Routes ────────────────────────────────────────────────────────
async function handleJoin(campaignId, event) {
  const auth = event.headers?.Authorization || event.headers?.authorization;
  const userId = extractUserId(auth);
  if (!userId) return res(401, { error: 'authentication required' });

  const body = parseBody(event);
  if (body.ageConfirmed !== true) {
    return res(400, { error: 'Kiro requires participants to be 18 or over.' });
  }

  const existing = await getParticipation(campaignId, userId);
  if (existing) {
    // Idempotent: reward tiers are positional, so a double click must never
    // create a second record or shift anyone's position.
    return res(200, { participation: publicView(existing) });
  }

  let name = userId;
  try {
    const u = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
    if (u.Item?.name) name = u.Item.name;
  } catch { /* display name is cosmetic */ }

  const item = {
    campaignId,
    userId,
    displayName: name,
    status: 'joined',
    joinedAt: new Date().toISOString(),
    ageConfirmed: true,
    consentToShowcase: body.consentToShowcase === true,
    intendedProjectName: (body.projectName || '').trim() || null,
    eligibleForKiroCredits: true,
    kironomicsConnected: false,
    // Ticks for the lessons a repo cannot show (see LESSON_DEFS). The rest are
    // read from the repo by the sweep.
    lessonTicks: [],
    updatedAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: PARTICIPATION_TABLE,
      Item: item,
      ConditionExpression: 'attribute_not_exists(userId)',
    }),
  );
  return res(201, { participation: publicView(item) });
}

async function handleMe(campaignId, event) {
  const userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (!userId) return res(401, { error: 'authentication required' });
  const p = await getParticipation(campaignId, userId);
  return res(200, { participation: publicView(p) });
}

// Leaderboard places that need at least one of the seven scored lessons, as
// well as an active day. Builders without one rank below these places.
const LESSON_GATE_PLACES = 40;

/** Whether a board entry may take one of the first LESSON_GATE_PLACES places. */
function passesLessonGate(e) {
  return e.activeDays >= 1 && e.lessonsDone >= 1;
}

/**
 * The leaderboard, best first. The public board and the prizes both use this,
 * so a winner's prize always matches the rank everyone saw.
 *
 * Active days first: distinct days, so a hundred pushes in one afternoon still
 * counts once. Commits break ties, then lessons. Member ids settle anything
 * still tied, the same order DynamoDB returns them in, so it never shifts.
 *
 * The first LESSON_GATE_PLACES places go to the builders who have started the
 * lessons, in that order. Everyone else follows, still in that order.
 */
function rankEntries(participants) {
  const gated = [];
  const rest = [];
  for (const e of orderByActivity(participants)) {
    if (gated.length < LESSON_GATE_PLACES && passesLessonGate(e)) gated.push(e);
    else rest.push(e);
  }
  return [...gated, ...rest].map((e, i) => ({ ...e, rank: i + 1 }));
}

/** Board entries in order of days, commits and lessons alone, unranked. */
function orderByActivity(participants) {
  return participants
    .filter((p) => p.repo && !p.repo.unreachable)
    .map((p) => {
      const counted = mergedLessons(p);
      return {
        userId: p.userId,
        displayName: p.displayName || 'Builder',
        activeDays: p.repo?.activeDays || 0,
        commitCount: p.repo?.commitCount || 0,
        lessonsRecorded: counted.length,
        // Split the way each member's own lessons card shows them: the seven
        // scored lessons, and the two bonuses.
        lessonsDone: counted.filter((id) => !id.startsWith('bonus')).length,
        bonusLessonsDone: counted.filter((id) => id.startsWith('bonus')).length,
        validated: p.status === 'validated',
      };
    })
    .sort((a, b) =>
      b.activeDays - a.activeDays ||
      b.commitCount - a.commitCount ||
      b.lessonsRecorded - a.lessonsRecorded ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

async function handleLeaderboard(campaignId) {
  // Once prizes are issued the board is the one they were decided from, frozen
  // with them. Lesson ticks, repo changes or a late sweep cannot move it.
  const lock = await getPrizeLock(campaignId);
  if (lock && Array.isArray(lock.board)) {
    return res(200, {
      entries: lock.board,
      totalItems: lock.board.length,
      final: true,
      standingsAsOf: lock.standingsAsOf || lock.issuedAt,
    });
  }
  const entries = rankEntries(await listParticipants(campaignId));
  return res(200, { entries, totalItems: entries.length });
}

async function handleStats(campaignId) {
  const [all, prizeLock] = await Promise.all([listParticipants(campaignId), getPrizeLock(campaignId)]);
  return res(200, {
    validatedCount: all.filter((p) => p.status === 'validated').length,
    joinedCount: all.length,
    withRepoCount: all.filter((p) => p.repo && !p.repo.unreachable).length,
    // Once true the standings are final: the sweep stops refreshing them.
    prizesIssued: Boolean(prizeLock),
  });
}

async function handleSetupCode(campaignId, event) {
  const auth = event.headers?.Authorization || event.headers?.authorization;
  const userId = extractUserId(auth);
  if (!userId) return res(401, { error: 'authentication required' });

  const p = await getParticipation(campaignId, userId);
  if (!p) return res(400, { error: 'Join the campaign first.' });

  // Short, unambiguous alphabet — no O/0/I/1, since these get read aloud.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  const expiresAt = Math.floor(Date.now() / 1000) + SETUP_CODE_TTL_SECONDS;

  const nowIso = new Date().toISOString();
  await docClient.send(
    new PutCommand({
      TableName: CODES_TABLE,
      Item: { code, campaignId, userId, expiresAt, used: false, createdAt: nowIso },
    }),
  );

  // Stamped on the participation record because the code row is deleted by TTL
  // soon after it expires. Without this, "generated a command but never ran it"
  // cannot be told apart from "never clicked Generate", and the reminder email
  // for the first group ("your code expired, get a fresh one") never goes out.
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression:
          'SET setupCodeIssuedAt = :n, setupCodeCount = if_not_exists(setupCodeCount, :zero) + :one',
        ExpressionAttributeValues: { ':n': nowIso, ':zero': 0, ':one': 1 },
      }),
    );
  } catch (err) {
    // Bookkeeping only. The member still gets a working code.
    console.warn('could not stamp setupCodeIssuedAt:', err.message);
  }

  return res(201, { code, expiresAt: new Date(expiresAt * 1000).toISOString() });
}

/**
 * Exchange a one-time code for the Kironomics token. This is how the setup
 * script authenticates without a browser, and why the permanent token never
 * appears in a command line or a screenshot.
 */
async function handleClaim(event) {
  const { code } = parseBody(event);
  if (!code) return res(400, { error: 'code required' });

  const r = await docClient.send(new GetCommand({ TableName: CODES_TABLE, Key: { code } }));
  const rec = r.Item;
  if (!rec) return res(404, { error: 'unknown or expired code' });
  if (rec.used) return res(410, { error: 'this code has already been used' });
  if (rec.expiresAt * 1000 < Date.now()) return res(410, { error: 'this code has expired' });

  const p = await getParticipation(rec.campaignId, rec.userId);
  if (!p) return res(404, { error: 'participation not found' });

  const token = await ensureKironomicsToken(rec.userId, p.displayName);

  // Single-use. Marked immediately, before anything else can go wrong.
  await docClient.send(
    new UpdateCommand({
      TableName: CODES_TABLE,
      Key: { code },
      UpdateExpression: 'SET used = :t, usedAt = :n',
      ExpressionAttributeValues: { ':t': true, ':n': new Date().toISOString() },
    }),
  );

  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId: rec.campaignId, userId: rec.userId },
      UpdateExpression: 'SET kironomicsConnected = :t, updatedAt = :n',
      ExpressionAttributeValues: { ':t': true, ':n': new Date().toISOString() },
    }),
  );

  return res(200, {
    kironomicsToken: token,
    participantId: rec.userId,
    campaignId: rec.campaignId,
  });
}

const CAMPAIGN_ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

/** Resolve a Kironomics API key to its member via the token-index GSI. */
async function getKironomicsUserByToken(token) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 200) return null;
  const r = await docClient.send(
    new QueryCommand({
      TableName: KIRONOMICS_TABLE,
      IndexName: 'token-index',
      // TOKEN is a DynamoDB reserved word, hence the alias.
      KeyConditionExpression: '#t = :t',
      ExpressionAttributeNames: { '#t': 'token' },
      ExpressionAttributeValues: { ':t': token },
      Limit: 1,
    }),
  );
  return (r.Items || [])[0] || null;
}

/**
 * Work out which member is registering a repo. Tried in this order:
 *
 *   1. The setup code, while it is inside its 15-minute window. It was just
 *      minted by the signed-in member on the site, so it is the most specific.
 *   2. The Kironomics key the setup script saved to ~/.kironomics/token on its
 *      first run. This is what lets a re-run finish: the code in a command
 *      pulled from shell history expired long ago, but the key did not. Before
 *      this, a re-run created and pushed the repo and could never register it,
 *      while the script's own warning told people to keep re-running.
 *   3. A Cognito token, for calls from the site itself.
 *
 * Each proves which member this is. None of them trusts a userId from the body.
 * Returns { campaignId, userId, via } or { status, error }.
 */
async function resolveRegistrant(event, body) {
  const freshCommand = 'Generate a fresh setup command at /kiro and run that.';
  let codeFailure = null;

  if (body.code) {
    const r = await docClient.send(
      new GetCommand({ TableName: CODES_TABLE, Key: { code: String(body.code) } }),
    );
    if (r.Item && r.Item.expiresAt * 1000 >= Date.now()) {
      return { campaignId: r.Item.campaignId, userId: r.Item.userId, via: 'code' };
    }
    // Not fatal yet: a re-run carries a stale code, and the key may still work.
    codeFailure = { status: r.Item ? 410 : 404, error: `This setup code has expired. ${freshCommand}` };
  }

  const campaignId =
    typeof body.campaignId === 'string' && CAMPAIGN_ID_RE.test(body.campaignId)
      ? body.campaignId
      : null;

  if (body.kironomicsToken) {
    const member = await getKironomicsUserByToken(body.kironomicsToken);
    if (!member) {
      // Most likely rotated since this machine was set up.
      return {
        status: 401,
        error: `The Kironomics key saved on this machine was not recognised — it may have been rotated. ${freshCommand}`,
      };
    }
    if (!campaignId) return { status: 400, error: 'campaignId required' };
    return { campaignId, userId: member.userId || member.user_id, via: 'kironomics-key' };
  }

  const cognitoUser = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (cognitoUser) {
    if (!campaignId) return { status: 400, error: 'campaignId required' };
    return { campaignId, userId: cognitoUser, via: 'cognito' };
  }

  return codeFailure || { status: 401, error: 'authentication required' };
}

/**
 * Register the repo the setup script just created, so the participant never
 * has to paste it anywhere. See resolveRegistrant for how they are identified.
 */
async function handleRegisterRepo(event) {
  const body = parseBody(event);

  const who = await resolveRegistrant(event, body);
  if (who.error) return res(who.status, { error: who.error });
  const { campaignId, userId, via } = who;
  if (isReservedId(userId)) return res(401, { error: 'authentication required' });
  if (await getPrizeLock(campaignId)) {
    return res(409, { error: 'This challenge has ended and its standings are final, so repos can no longer be registered.' });
  }

  const participation = await getParticipation(campaignId, userId);
  if (!participation) {
    return res(404, { error: 'You have not joined this campaign yet. Join at /kiro, then run the command again.' });
  }

  const fullName = body.fullName || (parseRepoUrl(body.repoUrl) &&
    `${parseRepoUrl(body.repoUrl).owner}/${parseRepoUrl(body.repoUrl).name}`);
  if (!fullName) return res(400, { error: 'fullName or repoUrl required' });

  // One repo per participant, one participant per repo — otherwise someone
  // could point us at an active repo they do not own and farm the leaderboard.
  const existingClaim = await docClient.send(
    new QueryCommand({
      TableName: PARTICIPATION_TABLE,
      IndexName: 'repoFullName-index',
      KeyConditionExpression: 'repoFullName = :r',
      ExpressionAttributeValues: { ':r': fullName.toLowerCase() },
      Limit: 2,
    }),
  );
  const claimedByOther = (existingClaim.Items || []).find((i) => i.userId !== userId);
  if (claimedByOther) {
    return res(409, { error: 'That repository is already registered by another participant.' });
  }

  const stats = await inspectRepo(fullName);

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression:
          'SET repoFullName = :rl, repo = :repo, githubLogin = :gl, #st = :status, updatedAt = :n',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':rl': fullName.toLowerCase(),
          ':repo': stats,
          ':gl': body.ownerLogin || fullName.split('/')[0],
          ':status': 'building',
          ':n': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_exists(userId)',
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return res(404, { error: 'You have not joined this campaign yet. Join at /kiro, then run the command again.' });
    }
    throw err;
  }

  console.log('repo registered', { userId, via, repo: fullName.toLowerCase() });
  return res(200, {
    repo: publicView({ repo: stats }).repo,
    eligible: stats.eligible,
    // Lets a re-run fill in .kiro/ugmdu.json when its code could no longer be
    // claimed, so the manifest is never left without an owner.
    participantId: userId,
    campaignId,
  });
}

/**
 * Save the member's ticks for the lessons a repo cannot show (see LESSON_DEFS).
 *
 * The current page sends { schema: 2, lessons }. Anything else comes from the
 * page version with the old guessed labels, which stays live until the new
 * frontend deploys; its ticks are stored as lessonsDeclared for the record and
 * change nothing that counts.
 */
async function handleLessons(campaignId, event) {
  const userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (!userId) return res(401, { error: 'authentication required' });
  // Lessons break ties on the final leaderboard, and so decide prizes. They
  // stop changing when entries close.
  if (Date.now() >= Date.parse(ENTRY_DEADLINE_ISO)) {
    return res(409, { error: 'Entries have closed, so lessons can no longer be changed.' });
  }

  const body = parseBody(event);
  if (!Array.isArray(body.lessons)) {
    return res(400, { error: 'lessons must be an array' });
  }

  const existing = await getParticipation(campaignId, userId);
  if (!existing) return res(404, { error: 'participation not found' });

  const current = body.schema === 2;
  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId },
      UpdateExpression: current
        ? 'SET lessonTicks = :l, lessonTicksAt = :n, updatedAt = :n'
        : 'SET lessonsDeclared = :l, updatedAt = :n',
      ExpressionAttributeValues: {
        // Ticks on lessons the repo decides are dropped rather than rejected:
        // the page never sends them, so one arriving is a stale tab.
        ':l': current
          ? normaliseLessons(body.lessons).filter((l) => TICKABLE_LESSONS.includes(l))
          : normaliseLessons(body.lessons),
        ':n': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(userId)',
    }),
  );

  const updated = await getParticipation(campaignId, userId);
  return res(200, { lessonsRecorded: mergedLessons(updated), lessons: lessonStatus(updated) });
}

async function handleConfirmEntry(campaignId, event) {
  const userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (!userId) return res(401, { error: 'authentication required' });
  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId },
      UpdateExpression: 'SET externalEntryConfirmedAt = :n, #st = :s, updatedAt = :n',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':n': new Date().toISOString(), ':s': 'submitted' },
      ConditionExpression: 'attribute_exists(userId)',
    }),
  );
  return res(200, { confirmed: true });
}

/** How far a participant has got, from joining to a validated entry. */
function participantStage(p) {
  if (p.validatedPosition) return 'validated';
  if (p.externalEntryConfirmedAt || p.status === 'submitted') return 'submitted';
  if (p.repoFullName) return 'building';
  if (p.kironomicsConnected) return 'setup-stopped'; // ran the command, no repo linked
  if (p.setupCodeIssuedAt) return 'command-generated';
  return 'not-started';
}

/** Items from one table by key, as a Map on that key. Missing items are absent. */
async function batchGetAll(table, keyName, keyValues, projection, names) {
  const out = new Map();
  const ids = [...new Set(keyValues.filter((v) => typeof v === 'string' && v))];
  for (let i = 0; i < ids.length; i += 100) {
    let keys = ids.slice(i, i + 100).map((v) => ({ [keyName]: v }));
    for (let attempt = 0; keys.length && attempt < 3; attempt++) {
      const r = await docClient.send(
        new BatchGetCommand({
          RequestItems: { [table]: { Keys: keys, ProjectionExpression: projection, ExpressionAttributeNames: names } },
        }),
      );
      for (const item of r.Responses?.[table] || []) out.set(item[keyName], item);
      keys = r.UnprocessedKeys?.[table]?.Keys || [];
    }
  }
  return out;
}

/** Profile fields for many users at once, keyed by userId. Missing users are absent. */
function getProfiles(userIds) {
  // Aliased throughout: several of these are DynamoDB reserved words.
  return batchGetAll(USERS_TABLE, 'userId', userIds, '#u, #n, #t, #d, #cn, #cc, #co, #ln, #lc, #ic, #ci, #iq, #qi', {
    '#u': 'userId', '#n': 'name', '#t': 'userType', '#d': 'designation',
    '#cn': 'companyName', '#cc': 'companyCity', '#co': 'country',
    '#ln': 'collegeName', '#lc': 'collegeCity',
    '#ic': 'isCollegeChamp', '#ci': 'champCollegeId', '#iq': 'isCloudClub', '#qi': 'cloudClubId',
  });
}

/**
 * The colleges behind College Champs and Cloud Club memberships. Students who
 * sign up through either pick their college from a list, so their profile
 * stores its id instead of a collegeName: 22 of the first 49 students in the
 * campaign showed no college until these were looked up.
 */
async function getCommunityColleges(profiles) {
  const list = [...profiles.values()];
  const names = { '#i': 'id', '#n': 'name', '#l': 'location' };
  try {
    const [colleges, clubs] = await Promise.all([
      batchGetAll(COLLEGES_TABLE, 'id', list.filter((u) => u.isCollegeChamp === true).map((u) => u.champCollegeId), '#i, #n, #l', names),
      batchGetAll(CLOUD_CLUBS_TABLE, 'id', list.filter((u) => u.isCloudClub === true).map((u) => u.cloudClubId), '#i, #n, #l', names),
    ]);
    return { colleges, clubs };
  } catch (err) {
    // Only the college names are lost. Everything else in the table still loads.
    console.error('could not look up community colleges:', err.message);
    return { colleges: new Map(), clubs: new Map() };
  }
}

/** Student or professional, and where from, as the member filled it in. */
function profileSummary(u, communities = {}) {
  if (!u) return null;
  const type = u.userType === 'student' || u.userType === 'professional' ? u.userType : null;
  const clean = (v) => (typeof v === 'string' ? v.trim() : '');
  const champId = u.isCollegeChamp === true ? clean(u.champCollegeId) : '';
  const clubId = u.isCloudClub === true ? clean(u.cloudClubId) : '';
  const listed = (champId && communities.colleges?.get(champId)) || (clubId && communities.clubs?.get(clubId)) || null;
  const student = type === 'student' ||
    (!type && !clean(u.companyName) && Boolean(clean(u.collegeName) || listed));
  return {
    type,
    organisation: student ? clean(u.collegeName) || clean(listed?.name) : clean(u.companyName),
    designation: student ? '' : clean(u.designation),
    city: student ? clean(u.collegeCity) || clean(listed?.location) : clean(u.companyCity),
    country: clean(u.country),
    // Which community programme they joined through, if any.
    community: champId ? 'College Champs' : clubId ? 'Cloud Club' : '',
  };
}

/**
 * Every participant: where they are in the challenge, and from their profile,
 * where they are from. Admin only, on a verified token, because it returns
 * every member's profile.
 */
async function handleAdminParticipants(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) {
    return res(who.status, { error: who.status === 401 ? 'Sign in again to continue.' : 'admin only' });
  }

  const participants = await listParticipants(campaignId);
  const profiles = await getProfiles(participants.map((p) => p.userId));
  const communities = await getCommunityColleges(profiles);

  const rows = participants.map((p) => {
    const u = profiles.get(p.userId);
    const repo = p.repo || {};
    const days = Array.isArray(repo.activeDayList) ? repo.activeDayList : [];
    return {
      userId: p.userId,
      name: (u && u.name) || p.displayName || '',
      joinedAt: p.joinedAt || null,
      stage: participantStage(p),
      repoFullName: repo.fullName || p.repoFullName || null,
      repoUrl: repo.repoUrl || (p.repoFullName ? `https://github.com/${p.repoFullName}` : null),
      repoUnreachable: Boolean(repo.unreachable),
      activeDays: repo.activeDays || 0,
      lastActiveDay: days.length ? days[days.length - 1] : null,
      commitCount: repo.commitCount || 0,
      lessonsDone: mergedLessons(p).filter((id) => !id.startsWith('bonus')).length,
      profile: profileSummary(u, communities),
    };
  });

  console.log('admin participants', { by: who.userId, count: rows.length });
  return res(200, { generatedAt: new Date().toISOString(), participants: rows });
}

/**
 * Admin validation. Assigns the next validated position from an ATOMIC counter —
 * reward tiers are positional, so a read-then-write here would let two people
 * both take position 5.
 */
async function handleValidate(campaignId, event) {
  if (!(await isAdmin(event))) return res(403, { error: 'admin only' });
  const { userId } = parseBody(event);
  if (!userId) return res(400, { error: 'userId required' });

  const p = await getParticipation(campaignId, userId);
  if (!p) return res(404, { error: 'participation not found' });
  if (p.validatedPosition) {
    return res(200, { validatedPosition: p.validatedPosition, alreadyValidated: true });
  }

  const counter = await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId: COUNTER_KEY },
      UpdateExpression: 'ADD validatedCount :one',
      ExpressionAttributeValues: { ':one': 1 },
      ReturnValues: 'UPDATED_NEW',
    }),
  );
  const position = counter.Attributes?.validatedCount;

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression:
          'SET validatedPosition = :p, #st = :s, validatedAt = :n, validatedBy = :by, updatedAt = :n',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':p': position,
          ':s': 'validated',
          ':n': new Date().toISOString(),
          ':by': extractUserId(event.headers?.Authorization || event.headers?.authorization),
        },
        // Only assign a position if one was not set between our read and now.
        ConditionExpression: 'attribute_exists(userId) AND attribute_not_exists(validatedPosition)',
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      // Someone else validated them first. Give the position back so we do not
      // leave a permanent gap in the tier sequence.
      await docClient.send(
        new UpdateCommand({
          TableName: PARTICIPATION_TABLE,
          Key: { campaignId, userId: COUNTER_KEY },
          UpdateExpression: 'ADD validatedCount :minus',
          ExpressionAttributeValues: { ':minus': -1 },
        }),
      );
      const current = await getParticipation(campaignId, userId);
      return res(200, { validatedPosition: current?.validatedPosition, alreadyValidated: true });
    }
    throw err;
  }

  return res(200, { validatedPosition: position });
}

// ── Reminder emails ───────────────────────────────────────────────
/**
 * Nudges for members who joined but are not on the leaderboard yet.
 *
 * Three groups, each stuck for a different reason and needing a different next
 * step, so each gets its own email:
 *   stuck        ran the command (key claimed) but no repo got linked. Usually a
 *                Windows crash (since fixed) or the GitHub CLI missing. Next
 *                step: run it again; it picks up where it stopped.
 *   generated    created a setup command but never ran it. The code expired 15
 *                minutes later, so the next step is a fresh one.
 *   not-started  joined and never generated a command.
 *
 * Safety rails, in the order they bite:
 *   - Three modes. dry-run (the schedule's default) sends nothing and returns
 *     who would get what. test sends one of each email to a single organiser
 *     and records nothing. live runs only from the schedule or a direct Lambda
 *     invoke, which needs AWS credentials, never over HTTP, so a stolen admin
 *     session cannot trigger a mass send.
 *   - At most REMINDER_MAX per member, REMINDER_MIN_GAP apart, none in the
 *     first REMINDER_GRACE after joining, none after entries close, none once a
 *     repo is linked or the member has unsubscribed.
 *   - Each send is claimed with a conditional write BEFORE the email goes out.
 *     Lambda retries a failed scheduled run twice; without the claim, a retry
 *     would email everyone a second time.
 *   - Nothing but dry-run works without a signing secret, so every email that
 *     goes out has a working unsubscribe link.
 */
const REMINDER_MAX = 2;
const REMINDER_MIN_GAP_MS = 3 * 24 * 60 * 60 * 1000;
const REMINDER_GRACE_MS = 24 * 60 * 60 * 1000;
const REMINDER_SEND_DELAY_MS = 150; // this account's SES limit is 14/sec
const REMINDER_SIGNING_SECRET = process.env.REMINDER_SIGNING_SECRET || '';
const REMINDER_MODES = ['dry-run', 'test', 'live'];
const REMINDER_SEGMENTS = ['stuck', 'generated', 'not-started'];
const DEADLINE_LABEL_IST = 'Tue 6 Oct, 12:29 PM IST';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function reminderSegment(p) {
  if (p.kironomicsConnected) return 'stuck';
  if (p.setupCodeIssuedAt) return 'generated';
  return 'not-started';
}

/** null when a reminder may go out now, otherwise why not. */
function reminderBlocker(p, nowMs) {
  if (p.repoFullName) return 'repo-linked';
  if (p.remindersOptOut) return 'unsubscribed';
  if ((p.reminderCount || 0) >= REMINDER_MAX) return 'max-reminders-sent';
  const joined = Date.parse(p.joinedAt || '');
  if (!Number.isFinite(joined) || nowMs - joined < REMINDER_GRACE_MS) return 'joined-in-last-24h';
  const last = Date.parse(p.lastReminderAt || '');
  if (Number.isFinite(last) && nowMs - last < REMINDER_MIN_GAP_MS) return 'reminded-in-last-3-days';
  return null;
}

// Unsubscribe links are signed. User ids are public — they are in the
// leaderboard response — so an unsigned link would let anyone unsubscribe
// everyone on the board.
function signUnsubscribe(campaignId, userId) {
  return crypto
    .createHmac('sha256', REMINDER_SIGNING_SECRET)
    .update(`unsubscribe:${campaignId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

function verifyUnsubscribe(campaignId, userId, sig) {
  if (!REMINDER_SIGNING_SECRET) return false;
  if (typeof userId !== 'string' || !userId || userId.length > 128) return false;
  if (typeof sig !== 'string' || !/^[0-9a-f]{32}$/.test(sig)) return false;
  return crypto.timingSafeEqual(Buffer.from(signUnsubscribe(campaignId, userId)), Buffer.from(sig));
}

function unsubscribeUrl(campaignId, userId, { test = false } = {}) {
  const q = new URLSearchParams({ c: campaignId, u: userId, s: signUnsubscribe(campaignId, userId) });
  if (test) q.set('test', '1');
  // A page on the site, not a link straight to the API: an email from
  // awsugmdu.in linking to an execute-api hostname looks like phishing, and the
  // page makes the member click a button, so link scanners that open every URL
  // in an email cannot unsubscribe people by accident.
  return `${APP_URL}/kiro/unsubscribe?${q.toString()}`;
}

function htmlEscape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Greeting name. Initials often come first in Indian names ("S Logesh",
 * "C Vishnu Vardhan"), so take the first word longer than one letter.
 */
function greetingName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.find((w) => w.replace(/\./g, '').length > 1) || words[0] || 'there';
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '(invalid address)';
  return `${local[0]}***@${domain}`;
}

// Paragraph strings are static and trusted. The only member-supplied value is
// the name, which buildReminderEmail escapes.
const REMINDER_COPY = {
  stuck: {
    subject: "Your Kiro University setup didn't finish",
    heading: 'Your setup stopped before your repo was linked',
    paragraphs: [
      'You ran the setup command for the Kiro University build-along, but it stopped before your repo was linked. Until it is, your progress is not tracked and you are not on the leaderboard.',
      'The usual causes:',
      '<ul style="margin:0 0 16px; padding-left:20px;">' +
        '<li style="margin-bottom:6px;"><strong>On Windows, it stopped with an error.</strong> That was a bug on our side, and it is fixed.</li>' +
        '<li><strong>It said the GitHub CLI was not found.</strong> Install it from <a href="https://cli.github.com" style="color:#0073bb;">cli.github.com</a>, then run <code>gh auth login</code>.</li>' +
        '</ul>',
      'To finish, run the same command again from the same folder. It picks up where it stopped, and it is safe to run more than once. If you no longer have it, the campaign page gives you a fresh one.',
    ],
    cta: 'Open the campaign page',
  },
  generated: {
    subject: 'Your Kiro University setup command is waiting',
    heading: "Your setup command hasn't been run yet",
    paragraphs: [
      "You generated your setup command for the Kiro University build-along, but it hasn't been run yet.",
      'Setup commands expire 15 minutes after they are created, so get a fresh one from the campaign page and run it in the folder where you keep your projects. It takes about two minutes and needs git, Python 3 and the GitHub CLI.',
    ],
    cta: 'Get a fresh setup command',
  },
  'not-started': {
    subject: 'One command to start your Kiro University project',
    heading: "You're in. One command gets you set up.",
    paragraphs: [
      'You joined the AWS User Group Madurai build-along for Kiro University, but your project is not set up yet.',
      'One command creates your project, turns on progress tracking and links your repo. It takes about two minutes and needs git, Python 3 and the GitHub CLI.',
      'Kiro awards up to 5,250 credits for a finished entry, and we add community rewards on top.',
    ],
    cta: 'Get my setup command',
  },
};

function buildReminderEmail(segment, { name, unsubscribeLink, test = false }) {
  const copy = REMINDER_COPY[segment];
  const para = (html) => (html.startsWith('<') ? html : `<p style="margin:0 0 16px;">${html}</p>`);
  const bodyHtml = [
    `<p style="margin:0 0 16px;">Hi ${htmlEscape(greetingName(name))},</p>`,
    ...copy.paragraphs.map(para),
    `<p style="margin:0 0 16px;">Entries close <strong>${DEADLINE_LABEL_IST}</strong>.</p>`,
    // The button lives here rather than in renderEmail's cta, which renders
    // after the body and would put the unsubscribe line above the button.
    `<p style="margin:8px 0 24px;"><a href="${htmlEscape(`${APP_URL}/kiro`)}" ` +
      'style="display:inline-block; background:#ff9900; color:#000000; text-decoration:none; ' +
      'font-weight:600; font-size:16px; padding:14px 28px; border-radius:8px;">' +
      `${htmlEscape(copy.cta)}</a></p>`,
    '<p style="margin:0; color:#8a8a8a; font-size:12px; line-height:18px;">' +
      "You're getting this because you joined the Kiro University build-along on awsugmdu.in. " +
      "Kiro University is Kiro's own challenge, and you submit your entry on kiro.dev. " +
      `<a href="${htmlEscape(unsubscribeLink)}" style="color:#8a8a8a;">Stop these reminders</a></p>`,
  ].join('\n');
  return {
    subject: `${test ? '[TEST] ' : ''}${copy.subject}`,
    html: renderEmail({ heading: copy.heading, bodyHtml }),
  };
}

async function getUserContact(userId) {
  const r = await docClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      ProjectionExpression: '#e, #n',
      ExpressionAttributeNames: { '#e': 'email', '#n': 'name' },
    }),
  );
  return r.Item || null;
}

/** Record the send before it happens, so a retried run cannot send it twice. */
async function claimReminder(campaignId, p, nowMs, segment) {
  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId: p.userId },
      UpdateExpression:
        'SET reminderCount = if_not_exists(reminderCount, :zero) + :one, lastReminderAt = :now, lastReminderSegment = :seg',
      ConditionExpression:
        'attribute_exists(userId) AND attribute_not_exists(repoFullName)' +
        ' AND (attribute_not_exists(remindersOptOut) OR remindersOptOut = :false)' +
        ' AND (attribute_not_exists(reminderCount) OR reminderCount < :max)' +
        ' AND (attribute_not_exists(lastReminderAt) OR lastReminderAt < :cutoff)',
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':now': new Date(nowMs).toISOString(),
        ':seg': segment,
        ':false': false,
        ':max': REMINDER_MAX,
        ':cutoff': new Date(nowMs - REMINDER_MIN_GAP_MS).toISOString(),
      },
    }),
  );
}

/**
 * Undo a claim when SES refuses the send, so the member is not skipped.
 * `prev` must be captured BEFORE the claim runs: the claim is what overwrites
 * lastReminderAt, and restoring the overwritten value would leave the member
 * locked out for REMINDER_MIN_GAP even though no email reached them.
 */
async function releaseReminder(campaignId, p, prev) {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId: p.userId },
        UpdateExpression: prev
          ? 'SET reminderCount = reminderCount - :one, lastReminderAt = :prev'
          : 'SET reminderCount = reminderCount - :one REMOVE lastReminderAt, lastReminderSegment',
        ExpressionAttributeValues: prev ? { ':one': 1, ':prev': prev } : { ':one': 1 },
      }),
    );
  } catch (err) {
    console.error(`could not release reminder claim for ${p.userId}:`, err.message);
  }
}

async function runReminders(campaignId, { mode = 'dry-run', testUserId = null } = {}) {
  if (!REMINDER_MODES.includes(mode)) mode = 'dry-run';
  const nowMs = Date.now();

  if (nowMs >= Date.parse(ENTRY_DEADLINE_ISO)) {
    return { mode, campaignId, skippedAll: 'entries have closed' };
  }
  if (mode !== 'dry-run' && !REMINDER_SIGNING_SECRET) {
    return {
      mode,
      campaignId,
      error: 'REMINDER_SIGNING_SECRET is not set, so emails would have no working unsubscribe link. Refusing to send.',
    };
  }

  if (mode === 'test') {
    // One of each email to a single organiser. Nothing is recorded, and the
    // unsubscribe link is marked as a test so clicking it changes nothing.
    if (!testUserId) return { mode, campaignId, error: 'testUserId required' };
    const contact = await getUserContact(testUserId);
    if (!contact?.email) return { mode, campaignId, error: 'no email on that user record' };
    const results = [];
    for (const segment of REMINDER_SEGMENTS) {
      const { subject, html } = buildReminderEmail(segment, {
        name: contact.name,
        unsubscribeLink: unsubscribeUrl(campaignId, testUserId, { test: true }),
        test: true,
      });
      const r = await sendEmail({ to: contact.email, subject, html });
      results.push({ segment, subject, ok: r.ok, error: r.error });
      await sleep(REMINDER_SEND_DELAY_MS);
    }
    return { mode, campaignId, sentTo: maskEmail(contact.email), results };
  }

  const participants = await listParticipants(campaignId);
  const skipped = {};
  const skip = (reason) => { skipped[reason] = (skipped[reason] || 0) + 1; };
  const plan = [];
  for (const p of participants) {
    const blocker = reminderBlocker(p, nowMs);
    if (blocker) { skip(blocker); continue; }
    const contact = await getUserContact(p.userId);
    if (!contact?.email) { skip('no-email-on-record'); continue; }
    plan.push({ p, contact, segment: reminderSegment(p), reminderNumber: (p.reminderCount || 0) + 1 });
  }
  const bySegment = Object.fromEntries(
    REMINDER_SEGMENTS.map((s) => [s, plan.filter((x) => x.segment === s).length]),
  );

  if (mode === 'dry-run') {
    const summary = { mode, campaignId, participants: participants.length, wouldSend: plan.length, bySegment, skipped };
    // Counts only in the logs. The recipient list goes back to whoever invoked
    // the dry run, never into CloudWatch.
    console.log('reminders', JSON.stringify(summary));
    return {
      ...summary,
      recipients: plan.map((x) => ({
        name: x.contact.name || x.p.displayName || '(no name)',
        email: maskEmail(x.contact.email),
        segment: x.segment,
        reminderNumber: x.reminderNumber,
        subject: REMINDER_COPY[x.segment].subject,
      })),
    };
  }

  // live
  let sent = 0;
  let failed = 0;
  let alreadyClaimed = 0;
  for (const x of plan) {
    const prevLastReminderAt = x.p.lastReminderAt || null;
    try {
      await claimReminder(campaignId, x.p, nowMs, x.segment);
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        alreadyClaimed++; // a retry of this run, or the member changed state meanwhile
      } else {
        console.error(`reminder claim failed for ${x.p.userId}:`, err.message);
        failed++;
      }
      continue;
    }
    const { subject, html } = buildReminderEmail(x.segment, {
      name: x.contact.name || x.p.displayName,
      unsubscribeLink: unsubscribeUrl(campaignId, x.p.userId),
    });
    const r = await sendEmail({ to: x.contact.email, subject, html });
    if (r.ok) {
      sent++;
    } else {
      failed++;
      await releaseReminder(campaignId, x.p, prevLastReminderAt);
    }
    await sleep(REMINDER_SEND_DELAY_MS);
  }
  const summary = { mode, campaignId, sent, failed, alreadyClaimed, bySegment, skipped };
  console.log('reminders', JSON.stringify(summary));
  return summary;
}

async function handleReminders(campaignId, event) {
  if (!(await isAdmin(event))) return res(403, { error: 'admin only' });
  const { mode = 'dry-run' } = parseBody(event);
  if (mode === 'live') {
    return res(403, { error: 'Live reminders run only on the schedule or from a direct Lambda invoke, never over HTTP.' });
  }
  if (mode === 'test') {
    const caller = extractUserId(event.headers?.Authorization || event.headers?.authorization);
    return res(200, await runReminders(campaignId, { mode: 'test', testUserId: caller }));
  }
  return res(200, await runReminders(campaignId, { mode: 'dry-run' }));
}

/**
 * Called by the /kiro/unsubscribe page when the member presses the button.
 * Public, and authorised only by the signature in their email link.
 */
async function handleUnsubscribe(campaignId, event) {
  const body = parseBody(event);
  const userId = typeof body.u === 'string' ? body.u : '';
  if (!verifyUnsubscribe(campaignId, userId, body.s)) {
    return res(403, { error: 'This unsubscribe link is not valid. If you copied it, check you copied all of it.' });
  }
  if (body.test === true || body.test === '1') {
    return res(200, { ok: true, test: true });
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression: 'SET remindersOptOut = :t, remindersOptOutAt = :n',
        ExpressionAttributeValues: { ':t': true, ':n': new Date().toISOString() },
        ConditionExpression: 'attribute_exists(userId)',
      }),
    );
  } catch (err) {
    // Participation gone: nothing left to email, so the outcome is the same.
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
  return res(200, { ok: true });
}

// ── Prizes ────────────────────────────────────────────────────────
/**
 * Community prizes by final leaderboard place. Must match PRIZE_TIERS in
 * src/lib/campaign.ts, which shows them.
 *
 * Each winner gets a coupon for one store item: the one whose name matches
 * `storeMatch`, fixed when prizes are issued. The coupon claims that item and
 * nothing else. Claiming it creates the order and adds `points` to the
 * winner's overall points, earned and spent in the same moment, so their
 * spendable balance does not change and the points cannot go anywhere else.
 */
const PRIZE_TIERS = [
  { id: 'jacket', item: 'Jacket', upTo: 3, points: 2500, storeMatch: /jacket/i },
  { id: 'power-bank', item: 'Power bank', upTo: 6, points: 2000, storeMatch: /power\s*-?\s*bank/i },
  { id: 'water-bottle', item: 'Water bottle', upTo: 11, points: 1500, storeMatch: /bottle/i },
  { id: 't-shirt', item: 'T-shirt', upTo: 31, points: 1000, storeMatch: /t\s*-?\s*shirt/i },
  { id: 'stickers', item: 'Sticker sheet', upTo: 51, points: 150, storeMatch: /sticker/i },
];
const PRIZE_PLACES = PRIZE_TIERS[PRIZE_TIERS.length - 1].upTo;

// Coupon emails per request. Each takes about half a second and API Gateway
// gives up on a request after 29, so the admin page sends them in batches and
// keeps asking until none are left.
const PRIZE_EMAIL_BATCH = 10;
const PRIZE_EMAIL_TIME_BUDGET_MS = 15 * 1000;
// A send claimed this long ago without a result is treated as lost and redone.
const PRIZE_EMAIL_STALE_MS = 5 * 60 * 1000;
const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function prizeTierForPlace(place) {
  return PRIZE_TIERS.find((t) => place <= t.upTo) || null;
}

function prizeTierById(id) {
  return PRIZE_TIERS.find((t) => t.id === id) || null;
}

/** "jacket" for "Jacket", to read naturally after "a". */
function itemInSentence(item) {
  const s = String(item || '');
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * KU-XXXX-XXXX. A reference for the member and the organisers, not a secret:
 * claiming needs the owner's verified sign-in. 32 symbols divide 256 evenly,
 * so every symbol is equally likely.
 */
function couponCode() {
  const s = Array.from(crypto.randomBytes(8), (b) => COUPON_ALPHABET[b % COUPON_ALPHABET.length]).join('');
  return `KU-${s.slice(0, 4)}-${s.slice(4)}`;
}

/** What the member sees of their coupon. */
function publicPrize(prize) {
  if (!prize) return null;
  return {
    code: prize.code,
    tier: prize.tier,
    item: prize.item,
    points: prize.points,
    place: prize.place,
    // Their rank on the public leaderboard. Differs from `place` only when
    // someone above them was excluded from the prizes.
    boardRank: prize.boardRank ?? prize.place,
    // 'issued' until claimed, then 'claimed'.
    status: prize.status,
    issuedAt: prize.issuedAt,
    // The store item the coupon claims.
    itemId: prize.itemId || null,
    claimedAt: prize.claimedAt || null,
    orderId: prize.orderId || null,
  };
}

/** What an admin sees of a coupon. */
function adminCoupon(prize) {
  if (!prize) return null;
  return {
    code: prize.code,
    status: prize.status,
    emailStatus: prize.emailStatus || 'pending',
    emailedAt: prize.emailedAt || null,
    emailError: prize.emailError || null,
    claimedAt: prize.claimedAt || null,
    orderId: prize.orderId || null,
    // The confirmation emailed when they claimed: 'sent', 'failed', or null.
    claimEmailStatus: prize.claimEmailStatus || null,
    claimEmailError: prize.claimEmailError || null,
  };
}

/** Every store item, to find what each prize is claimed as. */
async function listStoreItems() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: STORE_ITEMS_TABLE, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * The physical store item a tier's winners claim. When several match, the
 * oldest, so adding another one later does not quietly change the prize.
 */
function storeItemForTier(tier, items) {
  return items
    .filter((i) => i.itemType !== 'virtual' && tier.storeMatch.test(String(i.name || '')))
    .sort((a, b) =>
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
      String(a.id).localeCompare(String(b.id)))[0] || null;
}

/**
 * The store item for each tier: the one fixed when prizes were issued, or,
 * before that, or if that item has since been deleted, today's match.
 */
function tierItemsFor(lock, items) {
  return PRIZE_TIERS.map((tier) => {
    const fixedId = lock?.tierItems?.[tier.id]?.itemId;
    const item = (fixedId && items.find((i) => i.id === fixedId)) || storeItemForTier(tier, items);
    return { tier, item };
  });
}

/** A tier's store item as the admin page shows it, with its stock. */
function tierItemView({ tier, item }) {
  return {
    tier: tier.id,
    itemId: item ? item.id : null,
    itemName: item ? String(item.name || '').trim() : null,
    quantity: item && typeof item.quantity === 'number' ? item.quantity : null,
    inStock: item ? Boolean(item.inStock) : null,
  };
}

/**
 * Tiers that have winners but no store item to claim. Prizes cannot be issued
 * until there is one for each.
 */
function missingPrizeItems(winners, tierItems) {
  const withWinners = new Set(winners.map((w) => w.tier.id));
  return tierItems.filter(({ tier, item }) => !item && withWinners.has(tier.id)).map(({ tier }) => tier.item);
}

/**
 * The frozen allocation, once prizes are issued. Only a record with an
 * allocation counts, so nothing else at this key can pass for issued prizes.
 */
async function getPrizeLock(campaignId) {
  const r = await docClient.send(
    new GetCommand({ TableName: PARTICIPATION_TABLE, Key: { campaignId, userId: PRIZES_KEY } }),
  );
  const lock = r.Item;
  return lock && Array.isArray(lock.allocation) && lock.issuedAt ? lock : null;
}

/**
 * Identifies an allocation and the store items it is claimed as, so issuing
 * freezes exactly the list the admin reviewed.
 */
function allocationFingerprint(winners, tierItems) {
  const items = tierItems.map(({ tier, item }) => `${tier.id}=${item ? item.id : ''}`).join(',');
  return crypto
    .createHash('sha256')
    .update(`${winners.map((w) => `${w.userId}:${w.tier.id}`).join('|')}#${items}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Prize places from the current standings. A member an admin excluded gives up
 * their place, and everyone below moves up one. So does anyone with no active
 * day in the challenge window: there is no work in it to reward.
 */
function allocatePrizes(participants) {
  const excludedIds = new Set(participants.filter((p) => p.prizeExcluded === true).map((p) => p.userId));
  const board = rankEntries(participants);
  const eligible = board.filter((e) => !excludedIds.has(e.userId) && e.activeDays >= 1);
  const winners = eligible.slice(0, PRIZE_PLACES).map((e, i) => ({
    ...e,
    place: i + 1,
    tier: prizeTierForPlace(i + 1),
  }));

  // Ties across a prize boundary: same days and commits, so lessons or, failing
  // that, member ids decided who got the better prize. Admins see these.
  const ties = [];
  for (const t of PRIZE_TIERS) {
    const above = eligible[t.upTo - 1];
    const below = eligible[t.upTo];
    if (!above || !below) continue;
    if (above.activeDays !== below.activeDays || above.commitCount !== below.commitCount) continue;
    ties.push({
      place: t.upTo,
      aboveUserId: above.userId,
      aboveName: above.displayName,
      belowUserId: below.userId,
      belowName: below.displayName,
      decidedBy: above.lessonsRecorded !== below.lessonsRecorded ? 'lessons' : 'member id',
    });
  }

  // Builders ranked lower than their days and commits alone would put them,
  // because they had no lesson for the places that need one.
  const activityRank = new Map(orderByActivity(participants).map((e, i) => [e.userId, i + 1]));
  const movedForLessons = board
    .filter((e) => e.rank > activityRank.get(e.userId))
    .map((e) => ({ ...e, activityRank: activityRank.get(e.userId) }));

  return {
    board,
    winners,
    ties,
    excluded: board.filter((e) => excludedIds.has(e.userId)),
    // On the board, but without a single active day.
    inactive: board.filter((e) => !excludedIds.has(e.userId) && e.activeDays < 1),
    movedForLessons,
  };
}

/**
 * Ranked members whose repo the last refresh could not read in full, so their
 * days, commits or lessons may be short until the next one.
 */
function incompleteRepos(participants) {
  return participants
    .filter((p) => p.repoFullName && p.repo && !p.repo.unreachable && p.repo.complete === false)
    .map((p) => ({ userId: p.userId, name: p.displayName || 'Builder', repoFullName: p.repoFullName }));
}

/**
 * Members with a linked repo that GitHub would not show on the last refresh.
 * They are not ranked, so without this list they would miss out silently.
 */
function unreachableRepos(participants) {
  return participants
    .filter((p) => p.repoFullName && p.repo && p.repo.unreachable)
    .map((p) => ({ userId: p.userId, name: p.displayName || 'Builder', repoFullName: p.repoFullName }));
}

/** The part of a winner that is frozen when prizes are issued. */
function allocationEntry(w) {
  return {
    userId: w.userId,
    place: w.place,
    boardRank: w.rank,
    tier: w.tier.id,
    activeDays: w.activeDays,
    commitCount: w.commitCount,
    lessonsDone: w.lessonsDone,
    bonusLessonsDone: w.bonusLessonsDone,
  };
}

/** Name and email for many members at once, keyed by userId. */
function getContacts(userIds) {
  return batchGetAll(USERS_TABLE, 'userId', userIds, '#u, #n, #e', {
    '#u': 'userId', '#n': 'name', '#e': 'email',
  });
}

function adminDenied(who) {
  return res(who.status, { error: who.status === 401 ? 'Sign in again to continue.' : 'admin only' });
}

/**
 * The prize list for the admin page: a preview from the live standings until
 * prizes are issued, then the frozen allocation with each coupon's state.
 * Admin only, on a verified token, because it returns members' emails.
 */
async function handleAdminPrizes(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);

  const [participants, lock, sweep, storeItems] = await Promise.all([
    listParticipants(campaignId), getPrizeLock(campaignId), getSweepStatus(campaignId), listStoreItems(),
  ]);
  const byId = new Map(participants.map((p) => [p.userId, p]));
  const tierItems = tierItemsFor(lock, storeItems);

  let rows;
  let ties = [];
  let excluded = [];
  let inactive = [];
  let unreachable = [];
  let movedForLessons = [];
  let incomplete = [];
  let missingItems = [];
  let fingerprint = null;
  if (lock) {
    rows = lock.allocation.map((a) => ({ ...a, coupon: adminCoupon(byId.get(a.userId)?.prize) }));
  } else {
    const allocation = allocatePrizes(participants);
    rows = allocation.winners.map((w) => ({ ...allocationEntry(w), coupon: null }));
    ties = allocation.ties;
    excluded = allocation.excluded.map((e) => ({ userId: e.userId, boardRank: e.rank, name: e.displayName }));
    inactive = allocation.inactive.map((e) => ({ userId: e.userId, boardRank: e.rank, name: e.displayName }));
    movedForLessons = allocation.movedForLessons.map((e) => ({
      userId: e.userId, name: e.displayName, activityRank: e.activityRank, boardRank: e.rank,
    }));
    unreachable = unreachableRepos(participants);
    incomplete = incompleteRepos(participants);
    missingItems = missingPrizeItems(allocation.winners, tierItems);
    fingerprint = allocationFingerprint(allocation.winners, tierItems);
  }

  const contacts = await getContacts([
    ...rows.map((r) => r.userId),
    ...excluded.map((e) => e.userId),
    ...inactive.map((e) => e.userId),
    ...movedForLessons.map((e) => e.userId),
    ...unreachable.map((u) => u.userId),
    ...incomplete.map((u) => u.userId),
    ...ties.flatMap((t) => [t.aboveUserId, t.belowUserId]),
    lock?.issuedBy,
  ]);
  const nameOf = (userId, fallback) => contacts.get(userId)?.name || fallback || 'Unnamed member';
  const deadlinePassed = Date.now() >= Date.parse(ENTRY_DEADLINE_ISO);

  return res(200, {
    deadlinePassed,
    issued: Boolean(lock),
    issuedAt: lock?.issuedAt || null,
    issuedByName: lock ? nameOf(lock.issuedBy, 'an admin') : null,
    // When the board the prizes come from was last read from GitHub.
    standingsAsOf: lock ? lock.standingsAsOf || lock.issuedAt : sweep?.completedAt || null,
    // Why issuing has to wait, if it does.
    sweepBlocker: !lock && deadlinePassed ? sweepBlocker(sweep, participants) : null,
    fingerprint,
    rows: rows.map((r) => {
      const p = byId.get(r.userId);
      return {
        ...r,
        name: nameOf(r.userId, p?.displayName),
        email: contacts.get(r.userId)?.email || null,
        // false means the repo has commits from before the challenge window.
        repoEligible: p?.repo?.eligible ?? null,
        // How far they got: building, submitted on kiro.dev, or validated.
        stage: p ? participantStage(p) : null,
      };
    }),
    excluded: excluded.map((e) => ({ ...e, name: nameOf(e.userId, e.name) })),
    inactive: inactive.map((e) => ({ ...e, name: nameOf(e.userId, e.name) })),
    // Ranked below the places that need a lesson, for having none.
    movedForLessons: movedForLessons.map((e) => ({ ...e, name: nameOf(e.userId, e.name) })),
    unreachable: unreachable.map((u) => ({ ...u, name: nameOf(u.userId, u.name) })),
    // Read only in part on the last refresh: a refresh usually fixes these.
    incomplete: incomplete.map((u) => ({ ...u, name: nameOf(u.userId, u.name) })),
    ties: ties.map((t) => ({
      place: t.place,
      aboveName: nameOf(t.aboveUserId, t.aboveName),
      belowName: nameOf(t.belowUserId, t.belowName),
      decidedBy: t.decidedBy,
    })),
    // The store item each prize claims, and its stock.
    tierItems: tierItems.map(tierItemView),
    // Before issuing: prizes with winners but no store item to claim.
    missingItems,
  });
}

/** Take a member out of the prizes, or put them back, until prizes are issued. */
async function handleExcludeFromPrizes(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);

  const { userId, excluded } = parseBody(event);
  if (typeof userId !== 'string' || !userId || userId.startsWith('__') || typeof excluded !== 'boolean') {
    return res(400, { error: 'userId and excluded (true or false) are required' });
  }
  if (await getPrizeLock(campaignId)) {
    return res(409, { error: 'Prizes are already issued, so the list is final.' });
  }

  const update = {
    TableName: PARTICIPATION_TABLE,
    Key: { campaignId, userId },
    ConditionExpression: 'attribute_exists(userId)',
  };
  if (excluded) {
    update.UpdateExpression = 'SET prizeExcluded = :t, prizeExcludedBy = :by, prizeExcludedAt = :n';
    update.ExpressionAttributeValues = { ':t': true, ':by': who.userId, ':n': new Date().toISOString() };
  } else {
    update.UpdateExpression = 'REMOVE prizeExcluded, prizeExcludedBy, prizeExcludedAt';
  }
  try {
    await docClient.send(new UpdateCommand(update));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return res(404, { error: 'participation not found' });
    throw err;
  }

  console.log('prize exclusion', { by: who.userId, userId, excluded });
  return res(200, { userId, excluded });
}

/**
 * Freeze the standings and give each winner a coupon. No points move here:
 * the winner adds them by redeeming the coupon from their profile.
 *
 * The allocation is written once, conditionally, before any coupon. A re-run,
 * after a timeout or from a second admin, reuses it and only fills in missing
 * coupons, so nobody's prize can change and nobody gets two.
 */
async function handleIssuePrizes(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  if (Date.now() < Date.parse(ENTRY_DEADLINE_ISO)) {
    return res(409, { error: `Entries are still open. Prizes can be issued after ${DEADLINE_LABEL_IST}.` });
  }

  const participants = await listParticipants(campaignId);
  let lock = await getPrizeLock(campaignId);
  if (!lock) {
    const sweep = await getSweepStatus(campaignId);
    const blocker = sweepBlocker(sweep, participants);
    if (blocker) return res(409, { error: blocker });

    const { board, winners } = allocatePrizes(participants);
    if (!winners.length) return res(409, { error: 'Nobody is on the leaderboard, so there is nobody to award.' });
    // Every prize needs a store item to be claimed as.
    const tierItems = tierItemsFor(null, await listStoreItems());
    const missing = missingPrizeItems(winners, tierItems);
    if (missing.length) {
      return res(409, { error: `Add a store item for: ${missing.join(', ')}. Winners claim their prize as that item.` });
    }
    // The list must be the one the admin reviewed: a refresh, an exclusion or
    // a store change since they loaded it would otherwise change prizes
    // without them seeing.
    const { fingerprint } = parseBody(event);
    if (fingerprint !== allocationFingerprint(winners, tierItems)) {
      return res(409, { error: 'The prize list has changed since you loaded it. Review the updated list, then issue again.' });
    }
    const item = {
      campaignId,
      userId: PRIZES_KEY,
      issuedAt: new Date().toISOString(),
      issuedBy: who.userId,
      standingsAsOf: sweep.completedAt,
      allocation: winners.map(allocationEntry),
      // The store item each prize claims, fixed now so renaming or adding
      // items later cannot change what a coupon gets.
      tierItems: Object.fromEntries(tierItems
        .filter(({ item: storeItem }) => storeItem)
        .map(({ tier, item: storeItem }) => [tier.id, { itemId: storeItem.id, itemName: String(storeItem.name || '').trim() }])),
      // The public leaderboard, frozen with the prizes it decided.
      board,
    };
    try {
      await docClient.send(
        new PutCommand({
          TableName: PARTICIPATION_TABLE,
          Item: item,
          // A row here without an allocation is not a lock (see getPrizeLock),
          // so it is replaced rather than allowed to block issuing.
          ConditionExpression: 'attribute_not_exists(userId) OR attribute_not_exists(#al)',
          ExpressionAttributeNames: { '#al': 'allocation' },
        }),
      );
      lock = item;
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') throw err;
      lock = await getPrizeLock(campaignId); // another admin got there first: finish theirs
      if (!lock) return res(409, { error: 'Another admin is issuing the prizes. Reload the list in a moment.' });
    }
  }

  const byId = new Map(participants.map((p) => [p.userId, p]));
  let created = 0;
  let skipped = 0;
  const queue = [...lock.allocation];
  const worker = async () => {
    while (queue.length) {
      const a = queue.shift();
      const tier = prizeTierById(a.tier);
      if (!tier || byId.get(a.userId)?.prize) {
        skipped++;
        continue;
      }
      const prize = {
        code: couponCode(),
        tier: tier.id,
        item: tier.item,
        points: tier.points,
        // The one store item this coupon claims.
        itemId: lock.tierItems?.[tier.id]?.itemId || null,
        place: a.place,
        boardRank: a.boardRank,
        status: 'issued',
        issuedAt: lock.issuedAt,
        issuedBy: lock.issuedBy,
        emailStatus: 'pending',
        emailAttempts: 0,
      };
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: PARTICIPATION_TABLE,
            Key: { campaignId, userId: a.userId },
            UpdateExpression: 'SET #pz = :prize, updatedAt = :n',
            ConditionExpression: 'attribute_exists(userId) AND attribute_not_exists(#pz)',
            ExpressionAttributeNames: { '#pz': 'prize' },
            ExpressionAttributeValues: { ':prize': prize, ':n': new Date().toISOString() },
          }),
        );
        created++;
      } catch (err) {
        // Already has one (a parallel run), or the participation is gone.
        if (err.name !== 'ConditionalCheckFailedException') throw err;
        skipped++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, queue.length) }, worker));

  console.log('prizes issued', { campaignId, by: who.userId, created, skipped, total: lock.allocation.length });
  return res(200, { issuedAt: lock.issuedAt, created, skipped, total: lock.allocation.length });
}

// Prizes that come in sizes. Their winners give their size in the claim's note.
const SIZED_PRIZE_TIERS = new Set(['jacket', 't-shirt']);

// When shipped prizes go out, worded the same way in every email: "shipped by
// November".
const PRIZE_SHIPS_BY = 'November';

// Where winners make a social media post about their win: the community's post
// generator on PartyRock, behind the organisers' short link.
const PRIZE_SHARE_URL = 'https://bit.ly/4enYPpZ';

/**
 * The coupon email. It says plainly that the coupon claims the winner's prize
 * item and nothing else, and walks them from the site to the claim, using the
 * labels the site shows. `email` is the address it goes to, which is also the
 * one they log in with: members cannot change it on their profile.
 */
function buildPrizeEmail({ name, email, prize, test = false }) {
  const points = Number(prize.points).toLocaleString('en-IN');
  // "sticker sheet" in a sentence. The claim button reads "Claim Sticker sheet".
  const item = htmlEscape(itemInSentence(prize.item));
  const itemLabel = htmlEscape(String(prize.item || ''));
  // The rank they can see on the public leaderboard.
  const place = Number(prize.boardRank ?? prize.place);
  const site = APP_URL.replace(/^https?:\/\//, '');
  // Opens their profile, after logging in if they are not already.
  const profileUrl = `${APP_URL}/profile`;
  const link = (url, text) => `<a href="${htmlEscape(url)}" style="color:#0b63c5;">${htmlEscape(text)}</a>`;
  const logInWith = email
    ? `log in with <strong>${htmlEscape(email)}</strong>, the address this email was sent to`
    : 'log in with the address this email was sent to';

  const steps = [
    `Go to ${link(APP_URL, site)} and ${logInWith}. On a phone, <strong>Log in</strong> is in the ☰ menu.`,
    'Click your profile icon at the top right, then <strong>Profile</strong>.',
    `Near the top of your profile is your <strong>Kiro University prize</strong> card. Press <strong>Claim my ${item}</strong>. ` +
      'There is no code to type: the coupon is already on your account.',
    `Choose how you want it: <strong>Ship it to me</strong> (it will be shipped by ${PRIZE_SHIPS_BY}), or ` +
      '<strong>Collect it at our next in-person event</strong>.',
    'Enter your full name and mobile number. For shipping, also enter your address, city, state and PIN code.' +
      (SIZED_PRIZE_TIERS.has(prize.tier) ? ' Put your size in the <strong>Note for the organisers</strong> box.' : ''),
    `Press <strong>Claim ${itemLabel}</strong>. You'll see a confirmation on screen and get a confirmation email ` +
      'with all your claim details, and the claim then shows under <strong>Activity</strong> on your profile.',
  ];

  const bodyHtml = [
    `<p style="margin:0 0 16px;">Hi ${htmlEscape(greetingName(name))},</p>`,
    `<p style="margin:0 0 16px;">Kiro University has wrapped up, and you finished <strong>#${place}</strong> on the AWS User Group Madurai leaderboard. Thank you for building with us.</p>`,
    `<p style="margin:0 0 16px;">You won a <strong>${item}</strong>. Here is your prize coupon:</p>`,
    '<p style="margin:0 0 16px; padding:16px; background:#f4f5f7; border:1px dashed #c2c7d0; border-radius:8px; ' +
      'font-family:Menlo,Consolas,monospace; font-size:20px; font-weight:700; letter-spacing:2px; text-align:center;">' +
      `${htmlEscape(prize.code)}</p>`,
    '<p style="margin:0 0 24px; padding:14px 16px; background:#fff7e6; border-left:4px solid #ff9900; border-radius:4px;">' +
      `<strong>You can redeem this coupon only for your assigned prize: one ${item}.</strong> ` +
      'It cannot be used for any other item in the store, and it works only on your own account.</p>',
    `<p style="margin:0 0 12px; font-size:17px;"><strong>How to claim your ${item}</strong></p>`,
    ...steps.map((s, i) => `<p style="margin:0 0 12px;"><strong>${i + 1}.</strong> ${s}</p>`),
    `<p style="margin:20px 0 16px;">Your ${item} is free. Claiming it also adds <strong>${points} points</strong> to your ` +
      'overall points. They are not added to your redeemable points, so they cannot be spent in the store.</p>',
    '<p style="margin:0 0 8px;">Or press the button below to go straight to your profile.</p>',
    // The button is part of the body rather than renderEmail's call to action,
    // so the share prompt can come after it, at the very end.
    '<p style="margin:8px 0 28px;">' +
      `<a href="${htmlEscape(profileUrl)}" style="display:inline-block; background:#ff9900; color:#000000; ` +
      'text-decoration:none; font-weight:600; font-size:16px; padding:14px 28px; border-radius:8px;">' +
      `Claim my ${item}</a></p>`,
    '<p style="margin:0 0 6px; padding-top:20px; border-top:1px solid #eaeaea;">' +
      '<strong>Share your win on social media</strong></p>',
    `<p style="margin:0 0 8px;">Tell your network you finished #${place} in Kiro University and won a ${item}. ` +
      `${link(PRIZE_SHARE_URL, 'Generate your post here')}.</p>`,
  ].join('\n');
  return {
    subject: `${test ? '[TEST] ' : ''}Your Kiro University prize: ${prize.item}`,
    html: renderEmail({
      heading: `You finished #${place} in Kiro University`,
      bodyHtml,
    }),
  };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "12 Oct 2026, 11:45 pm IST". From the fixed offset rather than the locale
 * data, which formats differently from one Node version to the next.
 */
function istDateTime(iso) {
  const d = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const h = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ` +
    `${h % 12 || 12}:${minutes} ${h < 12 ? 'am' : 'pm'} IST`;
}

/**
 * The winner's confirmation of their claim, with every detail they entered,
 * so they can check it and keep it. Plain text is built from the same rows,
 * rather than stripped from the HTML, so it reads "Label: value".
 */
function buildClaimConfirmationEmail({ name, prize, order, totalPoints }) {
  const item = itemInSentence(prize.item);
  const ship = order.fulfillmentMethod === 'ship';
  const contact = order.shippingAddress || {};
  const points = Number(prize.points).toLocaleString('en-IN');
  const total = Number.isFinite(Number(totalPoints)) && totalPoints !== null
    ? ` (now ${Number(totalPoints).toLocaleString('en-IN')})`
    : '';

  // { label, lines, mono }. Every value is plain text, escaped when rendered.
  const rows = [
    { label: 'Prize', lines: [order.itemName] },
    { label: 'Coupon', lines: [prize.code], mono: true },
    { label: 'Order ID', lines: [order.id], mono: true },
    { label: 'Claimed on', lines: [istDateTime(order.createdAt)] },
    {
      label: 'How you get it',
      lines: [ship ? `Shipped to your address by ${PRIZE_SHIPS_BY}` : 'Collect it at our next in-person event'],
    },
    { label: 'Name', lines: [contact.name] },
    { label: 'Mobile', lines: [contact.phone] },
    ship && { label: 'Ship to', lines: [contact.address, `${contact.city}, ${contact.state} ${contact.zipCode}`] },
    order.customerNotes && { label: 'Your note', lines: [order.customerNotes] },
    { label: 'Cost', lines: ['Free with your coupon'] },
    { label: 'Points', lines: [`${points} added to your overall points${total}`] },
  ].filter(Boolean);

  const intro = ship
    ? `Your claim is confirmed. Your ${item} will be shipped to the address below by ${PRIZE_SHIPS_BY}, ` +
      "and we'll email you when it's on its way."
    : `Your claim is confirmed. Collect your ${item} from the organisers at our next in-person event: ` +
      'show them this email or your coupon code.';
  const after = "We'll use your mobile number if we need to reach you about it.";

  const cell = 'padding:10px 14px; font-size:14px; line-height:21px; vertical-align:top; border-top:1px solid #eef0f3;';
  const valueHtml = (r) => {
    const v = r.lines.map((l) => htmlEscape(l)).join('<br>');
    return r.mono ? `<span style="font-family:Menlo,Consolas,monospace; word-break:break-all;">${v}</span>` : v;
  };
  const table =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ' +
    'style="margin:0 0 20px; border:1px solid #e3e6ea; border-radius:8px; border-collapse:separate;">' +
    rows.map((r, i) => {
      const top = i === 0 ? 'border-top:none;' : '';
      return `<tr><td width="34%" style="${cell}${top} color:#6b7280;">${htmlEscape(r.label)}</td>` +
        `<td style="${cell}${top} color:#232f3e; font-weight:600;">${valueHtml(r)}</td></tr>`;
    }).join('') +
    '</table>';

  const greeting = `Hi ${greetingName(name)},`;
  const bodyHtml = [
    `<p style="margin:0 0 16px;">${htmlEscape(greeting)}</p>`,
    `<p style="margin:0 0 20px;">${htmlEscape(intro)}</p>`,
    '<p style="margin:0 0 10px;"><strong>Your claim</strong></p>',
    table,
    `<p style="margin:0 0 16px;">${htmlEscape(after)}</p>`,
    '<p style="margin:0 0 8px;">Your claim is also under <strong>Activity</strong> on your profile.</p>',
  ].join('\n');

  const text = [
    greeting,
    '',
    intro,
    '',
    'Your claim',
    ...rows.map((r) => `${r.label}: ${r.lines.join(', ')}`),
    '',
    after,
    'Your claim is also under Activity on your profile:',
    `${APP_URL}/profile`,
    '',
    'AWS User Group Madurai',
  ].join('\n');

  return {
    subject: `Claim confirmed: ${order.itemName} (Kiro University prize)`,
    html: renderEmail({
      heading: `Your ${item} is claimed`,
      bodyHtml,
      cta: { label: 'Open your profile', url: `${APP_URL}/profile` },
      footerNote: 'You received this because you claimed your Kiro University prize.',
    }),
    text,
  };
}

/**
 * Email the winner the confirmation of their claim, and record on the coupon
 * whether it went. Never throws: the claim is already saved, and a mail
 * problem must not fail or undo it. Returns whether the email was sent.
 */
async function sendClaimConfirmation(campaignId, { userId, user, name, prize, order, totalPoints }) {
  let r;
  try {
    if (!user?.email) {
      r = { ok: false, error: 'No email address on their profile.' };
    } else {
      const { subject, html, text } = buildClaimConfirmationEmail({ name, prize, order, totalPoints });
      r = await sendEmail({ to: user.email, subject, html, text });
    }
  } catch (err) {
    r = { ok: false, error: err.message };
  }

  const names = { '#pz': 'prize', '#cs': 'claimEmailStatus', '#code': 'code', '#oi': 'orderId' };
  const values = { ':code': prize.code, ':oid': order.id };
  let update;
  if (r.ok) {
    update = 'SET #pz.#cs = :s, #pz.#ca = :now REMOVE #pz.#ce';
    Object.assign(names, { '#ca': 'claimEmailedAt', '#ce': 'claimEmailError' });
    Object.assign(values, { ':s': 'sent', ':now': new Date().toISOString() });
  } else {
    update = 'SET #pz.#cs = :s, #pz.#ce = :err';
    names['#ce'] = 'claimEmailError';
    Object.assign(values, { ':s': 'failed', ':err': String(r.error || 'unknown error').slice(0, 300) });
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression: update,
        // Only on the coupon this claim used.
        ConditionExpression: '#pz.#code = :code AND #pz.#oi = :oid',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
  } catch (err) {
    console.warn('could not record the claim confirmation email:', err.message);
  }
  if (!r.ok) console.warn('claim confirmation email not sent', { campaignId, userId, orderId: order.id, error: r.error });
  return Boolean(r.ok);
}

/** Whether a coupon's email should go out now. */
function isPrizeEmailDue(prize, nowMs) {
  if (!prize) return false;
  if (!prize.emailStatus || prize.emailStatus === 'pending') return true;
  if (prize.emailStatus !== 'sending') return false;
  const claimed = Date.parse(prize.emailClaimedAt || '');
  return !(claimed > nowMs - PRIZE_EMAIL_STALE_MS);
}

async function recordPrizeEmail(campaignId, userId, { ok, error }) {
  const names = { '#pz': 'prize', '#es': 'emailStatus', '#ea': 'emailAttempts' };
  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId },
      UpdateExpression: ok
        ? 'SET #pz.#es = :s, #pz.#ea = if_not_exists(#pz.#ea, :zero) + :one, #pz.emailedAt = :now REMOVE #pz.emailError'
        : 'SET #pz.#es = :s, #pz.#ea = if_not_exists(#pz.#ea, :zero) + :one, #pz.emailError = :err',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: ok
        ? { ':s': 'sent', ':zero': 0, ':one': 1, ':now': new Date().toISOString() }
        : { ':s': 'failed', ':zero': 0, ':one': 1, ':err': String(error || 'unknown error').slice(0, 300) },
    }),
  );
}

/** Claim, send and record one coupon email. Returns 'sent', 'failed' or 'skipped'. */
async function sendPrizeEmail(campaignId, p, nowMs) {
  // Claim before sending, so a double click or a second admin cannot send it twice.
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId: p.userId },
        UpdateExpression: 'SET #pz.#es = :sending, #pz.#ec = :now',
        ConditionExpression:
          'attribute_exists(#pz) AND (attribute_not_exists(#pz.#es) OR #pz.#es = :pending OR ' +
          '(#pz.#es = :sending AND (attribute_not_exists(#pz.#ec) OR #pz.#ec < :stale)))',
        ExpressionAttributeNames: { '#pz': 'prize', '#es': 'emailStatus', '#ec': 'emailClaimedAt' },
        ExpressionAttributeValues: {
          ':sending': 'sending',
          ':pending': 'pending',
          ':now': new Date().toISOString(),
          ':stale': new Date(nowMs - PRIZE_EMAIL_STALE_MS).toISOString(),
        },
      }),
    );
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return 'skipped';
    throw err;
  }

  const contact = await getUserContact(p.userId);
  if (!contact?.email) {
    await recordPrizeEmail(campaignId, p.userId, { ok: false, error: 'No email address on their profile.' });
    return 'failed';
  }
  const { subject, html } = buildPrizeEmail({ name: contact.name || p.displayName, email: contact.email, prize: p.prize });
  const r = await sendEmail({ to: contact.email, subject, html });
  await recordPrizeEmail(campaignId, p.userId, r);
  return r.ok ? 'sent' : 'failed';
}

/**
 * Email the coupons, one batch per request. The admin page calls this until
 * `remaining` is 0. `retryFailed` first puts failed sends back in the queue.
 */
async function handleEmailPrizes(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  if (!(await getPrizeLock(campaignId))) return res(409, { error: 'Issue the coupons first.' });

  const started = Date.now();
  const participants = await listParticipants(campaignId);

  if (parseBody(event).retryFailed === true) {
    for (const p of participants) {
      if (p.prize?.emailStatus !== 'failed') continue;
      try {
        await docClient.send(
          new UpdateCommand({
            TableName: PARTICIPATION_TABLE,
            Key: { campaignId, userId: p.userId },
            UpdateExpression: 'SET #pz.#es = :pending',
            ConditionExpression: '#pz.#es = :failed',
            ExpressionAttributeNames: { '#pz': 'prize', '#es': 'emailStatus' },
            ExpressionAttributeValues: { ':pending': 'pending', ':failed': 'failed' },
          }),
        );
        p.prize.emailStatus = 'pending';
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
  }

  const due = participants
    .filter((p) => isPrizeEmailDue(p.prize, started))
    .sort((a, b) => a.prize.place - b.prize.place);

  let sent = 0;
  let failed = 0;
  let attempted = 0;
  for (const p of due) {
    if (attempted >= PRIZE_EMAIL_BATCH || Date.now() - started > PRIZE_EMAIL_TIME_BUDGET_MS) break;
    attempted++;
    const outcome = await sendPrizeEmail(campaignId, p, started);
    if (outcome === 'sent') sent++;
    if (outcome === 'failed') failed++;
    if (outcome !== 'skipped') await sleep(REMINDER_SEND_DELAY_MS);
  }

  console.log('prize emails', { campaignId, by: who.userId, sent, failed, remaining: due.length - attempted });
  return res(200, { sent, failed, remaining: due.length - attempted });
}

/** One sample coupon email to the admin who asks for it. Records nothing. */
async function handleTestPrizeEmail(campaignId, event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);

  const tier = prizeTierById(parseBody(event).tier) || PRIZE_TIERS[0];
  const index = PRIZE_TIERS.indexOf(tier);
  const contact = await getUserContact(who.userId);
  if (!contact?.email) return res(400, { error: 'Your profile has no email address to send the test to.' });

  const place = index <= 0 ? 1 : PRIZE_TIERS[index - 1].upTo + 1;
  const { subject, html } = buildPrizeEmail({
    name: contact.name,
    email: contact.email,
    prize: { code: 'KU-TEST-TEST', tier: tier.id, item: tier.item, points: tier.points, place, boardRank: place },
    test: true,
  });
  const r = await sendEmail({ to: contact.email, subject, html });
  if (!r.ok) return res(502, { error: `The test email could not be sent: ${r.error}` });
  return res(200, { ok: true, sentTo: maskEmail(contact.email) });
}

/**
 * The store item a coupon claims: the one fixed when prizes were issued, or,
 * for a coupon from before items were fixed, or one whose item has since been
 * deleted, the tier's match in today's store.
 */
async function prizeStoreItem(prize) {
  if (prize.itemId) {
    const r = await docClient.send(new GetCommand({ TableName: STORE_ITEMS_TABLE, Key: { id: prize.itemId } }));
    if (r.Item) return r.Item;
  }
  const tier = prizeTierById(prize.tier);
  return tier ? storeItemForTier(tier, await listStoreItems()) : null;
}

/**
 * The winner claims their prize: the one store item their coupon is for, and
 * nothing else. One transaction writes the order, marks the coupon claimed and
 * adds the coupon's points to the winner's overall points, so a double click
 * cannot claim twice and a failure leaves nothing half done.
 *
 * The points are earned and spent on the prize in the same moment: they count
 * towards overall points and the leaderboard, but never reach the spendable
 * balance, so they cannot buy anything else. Stock is taken when there is
 * some. A prize is never refused for stock: the organisers keep it topped up,
 * and a winner must not lose their prize to a late restock.
 *
 * On a verified token, because this creates an order and moves points:
 * extractUserId accepts a hand-made token, and member ids are public.
 */
async function handleClaimPrize(campaignId, event) {
  const claims = await verifyIdToken(event.headers?.Authorization || event.headers?.authorization);
  if (!claims) return res(401, { error: 'Sign in again to claim your prize.' });
  const userId = claims.sub;

  const p = await getParticipation(campaignId, userId);
  const prize = p?.prize;
  if (!prize) return res(404, { error: 'You do not have a prize coupon for this challenge.' });
  if (prize.status === 'claimed') {
    return res(409, { error: 'You have already claimed your prize.', prize: publicPrize(prize) });
  }

  const item = await prizeStoreItem(prize);
  if (!item) {
    return res(409, { error: 'Your prize is not set up in the store yet. The organisers have been told; try again later.' });
  }
  const checkout = validateCheckout('physical', parseBody(event));
  if (checkout.error) return res(400, { error: checkout.error });

  const u = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
  if (!u.Item) return res(404, { error: 'Your profile could not be found. Sign out and back in, then try again.' });

  const now = new Date().toISOString();
  const points = Number(prize.points) || 0;
  const itemName = String(item.name || prize.item).trim();
  const order = {
    id: `order_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`,
    userId,
    itemId: item.id,
    itemName,
    itemType: 'physical',
    // What the coupon covers. The member pays nothing.
    points,
    status: 'pending',
    fulfillmentMethod: checkout.method,
    shippingAddress: checkout.contact,
    ...(checkout.notes ? { customerNotes: checkout.notes } : {}),
    // Marks this order as a prize, claimed with this coupon.
    prizeCode: prize.code,
    prizeCampaignId: campaignId,
    createdAt: now,
    updatedAt: now,
  };
  const reason = `Kiro University prize coupon ${prize.code}: #${prize.boardRank ?? prize.place}, ${prize.item}`;

  const transactItems = [
    {
      Update: {
        TableName: PARTICIPATION_TABLE,
        Key: { campaignId, userId },
        UpdateExpression: 'SET #pz.#st = :claimed, #pz.#ca = :now, #pz.#oi = :oid, updatedAt = :now',
        // 'issued' only: a coupon already claimed, or redeemed under the old
        // flow, cannot claim again.
        ConditionExpression: '#pz.#st = :issued',
        ExpressionAttributeNames: { '#pz': 'prize', '#st': 'status', '#ca': 'claimedAt', '#oi': 'orderId' },
        ExpressionAttributeValues: { ':claimed': 'claimed', ':issued': 'issued', ':now': now, ':oid': order.id },
      },
    },
    {
      Update: {
        TableName: USERS_TABLE,
        Key: { userId },
        // Overall points only. A profile with no redeemablePoints yet gets its
        // current balance written down (its total, as the store reads it), so
        // the added overall points are not read back later as spendable.
        UpdateExpression:
          'SET #pt = if_not_exists(#pt, :zero) + :pts, #rp = if_not_exists(#rp, :base), ' +
          '#pa = list_append(if_not_exists(#pa, :empty), :pa), ' +
          '#ac = list_append(if_not_exists(#ac, :empty), :ac), #ua = :now',
        ConditionExpression: 'attribute_exists(userId)',
        ExpressionAttributeNames: {
          '#pt': 'points', '#rp': 'redeemablePoints', '#pa': 'pointActivities',
          '#ac': 'activities', '#ua': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':pts': points,
          ':base': Number(u.Item.points) || 0,
          ':empty': [],
          ':pa': [{
            id: `pa-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            userId,
            points,
            reason,
            type: 'coupon',
            awardedBy: 'system',
            awardedAt: now,
          }],
          ':ac': [
            { type: 'points_awarded', points, reason, pointType: 'coupon', awardedBy: 'system', timestamp: now },
            {
              type: 'store_redeemed',
              itemId: item.id,
              itemName,
              points,
              orderId: order.id,
              prizeCode: prize.code,
              timestamp: now,
            },
          ],
          ':now': now,
        },
      },
    },
    {
      Put: {
        TableName: ORDERS_TABLE,
        Item: order,
        ConditionExpression: 'attribute_not_exists(#id)',
        ExpressionAttributeNames: { '#id': 'id' },
      },
    },
  ];
  // One from stock, guarded on the quantity read, when there is any.
  const takesStock = typeof item.quantity === 'number' && item.quantity > 0;
  if (takesStock) {
    const left = item.quantity - 1;
    transactItems.push({
      Update: {
        TableName: STORE_ITEMS_TABLE,
        Key: { id: item.id },
        UpdateExpression: 'SET #q = :left, #is = :inStock',
        ConditionExpression: '#q = :q',
        ExpressionAttributeNames: { '#q': 'quantity', '#is': 'inStock' },
        ExpressionAttributeValues: { ':left': left, ':inStock': left > 0, ':q': item.quantity },
      },
    });
  }

  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      const reasons = (err.CancellationReasons || []).map((r) => r && r.Code);
      if (reasons[0] === 'ConditionalCheckFailed') {
        return res(409, { error: 'You have already claimed your prize.' });
      }
      // Someone took one from stock at the same moment. Nothing was written.
      return res(409, { error: 'Your claim could not be completed just now. Try again in a moment.' });
    }
    throw err;
  }
  if (!takesStock) {
    console.warn('prize claimed with no stock left', { campaignId, itemId: item.id, orderId: order.id });
  }

  const after = await docClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      ProjectionExpression: '#pt, #rp',
      ExpressionAttributeNames: { '#pt': 'points', '#rp': 'redeemablePoints' },
    }),
  );
  console.log('prize claimed', { campaignId, userId, code: prize.code, orderId: order.id, points });

  // The winner's record of the claim, with everything they entered.
  const confirmationEmailed = await sendClaimConfirmation(campaignId, {
    userId,
    user: u.Item,
    name: u.Item.name || p.displayName,
    prize,
    order,
    totalPoints: after.Item?.points ?? null,
  });

  return res(200, {
    prize: publicPrize({ ...prize, status: 'claimed', claimedAt: now, orderId: order.id }),
    order,
    added: points,
    points: after.Item?.points ?? null,
    redeemablePoints: after.Item?.redeemablePoints ?? null,
    confirmationEmailed,
  });
}

// ── The sweep (EventBridge) ───────────────────────────────────────
/**
 * Refresh GitHub stats for every registered repo. Runs on a schedule rather
 * than reacting to webhooks: no per-member setup, no permissions, and a
 * six-hour cadence answers a 72-hour staleness question perfectly.
 */
// Repos inspected at once. Checking one at a time with file-content reads, a
// hundred repos would outrun the Lambda's 300-second timeout. Four stays well
// clear of GitHub's secondary rate limits on concurrent requests.
const SWEEP_CONCURRENCY = 4;

/** When the sweep last started and finished. */
async function getSweepStatus(campaignId) {
  const r = await docClient.send(
    new GetCommand({ TableName: PARTICIPATION_TABLE, Key: { campaignId, userId: SWEEP_KEY } }),
  );
  return r.Item || null;
}

async function recordSweep(campaignId, fields) {
  const names = {};
  const values = {};
  const sets = Object.entries(fields).map(([k, v], i) => {
    names[`#f${i}`] = k;
    values[`:v${i}`] = v;
    return `#f${i} = :v${i}`;
  });
  await docClient.send(
    new UpdateCommand({
      TableName: PARTICIPATION_TABLE,
      Key: { campaignId, userId: SWEEP_KEY },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
}

/**
 * Why prizes cannot be issued from the current board yet, or null when they
 * can: a sweep that started after entries closed has to have finished under
 * the current counting rules (ACTIVITY_VERSION), none may be part-way through
 * updating repos, and every ranked repo must have been counted that way.
 */
function sweepBlocker(sweep, participants, nowMs = Date.now()) {
  const deadline = Date.parse(ENTRY_DEADLINE_ISO);
  const started = Date.parse(sweep?.startedAt || '');
  const completed = Date.parse(sweep?.completedAt || '');
  const running = started > (completed || 0) && nowMs - started < SWEEP_MAX_RUN_MS;
  if (running) return 'The leaderboard is refreshing from GitHub right now. Try again in a few minutes.';
  if (!(completed >= deadline) || !(Date.parse(sweep?.completedStartedAt || '') >= deadline)) {
    return 'The leaderboard has not been refreshed since entries closed. Run "Refresh from GitHub" first.';
  }
  if (sweep.completedActivityVersion !== ACTIVITY_VERSION) {
    return 'The way repos are counted has changed since the last refresh. Run "Refresh from GitHub" first.';
  }
  // Only repos the sweep recounts (it reads repoFullName), so a record it can
  // never reach cannot hold up the prizes for good.
  const stale = participants.filter((p) =>
    p.repoFullName && p.repo && !p.repo.unreachable && p.repo.activityVersion !== ACTIVITY_VERSION).length;
  if (stale) {
    return `${stale} ${stale === 1 ? 'repo has' : 'repos have'} not been recounted under the current rules yet. Run "Refresh from GitHub" again.`;
  }
  return null;
}

// The Lambda's own timeout. A sweep that started longer ago than this has
// stopped, whether or not it recorded finishing.
const SWEEP_MAX_RUN_MS = 300 * 1000;

async function runSweep(campaignId) {
  // Once prizes are issued the standings are final. Refreshing repos after
  // that could move the board away from the prizes it decided.
  if (await getPrizeLock(campaignId)) {
    console.log('sweep skipped: prizes are issued, so the standings are final');
    return { skipped: 'prizes issued' };
  }
  const startedAt = new Date().toISOString();
  await recordSweep(campaignId, { startedAt });

  const participants = await listParticipants(campaignId);
  const withRepo = participants.filter((p) => p.repoFullName);
  console.log(`sweep: ${withRepo.length} repos of ${participants.length} participants`);

  let updated = 0;
  let unreachable = 0;
  let unchanged = 0;
  let stoppedForPrizes = false;

  const queue = [...withRepo];
  const worker = async () => {
    for (let p = queue.shift(); p; p = queue.shift()) {
      try {
        const stats = await inspectRepo(p.repoFullName, p.repo);
        if (stats.unreachable) unreachable++;
        if (stats.inspectedAt && stats.inspectedAt !== stats.checkedAt) unchanged++;

        // Detect a rename: same repo, new full_name. Keep tracking it silently.
        const nextFullName = stats.fullName ? stats.fullName.toLowerCase() : p.repoFullName;

        await docClient.send(
          new UpdateCommand({
            TableName: PARTICIPATION_TABLE,
            Key: { campaignId, userId: p.userId },
            UpdateExpression: 'SET repo = :repo, repoFullName = :rl, updatedAt = :n',
            // A prize issued while this sweep runs freezes the member's
            // standing: leave their repo as the prize saw it.
            ConditionExpression: 'attribute_not_exists(#pz)',
            ExpressionAttributeNames: { '#pz': 'prize' },
            ExpressionAttributeValues: {
              ':repo': stats,
              ':rl': nextFullName,
              ':n': new Date().toISOString(),
            },
          }),
        );
        updated++;
      } catch (err) {
        if (err.name === 'ConditionalCheckFailedException') {
          stoppedForPrizes = true;
          queue.length = 0; // prizes are out: stop refreshing everyone else too
          continue;
        }
        // One bad repo must never abort the sweep for everyone else.
        console.error(`sweep failed for ${p.userId} (${p.repoFullName}):`, err.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, queue.length) }, worker));

  // Recorded only for a sweep that ran to the end, so issuing prizes can wait
  // for one that started after entries closed.
  if (!stoppedForPrizes) {
    await recordSweep(campaignId, {
      completedAt: new Date().toISOString(),
      completedStartedAt: startedAt,
      // The counting rules this sweep used, so prizes wait for a recount
      // when they change.
      completedActivityVersion: ACTIVITY_VERSION,
      lastRepoCount: withRepo.length,
      lastUnreachable: unreachable,
    });
  }

  console.log(`sweep done: ${updated} updated (${unchanged} unchanged since last push), ${unreachable} unreachable`);
  return { updated, unchanged, unreachable, total: withRepo.length };
}

// ── Router ────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // EventBridge and direct invokes arrive without an httpMethod. `task` picks
  // the job; anything else is the GitHub sweep, which is what the original
  // schedule sends.
  if (!event.httpMethod) {
    const campaignId = event.campaignId || process.env.DEFAULT_CAMPAIGN_ID || 'kiro-university-2026';
    if (event.task === 'reminders') {
      return await runReminders(campaignId, { mode: event.mode, testUserId: event.testUserId });
    }
    return await runSweep(campaignId);
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  const path = event.path || event.requestContext?.path || '';
  const parts = path.split('/').filter(Boolean);
  const i = parts.indexOf('campaign');
  const r = i >= 0 ? parts.slice(i + 1) : parts;
  const method = event.httpMethod;

  try {
    if (method === 'GET' && r[0] === 'health') return res(200, { status: 'ok' });

    // Codeless routes that are not campaign-scoped.
    if (method === 'POST' && r[0] === 'setup' && r[1] === 'claim') return await handleClaim(event);
    if (method === 'POST' && r[0] === 'repo') return await handleRegisterRepo(event);

    const campaignId = r[0] ? decodeURIComponent(r[0]) : null;
    const action = r[1];
    if (campaignId) {
      if (method === 'POST' && action === 'join') return await handleJoin(campaignId, event);
      if (method === 'GET' && action === 'me') return await handleMe(campaignId, event);
      if (method === 'GET' && action === 'leaderboard') return await handleLeaderboard(campaignId);
      if (method === 'GET' && action === 'stats') return await handleStats(campaignId);
      if (method === 'POST' && action === 'setup-code') return await handleSetupCode(campaignId, event);
      if (method === 'POST' && action === 'lessons') return await handleLessons(campaignId, event);
      if (method === 'POST' && action === 'confirm-entry') return await handleConfirmEntry(campaignId, event);
      if (method === 'POST' && action === 'validate') return await handleValidate(campaignId, event);
      if (method === 'GET' && action === 'admin' && r[2] === 'participants') {
        return await handleAdminParticipants(campaignId, event);
      }
      if (method === 'POST' && action === 'prize' && r[2] === 'claim') {
        return await handleClaimPrize(campaignId, event);
      }
      if (action === 'admin' && r[2] === 'prizes') {
        if (method === 'GET' && !r[3]) return await handleAdminPrizes(campaignId, event);
        if (method === 'POST' && r[3] === 'issue') return await handleIssuePrizes(campaignId, event);
        if (method === 'POST' && r[3] === 'email') return await handleEmailPrizes(campaignId, event);
        if (method === 'POST' && r[3] === 'test-email') return await handleTestPrizeEmail(campaignId, event);
        if (method === 'POST' && r[3] === 'exclude') return await handleExcludeFromPrizes(campaignId, event);
      }
      if (method === 'POST' && action === 'sweep') {
        // Verified, because the result decides who wins prizes.
        const who = await verifiedAdmin(event);
        if (who.status) return adminDenied(who);
        return res(200, await runSweep(campaignId));
      }
      if (method === 'POST' && action === 'reminders') return await handleReminders(campaignId, event);
      if (method === 'POST' && action === 'unsubscribe') return await handleUnsubscribe(campaignId, event);
    }

    console.log('route not matched', { method, path, r });
    return res(404, { error: 'Not found', path, method });
  } catch (error) {
    console.error('campaign error:', error);
    return res(500, { error: 'Internal server error', message: error.message });
  }
};
