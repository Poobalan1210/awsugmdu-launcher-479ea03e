/**
 * Builder Center backfill: AWS Builder Center blogs and projects our members
 * wrote, added to their profile. Members claim suggested articles, or link
 * their Builder Center account with a bio code so their articles are added
 * automatically. A weekly sync reads the public feed and keeps both current.
 *
 * Routes, behind /builder-center/{proxy+}:
 *   GET  /builder-center/me                         own articles, links and claim settings
 *   POST /builder-center/me/claim       {contentIds, types?}  claim suggested articles
 *   POST /builder-center/me/dismiss     {contentIds}  mark suggestions "not mine"
 *   POST /builder-center/me/restore     {contentIds}  undo "not mine"
 *   POST /builder-center/me/aliases/reject  {alias}   "this isn't my Builder Center profile"
 *   POST /builder-center/me/aliases/restore {alias}   undo that
 *   POST /builder-center/me/link/start  {alias}       get a bio code for an alias
 *   POST /builder-center/me/link/verify               check the bio, link, add articles
 *   POST /builder-center/me/link/remove {alias}       unlink
 *   POST /builder-center/me/articles/add {url, type}  add one of a linked account's articles now
 *   GET  /builder-center/users/{userId}/articles      a member's claimed articles (public)
 *   GET  /builder-center/admin/settings               points and the claims switch
 *   PUT  /builder-center/admin/settings
 *   GET  /builder-center/admin/summary                counts per member, links, last sync
 *   POST /builder-center/admin/import   {rows, dryRun, statsAsOf}
 *   POST /builder-center/admin/sync                   start a sync now
 *   POST /builder-center/admin/links/remove {userId, alias}
 * EventBridge (no httpMethod), { task: 'sync' }: the weekly sync.
 *
 * builder-content table, PK userId + SK itemKey:
 *   <userId>     / article#<contentId>  one blog or project per member
 *   <userId>     / link#<alias>         matched, verified or rejected Builder Center account
 *   <userId>     / verify#pending       an unexpired bio code
 *   __settings__ / config               points configuration
 *   __claimed__  / article#<contentId>  claim lock: one owner per article
 *   __aliases__  / <alias>              link lock: one verified owner per alias
 *   __sync__     / state                progress of the current or last sync
 * builder-feed table, PK alias + SK contentId: every live article in the
 * public feed, as of the last sync.
 *
 * Challenge wins will live in builder-content as win#<id> items. Not built yet.
 *
 * Design notes:
 *
 * 1. Every member and admin route verifies the Cognito ID token's signature
 *    (verifyIdToken, as in campaign-crud). Claiming moves points, and member
 *    ids are public, so a decoded-but-unverified token is not enough.
 *
 * 2. The claim lock is written in the same transaction as the claim, so only
 *    one account ever owns an article, even for people with two accounts.
 *
 * 3. Points come from the settings at the moment of the claim, by the type
 *    the article was claimed as, and are stored on the item. Changing the
 *    settings later does not touch points already given.
 *
 * 4. An article already on the platform (a sprint submission or a Community
 *    Spotlight entry, any status) is never added, so it cannot earn twice.
 *
 * 5. Linking proves ownership: the member puts a one-time code in their
 *    Builder Center bio, which only the account's owner can edit. Matching
 *    GitHub links is not accepted as proof, since members type those in.
 *
 * 6. The feed is sorted by a trending score, not by date, so the sync reads
 *    all of it every week (about 430 pages) instead of only the newest. It
 *    takes longer than one Lambda run, so it saves its place and continues
 *    in a fresh run. A lease on the sync state stops two runs overlapping.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchGetCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const builder = require('./builder');

const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = process.env.BUILDER_CONTENT_TABLE_NAME || 'awsug-builder-content';
const FEED_TABLE = process.env.BUILDER_FEED_TABLE_NAME || 'awsug-builder-feed';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const SPRINTS_TABLE = process.env.SPRINTS_TABLE_NAME || 'awsug-sprints';
const SPOTLIGHT_TABLE = process.env.SPOTLIGHT_TABLE_NAME || 'awsug-spotlight';
const SYNC_FUNCTION_NAME = process.env.SYNC_FUNCTION_NAME || '';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const SETTINGS_KEY = { userId: '__settings__', itemKey: 'config' };
const SYNC_KEY = { userId: '__sync__', itemKey: 'state' };
const LOCK_PARTITION = '__claimed__';
const ALIAS_LOCK_PARTITION = '__aliases__';
const ARTICLE_PREFIX = 'article#';
const LINK_PREFIX = 'link#';
const VERIFY_KEY = 'verify#pending';

const STATUS = {
  SUGGESTED: 'suggested',
  CLAIMED: 'claimed',
  DISMISSED: 'dismissed',
  // Submitted to a sprint or the Community Spotlight after it was suggested.
  ON_PLATFORM: 'already_on_platform',
  // Claimed by another account matched to the same Builder Center author.
  TAKEN: 'claimed_elsewhere',
};

const LINK = {
  // Found by the collector or an import; the member has not proven it.
  MATCHED: 'matched',
  // Proven with a bio code. New articles are added without review.
  VERIFIED: 'verified',
  // The member said this Builder Center profile is not theirs.
  REJECTED: 'rejected',
};

const TYPES = ['blog', 'project'];

// Off until an admin opens claims, so an import can be checked first.
const DEFAULT_SETTINGS = {
  claimsOpen: false,
  pointsPerArticle: 0,
  pointsPerUGMaduraiArticle: 0,
  pointsPerProject: 0,
  pointsPerUGMaduraiProject: 0,
  maxPointsPerMember: 0,
};
const POINT_FIELDS = [
  'pointsPerArticle',
  'pointsPerUGMaduraiArticle',
  'pointsPerProject',
  'pointsPerUGMaduraiProject',
  'maxPointsPerMember',
];
const MAX_POINTS_SETTING = 100000;
const MAX_IDS_PER_REQUEST = 100;
const MAX_IMPORT_ROWS = 3000;
const WRITE_CONCURRENCY = 10;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MS = 30 * 60 * 1000;
const CODE_MIN_INTERVAL_MS = 15 * 1000;
const MAX_VERIFY_ATTEMPTS = 10;

// Sync pacing: a quarter second between feed pages, and a minute kept back
// at the end of each run to save progress and hand over.
const FEED_PAGE_PAUSE_MS = 250;
const RUN_RESERVE_MS = 60 * 1000;
const LEASE_MS = 16 * 60 * 1000;
const MAX_FEED_PAGES = 2000;

// ── HTTP helpers ──────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  };
}

function res(statusCode, body) {
  return { statusCode, headers: corsHeaders(), body: JSON.stringify(body) };
}

/** The request body, {} when empty, or null when it is not valid JSON. */
function parseBody(event) {
  if (!event.body) return {};
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function authHeader(event) {
  return event.headers?.Authorization || event.headers?.authorization;
}

// ── Verified sign-in (mirrors campaign-crud) ──────────────────────
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
async function verifyIdToken(header) {
  if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) return null;
  const parts = String(header || '').replace(/^Bearer\s+/i, '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const head = decode(parts[0]);
    const claims = decode(parts[1]);
    if (head.alg !== 'RS256' || typeof head.kid !== 'string') return null;
    const jwk = await cognitoSigningKey(head.kid);
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
    if (isReservedId(claims.sub)) return null;
    if (typeof claims.exp !== 'number' || now > claims.exp + 60) return null; // 60s clock skew
    return claims;
  } catch {
    return null;
  }
}

const ADMIN_ROLE_NAMES = ['admin', 'organiser'];

function hasAdminRole(user) {
  if (!user) return false;
  if (ADMIN_ROLE_NAMES.includes(String(user.role || '').toLowerCase())) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) =>
    ADMIN_ROLE_NAMES.includes(String((typeof r === 'string' ? r : r?.role) || '').toLowerCase()));
}

