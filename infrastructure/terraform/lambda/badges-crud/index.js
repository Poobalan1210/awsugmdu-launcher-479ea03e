/**
 * Open Badges v2.0 — Lambda handler
 *
 * Serves the three hosted JSON documents required by the OB v2 spec:
 *
 *   GET /ob2/issuer.json                        → Issuer Profile
 *   GET /ob2/badges/{badgeId}.json              → BadgeClass
 *   GET /ob2/assertions/{badgeId}-{userId}.json → Assertion
 *   GET /ob2/badge-images/{badgeId}.svg         → Badge SVG image
 *   GET /ob2/verify?url={assertionUrl}          → Verification result
 *
 * All GET endpoints are public (no auth required).
 * Assertions are stored in DynamoDB when a badge is awarded.
 */

'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { handleOgBadge } = require('./og-proxy');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const db = DynamoDBDocumentClient.from(client);

const ASSERTIONS_TABLE  = process.env.ASSERTIONS_TABLE  || 'awsug-ob2-assertions';
const BADGES_TABLE      = process.env.BADGES_TABLE      || 'awsug-badges';
const BADGE_IMAGES_BUCKET = process.env.BADGE_IMAGES_BUCKET || '';
const BASE_URL          = process.env.BASE_URL          || 'https://www.awsugmdu.in';
const OB2_CONTEXT       = 'https://w3id.org/openbadges/v2';

// ─── Static badge definitions (mirrors src/data/mockData.ts) ─────────────────
// In production these would come from a DynamoDB table.
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
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
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

