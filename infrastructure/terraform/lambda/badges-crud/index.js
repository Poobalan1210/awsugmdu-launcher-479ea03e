/**
 * Open Badges v2.0 — Lambda handler
 *
 * Serves the three hosted JSON documents required by the OB v2 spec:
 *
 *   GET /ob2/issuer.json                        → Issuer Profile
 *   GET /ob2/badges/{badgeId}.json              → BadgeClass
 *   GET /ob2/assertions/{badgeId}-{userId}.json → Assertion
 *   GET /ob2/assertions/{badgeId}-{userId}.svg  → Baked badge (credential inside the image)
 *   GET /ob2/badge-images/{badgeId}.svg         → Badge SVG image (generic, no name)
 *   GET /ob2/verify?url={assertionUrl}          → Verification result
 *
 *   POST   /badges/{badgeId}/award               → Award to a member (organisers)
 *   DELETE /badges/{badgeId}/award?userId=…      → Revoke (organisers)
 *
 * All GET endpoints are public (no auth required).
 * An assertion is stored in DynamoDB when a badge is awarded.
 */

'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { handleOgBadge } = require('./og-proxy');
const { withVerifiedAuth, callerId, callerIsAdmin } = require('./verify-auth');
const { renderBadgeSvg, bakeSvg } = require('./render/badge-template');
const { sendEmail, renderEmail } = require('./shared/email');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const db = DynamoDBDocumentClient.from(client);

const ASSERTIONS_TABLE  = process.env.ASSERTIONS_TABLE  || 'awsug-ob2-assertions';
const BADGES_TABLE      = process.env.BADGES_TABLE      || 'awsug-badges';
const BASE_URL          = process.env.BASE_URL          || 'https://www.awsugmdu.in';
const OB2_CONTEXT       = 'https://w3id.org/openbadges/v2';
const USERS_TABLE       = process.env.USERS_TABLE_NAME  || 'awsug-users';

// ─── Built-in badge definitions (mirrors src/data/mockData.ts) ───────────────
// Badges created in the admin console live in BADGES_TABLE; see resolveBadge.
const BADGE_DEFINITIONS = {
  b1: { id: 'b1', name: 'Sprint Champion',   description: 'Completed 5 skill sprints',              icon: '🏆', criteria: 'Complete 5 skill sprints' },
  b2: { id: 'b2', name: 'First Submission',  description: 'Made your first sprint submission',       icon: '🚀', criteria: 'Get your first submission approved' },
  b3: { id: 'b3', name: 'AWS Certified',     description: 'Earned an AWS certification',             icon: '📜', criteria: 'Earn at least 1 AWS certification' },
  b4: { id: 'b4', name: 'Community Helper',  description: 'Helped 10 community members',             icon: '🤝', criteria: 'Awarded for outstanding community support' },
  b5: { id: 'b5', name: 'Blog Writer',       description: 'Published 3 technical blogs',             icon: '✍️', criteria: 'Get 3 blog submissions approved' },
  b6: { id: 'b6', name: 'Early Adopter',     description: 'Joined in the first month',               icon: '⭐', criteria: 'Awarded to early community members' },
  b7: { id: 'b7', name: 'Speaker Star',      description: 'Delivered 3 sessions',                    icon: '🎤', criteria: 'Deliver 3 speaker sessions' },
  b8: { id: 'b8', name: 'Security Expert',   description: 'Completed Security Sprint',               icon: '🔒', criteria: 'Complete the Security Sprint' },
};

// ─── CORS headers ─────────────────────────────────────────────────────────────
function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...extra,
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...cors(), 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body, null, 2),
  };
}

function svg(statusCode, body) {
  return {
    statusCode,
    headers: { ...cors(), 'Content-Type': 'image/svg+xml' },
    body,
  };
}