/** { userId } for a verified admin, otherwise { status } with 401 or 403. */
async function verifiedAdmin(event) {
  const claims = await verifyIdToken(authHeader(event));
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

function adminDenied(who) {
  return who.status === 401
    ? res(401, { error: 'Sign in again to continue.' })
    : res(403, { error: 'Only organisers can do this.' });
}

// ── Small helpers ─────────────────────────────────────────────────
/** Keys of the table's own records (settings, locks, sync), never a member's. */
function isReservedId(id) {
  return String(id).startsWith('__');
}

const CONTENT_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;
const BUILDER_URL_PATTERN = /^https:\/\/builder\.aws\.com\/content\/([A-Za-z0-9]{10,40})(\/[^\s?#]*)?(?:[?#]\S*)?$/;
// Looser, for links stored by other features, which may differ in form.
const BUILDER_CONTENT_IN_TEXT = /builder\.aws\.com\/content\/([A-Za-z0-9]{10,40})/i;
const USER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/** Builder Center's id for an article link, or null for any other link. */
function contentIdInLink(link) {
  const m = BUILDER_CONTENT_IN_TEXT.exec(String(link || ''));
  return m ? m[1] : null;
}

function articleKey(contentId) {
  return `${ARTICLE_PREFIX}${contentId}`;
}

function linkKey(alias) {
  return `${LINK_PREFIX}${alias}`;
}

function typeOf(item) {
  return item?.contentType === 'project' ? 'project' : 'blog';
}

function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return nowIso().slice(0, 10);
}

/** Run fn over items with at most `limit` running at once. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new QueryCommand({ ...params, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/** BatchGet in pages of 100, retrying unprocessed keys. */
async function batchGetAll(tableName, keys, extra = {}) {
  const out = [];
  for (let i = 0; i < keys.length; i += 100) {
    let request = { [tableName]: { Keys: keys.slice(i, i + 100), ...extra } };
    for (let attempt = 0; request; attempt++) {
      if (attempt >= 6) throw new Error(`BatchGet on ${tableName} left keys unprocessed`);
      const r = await docClient.send(new BatchGetCommand({ RequestItems: request }));
      out.push(...(r.Responses?.[tableName] || []));
      const left = r.UnprocessedKeys?.[tableName]?.Keys?.length ? r.UnprocessedKeys : null;
      request = left;
      if (request) await sleep(50 * 2 ** attempt);
    }
  }
  return out;
}

/** BatchWrite puts in groups of 25, retrying unprocessed items. */
async function batchPutAll(tableName, items) {
  const groups = [];
  for (let i = 0; i < items.length; i += 25) groups.push(items.slice(i, i + 25));
  await mapLimit(groups, 4, async (group) => {
    let request = { [tableName]: group.map((Item) => ({ PutRequest: { Item } })) };
    for (let attempt = 0; request; attempt++) {
      if (attempt >= 8) throw new Error(`BatchWrite on ${tableName} left items unprocessed`);
      const r = await docClient.send(new BatchWriteCommand({ RequestItems: request }));
      const left = r.UnprocessedItems?.[tableName]?.length ? r.UnprocessedItems : null;
      request = left;
      if (request) await sleep(100 * 2 ** attempt);
    }
  });
}

/** An UpdateExpression that SETs every field, with every name aliased. */
function setExpression(fields, prefix = 'f') {
  const names = {};
  const values = {};
  const sets = [];
  Object.entries(fields).forEach(([attr, value], i) => {
    if (value === undefined) return;
    names[`#${prefix}${i}`] = attr;
    values[`:${prefix}${i}`] = value;
    sets.push(`#${prefix}${i} = :${prefix}${i}`);
  });
  return { sets, names, values };
}

// ── Data access ───────────────────────────────────────────────────
async function getSettings() {
  const r = await docClient.send(new GetCommand({ TableName: TABLE, Key: SETTINGS_KEY }));
  const s = r.Item || {};
  const out = { claimsOpen: s.claimsOpen === true };
  for (const f of POINT_FIELDS) out[f] = clampInt(s[f], 0, MAX_POINTS_SETTING) ?? DEFAULT_SETTINGS[f];
  out.updatedAt = s.updatedAt || null;
  out.updatedBy = s.updatedBy || null;
  return out;
}

function publicSettings(s) {
  const out = { claimsOpen: s.claimsOpen };
  for (const f of POINT_FIELDS) out[f] = s[f];
  return out;
}

async function getSyncState() {
  const r = await docClient.send(new GetCommand({ TableName: TABLE, Key: SYNC_KEY }));
  return r.Item || null;
}

function publicSync(state) {
  if (!state) return null;
  return {
    status: state.status || null,
    trigger: state.trigger || null,
    startedAt: state.startedAt || null,
    updatedAt: state.updatedAt || null,
    finishedAt: state.finishedAt || null,
    lastCompletedAt: state.lastCompletedAt || null,
    pages: state.pages || 0,
    articles: state.articles || 0,
    stats: state.stats || null,
    error: state.error || null,
  };
}

/** Every item in one member's partition. */
async function queryUserItems(userId) {
  return queryAll({
    TableName: TABLE,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
  });
}

function splitUserItems(items) {
  const articles = [];
  const links = [];
  let pending = null;
  for (const i of items) {
    const key = String(i.itemKey || '');
    if (key.startsWith(ARTICLE_PREFIX)) articles.push(i);
    else if (key.startsWith(LINK_PREFIX)) links.push(i);
    else if (key === VERIFY_KEY) pending = i;
  }
  return { articles, links, pending };
}

/** Every live article of one Builder Center author in the feed index. */
async function queryFeed(alias) {
  return queryAll({
    TableName: FEED_TABLE,
    KeyConditionExpression: 'alias = :a',
    ExpressionAttributeValues: { ':a': alias },
  });
}

/**
 * Builder Center content ids already on the platform: blog links on sprint
 * submissions and Community Spotlight entries, whatever their status.
 */
async function platformContentIds() {
  const ids = new Set();
  const [sprints, spotlight] = await Promise.all([
    scanAll({
      TableName: SPRINTS_TABLE,
      ProjectionExpression: '#s',
      ExpressionAttributeNames: { '#s': 'submissions' },
    }),
    scanAll({
      TableName: SPOTLIGHT_TABLE,
      ProjectionExpression: '#u',
      ExpressionAttributeNames: { '#u': 'url' },
    }),
  ]);
  for (const sprint of sprints) {
    for (const sub of Array.isArray(sprint.submissions) ? sprint.submissions : []) {
      const id = contentIdInLink(sub?.blogUrl);
      if (id) ids.add(id);
    }
  }
  for (const entry of spotlight) {
    const id = contentIdInLink(entry.url);
    if (id) ids.add(id);
  }
  return ids;
}

function publicArticle(item) {
  return {
    contentId: item.contentId,
    type: typeOf(item),
    url: item.url,
    title: item.title,
    description: item.description || '',
    imageUrl: item.imageUrl || null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    publishedAt: item.publishedAt || null,
    likes: Number(item.likes) || 0,
    comments: Number(item.comments) || 0,
    statsAsOf: item.statsAsOf || null,
    claimedAt: item.claimedAt || null,
  };
}

function ownArticle(item) {
  return {
    ...publicArticle(item),
    status: item.status,
    builderAlias: item.builderAlias || null,
    mentionsUGMadurai: item.mentionsUGMadurai === true,
    pointsAwarded: Number(item.pointsAwarded) || 0,
    autoAdded: item.autoAdded === true,
  };
}

function publicLink(link) {
  return {
    alias: link.alias,
    status: link.status,
    source: link.source || null,
    verifiedAt: link.verifiedAt || null,
    rejectedAt: link.rejectedAt || null,
    lastSyncedAt: link.lastSyncedAt || null,
    profileUrl: builder.PROFILE_URL(link.alias),
  };
}

function byPublishedDesc(a, b) {
  return String(b.publishedAt || '').localeCompare(String(a.publishedAt || ''));
}

// ── Points ────────────────────────────────────────────────────────
function awardedSoFar(articles) {
  return articles
    .filter((i) => i.status === STATUS.CLAIMED)
    .reduce((sum, i) => sum + (Number(i.pointsAwarded) || 0), 0);
}

/**
 * Points one more claimed article earns, by its type, after the member's cap.
 * The UG Madurai rate replaces the normal one when it is set; at 0 (not set)
 * those articles earn the normal rate, not nothing.
 */
function pointsFor(item, settings, alreadyAwarded, type = typeOf(item)) {
  const normal = type === 'project' ? settings.pointsPerProject : settings.pointsPerArticle;
  const ugmRate = type === 'project' ? settings.pointsPerUGMaduraiProject : settings.pointsPerUGMaduraiArticle;
  const base = item.mentionsUGMadurai === true && ugmRate > 0 ? ugmRate : normal;
  if (!(base > 0)) return 0;
  if (!settings.maxPointsPerMember) return base;
  return Math.max(0, Math.min(base, settings.maxPointsPerMember - alreadyAwarded));
}

// ── Claiming ──────────────────────────────────────────────────────
/** Move an item between two statuses; false if it was not in `from`. */
async function moveStatus(userId, contentId, from, to, extra = {}) {
  const { sets, names, values } = setExpression({ status: to, updatedAt: nowIso(), ...extra });
  try {
    await docClient.send(new UpdateCommand({
      TableName: TABLE,
      Key: { userId, itemKey: articleKey(contentId) },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ConditionExpression: '#cur = :from',
      ExpressionAttributeNames: { ...names, '#cur': 'status' },
      ExpressionAttributeValues: { ...values, ':from': from },
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

/**
 * Claims for one member, sharing a running points total so the cap holds.
 * Each claim is its own transaction: the article (claimed), the claim lock
 * and the member's points. One article another account owns does not stop
 * the rest.
 */
function claimer(userId, user, settings, articles) {
  let awarded = awardedSoFar(articles);
  const totals = { claimed: 0, pointsAdded: 0 };

  /**
   * existing: a suggested item; or create: a new article (from the feed).
   * type: what it is claimed as. auto: added for a verified link.
   */
  async function claim({ contentId, existing, create, type, auto = false }) {
    const base = existing || create;
    const chosen = TYPES.includes(type) ? type : typeOf(base);
    const points = pointsFor(base, settings, awarded, chosen);
    const now = nowIso();
    const key = { userId, itemKey: articleKey(contentId) };
    const transactItems = [];

    if (existing) {
      const fields = { status: STATUS.CLAIMED, claimedAt: now, pointsAwarded: points, contentType: chosen, updatedAt: now };
      if (chosen !== typeOf(existing)) {
        fields.typeSource = 'member';
        if (!existing.importedType) fields.importedType = typeOf(existing);
      }
      if (auto) fields.autoAdded = true;
      const { sets, names, values } = setExpression(fields);
      transactItems.push({
        Update: {
          TableName: TABLE,
          Key: key,
          UpdateExpression: `SET ${sets.join(', ')}`,
          ConditionExpression: '#cur = :suggested',
          ExpressionAttributeNames: { ...names, '#cur': 'status' },
          ExpressionAttributeValues: { ...values, ':suggested': STATUS.SUGGESTED },
        },
      });
    } else {
      transactItems.push({
        Put: {
          TableName: TABLE,
          Item: {
            ...create,
            ...key,
            kind: 'article',
            contentId,
            contentType: chosen,
            status: STATUS.CLAIMED,
            claimedAt: now,
            pointsAwarded: points,
            autoAdded: auto || undefined,
            createdAt: now,
            updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(itemKey)',
        },
      });
    }
    transactItems.push({
      Put: {
        TableName: TABLE,
        Item: { userId: LOCK_PARTITION, itemKey: articleKey(contentId), ownerUserId: userId, claimedAt: now },
        ConditionExpression: 'attribute_not_exists(userId)',
      },
    });
    if (points > 0) {
      const reason = `Builder Center ${chosen}: ${base.title}`.slice(0, 200);
      transactItems.push({
        Update: {
          TableName: USERS_TABLE,
          Key: { userId },
          // A profile with no redeemablePoints yet starts from its current
          // points, as the store reads it, then gets the award on top.
          UpdateExpression:
            'SET #pt = if_not_exists(#pt, :zero) + :pts, #rp = if_not_exists(#rp, :base) + :pts, ' +
            '#pl = list_append(if_not_exists(#pl, :empty), :pl), ' +
            '#ac = list_append(if_not_exists(#ac, :empty), :ac), #ua = :now',
          ConditionExpression: 'attribute_exists(userId)',
          ExpressionAttributeNames: {
            '#pt': 'points', '#rp': 'redeemablePoints', '#pl': 'pointActivities',
            '#ac': 'activities', '#ua': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':pts': points,
            ':base': Number(user.points) || 0,
            ':empty': [],
            ':pl': [{
              id: `pa-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
              userId,
              points,
              reason,
              type: 'builder_center',
              awardedBy: 'system',
              awardedAt: now,
              contentId,
            }],
            ':ac': [{
              type: 'points_awarded', points, reason, pointType: 'builder_center', awardedBy: 'system', timestamp: now,
            }],
            ':now': now,
          },
        },
      });
    }

    try {
      await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
      awarded += points;
      totals.claimed += 1;
      totals.pointsAdded += points;
      return { contentId, status: 'claimed', points };
    } catch (err) {
      if (err.name !== 'TransactionCanceledException') throw err;
      const codes = (err.CancellationReasons || []).map((r) => r && r.Code);
      if (codes[1] === 'ConditionalCheckFailed') {
        // Another account matched to the same author owns it.
        if (existing) await moveStatus(userId, contentId, STATUS.SUGGESTED, STATUS.TAKEN);
        return { contentId, status: 'skipped', reason: STATUS.TAKEN };
      }
      if (codes[0] === 'ConditionalCheckFailed') {
        return { contentId, status: 'skipped', reason: existing ? 'not_suggested' : 'exists' };
      }
      console.warn('claim cancelled', { userId, contentId, codes });
      return { contentId, status: 'skipped', reason: 'try_again' };
    }
  }

  return { claim, totals };
}

async function getUser(userId) {
  const r = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }));
  return r.Item || null;
}

async function pointTotals(userId) {
  const r = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    ProjectionExpression: '#pt, #rp',
    ExpressionAttributeNames: { '#pt': 'points', '#rp': 'redeemablePoints' },
  }));
  return { points: r.Item?.points ?? null, redeemablePoints: r.Item?.redeemablePoints ?? null };
}

/**
 * Add every article of a verified alias the member does not have yet: their
 * suggestions from it, and articles from the feed index. Articles already on
 * the platform, owned by another account, or marked "not mine" are left.
 */
async function addVerifiedArticles(userId, alias, { settings, user, articles, onPlatform }) {
  const c = claimer(userId, user, settings, articles);
  const byId = new Map(articles.map((a) => [a.contentId, a]));
  const results = [];

  // Hidden only because they said this profile wasn't theirs, which the bio
  // code has now disproved. Articles they marked one by one stay hidden.
  for (const a of articles) {
    if (a.status === STATUS.DISMISSED && a.builderAlias === alias && a.dismissedReason === 'alias_rejected'
      && await moveStatus(userId, a.contentId, STATUS.DISMISSED, STATUS.SUGGESTED)) {
      a.status = STATUS.SUGGESTED;
    }
  }

  for (const a of articles) {
    if (a.status !== STATUS.SUGGESTED || a.builderAlias !== alias) continue;
    if (onPlatform.has(a.contentId)) {
      await moveStatus(userId, a.contentId, STATUS.SUGGESTED, STATUS.ON_PLATFORM);
      continue;
    }
    results.push(await c.claim({ contentId: a.contentId, existing: a, auto: true }));
  }

  const feed = await queryFeed(alias);
  for (const f of feed) {
    if (byId.has(f.contentId) || onPlatform.has(f.contentId)) continue;
    results.push(await c.claim({
      contentId: f.contentId,
      create: feedToItem(f, { userId, alias, source: 'builder-center-link' }),
      auto: true,
    }));
  }
  return { ...c.totals, results, feedArticles: feed.length };
}

/** A feed index item as the fields of a member's article item. */
function feedToItem(f, { alias, source, matchMethod }) {
  return {
    url: f.url,
    title: f.title,
    description: f.description || '',
    imageUrl: f.imageUrl,
    tags: Array.isArray(f.tags) ? f.tags : [],
    publishedAt: f.publishedAt || null,
    likes: Number(f.likes) || 0,
    comments: Number(f.comments) || 0,
    statsAsOf: f.statsAsOf || today(),
    builderAlias: alias,
    matchMethod: matchMethod || undefined,
    mentionsUGMadurai: f.mentionsUGMadurai === true,
    contentType: f.contentType === 'project' ? 'project' : 'blog',
    typeSource: 'guess',
    source,
  };
}

// ── Member routes ─────────────────────────────────────────────────
async function handleMe(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to see your Builder Center articles.' });
  const [settings, items, sync] = await Promise.all([getSettings(), queryUserItems(claims.sub), getSyncState()]);
  const { articles, links, pending } = splitUserItems(items);
  const live = pending && Date.parse(pending.expiresAt) > Date.now() ? pending : null;
  return res(200, {
    settings: publicSettings(settings),
    awardedPoints: awardedSoFar(articles),
    articles: articles.map(ownArticle).sort(byPublishedDesc),
    links: links.map(publicLink),
    pendingVerification: live
      ? { alias: live.alias, code: live.code, expiresAt: live.expiresAt, profileName: live.profileName || null }
      : null,
    lastSyncAt: sync?.lastCompletedAt || null,
  });
}

/** Unique, well-formed content ids from the body, or null if there are none. */
function requestedIds(body) {
  const raw = Array.isArray(body?.contentIds) ? body.contentIds : [];
  const ids = [];
  for (const v of raw) {
    const id = String(v || '').trim();
    if (CONTENT_ID_PATTERN.test(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.length && ids.length <= MAX_IDS_PER_REQUEST ? ids : null;
}

async function handleClaim(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to claim your articles.' });
  const userId = claims.sub;
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const ids = requestedIds(body);
  if (!ids) return res(400, { error: `Send between 1 and ${MAX_IDS_PER_REQUEST} article ids in contentIds.` });
  const types = body.types && typeof body.types === 'object' ? body.types : {};

  const settings = await getSettings();
  if (!settings.claimsOpen) return res(403, { error: 'Claiming Builder Center articles is not open right now.' });

  const user = await getUser(userId);
  if (!user) return res(404, { error: 'Your profile could not be found. Sign out and back in, then try again.' });

  const [items, onPlatform] = await Promise.all([queryUserItems(userId), platformContentIds()]);
  const { articles } = splitUserItems(items);
  const byId = new Map(articles.map((i) => [i.contentId, i]));
  const c = claimer(userId, user, settings, articles);
  const results = [];

  for (const contentId of ids) {
    const item = byId.get(contentId);
    if (!item) {
      results.push({ contentId, status: 'skipped', reason: 'not_found' });
      continue;
    }
    if (item.status !== STATUS.SUGGESTED) {
      results.push({ contentId, status: 'skipped', reason: item.status });
      continue;
    }
    if (onPlatform.has(contentId)) {
      await moveStatus(userId, contentId, STATUS.SUGGESTED, STATUS.ON_PLATFORM);
      results.push({ contentId, status: 'skipped', reason: STATUS.ON_PLATFORM });
      continue;
    }
    results.push(await c.claim({ contentId, existing: item, type: types[contentId] }));
  }

  console.log('builder center claim', { userId, requested: ids.length, ...c.totals });
  return res(200, { results, ...c.totals, ...(await pointTotals(userId)) });
}

async function handleMove(event, from, to, extraFor) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to continue.' });
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const ids = requestedIds(body);
  if (!ids) return res(400, { error: `Send between 1 and ${MAX_IDS_PER_REQUEST} article ids in contentIds.` });

  const moved = [];
  for (const contentId of ids) {
    if (await moveStatus(claims.sub, contentId, from, to, extraFor ? extraFor() : {})) moved.push(contentId);
  }
  return res(200, { moved });
}

/** Write a member's link record for an alias, keeping when it was first made. */
async function putLink(userId, alias, fields) {
  const now = nowIso();
  const { sets, names, values } = setExpression({ ...fields, kind: 'link', alias, updatedAt: now });
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId, itemKey: linkKey(alias) },
    UpdateExpression: `SET ${sets.join(', ')}, #ca = if_not_exists(#ca, :now)`,
    ExpressionAttributeNames: { ...names, '#ca': 'createdAt' },
    ExpressionAttributeValues: { ...values, ':now': now },
  }));
}

/** "This isn't my Builder Center profile": hide its suggestions and skip it from now on. */
async function handleRejectAlias(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to continue.' });
  const userId = claims.sub;
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const alias = builder.normalizeAlias(body.alias);
  if (!alias) return res(400, { error: 'Send the Builder Center alias in alias.' });

  const { articles, links } = splitUserItems(await queryUserItems(userId));
  const link = links.find((l) => l.alias === alias);
  if (link?.status === LINK.VERIFIED) {
    return res(409, { error: 'You linked this Builder Center account yourself. Unlink it first.' });
  }
  await putLink(userId, alias, { status: LINK.REJECTED, rejectedAt: nowIso(), source: link?.source || 'member' });

  let dismissed = 0;
  for (const a of articles) {
    if (a.status !== STATUS.SUGGESTED || a.builderAlias !== alias) continue;
    if (await moveStatus(userId, a.contentId, STATUS.SUGGESTED, STATUS.DISMISSED, {
      dismissedAt: nowIso(), dismissedReason: 'alias_rejected',
    })) dismissed++;
  }
  console.log('builder center alias rejected', { userId, alias, dismissed });
  return res(200, { alias, dismissed });
}

/** Undo "this isn't my Builder Center profile". */
async function handleRestoreAlias(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to continue.' });
  const userId = claims.sub;
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const alias = builder.normalizeAlias(body.alias);
  if (!alias) return res(400, { error: 'Send the Builder Center alias in alias.' });

  const { articles, links } = splitUserItems(await queryUserItems(userId));
  const link = links.find((l) => l.alias === alias);
  if (!link || link.status !== LINK.REJECTED) return res(409, { error: 'That profile is not marked as not yours.' });
  await putLink(userId, alias, { status: LINK.MATCHED });

  let restored = 0;
  for (const a of articles) {
    if (a.status !== STATUS.DISMISSED || a.builderAlias !== alias || a.dismissedReason !== 'alias_rejected') continue;
    if (await moveStatus(userId, a.contentId, STATUS.DISMISSED, STATUS.SUGGESTED)) restored++;
  }
  return res(200, { alias, restored });
}

function newCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `awsugmdu-${s}`;
}

async function aliasOwner(alias) {
  const r = await docClient.send(new GetCommand({
    TableName: TABLE,
    Key: { userId: ALIAS_LOCK_PARTITION, itemKey: alias },
  }));
  return r.Item?.ownerUserId || null;
}

/** Step 1 of linking: a one-time code for the member to put in their Builder Center bio. */
async function handleLinkStart(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to link your Builder Center account.' });
  const userId = claims.sub;
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const alias = builder.normalizeAlias(body.alias);
  if (!alias) return res(400, { error: 'Enter your Builder Center alias or profile link, like builder.aws.com/community/@yourname.' });

  const settings = await getSettings();
  if (!settings.claimsOpen) return res(403, { error: 'Linking Builder Center accounts is not open right now.' });

  const { links, pending } = splitUserItems(await queryUserItems(userId));
  if (links.some((l) => l.alias === alias && l.status === LINK.VERIFIED)) {
    return res(409, { error: `@${alias} is already linked to your profile.` });
  }
  const owner = await aliasOwner(alias);
  if (owner && owner !== userId) {
    return res(409, { error: `@${alias} is already linked to another awsugmdu.in account. Ask an organiser if that is wrong.` });
  }
  if (pending && Date.now() - Date.parse(pending.createdAt) < CODE_MIN_INTERVAL_MS) {
    return res(429, { error: 'Wait a few seconds before asking for another code.' });
  }

  let profile;
  try {
    profile = await builder.fetchProfile(alias);
  } catch (err) {
    console.warn('profile fetch failed', { alias, error: err.message });
    return res(502, { error: 'Builder Center could not be reached. Try again in a minute.' });
  }
  if (!profile.found) return res(404, { error: `There is no Builder Center profile at @${alias}.` });

  const now = Date.now();
  const item = {
    userId,
    itemKey: VERIFY_KEY,
    alias,
    code: newCode(),
    profileName: profile.name || undefined,
    attempts: 0,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CODE_TTL_MS).toISOString(),
  };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  return res(200, {
    alias,
    code: item.code,
    expiresAt: item.expiresAt,
    profileName: profile.name || null,
    profileUrl: builder.PROFILE_URL(alias),
  });
}

/** Step 2 of linking: find the code in the bio, link the account, add its articles. */
async function handleLinkVerify(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to link your Builder Center account.' });
  const userId = claims.sub;

  const settings = await getSettings();
  if (!settings.claimsOpen) return res(403, { error: 'Linking Builder Center accounts is not open right now.' });

  const items = await queryUserItems(userId);
  const { pending } = splitUserItems(items);
  if (!pending || Date.parse(pending.expiresAt) <= Date.now()) {
    return res(410, { error: 'Your code has expired. Get a new one.' });
  }
  if ((pending.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    return res(429, { error: 'Too many tries with this code. Get a new one.' });
  }
  await docClient.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId, itemKey: VERIFY_KEY },
    UpdateExpression: 'SET #a = if_not_exists(#a, :zero) + :one',
    ExpressionAttributeNames: { '#a': 'attempts' },
    ExpressionAttributeValues: { ':zero': 0, ':one': 1 },
  }));

  const alias = pending.alias;
  let profile;
  try {
    profile = await builder.fetchProfile(alias);
  } catch (err) {
    console.warn('profile fetch failed', { alias, error: err.message });
    return res(502, { error: 'Builder Center could not be reached. Try again in a minute.' });
  }
  if (!profile.found) return res(404, { error: `There is no Builder Center profile at @${alias}.` });
  const text = `${profile.bio} ${profile.headline}`.toUpperCase();
  if (!text.includes(String(pending.code).toUpperCase())) {
    return res(422, {
      error: `We couldn't find ${pending.code} in the bio of @${alias} yet. Save your Builder Center profile, then try again.`,
    });
  }

  const now = nowIso();
  try {
    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: { userId: ALIAS_LOCK_PARTITION, itemKey: alias, ownerUserId: userId, verifiedAt: now },
            ConditionExpression: 'attribute_not_exists(userId) OR ownerUserId = :me',
            ExpressionAttributeValues: { ':me': userId },
          },
        },
        {
          Delete: {
            TableName: TABLE,
            Key: { userId, itemKey: VERIFY_KEY },
            ConditionExpression: '#c = :code',
            ExpressionAttributeNames: { '#c': 'code' },
            ExpressionAttributeValues: { ':code': pending.code },
          },
        },
      ],
    }));
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      const codes = (err.CancellationReasons || []).map((r) => r && r.Code);
      if (codes[0] === 'ConditionalCheckFailed') {
        return res(409, { error: `@${alias} is already linked to another awsugmdu.in account. Ask an organiser if that is wrong.` });
      }
      return res(409, { error: 'Your code was replaced. Use the newest one.' });
    }
    throw err;
  }
  await putLink(userId, alias, { status: LINK.VERIFIED, verifiedAt: now, source: 'bio-code', rejectedAt: undefined });
  console.log('builder center linked', { userId, alias });

  // Add what they have so far. The weekly sync adds anything new.
  const user = await getUser(userId);
  let added = { claimed: 0, pointsAdded: 0, feedArticles: 0 };
  if (user) {
    const { articles } = splitUserItems(await queryUserItems(userId));
    added = await addVerifiedArticles(userId, alias, {
      settings, user, articles, onPlatform: await platformContentIds(),
    });
  }
  return res(200, {
    alias,
    added: added.claimed,
    pointsAdded: added.pointsAdded,
    feedIndexed: added.feedArticles > 0,
    ...(await pointTotals(userId)),
  });
}

/** Unlink: the member stops automatic adding. Articles already added stay. */
async function removeLink(userId, alias) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: TABLE,
      Key: { userId: ALIAS_LOCK_PARTITION, itemKey: alias },
      ConditionExpression: 'ownerUserId = :me',
      ExpressionAttributeValues: { ':me': userId },
    }));
  } catch (err) {
    if (err.name !== 'ConditionalCheckFailedException') throw err;
  }
  await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { userId, itemKey: linkKey(alias) } }));
}

