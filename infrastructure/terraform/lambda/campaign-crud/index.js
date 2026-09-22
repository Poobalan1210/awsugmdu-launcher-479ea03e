/**
 * Kiro University Build-Along — campaign backend.
 *
 * One Lambda serving two entry points:
 *   • API Gateway  /campaign/{proxy+}  — participant and admin routes
 *   • EventBridge  (no httpMethod)     — the scheduled GitHub sweep
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
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const PARTICIPATION_TABLE = process.env.PARTICIPATION_TABLE_NAME || 'awsug-campaign-participation';
const CODES_TABLE = process.env.SETUP_CODES_TABLE_NAME || 'awsug-campaign-setup-codes';
const KIRONOMICS_TABLE = process.env.KIRONOMICS_TABLE_NAME || 'awsug-kironomics';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
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

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // Asia/Kolkata, no DST
const SETUP_CODE_TTL_SECONDS = 15 * 60;
const STALE_AFTER_HOURS = 72;
const COUNTER_KEY = '__counter__';

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

const LESSON_ARTIFACTS = [
  ['steering', (p) => /^\.kiro\/steering\/.+\.md$/i.test(p)],
  ['specs', (p) => /^\.kiro\/specs\/[^/]+\/(requirements|design|tasks)\.md$/i.test(p)],
  ['hooks', (p) => /^\.kiro\/hooks\/.+\.(json|kiro\.hook)$/i.test(p)],
  ['mcp', (p) => /^\.kiro\/settings\/mcp\.json$/i.test(p)],
  ['agents', (p) => /^\.kiro\/agents\/.+/i.test(p)],
  ['skills', (p) => /^\.kiro\/skills\/.+\/SKILL\.md$/i.test(p)],
];

// Older Kironomics setups wrote the API key as a literal into this file, and
// Kiro University requires committing .kiro/ — so its presence in a public tree
// means that member's key is public. Detected from a tree call we already make.
const LEAKED_KEY_PATH = /^\.kiro\/kironomics_report\.py$/i;

/**
 * Inspect one public repo. Returns a stats object; never throws. A GitHub
 * failure yields `unreachable`, which the UI shows as "couldn't check" rather
 * than as a disqualification.
 */
async function inspectRepo(fullName) {
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

  // Eligibility: any commit before the window opened is disqualifying.
  const prior = await gh(
    `/repos/${owner}/${name}/commits?until=${encodeURIComponent(BEFORE_WINDOW_ISO)}&per_page=1`,
  );
  if (prior.status === 409) {
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
  }

  // Distinct active days, bucketed IST. 100 commits covers a two-week sprint.
  const commits = await gh(`/repos/${owner}/${name}/commits?per_page=100`);
  if (commits.status === 200 && Array.isArray(commits.body)) {
    const days = new Set();
    for (const c of commits.body) {
      const d = c?.commit?.committer?.date || c?.commit?.author?.date;
      if (d) days.add(istDay(d));
    }
    out.activeDays = days.size;
    out.activeDayList = [...days].sort();
    const head = await gh(`/repos/${owner}/${name}/commits?per_page=1`);
    out.commitCount = commitCountFromLink(head.link, head.body);
  }

  // .kiro contents, artifact map, and the leaked-key check in one tree call.
  if (out.defaultBranch) {
    const tree = await gh(
      `/repos/${owner}/${name}/git/trees/${encodeURIComponent(out.defaultBranch)}?recursive=1`,
    );
    if (tree.status === 200 && Array.isArray(tree.body?.tree)) {
      const paths = tree.body.tree.filter((n) => n.type === 'blob').map((n) => n.path);
      out.hasKiroFolder = paths.some((p) => p.startsWith('.kiro/'));
      out.artifacts = Object.fromEntries(LESSON_ARTIFACTS.map(([k, t]) => [k, paths.some(t)]));
      out.kironomicsKeyExposed = paths.some((p) => LEAKED_KEY_PATH.test(p));
      out.treeTruncated = Boolean(tree.body.truncated);
      if (paths.includes('.kiro/ugmdu.json')) {
        const f = await gh(`/repos/${owner}/${name}/contents/.kiro/ugmdu.json`);
        if (f.status === 200 && f.body?.content) {
          try {
            out.manifest = JSON.parse(Buffer.from(f.body.content, 'base64').toString('utf8'));
          } catch {
            out.manifest = null;
          }
        }
      }
    }
  }

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
          fullName: p.repo.fullName,
          repoUrl: p.repo.repoUrl,
          activeDays: p.repo.activeDays || 0,
          commitCount: p.repo.commitCount || 0,
          lastPushAt: p.repo.lastPushAt || null,
          unreachable: Boolean(p.repo.unreachable),
          artifacts: p.repo.artifacts || {},
        }
      : null,
    lessonsRecorded: p.lessonsRecorded || [],
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
    lessonsRecorded: [],
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
      lessonsRecorded: (p.lessonsRecorded || []).length,
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

  await docClient.send(
    new PutCommand({
      TableName: CODES_TABLE,
      Item: { code, campaignId, userId, expiresAt, used: false, createdAt: new Date().toISOString() },
    }),
  );

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