// ─── Recipient hashing ────────────────────────────────────────────────────────
function hashEmail(email, salt) {
  const input = email.toLowerCase().trim() + salt;
  return 'sha256$' + crypto.createHash('sha256').update(input).digest('hex');
}

function makeSalt(userId) {
  return `awsugmdu-${userId.slice(0, 8)}`;
}

// ─── Badge lookup ─────────────────────────────────────────────────────────────
/**
 * A built-in badge, or one created in the admin console. Criteria come back as
 * the narrative string in both cases (custom badges store an object).
 */
async function resolveBadge(badgeId) {
  if (BADGE_DEFINITIONS[badgeId]) return { ...BADGE_DEFINITIONS[badgeId], isBuiltIn: true };
  if (!/^[\w-]{1,80}$/.test(badgeId)) return null;
  const r = await db.send(new GetCommand({ TableName: BADGES_TABLE, Key: { id: badgeId } }));
  if (!r.Item) return null;
  const c = r.Item.criteria;
  return {
    ...r.Item,
    criteriaObject: c && typeof c === 'object' ? c : undefined,
    criteria: typeof c === 'string' ? c : (c?.description || 'Awarded by the AWS User Group Madurai organisers'),
  };
}

/** Same slug as src/lib/profileSlug.ts, so evidence links open the profile. */
function profileSlug(name, userId) {
  const nameSlug = String(name || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return `${nameSlug}-${Math.abs(hash).toString(16).slice(0, 4).padStart(4, '0')}`;
}

// ─── OB v2 document builders ──────────────────────────────────────────────────
function buildIssuer() {
  return {
    '@context': OB2_CONTEXT,
    id: `${BASE_URL}/ob2/issuer.json`,
    type: 'Profile',
    name: 'AWS User Group Madurai',
    url: BASE_URL,
    email: 'badges@awsugmdu.in',
    description:
      'AWS User Group Madurai is a community of cloud enthusiasts, developers, and architects ' +
      'who learn and grow together through events, sprints, and certifications.',
    image: `${BASE_URL}/logo.png`,
  };
}

function buildBadgeClass(def) {
  const id = `${BASE_URL}/ob2/badges/${def.id}.json`;
  return {
    '@context': OB2_CONTEXT,
    id,
    type: 'BadgeClass',
    name: def.name,
    description: def.description,
    // Uploaded artwork when an organiser added some, otherwise the hexagon
    image: def.imageUrl || `${BASE_URL}/ob2/badge-images/${def.id}.svg`,
    criteria: {
      id: `${id}/criteria`,
      narrative: def.criteria,
    },
    issuer: `${BASE_URL}/ob2/issuer.json`,
    tags: ['AWS', 'Cloud', 'Community', 'AWSUG'],
  };
}

function buildAssertion(record) {
  return {
    '@context': OB2_CONTEXT,
    id: `${BASE_URL}/ob2/assertions/${record.assertionId}.json`,
    type: 'Assertion',
    recipient: {
      type: 'email',
      hashed: true,
      salt: record.salt,
      identity: record.hashedEmail,
    },
    badge: `${BASE_URL}/ob2/badges/${record.badgeId}.json`,
    verification: { type: 'HostedBadge' },
    issuedOn: record.issuedOn,
    ...(record.expires ? { expires: record.expires } : {}),
    evidence: [
      {
        type: 'Evidence',
        id: `${BASE_URL}/u/${record.userSlug}`,
        name: `${record.recipientName}'s AWS UG Madurai Profile`,
        description: `View ${record.recipientName}'s full profile and achievements.`,
      },
    ],
    narrative:
      `${record.recipientName} earned the "${record.badgeName}" badge from AWS User Group Madurai ` +
      `for: ${record.criteria}`,
  };
}

// ─── Badge image ──────────────────────────────────────────────────────────────
/**
 * The hexagon from tools/badge-renderer (render/badge-template.js). The badge
 * name sits under the issuer lockup; no recipient name is drawn, so one image
 * serves every earner, and the fonts are embedded so it renders identically
 * everywhere, including as a downloaded file.
 */
function renderBadge(def) {
  return renderBadgeSvg({ id: def.id, role: def.name, description: def.description, embedFont: true });
}

// ─── Verification ─────────────────────────────────────────────────────────────
/**
 * The verifier fetches the URL it is given, so refuse anything but a public
 * https host: no loopback, link-local or private addresses (the Lambda runtime
 * API listens on 127.0.0.1).
 */
function isPublicHttpsUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false; // IP literals
  return host.includes('.');
}