/**
 * Add one Builder Center article by its link, without waiting for the weekly
 * sync. Only for members with a linked account, and only articles whose
 * author is that account: the author is read from the feed index, or from
 * the article's own page when the sync has not seen it yet.
 */
async function handleAddArticle(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to add your article.' });
  const userId = claims.sub;
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const m = BUILDER_URL_PATTERN.exec(String(body.url || '').trim());
  if (!m) return res(400, { error: 'Paste the link to your article, like https://builder.aws.com/content/...' });
  const contentId = m[1];
  const type = TYPES.includes(body.type) ? body.type : null;
  if (!type) return res(400, { error: 'type must be blog or project.' });

  const settings = await getSettings();
  if (!settings.claimsOpen) return res(403, { error: 'Adding Builder Center articles is not open right now.' });

  const { articles, links } = splitUserItems(await queryUserItems(userId));
  const verified = links.filter((l) => l.status === LINK.VERIFIED).map((l) => l.alias);
  if (!verified.length) {
    return res(403, { error: 'Link your Builder Center account first, so we can check the article is yours.' });
  }
  const existing = articles.find((a) => a.contentId === contentId);
  if (existing?.status === STATUS.CLAIMED) return res(409, { error: 'That article is already on your profile.' });

  // Who wrote it: the feed index, or the article page itself.
  let f = null;
  for (const alias of verified) {
    const r = await docClient.send(new GetCommand({ TableName: FEED_TABLE, Key: { alias, contentId } }));
    if (r.Item) { f = r.Item; break; }
  }
  if (!f) {
    let article;
    try {
      article = await builder.fetchArticle(contentId);
    } catch (err) {
      console.warn('article fetch failed', { contentId, error: err.message });
      return res(502, { error: 'Builder Center could not be reached. Try again in a minute.' });
    }
    const item = article && builder.feedArticleToIndexItem(article);
    if (!item) return res(404, { error: 'There is no published Builder Center article at that link.' });
    if (!verified.includes(item.alias)) {
      return res(403, {
        error: `That article is by @${item.alias}, not your linked account @${verified.join(', @')}.`,
      });
    }
    f = { ...item, statsAsOf: today(), lastSeenRun: 'manual', updatedAt: nowIso() };
    await docClient.send(new PutCommand({ TableName: FEED_TABLE, Item: f }));
  }

  if ((await platformContentIds()).has(contentId)) {
    return res(409, { error: 'That article is already on the platform, in a Skill Sprint or the Community Spotlight.' });
  }
  const user = await getUser(userId);
  if (!user) return res(404, { error: 'Your profile could not be found. Sign out and back in, then try again.' });

  const c = claimer(userId, user, settings, articles);
  let result;
  if (existing) {
    // A suggestion they hid, or one held back earlier: bring it back to claim it.
    if (existing.status !== STATUS.SUGGESTED) {
      await moveStatus(userId, contentId, existing.status, STATUS.SUGGESTED);
    }
    result = await c.claim({ contentId, existing: { ...existing, status: STATUS.SUGGESTED }, type });
  } else {
    const create = feedToItem(f, { alias: f.alias, source: 'builder-center-manual', matchMethod: 'bio-code' });
    if (type !== create.contentType) {
      create.importedType = create.contentType;
      create.typeSource = 'member';
    }
    result = await c.claim({ contentId, create, type });
  }

  if (result.status !== 'claimed') {
    const message = result.reason === STATUS.TAKEN
      ? 'Another account already has this article on its profile. Ask an organiser if that is wrong.'
      : 'That article could not be added just now. Try again.';
    return res(409, { error: message, reason: result.reason });
  }
  const added = (await docClient.send(new GetCommand({ TableName: TABLE, Key: { userId, itemKey: articleKey(contentId) } }))).Item;
  console.log('builder center article added', { userId, contentId, type, points: result.points });
  return res(200, {
    article: added ? ownArticle(added) : null,
    pointsAdded: result.points,
    ...(await pointTotals(userId)),
  });
}

