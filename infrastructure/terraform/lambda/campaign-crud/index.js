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
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
// Mirrored from lambda/shared/email.js by deploy.sh — edit the master copy.
const { sendEmail, renderEmail, APP_URL } = require('./shared/email');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const PARTICIPATION_TABLE = process.env.PARTICIPATION_TABLE_NAME || 'awsug-campaign-participation';
const CODES_TABLE = process.env.SETUP_CODES_TABLE_NAME || 'awsug-campaign-setup-codes';
const KIRONOMICS_TABLE = process.env.KIRONOMICS_TABLE_NAME || 'awsug-kironomics';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
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

// 3 pages x 100 = 300 in-window commits. Far beyond a two-week solo project,
// and bounded so one prolific repo cannot stall the whole sweep.
const MAX_COMMIT_PAGES = 3;

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

// Bump whenever detection changes, so the next sweep re-reads every repo
// instead of reusing results computed under older rules.
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
  // its folder, so the same name in two lesson folders is two specs.
  const specs = new Map();
  for (const p of files) {
    const m = p.match(SPEC_DOC);
    if (m) specs.set(`${m[1]}${m[2]}`, m[1]);
  }
  const specRoots = [...new Set(specs.values())];
  ev.specs = specs.size
    ? {
        found: true,
        detail: `${plural(specs.size, 'spec')} in ${specRoots.length === 1 ? `${specRoots[0]}.kiro/specs` : `${specRoots.length} .kiro folders`}`,
      }
    : { found: false, detail: '' };

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
  const days = new Set();
  let inWindowCommits = 0;
  for (let page = 1; page <= MAX_COMMIT_PAGES; page++) {
    const batch = await gh(
      `/repos/${owner}/${name}/commits` +
        `?since=${encodeURIComponent(WINDOW_START_ISO)}` +
        `&until=${encodeURIComponent(ENTRY_DEADLINE_ISO)}` +
        `&per_page=100&page=${page}`,
    );
    if (batch.status !== 200 || !Array.isArray(batch.body)) {
      if (batch.status !== 409) complete = false; // 409: empty repo
      break;
    }
    if (batch.body.length === 0) break;
    for (const c of batch.body) {
      const d = c?.commit?.committer?.date || c?.commit?.author?.date;
      if (d) days.add(istDay(d));
    }
    inWindowCommits += batch.body.length;
    if (batch.body.length < 100) break; // last page
  }
  out.activeDays = days.size;
  out.activeDayList = [...days].sort();
  // Commits that count toward the challenge, not the repo's lifetime total.
  out.commitCount = inWindowCommits;

  // Lifetime total kept separately: useful for spotting a repo that was busy
  // outside the window, without letting that inflate the leaderboard.
  const head = await gh(`/repos/${owner}/${name}/commits?per_page=1`);
  if (head.status === 200) out.totalCommitCount = commitCountFromLink(head.link, head.body);
  else if (head.status !== 409) complete = false;

  // .kiro contents, lesson evidence, and the leaked-key check in one tree call.
  // An empty repo has no tree, and nothing to find yet.
  let paths = emptyRepo ? [] : null;
  if (!paths && out.defaultBranch) {
    const tree = await gh(
      `/repos/${owner}/${name}/git/trees/${encodeURIComponent(out.defaultBranch)}?recursive=1`,
    );
    if (tree.status === 200 && Array.isArray(tree.body?.tree)) {
      paths = tree.body.tree.filter((n) => n.type === 'blob').map((n) => n.path);
      out.treeTruncated = Boolean(tree.body.truncated);
    } else if (tree.status === 409) {
      paths = [];
    } else {
      complete = false;
    }
  }

  if (paths) {
    out.hasKiroFolder = paths.some((p) => p.startsWith('.kiro/'));
    out.kironomicsKeyExposed = paths.some((p) => LEAKED_KEY_PATH.test(p));

    const readFile = async (p) => {
      try {
        return await fetchRepoFile(owner, name, p, out.defaultBranch);
      } catch (err) {
        complete = false;
        throw err;
      }
    };

    out.evidence = await detectLessonEvidence(paths, readFile);
    out.evidenceVersion = EVIDENCE_VERSION;
    // The old shape, for the page version still deployed until the new one
    // ships. Derived from the evidence so both agree.
    out.artifacts = {
      steering: out.evidence.steering.found,
      specs: out.evidence.specs.found,
      hooks: out.evidence.hooks.found,
      mcp: out.evidence.mcp.found,
      agents: out.evidence.agents.found,
      skills: paths.some((p) => SKILL_FILE.test(p)),
    };

    if (paths.includes('.kiro/ugmdu.json')) {
      try {
        // Kept for its participantId, which says whose setup command made
        // the repo. Its `lessons` list no longer counts: nobody edits it by
        // hand, and the repo files are better evidence.
        const text = await readFile('.kiro/ugmdu.json');
        out.manifest = text ? JSON.parse(text) : null;
      } catch {
        out.manifest = null;
      }
    }
  }

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
  return items.filter((i) => i.userId !== COUNTER_KEY);
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

async function handleLeaderboard(campaignId) {
  const all = await listParticipants(campaignId);
  const entries = all
    .filter((p) => p.repo && !p.repo.unreachable)
    .map((p) => ({
      userId: p.userId,
      displayName: p.displayName || 'Builder',
      activeDays: p.repo?.activeDays || 0,
      commitCount: p.repo?.commitCount || 0,
      lessonsRecorded: mergedLessons(p).length,
      validated: p.status === 'validated',
    }))
    // Active days first — distinct days, so a hundred pushes in one afternoon
    // still counts once. Commits break ties.
    .sort((a, b) => b.activeDays - a.activeDays || b.commitCount - a.commitCount)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  return res(200, { entries, totalItems: entries.length });
}

async function handleStats(campaignId) {
  const all = await listParticipants(campaignId);
  return res(200, {
    validatedCount: all.filter((p) => p.status === 'validated').length,
    joinedCount: all.length,
    withRepoCount: all.filter((p) => p.repo && !p.repo.unreachable).length,
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

async function runSweep(campaignId) {
  const participants = await listParticipants(campaignId);
  const withRepo = participants.filter((p) => p.repoFullName);
  console.log(`sweep: ${withRepo.length} repos of ${participants.length} participants`);

  let updated = 0;
  let unreachable = 0;
  let unchanged = 0;

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
            ExpressionAttributeValues: {
              ':repo': stats,
              ':rl': nextFullName,
              ':n': new Date().toISOString(),
            },
          }),
        );
        updated++;
      } catch (err) {
        // One bad repo must never abort the sweep for everyone else.
        console.error(`sweep failed for ${p.userId} (${p.repoFullName}):`, err.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SWEEP_CONCURRENCY, queue.length) }, worker));

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
      if (method === 'POST' && action === 'sweep') {
        if (!(await isAdmin(event))) return res(403, { error: 'admin only' });
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