/** GET a JSON document the verifier was pointed at, with the same guards. */
async function fetchPublicJson(url) {
  if (!isPublicHttpsUrl(url)) throw new Error('not a public https URL');
  return fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
}

async function verifyAssertion(assertionUrl) {
  const steps = [];

  // 1. Fetch assertion
  let assertion;
  try {
    const res = await fetchPublicJson(assertionUrl);
    // OB v2 hosted verification: a revoked assertion answers 410 Gone.
    if (res.status === 410) {
      const body = await res.json().catch(() => ({}));
      steps.push({ label: 'Badge not revoked', status: 'fail', detail: body.revocationReason || 'Revoked by the issuer' });
      return { valid: false, revoked: true, steps };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    assertion = await res.json();
    steps.push({ label: 'Fetch assertion', status: 'pass', detail: assertionUrl });
  } catch (e) {
    steps.push({ label: 'Fetch assertion', status: 'fail', detail: e.message });
    return { valid: false, steps };
  }

  // 2. Structural checks
  const checks = [
    [assertion['@context'] === OB2_CONTEXT, '@context is OB v2'],
    [assertion.type === 'Assertion', 'type is "Assertion"'],
    [assertion.id === assertionUrl, 'id matches fetch URL'],
    [typeof assertion.badge === 'string', 'badge is a URL'],
    // Credly (and so every AWS certification badge) uses "hosted"; both are valid OB v2.
    [['HostedBadge', 'hosted'].includes(assertion.verification?.type), 'verification is hosted'],
    [typeof assertion.issuedOn === 'string', 'issuedOn is present'],
    [assertion.recipient?.hashed === true, 'recipient is hashed'],
    [assertion.recipient?.identity?.startsWith('sha256$'), 'recipient uses sha256'],
  ];
  for (const [ok, label] of checks) {
    steps.push({ label, status: ok ? 'pass' : 'fail' });
  }
  if (steps.some(s => s.status === 'fail')) return { valid: false, steps };

  // 3. Fetch BadgeClass
  let badgeClass;
  try {
    const res = await fetchPublicJson(assertion.badge);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    badgeClass = await res.json();
    steps.push({ label: 'Fetch BadgeClass', status: 'pass' });
  } catch (e) {
    steps.push({ label: 'Fetch BadgeClass', status: 'fail', detail: e.message });
    return { valid: false, steps };
  }

  // 4. BadgeClass checks
  const bcChecks = [
    [badgeClass['@context'] === OB2_CONTEXT, 'BadgeClass @context correct'],
    [badgeClass.type === 'BadgeClass', 'BadgeClass type correct'],
    [badgeClass.id === assertion.badge, 'BadgeClass id matches assertion.badge'],
    [typeof badgeClass.issuer === 'string', 'BadgeClass issuer is a URL'],
  ];
  for (const [ok, label] of bcChecks) {
    steps.push({ label, status: ok ? 'pass' : 'fail' });
  }
  if (steps.some(s => s.status === 'fail')) return { valid: false, steps };

  // 5. Fetch Issuer
  let issuer;
  try {
    const res = await fetchPublicJson(badgeClass.issuer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    issuer = await res.json();
    steps.push({ label: 'Fetch Issuer', status: 'pass' });
  } catch (e) {
    steps.push({ label: 'Fetch Issuer', status: 'fail', detail: e.message });
    return { valid: false, steps };
  }

  // 6. Issuer checks
  const issuerChecks = [
    [issuer['@context'] === OB2_CONTEXT, 'Issuer @context correct'],
    [issuer.id === badgeClass.issuer, 'Issuer id matches badgeClass.issuer'],
    [typeof issuer.name === 'string', 'Issuer name present'],
    [typeof issuer.email === 'string', 'Issuer email present'],
  ];
  for (const [ok, label] of issuerChecks) {
    steps.push({ label, status: ok ? 'pass' : 'fail' });
  }

  // 7. Expiry
  if (assertion.expires) {
    const expired = new Date(assertion.expires) < new Date();
    steps.push({ label: 'Badge not expired', status: expired ? 'fail' : 'pass', detail: assertion.expires });
  }

  return {
    valid: steps.every(s => s.status !== 'fail'),
    steps,
    assertion,
    badgeClass,
    issuer,
  };
}

// ─── Awarding ─────────────────────────────────────────────────────────────────
/** The entry kept on the member's profile, the shape src/data/mockData.ts `Badge` reads. */
function profileBadge(def, earnedDate) {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon || '🏅',
    ...(def.imageUrl ? { imageUrl: def.imageUrl } : {}),
    earnedDate,
    criteria: def.criteriaObject || { type: 'manual', description: def.criteria },
  };
}

async function sendAwardEmail(user, def, slug) {
  const badgeUrl = `${BASE_URL}/badges/${def.id}/${slug}`;
  const html = renderEmail({
    heading: `You've earned the ${def.name} badge`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${escHtml(user.name || 'there')},</p>
      <p style="margin:0 0 16px;">Congratulations! AWS User Group Madurai has awarded you the
        <strong>${escHtml(def.name)}</strong> badge.</p>
      <p style="margin:0 0 16px;"><img src="${BASE_URL}/og/badge/${encodeURIComponent(def.id)}/image.png"
        width="480" height="251" alt="${escHtml(def.name)} badge"
        style="display:block;border:0;max-width:100%;height:auto;border-radius:8px;"></p>
      ${def.description ? `<p style="margin:0 0 16px;color:#555;">${escHtml(def.description)}</p>` : ''}
      <p style="margin:0 0 16px;">It is an Open Badge: anyone can verify it, and you can share it on
        LinkedIn or add it to your profile's Licenses &amp; Certifications from the badge page.</p>`,
    cta: { label: 'View and share your badge', url: badgeUrl },
    footerNote: 'You are receiving this because an AWS User Group Madurai organiser awarded you a badge.',
  });
  await sendEmail({ to: user.email, subject: `You've earned the ${def.name} badge`, html });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Award a badge: store the Open Badges assertion, add the badge to the
 * member's profile, then email them. The assertion write is create-only (or
 * re-issues a revoked one), so a retry or double click never awards twice or
 * sends a second email.
 */
async function awardBadge(badgeId, body, event) {
  if (!(await callerIsAdmin(event))) return json(403, { error: 'Only organisers can award badges.' });
  const userId = String(body.userId || '');
  if (!userId) return json(400, { error: 'userId is required' });

  const def = await resolveBadge(badgeId);
  if (!def) return json(404, { error: 'Badge not found' });
  const user = (await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }))).Item;
  if (!user) return json(404, { error: 'Member not found' });
  if (!user.email) return json(400, { error: 'This member has no email address on their profile.' });

  const now = new Date().toISOString();
  const salt = makeSalt(userId);
  const slug = profileSlug(user.name, userId);
  const record = {
    assertionId: `${badgeId}-${userId}`,
    badgeId,
    userId,
    userSlug: slug,
    recipientName: user.name || 'AWS User Group Madurai member',
    hashedEmail: hashEmail(user.email, salt),
    salt,
    badgeName: def.name,
    criteria: def.criteria,
    issuedOn: now,
    createdAt: now,
    awardedBy: callerId(event),
    ...(body.reason ? { reason: String(body.reason).slice(0, 500) } : {}),
  };
  try {
    await db.send(new PutCommand({
      TableName: ASSERTIONS_TABLE,
      Item: record,
      ConditionExpression: 'attribute_not_exists(assertionId) OR revoked = :true',
      ExpressionAttributeValues: { ':true': true },
    }));
  } catch (e) {
    if (e.name === 'ConditionalCheckFailedException') {
      return json(409, { error: `${user.name || 'This member'} already has this badge.` });
    }
    throw e;
  }

  const badges = Array.isArray(user.badges) ? user.badges : [];
  const entry = profileBadge(def, now.slice(0, 10));
  if (!badges.some((b) => b?.id === badgeId)) {
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET badges = list_append(if_not_exists(badges, :empty), :b), updatedAt = :now',
      ExpressionAttributeValues: { ':empty': [], ':b': [entry], ':now': now },
    }));
  }

  let emailed = true;
  try {
    await sendAwardEmail(user, def, slug);
  } catch (e) {
    emailed = false;
    console.error('Badge award email failed:', e.message);
  }

  return json(201, {
    assertionUrl: `${BASE_URL}/ob2/assertions/${record.assertionId}.json`,
    badge: entry,
    emailed,
  });
}