async function handleLinkRemove(event) {
  const claims = await verifyIdToken(authHeader(event));
  if (!claims) return res(401, { error: 'Sign in again to continue.' });
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const alias = builder.normalizeAlias(body.alias);
  if (!alias) return res(400, { error: 'Send the Builder Center alias in alias.' });
  await removeLink(claims.sub, alias);
  console.log('builder center unlinked', { userId: claims.sub, alias, by: 'member' });
  return res(200, { alias, removed: true });
}

async function handlePublicArticles(userId) {
  if (!USER_ID_PATTERN.test(userId) || isReservedId(userId)) return res(400, { error: 'Invalid user id.' });
  const items = await queryAll({
    TableName: TABLE,
    KeyConditionExpression: 'userId = :u AND begins_with(itemKey, :p)',
    ExpressionAttributeValues: { ':u': userId, ':p': ARTICLE_PREFIX },
  });
  return res(200, {
    articles: items.filter((i) => i.status === STATUS.CLAIMED).map(publicArticle).sort(byPublishedDesc),
  });
}

// ── Admin routes ──────────────────────────────────────────────────
async function handleGetSettings(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  return res(200, { settings: await getSettings() });
}

async function handlePutSettings(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });

  const next = await getSettings();
  if (body.claimsOpen !== undefined) {
    if (typeof body.claimsOpen !== 'boolean') return res(400, { error: 'claimsOpen must be true or false.' });
    next.claimsOpen = body.claimsOpen;
  }
  for (const field of POINT_FIELDS) {
    if (body[field] === undefined) continue;
    const n = Number(body[field]);
    if (!Number.isInteger(n) || n < 0 || n > MAX_POINTS_SETTING) {
      return res(400, { error: `${field} must be a whole number from 0 to ${MAX_POINTS_SETTING}.` });
    }
    next[field] = n;
  }

  const item = { ...SETTINGS_KEY, ...publicSettings(next), updatedAt: nowIso(), updatedBy: who.userId };
  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  console.log('builder center settings updated', { by: who.userId, settings: publicSettings(item) });
  return res(200, { settings: await getSettings() });
}