function buildBadgeClass(badgeId, imageUrl) {
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) return null;

  const id = `${BASE_URL}/ob2/badges/${badgeId}.json`;
  return {
    '@context': OB2_CONTEXT,
    id,
    type: 'BadgeClass',
    name: def.name,
    description: def.description,
    // Prefer an uploaded image URL; fall back to the generated SVG endpoint
    image: imageUrl || `${BASE_URL}/ob2/badge-images/${badgeId}.svg`,
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

// ─── SVG generator ────────────────────────────────────────────────────────────
function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length <= maxChars) {
      current = (current + ' ' + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSvg(badgeId, assertionUrl) {
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) return null;

  const name = esc(def.name);
  const desc = esc(def.description);
  const nameLines = wrapText(name, 18);

  // OB v2 SVG baking: <openbadges:assertion verify="..."/>
  const metaBlock = assertionUrl
    ? `  <metadata xmlns:openbadges="https://w3id.org/openbadges/v2">
    <openbadges:assertion verify="${esc(assertionUrl)}" />
  </metadata>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"
     role="img" aria-label="${name} badge">
  <title>${name}</title>
  <desc>${desc}</desc>
${metaBlock}
  <circle cx="100" cy="100" r="96" fill="#FF9900"/>
  <circle cx="100" cy="100" r="88" fill="#1a1a2e"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#FF9900" stroke-width="2" stroke-dasharray="8 4"/>
  <text x="100" y="90" text-anchor="middle" dominant-baseline="middle"
        font-size="48" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${def.icon}</text>
  ${nameLines.map((line, i) =>
    `<text x="100" y="${118 + i * 18}" text-anchor="middle" font-size="13" font-weight="bold"
        fill="#FFFFFF" font-family="system-ui,-apple-system,sans-serif">${line}</text>`
  ).join('\n  ')}
  <text x="100" y="172" text-anchor="middle" font-size="9" fill="#FF9900" letter-spacing="1"
        font-family="system-ui,-apple-system,sans-serif">AWS UG MADURAI</text>
</svg>`;
}

// ─── Verification ─────────────────────────────────────────────────────────────
async function verifyAssertion(assertionUrl) {
  const steps = [];

  // 1. Fetch assertion
  let assertion;
  try {
    const res = await fetch(assertionUrl, { headers: { Accept: 'application/json' } });
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
    [assertion.verification?.type === 'HostedBadge', 'verification is HostedBadge'],
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
    const res = await fetch(assertion.badge, { headers: { Accept: 'application/json' } });
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
    const res = await fetch(badgeClass.issuer, { headers: { Accept: 'application/json' } });
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

// ─── Route handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
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

  // GET /ob2/issuer.json
  if (method === 'GET' && path === '/ob2/issuer.json') {
    return json(200, buildIssuer(), {
      'Cache-Control': 'public, max-age=86400',
    });
  }

  // GET /ob2/badges/{badgeId}.json
  const badgeMatch = path.match(/^\/ob2\/badges\/([^/]+)\.json$/);
  if (method === 'GET' && badgeMatch) {
    const badgeId = badgeMatch[1];
    // Try to find a stored imageUrl from any assertion for this badge
    let imageUrl = null;
    try {
      const scan = await db.send(new QueryCommand({
        TableName: ASSERTIONS_TABLE,
        IndexName: 'badgeId-index',
        KeyConditionExpression: 'badgeId = :bid',
        ExpressionAttributeValues: { ':bid': badgeId },
        Limit: 1,
      }));
      imageUrl = scan.Items?.[0]?.imageUrl || null;
    } catch (_) { /* table may not have badgeId-index yet — fall through */ }
    const bc = buildBadgeClass(badgeId, imageUrl);
    if (!bc) return json(404, { error: 'Badge not found' });
    return json(200, bc, { 'Cache-Control': 'public, max-age=86400' });
  }

  // GET /ob2/badge-images/{badgeId}.svg
  const imgMatch = path.match(/^\/ob2\/badge-images\/([^/]+)\.svg$/);
  if (method === 'GET' && imgMatch) {
    const badgeId = imgMatch[1];
    const svgContent = buildSvg(badgeId, null);
    if (!svgContent) return json(404, { error: 'Badge not found' });
    return svg(200, svgContent);
  }

  // GET /ob2/assertions/{assertionId}.json
  const assertionMatch = path.match(/^\/ob2\/assertions\/([^/]+)\.json$/);
  if (method === 'GET' && assertionMatch) {
    const assertionId = assertionMatch[1];
    try {
      const result = await db.send(new GetCommand({
        TableName: ASSERTIONS_TABLE,
        Key: { assertionId },
      }));
      if (!result.Item) return json(404, { error: 'Assertion not found' });
      return json(200, buildAssertion(result.Item), {
        'Cache-Control': 'public, max-age=3600',
      });
    } catch (e) {
      console.error('DynamoDB error:', e);
      return json(500, { error: 'Internal server error' });
    }
  }

  // GET /ob2/verify?url={assertionUrl}
  if (method === 'GET' && path === '/ob2/verify') {
    const url = qs.url;
    if (!url) return json(400, { error: 'url query parameter required' });
    try {
      const result = await verifyAssertion(url);
      return json(200, result);
    } catch (e) {
      return json(500, { error: 'Verification failed', detail: e.message });
    }
  }

  // POST /ob2/assertions — issue a new assertion (called internally when badge is awarded)
  if (method === 'POST' && path === '/ob2/assertions') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid JSON' }); }

    const { badgeId, userId, userSlug, recipientName, recipientEmail, issuedOn, imageUrl } = body;
    if (!badgeId || !userId || !recipientEmail) {
      return json(400, { error: 'badgeId, userId, recipientEmail are required' });
    }

    const def = BADGE_DEFINITIONS[badgeId];
    if (!def) return json(404, { error: 'Badge not found' });

    const assertionId = `${badgeId}-${userId}`;
    const salt = makeSalt(userId);
    const hashedEmail = hashEmail(recipientEmail, salt);

    const record = {
      assertionId,
      badgeId,
      userId,
      userSlug: userSlug || userId,
      recipientName: recipientName || 'Unknown',
      hashedEmail,
      salt,
      badgeName: def.name,
      criteria: def.criteria,
      issuedOn: issuedOn || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      ...(imageUrl ? { imageUrl } : {}),
    };

    try {
      await db.send(new PutCommand({ TableName: ASSERTIONS_TABLE, Item: record }));
      return json(201, {
        assertionId,
        assertionUrl: `${BASE_URL}/ob2/assertions/${assertionId}.json`,
        assertion: buildAssertion(record),
      });
    } catch (e) {
      console.error('DynamoDB error:', e);
      return json(500, { error: 'Failed to store assertion' });
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

  return json(404, { error: 'Not found' });
};