/** Revoke: the assertion answers 410 from now on and the badge leaves the profile. */
async function revokeBadge(badgeId, body, event) {
  if (!(await callerIsAdmin(event))) return json(403, { error: 'Only organisers can revoke badges.' });
  const userId = String(body.userId || '');
  if (!userId) return json(400, { error: 'userId is required' });
  const now = new Date().toISOString();

  try {
    await db.send(new UpdateCommand({
      TableName: ASSERTIONS_TABLE,
      Key: { assertionId: `${badgeId}-${userId}` },
      UpdateExpression: 'SET revoked = :true, revokedAt = :now, revokedBy = :by, revocationReason = :why',
      ConditionExpression: 'attribute_exists(assertionId)',
      ExpressionAttributeValues: {
        ':true': true, ':now': now, ':by': callerId(event),
        ':why': String(body.reason || 'Revoked by the issuer').slice(0, 500),
      },
    }));
  } catch (e) {
    if (e.name !== 'ConditionalCheckFailedException') throw e;
    // No assertion: the badge may only be on the profile; still remove it below.
  }

  const user = (await db.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }))).Item;
  if (user && Array.isArray(user.badges) && user.badges.some((b) => b?.id === badgeId)) {
    await db.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET badges = :b, updatedAt = :now',
      ExpressionAttributeValues: { ':b': user.badges.filter((b) => b?.id !== badgeId), ':now': now },
    }));
  }
  return json(200, { revoked: true });
}