function emptyCounts() {
  return Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
}

async function handleSummary(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);

  const [all, sync, settings] = await Promise.all([scanAll({ TableName: TABLE }), getSyncState(), getSettings()]);
  const totals = {
    articles: 0, pointsAwarded: 0, ...emptyCounts(),
    byType: { blog: 0, project: 0 },
    links: { matched: 0, verified: 0, rejected: 0 },
  };
  const perMember = new Map();
  const member = (userId) => {
    if (!perMember.has(userId)) {
      perMember.set(userId, {
        userId,
        builderAlias: null,
        links: [],
        counts: emptyCounts(),
        byType: { blog: 0, project: 0 },
        relabelled: 0,
        pointsAwarded: 0,
        lastClaimedAt: null,
      });
    }
    return perMember.get(userId);
  };

  for (const item of all) {
    if (isReservedId(item.userId)) continue;
    const key = String(item.itemKey || '');
    if (key.startsWith(LINK_PREFIX)) {
      member(item.userId).links.push({ alias: item.alias, status: item.status, verifiedAt: item.verifiedAt || null });
      if (totals.links[item.status] !== undefined) totals.links[item.status] += 1;
      continue;
    }
    if (!key.startsWith(ARTICLE_PREFIX)) continue;
    const m = member(item.userId);
    totals.articles += 1;
    totals[item.status] = (totals[item.status] || 0) + 1;
    totals.byType[typeOf(item)] += 1;
    m.builderAlias = m.builderAlias || item.builderAlias || null;
    m.counts[item.status] = (m.counts[item.status] || 0) + 1;
    m.byType[typeOf(item)] += 1;
    if (item.typeSource === 'member') m.relabelled += 1;
    if (item.status === STATUS.CLAIMED) {
      const pts = Number(item.pointsAwarded) || 0;
      m.pointsAwarded += pts;
      totals.pointsAwarded += pts;
      if (!m.lastClaimedAt || String(item.claimedAt) > m.lastClaimedAt) m.lastClaimedAt = item.claimedAt || null;
    }
  }

  const users = await batchGetAll(
    USERS_TABLE,
    [...perMember.keys()].map((userId) => ({ userId })),
    { ProjectionExpression: '#u, #n, #a', ExpressionAttributeNames: { '#u': 'userId', '#n': 'name', '#a': 'avatar' } },
  );
  const byUser = new Map(users.map((u) => [u.userId, u]));
  const members = [...perMember.values()]
    .map((m) => ({ ...m, name: byUser.get(m.userId)?.name || null, avatar: byUser.get(m.userId)?.avatar || null }))
    .sort((a, b) => (b.counts.suggested - a.counts.suggested) || (b.counts.claimed - a.counts.claimed));

  return res(200, { settings, totals, members, sync: publicSync(sync) });
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoDateOrNull(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) ? null : s.slice(0, 10);
}