/**
 * Register the repo the setup script just created. Authenticated by the same
 * one-time code (not yet consumed by /claim in the failure case) or by a
 * Cognito token, so the participant types nothing.
 */
async function handleRegisterRepo(event) {
  const body = parseBody(event);
  let campaignId = null;
  let userId = null;

  if (body.code) {
    const r = await docClient.send(new GetCommand({ TableName: CODES_TABLE, Key: { code: body.code } }));
    if (!r.Item) return res(404, { error: 'unknown or expired code' });
    if (r.Item.expiresAt * 1000 < Date.now()) return res(410, { error: 'this code has expired' });
    campaignId = r.Item.campaignId;
    userId = r.Item.userId;
  } else {
    userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
    campaignId = body.campaignId;
    if (!userId) return res(401, { error: 'authentication required' });
  }
  if (!campaignId || !userId) return res(400, { error: 'campaign or user could not be resolved' });

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

  return res(200, { repo: publicView({ repo: stats }).repo, eligible: stats.eligible });
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

// ── The sweep (EventBridge) ───────────────────────────────────────
/**
 * Refresh GitHub stats for every registered repo. Runs on a schedule rather
 * than reacting to webhooks: no per-member setup, no permissions, and a
 * six-hour cadence answers a 72-hour staleness question perfectly.
 */
async function runSweep(campaignId) {
  const participants = await listParticipants(campaignId);
  const withRepo = participants.filter((p) => p.repoFullName);
  console.log(`sweep: ${withRepo.length} repos of ${participants.length} participants`);

  let updated = 0;
  let unreachable = 0;

  for (const p of withRepo) {
    try {
      const stats = await inspectRepo(p.repoFullName);
      if (stats.unreachable) unreachable++;

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

  console.log(`sweep done: ${updated} updated, ${unreachable} unreachable`);
  return { updated, unreachable, total: withRepo.length };
}

// ── Router ────────────────────────────────────────────────────────
exports.handler = async (event) => {
  // EventBridge invokes this Lambda directly, with no httpMethod.
  if (!event.httpMethod) {
    const campaignId = event.campaignId || process.env.DEFAULT_CAMPAIGN_ID || 'kiro-university-2026';
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
      if (method === 'POST' && action === 'confirm-entry') return await handleConfirmEntry(campaignId, event);
      if (method === 'POST' && action === 'validate') return await handleValidate(campaignId, event);
      if (method === 'POST' && action === 'sweep') {
        if (!(await isAdmin(event))) return res(403, { error: 'admin only' });
        return res(200, await runSweep(campaignId));
      }
    }

    console.log('route not matched', { method, path, r });
    return res(404, { error: 'Not found', path, method });
  } catch (error) {
    console.error('campaign error:', error);
    return res(500, { error: 'Internal server error', message: error.message });
  }
};
