/**
 * Kironomics Lambda — gamified Kiro usage tracking.
 *
 * Ported from the standalone Express server (Kiro-Backend/backend/server.ts) to
 * run on the main website's AWS stack: API Gateway (REST) -> this Lambda -> DynamoDB.
 *
 * Single lambda behind a /kironomics/{proxy+} ANY route; it routes internally.
 * Persistence is one item per user in the kironomics table, plus a `token-index`
 * GSI to resolve an API key (token) back to its user for ingestion endpoints.
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.KIRONOMICS_TABLE_NAME || 'awsug-kironomics';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// ── HTTP helpers ──────────────────────────────────────────────────
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,x-admin-key',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...getCorsHeaders(), ...headers },
    body: JSON.stringify(body),
  };
}

// Standard envelope used by the existing frontend ({ data, metadata, error }).
function ok(data) {
  return createResponse(200, {
    data,
    metadata: { request_id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    error: null,
  });
}

// Extract a user id from the Cognito Authorization header (base64-decode the
// JWT payload's `sub`). Mirrors lambda/shared/auth.js — no signature verify,
// consistent with the rest of this stack.
function extractUserId(authHeader) {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  if (token.includes('.')) {
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
        return payload.sub || payload['cognito:username'] || payload.userId || payload.username || null;
      }
    } catch (e) {
      return null;
    }
  }
  return token;
}

// ── DynamoDB access ───────────────────────────────────────────────
async function getUserById(userId) {
  const r = await docClient.send(new GetCommand({ TableName: TABLE, Key: { userId } }));
  return r.Item || null;
}

async function getUserByToken(token) {
  if (!token) return null;
  const r = await docClient.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'token-index',
    KeyConditionExpression: '#t = :t',
    ExpressionAttributeNames: { '#t': 'token' },
    ExpressionAttributeValues: { ':t': token },
    Limit: 1,
  }));
  return (r.Items || [])[0] || null;
}

async function putUser(user) {
  // Normalize collections for storage: dedupe machine/ip lists, cap sessions.
  user.machines = [...new Set(user.machines || [])];
  user.ips = [...new Set(user.ips || [])];
  user.sessions = (user.sessions || []).slice(-200);
  await docClient.send(new PutCommand({ TableName: TABLE, Item: user }));
  return user;
}

async function scanUsers() {
  const users = [];
  let ExclusiveStartKey;
  do {
    const r = await docClient.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }));
    users.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return users;
}

function newUser(userId, displayName) {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    userId,                       // DynamoDB partition key
    token,                        // GSI key (the API key)
    user_id: userId,              // keep server.ts field names for compatibility
    display_name: displayName || userId,
    api_key: token,
    total_sessions: 0, total_prompts: 0, total_tool_calls: 0, total_elapsed_seconds: 0,
    score: 0, last_activity: null, sessions: [], daily_activity: {},
    machines: [], ips: [], flagged: false, flag_reasons: [], streak_days: 0,
    tool_breakdown: {}, registered_at: new Date().toISOString(),
  };
}

// ── Scoring / titles / badges / plans (ported verbatim) ───────────
const TITLE_TIERS = [
  { min: 0, max: 99, name: 'Kiro Novice', icon: '🌱' },
  { min: 100, max: 499, name: 'Prompt Apprentice', icon: '📝' },
  { min: 500, max: 1999, name: 'Hook Wrangler', icon: '🪝' },
  { min: 2000, max: 4999, name: 'Tool Wielder', icon: '🔧' },
  { min: 5000, max: 14999, name: 'Session Warrior', icon: '⚔️' },
  { min: 15000, max: 49999, name: 'Token Legend', icon: '👑' },
  { min: 50000, max: Infinity, name: 'Session Immortal', icon: '🏆' },
];

const BADGE_DEFS = [
  { name: 'First Session', icon: '🎯', key: 'total_sessions', threshold: 1 },
  { name: 'Century Club', icon: '💯', key: 'total_tool_calls', threshold: 100 },
  { name: 'Hook Hero', icon: '🦸', key: 'total_prompts', threshold: 50 },
  { name: 'Token Titan', icon: '💎', key: 'total_tool_calls', threshold: 500 },
  { name: 'Marathon Runner', icon: '🏃', key: 'total_elapsed_seconds', threshold: 36000 },
  { name: 'Week Warrior', icon: '🔥', key: 'streak_days', threshold: 7 },
  { name: 'Monthly Master', icon: '🌟', key: 'streak_days', threshold: 30 },
];

function getTitle(score) {
  for (const t of TITLE_TIERS) {
    if (score >= t.min && score <= t.max) return { name: t.name, icon: t.icon };
  }
  return { name: 'Kiro Novice', icon: '🌱' };
}

function getBadges(user) {
  const earned = [];
  for (const b of BADGE_DEFS) {
    if ((user[b.key] || 0) >= b.threshold) earned.push({ name: b.name, icon: b.icon });
  }
  return earned;
}

const PLANS = {
  50: { name: 'Free', price: 0 },
  1000: { name: 'Pro', price: 20 },
  2000: { name: 'Pro+', price: 40 },
  10000: { name: 'Power', price: 200 },
};
function detectPlan(usageLimit) {
  if (!usageLimit) return { name: 'Auto-Auto', price: 0 };
  return PLANS[usageLimit] || { name: 'Custom', price: 0 };
}

function recalcScore(user) {
  const credits = user.credits_consumed_total || 0;
  if (credits > 0) {
    user.score = Math.round((credits * 100) + (user.total_tool_calls * 1) + (user.total_prompts * 2));
  } else {
    user.score = Math.round((user.total_tool_calls * 3) + (user.total_prompts * 5) + (user.total_elapsed_seconds / 60));
  }
  const today = new Date().toISOString().slice(0, 10);
  if (!user.daily_activity) user.daily_activity = {};
  user.daily_activity[today] = (user.daily_activity[today] || 0) + 1;
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (user.daily_activity[ds]) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  user.streak_days = streak;
}

function detectFraud(user, session) {
  const reasons = [];
  const hookTotal = (session.tool_calls || 0) + (session.prompts || 0);
  const creditsConsumed = session.creditsConsumed || 0;
  if (hookTotal > 5 && creditsConsumed === 0 && session.currentUsage !== null && session.currentUsage !== undefined) {
    user.consecutive_no_credit_sessions = (user.consecutive_no_credit_sessions || 0) + 1;
  } else if (creditsConsumed > 0) {
    user.consecutive_no_credit_sessions = 0;
  }
  if ((user.consecutive_no_credit_sessions || 0) >= 3 && hookTotal > 10) {
    reasons.push('repeated_no_credit_growth');
  }
  if (hookTotal > 0 && creditsConsumed > hookTotal * 50) {
    reasons.push(`credits_too_high:${creditsConsumed}vs_${hookTotal}events`);
  }
  return reasons;
}

function clientIp(event) {
  const xff = event.headers?.['x-forwarded-for'] || event.headers?.['X-Forwarded-For'];
  const raw = (Array.isArray(xff) ? xff[0] : xff) || event.requestContext?.identity?.sourceIp || '';
  return String(raw).split(',')[0].trim();
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch (e) {
    return {};
  }
}

function isAdmin(event) {
  // Admin is disabled unless a real key is configured (never blank or the "admin" default).
  if (!ADMIN_KEY || ADMIN_KEY === 'admin') return false;
  const key = event.headers?.['x-admin-key'] || event.headers?.['X-Admin-Key'];
  return key === ADMIN_KEY;
}

// ── Route handlers ────────────────────────────────────────────────
async function handleProfile(event) {
  const body = parseBody(event);
  // Identity MUST come from the Cognito token (attached by the website via callApi).
  // We never trust a userId from the request body — that would let anyone mint a key
  // for any account. This is the ONLY way to obtain an API key.
  const userId = extractUserId(event.headers?.Authorization || event.headers?.authorization);
  if (!userId) return createResponse(401, { error: 'authentication required' });

  let user = await getUserById(userId);
  if (!user) {
    user = newUser(userId, body.displayName);
  }
  if (body.displayName) user.display_name = body.displayName;
  if (body.publicProfile !== undefined) user.publicProfile = body.publicProfile;
  await putUser(user);
  return ok({ userId, updated: true, apiKey: user.token || user.api_key });
}

async function handlePrompt(event) {
  const { token, timestamp, machine_id } = parseBody(event);
  if (!token) return createResponse(400, { error: 'token required' });
  const user = await getUserByToken(token);
  if (!user) return createResponse(401, { error: 'invalid token' });
  const ip = clientIp(event);
  if (machine_id) user.machines = [...(user.machines || []), machine_id];
  if (ip) user.ips = [...(user.ips || []), ip];
  user.total_prompts = (user.total_prompts || 0) + 1;
  user.last_activity = timestamp || new Date().toISOString();
  recalcScore(user);
  await putUser(user);
  return createResponse(200, { success: true, total_prompts: user.total_prompts });
}

async function handleTool(event) {
  const { token, tool_name, timestamp } = parseBody(event);
  if (!token) return createResponse(400, { error: 'token required' });
  const user = await getUserByToken(token);
  if (!user) return createResponse(401, { error: 'invalid token' });
  user.total_tool_calls = (user.total_tool_calls || 0) + 1;
  if (!user.tool_breakdown) user.tool_breakdown = {};
  const tn = tool_name || 'unknown';
  user.tool_breakdown[tn] = (user.tool_breakdown[tn] || 0) + 1;
  user.last_activity = timestamp || new Date().toISOString();
  recalcScore(user);
  await putUser(user);
  return createResponse(200, { success: true, total_tool_calls: user.total_tool_calls });
}

async function handleSession(event) {
  const {
    token, elapsed_seconds, tool_calls, prompts, timestamp, machine_id,
    currentUsage, usageLimit, percentageUsed, resetDate,
  } = parseBody(event);
  if (!token) return createResponse(400, { error: 'token required' });
  const user = await getUserByToken(token);
  if (!user) return createResponse(401, { error: 'invalid token' });
  const ip = clientIp(event);
  if (machine_id) user.machines = [...(user.machines || []), machine_id];
  if (ip) user.ips = [...(user.ips || []), ip];

  let creditsConsumed = 0;
  if (currentUsage !== null && currentUsage !== undefined) {
    const previousUsage = user.current_usage;
    if (previousUsage === undefined || previousUsage === null) {
      creditsConsumed = 0;
    } else if (currentUsage >= previousUsage) {
      creditsConsumed = currentUsage - previousUsage;
    } else {
      creditsConsumed = currentUsage;
    }
    user.current_usage = currentUsage;
    user.monthly_limit = usageLimit || user.monthly_limit;
    user.percentage_used = percentageUsed || user.percentage_used;
    user.reset_date = resetDate || user.reset_date;
    user.plan = detectPlan(usageLimit).name;
    user.plan_price = detectPlan(usageLimit).price;
    user.credits_consumed_total = (user.credits_consumed_total || 0) + creditsConsumed;
  }

  const session = {
    timestamp: timestamp || new Date().toISOString(),
    elapsed_seconds: elapsed_seconds || 0,
    tool_calls: tool_calls || 0,
    prompts: prompts || 0,
    creditsConsumed,
    currentUsage: currentUsage ?? null,
  };
  const fraud = detectFraud(user, session);
  if (fraud.length) {
    user.flagged = true;
    user.flag_reasons = [...new Set([...(user.flag_reasons || []), ...fraud])];
  }
  user.sessions = [...(user.sessions || []), session];
  user.total_sessions = (user.total_sessions || 0) + 1;
  user.total_elapsed_seconds = (user.total_elapsed_seconds || 0) + session.elapsed_seconds;
  if (prompts) user.total_prompts = (user.total_prompts || 0) + prompts;
  if (tool_calls) user.total_tool_calls = (user.total_tool_calls || 0) + tool_calls;
  user.last_activity = session.timestamp;
  recalcScore(user);
  await putUser(user);
  return createResponse(200, {
    success: true, flagged: user.flagged, score: user.score, creditsConsumed, plan: user.plan,
  });
}

async function handleLeaderboard(event) {
  const window = (event.queryStringParameters && event.queryStringParameters.window) || 'all-time';
  const now = new Date();
  let cutoff = null;
  if (window === 'daily') cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  else if (window === 'weekly') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const users = await scanUsers();
  const board = users
    .filter((u) => !u.flagged)
    .map((u) => {
      const windowSessions = cutoff
        ? (u.sessions || []).filter((s) => new Date(s.timestamp) >= cutoff)
        : (u.sessions || []);
      const windowTools = windowSessions.reduce((sum, s) => sum + (s.tool_calls || 0), 0);
      const windowPrompts = windowSessions.reduce((sum, s) => sum + (s.prompts || 0), 0);
      const windowDuration = windowSessions.reduce((sum, s) => sum + (s.elapsed_seconds || 0), 0);
      const windowCredits = windowSessions.reduce((sum, s) => sum + (s.creditsConsumed || 0), 0);
      const windowScore = window === 'all-time'
        ? u.score
        : Math.round((windowCredits * 100) + (windowTools * 1) + (windowPrompts * 2));
      const title = getTitle(windowScore);
      return {
        userId: u.user_id,
        displayName: u.display_name,
        compositeScore: windowScore,
        title: title.name,
        titleIcon: title.icon,
        totalTokens: windowTools * 10,
        totalMcpCalls: windowTools,
        totalHookTriggers: windowPrompts,
        totalSessions: windowSessions.length,
        totalDuration: windowDuration,
        streakDays: u.streak_days || 0,
        badges: getBadges(u),
        lastActivity: u.last_activity,
        awsVerified: u.aws_verified || false,
        awsConfidence: u.aws_confidence || null,
        plan: u.plan || 'Auto-Auto',
        creditsConsumedTotal: Math.round((u.credits_consumed_total || 0) * 100) / 100,
      };
    })
    .filter((entry) => window === 'all-time' || entry.totalSessions > 0)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));

  return ok({ entries: board, totalItems: board.length, window });
}

async function handleMetrics(userId) {
  const user = await getUserById(userId);
  if (!user) return createResponse(404, { data: null, error: { code: 'NOT_FOUND', message: 'User not found' } });
  const title = getTitle(user.score || 0);
  const badges = getBadges(user);

  const monthlyLimit = user.monthly_limit || null;
  const currentUsage = user.current_usage || 0;
  const percentageUsed = user.percentage_used || (monthlyLimit ? (currentUsage / monthlyLimit) * 100 : 0);
  const creditsRemaining = monthlyLimit ? Math.max(0, monthlyLimit - currentUsage) : null;

  let daysUntilReset = null;
  if (user.reset_date) {
    const reset = new Date(user.reset_date);
    daysUntilReset = Math.max(0, Math.ceil((reset.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  }

  let dailyBurnRate = 0;
  let daysRemaining = null;
  if (currentUsage > 0 && user.daily_activity) {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysSinceMonthStart = Math.max(1, Math.ceil((today.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24)));
    dailyBurnRate = currentUsage / daysSinceMonthStart;
    if (dailyBurnRate > 0 && creditsRemaining !== null) {
      daysRemaining = Math.floor(creditsRemaining / dailyBurnRate);
    }
  }

  return ok({
    userId: user.user_id, displayName: user.display_name,
    compositeScore: user.score || 0, title: title.name, titleIcon: title.icon,
    totalTokens: (user.total_tool_calls || 0) * 10, totalMcpCalls: user.total_tool_calls || 0,
    totalHookTriggers: user.total_prompts || 0, totalSessions: user.total_sessions || 0,
    totalDuration: user.total_elapsed_seconds || 0, streakDays: user.streak_days || 0,
    longestStreak: user.streak_days || 0, badges,
    publicProfile: user.publicProfile || false,
    publicSlug: user.display_name || user.user_id,
    toolBreakdown: Object.entries(user.tool_breakdown || {}).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    hookBreakdown: [{ name: 'promptSubmit', count: user.total_prompts || 0 }],
    plan: user.plan || 'Auto-Auto',
    planPrice: user.plan_price || 0,
    monthlyLimit,
    currentUsage: Math.round(currentUsage * 100) / 100,
    percentageUsed: Math.round(percentageUsed * 100) / 100,
    creditsRemaining,
    creditsConsumedTotal: Math.round((user.credits_consumed_total || 0) * 100) / 100,
    resetDate: user.reset_date || null,
    daysUntilReset,
    dailyBurnRate: Math.round(dailyBurnRate * 100) / 100,
    daysRemaining,
  });
}

async function handleUserSessions(userId, event) {
  const user = await getUserById(userId);
  if (!user) return createResponse(404, { data: null, error: { code: 'NOT_FOUND' } });
  const limit = parseInt(String((event.queryStringParameters && event.queryStringParameters.limit) ?? ''), 10) || 10;
  const sessions = (user.sessions || []).slice(-limit).reverse().map((s, i) => ({
    sessionId: `session-${i}`, startTime: s.timestamp,
    duration: s.elapsed_seconds, tokenUsage: (s.tool_calls || 0) * 10, mcpCalls: s.tool_calls || 0,
  }));
  if (sessions.length === 0 && (user.total_tool_calls || 0) > 0) {
    sessions.push({
      sessionId: 'current', startTime: user.last_activity || new Date().toISOString(),
      duration: user.total_elapsed_seconds || 0, tokenUsage: (user.total_tool_calls || 0) * 10, mcpCalls: user.total_tool_calls || 0,
    });
  }
  return ok(sessions);
}

async function handleBadges(userId) {
  const user = await getUserById(userId);
  if (!user) return createResponse(404, { data: null, error: { code: 'NOT_FOUND' } });
  return ok(getBadges(user));
}

async function handleHistory(userId, event) {
  const user = await getUserById(userId);
  if (!user) return createResponse(404, { data: null, error: { code: 'NOT_FOUND' } });
  const days = parseInt(String((event.queryStringParameters && event.queryStringParameters.days) ?? ''), 10) || 30;
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    data.push({ date: ds, value: (user.daily_activity || {})[ds] || 0 });
  }
  return ok(data);
}

async function handleHeatmap(userId) {
  const user = await getUserById(userId);
  if (!user) return createResponse(404, { data: null, error: { code: 'NOT_FOUND' } });
  const activity = user.daily_activity || {};
  const maxVal = Math.max(1, ...Object.values(activity));
  const data = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    const count = activity[ds] || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / maxVal) * 4));
    data.push({ date: ds, count, level });
  }
  return ok(data);
}

// ── Admin ─────────────────────────────────────────────────────────
async function handleAdminFlagged() {
  const users = await scanUsers();
  return createResponse(200, users.filter((u) => u.flagged));
}

async function handleAdminResetScores() {
  const users = await scanUsers();
  const cleared = [];
  for (const user of users) {
    cleared.push({ userId: user.user_id, oldScore: user.score });
    user.score = 0;
    user.credits_consumed_total = 0;
    user.flagged = false;
    user.flag_reasons = [];
    await putUser(user);
  }
  return createResponse(200, { success: true, cleared, message: `Reset ${cleared.length} users` });
}

async function handleAdminRecalc() {
  const users = await scanUsers();
  const updated = [];
  for (const user of users) {
    const oldScore = user.score;
    recalcScore(user);
    updated.push({ userId: user.user_id, displayName: user.display_name, oldScore, newScore: user.score });
    await putUser(user);
  }
  return createResponse(200, { success: true, updated, message: `Recalculated ${updated.length} users` });
}

async function handleAdminUnflag(userIdParam) {
  const unflagged = [];
  if (userIdParam === 'all') {
    const users = await scanUsers();
    for (const user of users) {
      if (user.flagged) {
        unflagged.push({ userId: user.user_id, reasons: [...(user.flag_reasons || [])] });
        user.flagged = false;
        user.flag_reasons = [];
        user.consecutive_no_credit_sessions = 0;
        await putUser(user);
      }
    }
  } else {
    const user = await getUserById(userIdParam);
    if (!user) return createResponse(404, { error: 'user not found' });
    unflagged.push({ userId: user.user_id, reasons: [...(user.flag_reasons || [])] });
    user.flagged = false;
    user.flag_reasons = [];
    user.consecutive_no_credit_sessions = 0;
    await putUser(user);
  }
  return createResponse(200, { success: true, unflagged, message: `Unflagged ${unflagged.length} user(s)` });
}

// ── Router ────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const method = event.httpMethod;
  if (method === 'OPTIONS') return { statusCode: 200, headers: getCorsHeaders(), body: '' };

  // Route parts after the "kironomics" segment, stage-prefix agnostic.
  const path = event.path || event.requestContext?.path || '';
  const parts = path.split('/').filter(Boolean);
  const ki = parts.indexOf('kironomics');
  const r = ki >= 0 ? parts.slice(ki + 1) : parts;

  try {
    if (method === 'GET' && r[0] === 'health') return createResponse(200, { status: 'ok' });
    if (method === 'GET' && r[0] === 'leaderboard') return await handleLeaderboard(event);

    if (r[0] === 'users') {
      // /kironomics/users/profile
      if (method === 'POST' && r[1] === 'profile') return await handleProfile(event);
      // /kironomics/users/{userId}/...
      const userId = r[1] ? decodeURIComponent(r[1]) : null;
      if (method === 'GET' && userId) {
        if (r[2] === 'metrics') return await handleMetrics(userId);
        if (r[2] === 'sessions') return await handleUserSessions(userId, event);
        if (r[2] === 'badges') return await handleBadges(userId);
        if (r[2] === 'history') return await handleHistory(userId, event);
        if (r[2] === 'heatmap') return await handleHeatmap(userId);
      }
    }

    if (method === 'POST') {
      if (r[0] === 'prompt') return await handlePrompt(event);
      if (r[0] === 'tool') return await handleTool(event);
      if (r[0] === 'session') return await handleSession(event);
      if (r[0] === 'verify-aws') {
        return createResponse(501, { error: 'not_implemented', message: 'AWS Cost Explorer verification is not available in the serverless deployment yet.' });
      }
    }

    // /kironomics/admin/* (guarded by x-admin-key)
    if (r[0] === 'admin') {
      if (!isAdmin(event)) return createResponse(403, { error: 'forbidden' });
      if (method === 'GET' && r[1] === 'flagged') return await handleAdminFlagged();
      if (method === 'POST' && r[1] === 'reset-scores') return await handleAdminResetScores();
      if (method === 'POST' && r[1] === 'recalc-all-scores') return await handleAdminRecalc();
      if (method === 'POST' && r[1] === 'unflag') return await handleAdminUnflag(r[2] ? decodeURIComponent(r[2]) : '');
    }

    return createResponse(404, { error: 'Not found', path, method });
  } catch (error) {
    console.error('Kironomics error:', error);
    return createResponse(500, { error: 'Internal server error', message: error.message });
  }
};