// ─── Route handler ────────────────────────────────────────────────────────────
const handleRequest = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: cors(), body: '' };
  }

  const rawPath = event.path || '';
  // API Gateway may include the stage prefix (e.g. /dev/badges) or not (/badges).
  // Strip the stage prefix only when present.
  const stageNames = ['dev', 'staging', 'prod'];
  const firstSegment = rawPath.split('/')[1]; // e.g. "dev" or "badges"
  const path = stageNames.includes(firstSegment)
    ? rawPath.replace(/^\/[^/]+/, '') // strip /dev → /badges
    : rawPath;                         // already /badges
  const method = event.httpMethod;
  const qs = event.queryStringParameters || {};

  // Every read here is public; issuing assertions and editing badges is organiser-only.
  if (method !== 'GET' && !(await callerIsAdmin(event))) {
    return json(403, { error: 'Only organisers can do that.' });
  }

  // GET /ob2/issuer.json
  if (method === 'GET' && path === '/ob2/issuer.json') {
    return json(200, buildIssuer(), {
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // GET /ob2/badges/{badgeId}.json
  const badgeMatch = path.match(/^\/ob2\/badges\/([^/]+)\.json$/);
  if (method === 'GET' && badgeMatch) {
    const def = await resolveBadge(badgeMatch[1]);
    if (!def) return json(404, { error: 'Badge not found' });
    return json(200, buildBadgeClass(def), { 'Cache-Control': 'public, max-age=3600' });
  }

  // GET /ob2/badge-images/{badgeId}.svg — generic image, shared by every earner
  const imgMatch = path.match(/^\/ob2\/badge-images\/([^/]+)\.svg$/);
  if (method === 'GET' && imgMatch) {
    const def = await resolveBadge(imgMatch[1]);
    if (!def) return json(404, { error: 'Badge not found' });
    return {
      statusCode: 200,
      headers: { ...cors(), 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=3600' },
      body: renderBadge(def),
    };
  }

  // GET /ob2/assertions/{assertionId}.json  — the hosted assertion
  // GET /ob2/assertions/{assertionId}.svg   — the badge with that assertion baked in
  const assertionMatch = path.match(/^\/ob2\/assertions\/([^/]+)\.(json|svg)$/);
  if (method === 'GET' && assertionMatch) {
    const [, assertionId, format] = assertionMatch;
    const result = await db.send(new GetCommand({ TableName: ASSERTIONS_TABLE, Key: { assertionId } }));
    const record = result.Item;
    if (!record) return json(404, { error: 'Assertion not found' });
    const assertionUrl = `${BASE_URL}/ob2/assertions/${assertionId}.json`;
    if (record.revoked) {
      // OB v2 hosted verification: revoked assertions answer 410 Gone.
      return json(410, { id: assertionUrl, revoked: true, revocationReason: record.revocationReason || 'Revoked by the issuer' });
    }
    if (format === 'json') {
      return json(200, buildAssertion(record), { 'Cache-Control': 'public, max-age=300' });
    }
    const def = await resolveBadge(record.badgeId);
    if (!def) return json(404, { error: 'Badge not found' });
    return {
      statusCode: 200,
      headers: {
        ...cors(),
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `attachment; filename="awsugmdu-${record.badgeId}-badge.svg"`,
        'Cache-Control': 'private, max-age=300',
      },
      body: bakeSvg(renderBadge(def), assertionUrl, buildAssertion(record)),
    };
  }

  // GET /ob2/verify?url={assertionUrl}
  if (method === 'GET' && path === '/ob2/verify') {
    const url = qs.url;
    if (!url) return json(400, { error: 'url query parameter required' });
    if (!isPublicHttpsUrl(url)) return json(400, { error: 'url must be a public https URL' });
    try {
      const result = await verifyAssertion(url);
      return json(200, result);
    } catch (e) {
      return json(500, { error: 'Verification failed', detail: e.message });
    }
  }

  // GET /og/badge/{badgeId}/{userSlug} — OG proxy for social crawlers
  const ogMatch = path.match(/^\/og\/badge\/([^/]+)\/([^/]+)$/);
  if (method === 'GET' && ogMatch) {
    return handleOgBadge(ogMatch[1], ogMatch[2]);
  }

  // ── Badge definitions CRUD ────────────────────────────────────────────────

  // GET /badges — list all badges (hardcoded + custom from DB)
  if (method === 'GET' && path === '/badges') {
    try {
      const result = await db.send(new ScanCommand({ TableName: BADGES_TABLE }));
      const dbBadges = result.Items || [];
      // Merge: hardcoded first (as base), then DB badges override/extend
      const hardcoded = Object.values(BADGE_DEFINITIONS).map(def => ({
        id: def.id, name: def.name, description: def.description,
        icon: def.icon, criteria: { type: 'manual', description: def.criteria },
        earnedDate: '', isBuiltIn: true,
      }));
      // DB badges that aren't in hardcoded list
      const custom = dbBadges.filter(b => !BADGE_DEFINITIONS[b.id]);
      return json(200, { badges: [...hardcoded, ...custom] });
    } catch (e) {
      console.error('DynamoDB error:', e);
      return json(500, { error: 'Failed to list badges' });
    }
  }

  // GET /badges/{id}
  const badgeIdMatch = path.match(/^\/badges\/([^/]+)$/);
  if (method === 'GET' && badgeIdMatch) {
    const id = badgeIdMatch[1];
    if (BADGE_DEFINITIONS[id]) {
      const def = BADGE_DEFINITIONS[id];
      return json(200, { badge: { id: def.id, name: def.name, description: def.description, icon: def.icon, isBuiltIn: true } });
    }
    try {
      const result = await db.send(new GetCommand({ TableName: BADGES_TABLE, Key: { id } }));
      if (!result.Item) return json(404, { error: 'Badge not found' });
      return json(200, { badge: result.Item });
    } catch (e) {
      return json(500, { error: 'Failed to get badge' });
    }
  }

  // POST /badges — create a new badge
  if (method === 'POST' && path === '/badges') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    const { name, description, icon, imageUrl, criteria } = body;
    if (!name || !description) return json(400, { error: 'name and description are required' });
    const id = `b-${Date.now()}`;
    const item = {
      id, name, description,
      icon: icon || '🏅',
      imageUrl: imageUrl || null,
      criteria: criteria || { type: 'manual', description: 'Manually awarded by admins' },
      earnedDate: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      isBuiltIn: false,
    };
    try {
      await db.send(new PutCommand({ TableName: BADGES_TABLE, Item: item }));
      return json(201, { badge: item });
    } catch (e) {
      console.error('DynamoDB error:', e);
      return json(500, { error: 'Failed to create badge' });
    }
  }

  // PUT /badges/{id} — update a badge
  if (method === 'PUT' && badgeIdMatch) {
    const id = badgeIdMatch[1];
    if (BADGE_DEFINITIONS[id]) return json(403, { error: 'Cannot modify built-in badges' });
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    const { name, description, icon, imageUrl, criteria } = body;
    try {
      const result = await db.send(new GetCommand({ TableName: BADGES_TABLE, Key: { id } }));
      if (!result.Item) return json(404, { error: 'Badge not found' });
      const updated = {
        ...result.Item,
        ...(name && { name }),
        ...(description && { description }),
        ...(icon && { icon }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(criteria && { criteria }),
        updatedAt: new Date().toISOString(),
      };
      await db.send(new PutCommand({ TableName: BADGES_TABLE, Item: updated }));
      return json(200, { badge: updated });
    } catch (e) {
      return json(500, { error: 'Failed to update badge' });
    }
  }

  // DELETE /badges/{id}
  if (method === 'DELETE' && badgeIdMatch) {
    const id = badgeIdMatch[1];
    if (BADGE_DEFINITIONS[id]) return json(403, { error: 'Cannot delete built-in badges' });
    try {
      await db.send(new DeleteCommand({ TableName: BADGES_TABLE, Key: { id } }));
      return json(200, { message: 'Badge deleted' });
    } catch (e) {
      return json(500, { error: 'Failed to delete badge' });
    }
  }

  // POST   /badges/{id}/award   { userId, reason? }  — award (organisers)
  // DELETE /badges/{id}/award?userId=…&reason=…      — revoke (organisers)
  const awardMatch = path.match(/^\/badges\/([^/]+)\/award$/);
  if (awardMatch && (method === 'POST' || method === 'DELETE')) {
    let body = {};
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }
    return method === 'POST'
      ? awardBadge(awardMatch[1], body, event)
      : revokeBadge(awardMatch[1], { ...body, ...qs }, event);
  }

  return json(404, { error: 'Not found' });
};

exports.handler = withVerifiedAuth(handleRequest);