/** One CSV row, as the collector writes it, checked and trimmed. */
function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return { reason: 'invalid_row' };
  const primary = String(raw.platformUserId || '').trim();
  if (!primary) return { reason: 'no_platform_account' };
  const others = String(raw.otherPlatformUserIds || '')
    .split(/[\s,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const userIds = [...new Set([primary, ...others])];
  if (userIds.some((id) => !USER_ID_PATTERN.test(id) || isReservedId(id))) return { reason: 'invalid_user_id' };

  const urlRaw = String(raw.url || '').trim();
  const m = BUILDER_URL_PATTERN.exec(urlRaw);
  if (!m) return { reason: 'invalid_url' };
  const contentId = m[1];
  const url = `https://builder.aws.com/content/${contentId}${m[2] || ''}`;

  // A leading markdown heading mark ("# Title") is not part of the title.
  // Hashtags ("#AgentsforHumans: ...") are kept.
  const title = cleanText(raw.title, 300).replace(/^#+\s+/, '');
  if (!title) return { reason: 'missing_title' };

  const imageRaw = String(raw.imageUrl || '').trim();
  const imageUrl = /^https:\/\/\S+$/.test(imageRaw) && imageRaw.length <= 600 ? imageRaw : undefined;
  const tags = [...new Set(String(raw.tags || '')
    .split(',')
    .map((t) => cleanText(t, 60).toLowerCase())
    .filter(Boolean))].slice(0, 10);
  const alias = builder.normalizeAlias(raw.builderAlias) || undefined;
  const confidence = String(raw.matchConfidence || '').trim().toLowerCase();
  const typeRaw = String(raw.type || '').trim().toLowerCase();

  return {
    row: {
      userIds,
      contentId,
      url,
      title,
      description: cleanText(raw.description, 1000),
      imageUrl,
      tags,
      publishedAt: isoDateOrNull(raw.publishedDate),
      likes: clampInt(raw.likes, 0, 10000000) ?? 0,
      comments: clampInt(raw.comments, 0, 10000000) ?? 0,
      builderAlias: alias,
      matchMethod: cleanText(raw.matchMethod, 40) || undefined,
      matchConfidence: ['high', 'medium', 'low'].includes(confidence) ? confidence : undefined,
      mentionsUGMadurai: ['yes', 'true', '1'].includes(String(raw.mentionsUGMadurai || '').trim().toLowerCase()),
      contentType: typeRaw === 'project' ? 'project' : 'blog',
    },
  };
}

/**
 * Import collector rows as suggestions. New articles become `suggested`, and
 * each member's Builder Center alias is recorded as matched so the weekly
 * sync suggests their new articles too. Articles already in the table keep
 * their status (a member's claim or "not mine" is never undone); only their
 * title, likes and the like are refreshed. Profiles a member rejected are
 * skipped. dryRun reports the same counts without writing.
 */
async function handleImport(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || !rows.length) return res(400, { error: 'No rows to import.' });
  if (rows.length > MAX_IMPORT_ROWS) return res(400, { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` });
  const dryRun = body.dryRun === true;
  const statsAsOf = isoDateOrNull(body.statsAsOf) || today();

  const skipped = {};
  const skip = (reason, n = 1) => { skipped[reason] = (skipped[reason] || 0) + n; };

  // One candidate per account per article.
  const candidates = new Map();
  for (const raw of rows) {
    const { row, reason } = normalizeRow(raw);
    if (!row) { skip(reason); continue; }
    for (const userId of row.userIds) {
      const key = `${userId}|${row.contentId}`;
      if (candidates.has(key)) { skip('duplicate_row'); continue; }
      candidates.set(key, { ...row, userId });
    }
  }

  const userIds = [...new Set([...candidates.values()].map((c) => c.userId))];
  const knownUsers = new Set((await batchGetAll(
    USERS_TABLE,
    userIds.map((userId) => ({ userId })),
    { ProjectionExpression: '#u', ExpressionAttributeNames: { '#u': 'userId' } },
  )).map((u) => u.userId));
  const forKnown = [...candidates.values()].filter((c) => {
    if (knownUsers.has(c.userId)) return true;
    skip('unknown_user');
    return false;
  });

  const linkPairs = [...new Set(forKnown.filter((c) => c.builderAlias).map((c) => `${c.userId}|${c.builderAlias}`))];
  const [onPlatform, existingItems, existingLinks] = await Promise.all([
    platformContentIds(),
    batchGetAll(TABLE, forKnown.map((c) => ({ userId: c.userId, itemKey: articleKey(c.contentId) }))),
    batchGetAll(TABLE, linkPairs.map((p) => {
      const [userId, alias] = p.split('|');
      return { userId, itemKey: linkKey(alias) };
    })),
  ]);
  const existing = new Map(existingItems.map((i) => [`${i.userId}|${i.contentId}`, i]));
  const links = new Map(existingLinks.map((l) => [`${l.userId}|${l.alias}`, l]));

  const toCreate = [];
  const toUpdate = [];
  for (const c of forKnown) {
    const found = existing.get(`${c.userId}|${c.contentId}`);
    const link = c.builderAlias ? links.get(`${c.userId}|${c.builderAlias}`) : null;
    if (found) toUpdate.push({ c, found });
    else if (link?.status === LINK.REJECTED) skip('alias_rejected');
    else if (onPlatform.has(c.contentId)) skip(STATUS.ON_PLATFORM);
    else toCreate.push(c);
  }
  const markOnPlatform = toUpdate.filter(({ c, found }) => found.status === STATUS.SUGGESTED && onPlatform.has(c.contentId));
  const newLinks = linkPairs.filter((p) => !links.has(p));

  const summary = {
    dryRun,
    statsAsOf,
    rows: rows.length,
    created: toCreate.length,
    updated: toUpdate.length,
    markedOnPlatform: markOnPlatform.length,
    membersWithNewSuggestions: new Set(toCreate.map((c) => c.userId)).size,
    byType: {
      blog: toCreate.filter((c) => c.contentType === 'blog').length,
      project: toCreate.filter((c) => c.contentType === 'project').length,
    },
    linksMatched: newLinks.length,
    skipped,
  };
  if (dryRun) return res(200, summary);

  const now = nowIso();
  const display = (c) => ({
    url: c.url,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    tags: c.tags,
    publishedAt: c.publishedAt,
    likes: c.likes,
    comments: c.comments,
    statsAsOf,
    builderAlias: c.builderAlias,
    matchMethod: c.matchMethod,
    matchConfidence: c.matchConfidence,
    mentionsUGMadurai: c.mentionsUGMadurai,
  });

  let created = 0;
  let updated = 0;
  const failures = [];
  await mapLimit(toCreate, WRITE_CONCURRENCY, async (c) => {
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE,
        Item: {
          userId: c.userId,
          itemKey: articleKey(c.contentId),
          kind: 'article',
          contentId: c.contentId,
          ...display(c),
          contentType: c.contentType,
          typeSource: 'import',
          status: STATUS.SUGGESTED,
          source: 'builder-center-import',
          importedBy: who.userId,
          importedAt: now,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: 'attribute_not_exists(itemKey)',
      }));
      created++;
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') return; // written meanwhile
      failures.push({ userId: c.userId, contentId: c.contentId, error: err.message });
    }
  });
  const markIds = new Set(markOnPlatform.map(({ c }) => `${c.userId}|${c.contentId}`));
  await mapLimit(toUpdate, WRITE_CONCURRENCY, async ({ c, found }) => {
    try {
      // The type is refreshed unless the member chose it. A claimed item keeps
      // its points either way.
      const fields = { ...display(c), updatedAt: now };
      if (found.typeSource !== 'member') {
        fields.contentType = c.contentType;
        fields.typeSource = 'import';
      }
      const { sets, names, values } = setExpression(fields);
      await docClient.send(new UpdateCommand({
        TableName: TABLE,
        Key: { userId: c.userId, itemKey: articleKey(c.contentId) },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }));
      if (markIds.has(`${c.userId}|${c.contentId}`)) {
        await moveStatus(c.userId, c.contentId, STATUS.SUGGESTED, STATUS.ON_PLATFORM);
      }
      updated++;
    } catch (err) {
      failures.push({ userId: c.userId, contentId: c.contentId, error: err.message });
    }
  });
  await mapLimit(newLinks, WRITE_CONCURRENCY, async (p) => {
    const [userId, alias] = p.split('|');
    try {
      await docClient.send(new PutCommand({
        TableName: TABLE,
        Item: { userId, itemKey: linkKey(alias), kind: 'link', alias, status: LINK.MATCHED, source: 'import', createdAt: now, updatedAt: now },
        ConditionExpression: 'attribute_not_exists(itemKey)',
      }));
    } catch (err) {
      if (err.name !== 'ConditionalCheckFailedException') failures.push({ userId, alias, error: err.message });
    }
  });

  console.log('builder center import', { by: who.userId, ...summary, created, updated, failures: failures.length });
  return res(200, { ...summary, created, updated, failures: failures.slice(0, 20), failureCount: failures.length });
}

async function handleAdminSync(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  if (!SYNC_FUNCTION_NAME) return res(500, { error: 'The sync function is not configured.' });
  const state = await getSyncState();
  if (state && ['crawling', 'applying'].includes(state.status) && Date.parse(state.leaseUntil || 0) > Date.now()) {
    return res(409, { error: 'A sync is already running.', sync: publicSync(state) });
  }
  await invokeAsync(SYNC_FUNCTION_NAME, { task: 'sync', trigger: 'admin', requestedBy: who.userId });
  console.log('builder center sync requested', { by: who.userId });
  return res(202, { started: true });
}

async function handleAdminRemoveLink(event) {
  const who = await verifiedAdmin(event);
  if (who.status) return adminDenied(who);
  const body = parseBody(event);
  if (!body) return res(400, { error: 'Invalid JSON body.' });
  const userId = String(body.userId || '');
  const alias = builder.normalizeAlias(body.alias);
  if (!USER_ID_PATTERN.test(userId) || isReservedId(userId) || !alias) {
    return res(400, { error: 'Send userId and alias.' });
  }
  await removeLink(userId, alias);
  console.log('builder center unlinked', { userId, alias, by: who.userId });
  return res(200, { userId, alias, removed: true });
}

// ── Sync ──────────────────────────────────────────────────────────
let lambdaClient = null;
async function invokeAsync(functionName, payload) {
  if (!lambdaClient) {
    const { LambdaClient } = require('@aws-sdk/client-lambda');
    lambdaClient = new LambdaClient({});
  }
  const { InvokeCommand } = require('@aws-sdk/client-lambda');
  await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  }));
}

async function saveSyncState(state) {
  const leaseUntil = state.status === 'crawling' || state.status === 'applying'
    ? new Date(Date.now() + LEASE_MS).toISOString()
    : undefined;
  const item = { ...state, ...SYNC_KEY, updatedAt: nowIso(), leaseUntil };
  if (!leaseUntil) delete item.leaseId;
  await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
  return item;
}

/**
 * Take the sync lease: free, expired, or already ours (a continuation).
 * Returns the state to work from, or null if another run holds it.
 */
async function takeLease(leaseId) {
  const now = nowIso();
  try {
    const r = await docClient.send(new UpdateCommand({
      TableName: TABLE,
      Key: SYNC_KEY,
      UpdateExpression: 'SET #li = :l, #lu = :until',
      ConditionExpression: 'attribute_not_exists(#lu) OR #lu < :now OR #li = :l',
      ExpressionAttributeNames: { '#li': 'leaseId', '#lu': 'leaseUntil' },
      ExpressionAttributeValues: { ':l': leaseId, ':until': new Date(Date.now() + LEASE_MS).toISOString(), ':now': now },
      ReturnValues: 'ALL_NEW',
    }));
    return r.Attributes;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return null;
    throw err;
  }
}

/**
 * The weekly sync. Reads the whole public feed into the index, then for each
 * matched or verified member: refreshes their articles' likes and comments,
 * suggests new articles (matched) or adds them (verified, while claims are
 * open). Continues in a fresh run when this one is about to time out.
 */
async function runSync(event, context) {
  const leaseId = event.leaseId || crypto.randomUUID();
  const remaining = () => (context && typeof context.getRemainingTimeInMillis === 'function'
    ? context.getRemainingTimeInMillis()
    : 15 * 60 * 1000);
  const continueLater = async (state) => {
    await saveSyncState({ ...state, leaseId });
    await invokeAsync(context.invokedFunctionArn, { task: 'sync', leaseId });
    console.log('sync continues in a new run', { runId: state.runId, status: state.status, pages: state.pages });
    return { continued: true, runId: state.runId };
  };

  const leased = await takeLease(leaseId);
  if (!leased) {
    console.log('sync already running, skipped');
    return { skipped: 'running' };
  }

  let state = leased;
  const continuing = event.leaseId && ['crawling', 'applying'].includes(state.status);
  // A run that stopped mid-way (its lease ran out) is picked up where it was.
  const resuming = !continuing && ['crawling', 'applying'].includes(state.status) && state.runId;
  if (!continuing && !resuming) {
    state = {
      ...SYNC_KEY,
      runId: nowIso(),
      trigger: event.trigger || 'schedule',
      status: 'crawling',
      cursor: null,
      pages: 0,
      articles: 0,
      applyAfter: null,
      startedAt: nowIso(),
      finishedAt: null,
      lastCompletedAt: leased.lastCompletedAt || null,
      stats: { refreshed: 0, newSuggestions: 0, autoAdded: 0, pointsAwarded: 0, linksMatched: 0 },
      error: null,
    };
  }

  try {
    // 1. Read the feed into the index.
    while (state.status === 'crawling') {
      if (remaining() < RUN_RESERVE_MS) return await continueLater(state);
      const page = await builder.fetchFeedPage(state.cursor);
      const indexItems = page.articles
        .map(builder.feedArticleToIndexItem)
        .filter(Boolean)
        .map((i) => ({ ...i, statsAsOf: today(), lastSeenRun: state.runId, updatedAt: nowIso() }));
      // One item per key per batch: the feed can repeat an article across pages.
      const unique = [...new Map(indexItems.map((i) => [`${i.alias}|${i.contentId}`, i])).values()];
      await batchPutAll(FEED_TABLE, unique);
      state.pages += 1;
      state.articles += unique.length;
      const stuck = page.cursor && page.cursor === state.cursor;
      state.cursor = page.cursor;
      if (!page.cursor || !page.articles.length || stuck || state.pages >= MAX_FEED_PAGES) {
        state.status = 'applying';
        state.cursor = null;
      }
      state = await saveSyncState({ ...state, leaseId });
      await sleep(FEED_PAGE_PAUSE_MS);
    }

    // 2. Bring members' articles up to date.
    if (state.status === 'applying') {
      const [settings, onPlatform, all] = await Promise.all([
        getSettings(), platformContentIds(), scanAll({ TableName: TABLE }),
      ]);
      const itemsByUser = new Map();
      const linksByUser = new Map();
      const aliasOwners = new Map();
      for (const item of all) {
        if (item.userId === ALIAS_LOCK_PARTITION) { aliasOwners.set(item.itemKey, item.ownerUserId); continue; }
        if (isReservedId(item.userId)) continue;
        const key = String(item.itemKey || '');
        if (key.startsWith(ARTICLE_PREFIX)) {
          if (!itemsByUser.has(item.userId)) itemsByUser.set(item.userId, []);
          itemsByUser.get(item.userId).push(item);
        } else if (key.startsWith(LINK_PREFIX)) {
          if (!linksByUser.has(item.userId)) linksByUser.set(item.userId, new Map());
          linksByUser.get(item.userId).set(item.alias, item);
        }
      }
      // Members matched before links were recorded: their articles' alias.
      for (const [userId, items] of itemsByUser) {
        for (const alias of new Set(items.map((i) => i.builderAlias).filter(Boolean))) {
          if (linksByUser.get(userId)?.has(alias)) continue;
          const link = { userId, itemKey: linkKey(alias), kind: 'link', alias, status: LINK.MATCHED, source: 'sync', createdAt: nowIso(), updatedAt: nowIso() };
          try {
            await docClient.send(new PutCommand({ TableName: TABLE, Item: link, ConditionExpression: 'attribute_not_exists(itemKey)' }));
            state.stats.linksMatched += 1;
          } catch (err) {
            if (err.name !== 'ConditionalCheckFailedException') throw err;
          }
          if (!linksByUser.has(userId)) linksByUser.set(userId, new Map());
          linksByUser.get(userId).set(alias, link);
        }
      }

      const targets = [];
      for (const [userId, links] of linksByUser) {
        for (const link of links.values()) {
          if (link.status === LINK.MATCHED || link.status === LINK.VERIFIED) targets.push({ userId, link });
        }
      }
      targets.sort((a, b) => `${a.userId}|${a.link.alias}`.localeCompare(`${b.userId}|${b.link.alias}`));

      for (const { userId, link } of targets) {
        const key = `${userId}|${link.alias}`;
        if (state.applyAfter && key <= state.applyAfter) continue;
        if (remaining() < RUN_RESERVE_MS) return await continueLater(state);
        await applyToMember(userId, link, {
          settings, onPlatform, items: itemsByUser.get(userId) || [], aliasOwners, stats: state.stats,
        });
        state.applyAfter = key;
        state = await saveSyncState({ ...state, leaseId });
      }

      state.status = 'done';
      state.finishedAt = nowIso();
      state.lastCompletedAt = state.finishedAt;
      state.applyAfter = null;
      state = await saveSyncState(state);
      console.log('sync finished', { runId: state.runId, pages: state.pages, articles: state.articles, ...state.stats });
    }
    return { done: true, runId: state.runId };
  } catch (err) {
    console.error('sync failed', err);
    await saveSyncState({ ...state, status: 'failed', finishedAt: nowIso(), error: String(err.message || err).slice(0, 500) });
    return { failed: true, error: err.message };
  }
}

/** One member's articles from one alias, from the feed index. */
async function applyToMember(userId, link, { settings, onPlatform, items, aliasOwners, stats }) {
  const alias = link.alias;
  const owner = aliasOwners.get(alias);
  // Another account proved it owns this alias: nothing more to suggest here.
  if (link.status === LINK.MATCHED && owner && owner !== userId) return;

  const feed = await queryFeed(alias);
  const byId = new Map(items.map((i) => [i.contentId, i]));
  const verified = link.status === LINK.VERIFIED && settings.claimsOpen;
  let c = null;
  const getClaimer = async () => {
    if (!c) {
      const user = await getUser(userId);
      if (!user) return null;
      c = claimer(userId, user, settings, items);
    }
    return c;
  };

  for (const f of feed) {
    const ex = byId.get(f.contentId);
    if (ex) {
      // Refresh what changes on Builder Center. Status and type stay.
      const changed = ex.title !== f.title || ex.likes !== f.likes || ex.comments !== f.comments
        || ex.description !== f.description || ex.imageUrl !== f.imageUrl || ex.url !== f.url;
      if (changed) {
        const { sets, names, values } = setExpression({
          title: f.title, description: f.description, imageUrl: f.imageUrl, url: f.url,
          tags: f.tags, likes: f.likes, comments: f.comments, statsAsOf: f.statsAsOf || today(), updatedAt: nowIso(),
        });
        await docClient.send(new UpdateCommand({
          TableName: TABLE,
          Key: { userId, itemKey: articleKey(f.contentId) },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
        }));
        stats.refreshed += 1;
      }
      if (verified && ex.status === STATUS.SUGGESTED && !onPlatform.has(f.contentId)) {
        const cl = await getClaimer();
        const r = cl && await cl.claim({ contentId: f.contentId, existing: ex, auto: true });
        if (r?.status === 'claimed') { stats.autoAdded += 1; stats.pointsAwarded += r.points; }
      }
      continue;
    }
    if (onPlatform.has(f.contentId)) continue;
    const fields = feedToItem(f, { alias, source: 'builder-center-sync', matchMethod: link.source || 'sync' });
    if (verified) {
      const cl = await getClaimer();
      const r = cl && await cl.claim({ contentId: f.contentId, create: fields, auto: true });
      if (r?.status === 'claimed') { stats.autoAdded += 1; stats.pointsAwarded += r.points; }
    } else {
      const now = nowIso();
      try {
        await docClient.send(new PutCommand({
          TableName: TABLE,
          Item: {
            ...fields, userId, itemKey: articleKey(f.contentId), kind: 'article', contentId: f.contentId,
            status: STATUS.SUGGESTED, createdAt: now, updatedAt: now,
          },
          ConditionExpression: 'attribute_not_exists(itemKey)',
        }));
        stats.newSuggestions += 1;
      } catch (err) {
        if (err.name !== 'ConditionalCheckFailedException') throw err;
      }
    }
  }
  await putLink(userId, alias, { lastSyncedAt: nowIso() });
}

// ── Router ────────────────────────────────────────────────────────
exports.handler = async (event, context) => {
  // EventBridge, the admin's "sync now" and continuations arrive without httpMethod.
  if (!event.httpMethod) {
    if (event.task === 'sync') return runSync(event, context);
    console.warn('unknown task', { task: event.task });
    return { error: 'unknown task' };
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  const path = event.path || event.requestContext?.path || '';
  const method = event.httpMethod;

  try {
    const parts = path.split('/').filter(Boolean);
    const i = parts.indexOf('builder-center');
    const r = (i >= 0 ? parts.slice(i + 1) : parts).map((p) => decodeURIComponent(p));

    if (r[0] === 'me') {
      if (method === 'GET' && !r[1]) return await handleMe(event);
      if (method === 'POST' && r[1] === 'claim') return await handleClaim(event);
      if (method === 'POST' && r[1] === 'dismiss') {
        return await handleMove(event, STATUS.SUGGESTED, STATUS.DISMISSED, () => ({ dismissedAt: nowIso(), dismissedReason: 'member' }));
      }
      if (method === 'POST' && r[1] === 'restore') return await handleMove(event, STATUS.DISMISSED, STATUS.SUGGESTED);
      if (method === 'POST' && r[1] === 'aliases' && r[2] === 'reject') return await handleRejectAlias(event);
      if (method === 'POST' && r[1] === 'aliases' && r[2] === 'restore') return await handleRestoreAlias(event);
      if (method === 'POST' && r[1] === 'link' && r[2] === 'start') return await handleLinkStart(event);
      if (method === 'POST' && r[1] === 'link' && r[2] === 'verify') return await handleLinkVerify(event);
      if (method === 'POST' && r[1] === 'link' && r[2] === 'remove') return await handleLinkRemove(event);
      if (method === 'POST' && r[1] === 'articles' && r[2] === 'add') return await handleAddArticle(event);
    }
    if (method === 'GET' && r[0] === 'users' && r[1] && r[2] === 'articles' && !r[3]) {
      return await handlePublicArticles(r[1]);
    }
    if (r[0] === 'admin') {
      if (r[1] === 'settings' && method === 'GET') return await handleGetSettings(event);
      if (r[1] === 'settings' && method === 'PUT') return await handlePutSettings(event);
      if (r[1] === 'summary' && method === 'GET') return await handleSummary(event);
      if (r[1] === 'import' && method === 'POST') return await handleImport(event);
      if (r[1] === 'sync' && method === 'POST') return await handleAdminSync(event);
      if (r[1] === 'links' && r[2] === 'remove' && method === 'POST') return await handleAdminRemoveLink(event);
    }

    console.log('route not matched', { method, path });
    return res(404, { error: 'Not found' });
  } catch (error) {
    console.error('builder center error:', error);
    return res(500, { error: 'Internal server error' });
  }
};

// Exported for local checks.
exports._internal = { normalizeRow, pointsFor, awardedSoFar, contentIdInLink, requestedIds };
