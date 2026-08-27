// ============================================================================
// Hackathons CRUD Lambda
//
// Sits behind /hackathons and /hackathons/{proxy+} (see hackathons.tf) and does
// its own path routing, matching the pattern used by sprints-crud and
// kironomics-crud.
//
// Owns three tables:
//   hackathons             - the event itself, plus mentor pool + resources
//   hackathon_teams        - one item per team, with nested invites + requests
//   hackathon_submissions  - one item per submission (team or individual)
//
// Authorisation notes:
//   Writes require an authenticated caller. Admin-only routes additionally go
//   through isHackathonAdmin(), which checks the users table role/roles plus the
//   ADMIN_EMAILS allow-list. We deliberately do NOT rely on
//   shared/permissions.js RESOURCE_PERMISSIONS here: it has no 'organiser' role
//   defined, and unmapped routes default to allow, so registering routes there
//   would either lock organisers out or be a no-op.
//
//   Team-scoped actions (invite, approve, kick) check team leadership explicitly
//   against the caller's resolved user id, not a client-supplied one.
// ============================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const { extractUserId } = require('./shared/auth');
const { sendEmail, renderEmail, APP_URL } = require('./shared/email');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const HACKATHONS_TABLE = process.env.HACKATHONS_TABLE_NAME || 'awsug-hackathons';
const TEAMS_TABLE = process.env.HACKATHON_TEAMS_TABLE_NAME || 'awsug-hackathon-teams';
const SUBMISSIONS_TABLE = process.env.HACKATHON_SUBMISSIONS_TABLE_NAME || 'awsug-hackathon-submissions';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
// Only used to clear meetup.hackathonId when a hackathon is deleted.
const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';
// Used to mirror hackathon participants into the sprint the hackathon runs under.
const SPRINTS_TABLE = process.env.SPRINTS_TABLE_NAME || 'awsug-sprints';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_ROLES = ['admin', 'organiser', 'volunteer'];
// Judges can see and score submissions, but nothing else. Kept separate from
// ADMIN_ROLES so a judge can't create, edit or delete hackathons.
const JUDGE_ROLES = ['judge'];
const INVITE_TTL_DAYS = 14;
const MAX_INVITES_PER_CALL = 20;

// ----------------------------------------------------------------------------
// HTTP helpers
// ----------------------------------------------------------------------------

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
};

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  } catch {
    return {};
  }
}

// ----------------------------------------------------------------------------
// Small utilities
// ----------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

/** Today as a YYYY-MM-DD string in UTC. */
const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Compare date-only deadline strings instead of constructing Date objects.
 *
 * Deadlines are stored as YYYY-MM-DD with no timezone. `new Date('2026-08-23T23:59:59')`
 * parses as *local* time, so comparing that against `new Date()` shifts the
 * boundary by the server's UTC offset — a deadline could read as expired hours
 * early or late depending on where the Lambda runs. Lexicographic comparison of
 * ISO date strings is exact and timezone-stable, and "through the end of that
 * day" is what an organiser picking a date means.
 */
function isOnOrBeforeToday(dateStr) {
  return String(dateStr) <= todayStr();
}

function isTodayOnOrBefore(dateStr) {
  return todayStr() <= String(dateStr);
}

function genId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

function genToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** 6-char human-friendly code. Excludes easily confused characters. */
function genJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return out;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidUrl(url) {
  return /^https?:\/\/.+\..+/.test(String(url || '').trim());
}

/** Strip undefined values so DynamoDB doesn't reject the item. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// ----------------------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------------------

async function getUserRecord(userId) {
  if (!userId) return null;
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    return result.Item || null;
  } catch (error) {
    console.error('Failed to load user record:', error.message);
    return null;
  }
}

/**
 * Resolve the caller from the Authorization header.
 * Returns { userId, user } — user may be null if there's no profile row yet.
 */
async function resolveCaller(event) {
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  const userId = extractUserId(authHeader);
  if (!userId) return { userId: null, user: null };
  const user = await getUserRecord(userId);
  return { userId, user };
}

/** Does the user hold any of the given roles, via profile.role or roles[]? */
function hasAnyRole(user, allowed) {
  if (!user) return false;

  if (user.role && allowed.includes(String(user.role).toLowerCase())) return true;

  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some(r => {
    const name = typeof r === 'string' ? r : r?.role;
    return name && allowed.includes(String(name).toLowerCase());
  });
}

function isAdminUser(user, userId) {
  if (!user) return false;

  const email = normalizeEmail(user.email);
  if (email && ADMIN_EMAILS.includes(email)) return true;

  return hasAnyRole(user, ADMIN_ROLES);
}

function isJudgeUser(user) {
  return hasAnyRole(user, JUDGE_ROLES);
}

/**
 * Who may see every submission and score it. Judges get exactly this and no
 * more — hackathon CRUD, mentors and resources all stay behind isAdminUser.
 */
function canReviewSubmissions(user, userId) {
  return isAdminUser(user, userId) || isJudgeUser(user);
}

// ----------------------------------------------------------------------------
// Data access helpers
// ----------------------------------------------------------------------------

async function fetchHackathon(id) {
  const result = await docClient.send(new GetCommand({
    TableName: HACKATHONS_TABLE,
    Key: { id },
  }));
  return result.Item || null;
}

async function fetchTeam(teamId) {
  const result = await docClient.send(new GetCommand({
    TableName: TEAMS_TABLE,
    Key: { id: teamId },
  }));
  return result.Item || null;
}

async function fetchTeamsByHackathon(hackathonId) {
  const result = await docClient.send(new QueryCommand({
    TableName: TEAMS_TABLE,
    IndexName: 'hackathonId-index',
    KeyConditionExpression: 'hackathonId = :h',
    ExpressionAttributeValues: { ':h': hackathonId },
  }));
  return result.Items || [];
}

async function fetchTeamByJoinCode(hackathonId, joinCode) {
  const result = await docClient.send(new QueryCommand({
    TableName: TEAMS_TABLE,
    IndexName: 'joinCode-index',
    KeyConditionExpression: 'joinCode = :c',
    ExpressionAttributeValues: { ':c': joinCode },
  }));
  return (result.Items || []).find(t => t.hackathonId === hackathonId) || null;
}

async function putTeam(team) {
  const next = { ...team, updatedAt: nowIso() };
  await docClient.send(new PutCommand({ TableName: TEAMS_TABLE, Item: next }));
  return next;
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: USERS_TABLE,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :e',
      ExpressionAttributeValues: { ':e': normalized },
      Limit: 1,
    }));
    return (result.Items || [])[0] || null;
  } catch (error) {
    console.error('email lookup failed:', error.message);
    return null;
  }
}

/** The team the user already belongs to in this hackathon, if any. */
async function findExistingMembership(hackathonId, userId) {
  const teams = await fetchTeamsByHackathon(hackathonId);
  return teams.find(t => (t.members || []).some(m => m.userId === userId)) || null;
}

// ----------------------------------------------------------------------------
// Router
// ----------------------------------------------------------------------------

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify({
    method: event.httpMethod,
    path: event.path,
    query: event.queryStringParameters,
  }));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // The `await` here is load-bearing: `return dispatch(event)` would hand the
  // pending promise back to the caller, so a rejection inside any handler would
  // escape the catch below and surface as an unhandled rejection instead of a 500.
  try {
    return await dispatch(event);
  } catch (error) {
    console.error('Unhandled error:', error);
    return createResponse(500, { error: 'Internal server error', message: error.message });
  }
};

async function dispatch(event) {
  const method = event.httpMethod;
  const rawPath = event.path || event.requestContext?.path || '';

    const parts = rawPath.split('/').filter(Boolean);
    const stageIndex = parts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const route = parts.slice(stageIndex >= 0 ? stageIndex + 1 : 0);

    // route[0] is always 'hackathons'
    if (route[0] !== 'hackathons') {
      return createResponse(404, { error: 'Not found' });
    }

    const id = route[1];
    const section = route[2];
    const sectionId = route[3];
    const subAction = route[4];

    // --- Collection level -------------------------------------------------
    if (!id) {
      if (method === 'GET') return listHackathons(event);
      if (method === 'POST') return createHackathon(event);
      return createResponse(405, { error: `Method ${method} not allowed on /hackathons` });
    }

    // --- Single hackathon -------------------------------------------------
    if (!section) {
      if (method === 'GET') return getHackathonById(id, event);
      if (method === 'PUT') return updateHackathon(id, event);
      if (method === 'DELETE') return deleteHackathon(id, event);
      return createResponse(405, { error: `Method ${method} not allowed` });
    }

    if (section === 'register' && method === 'POST') {
      return registerForHackathon(id, event);
    }

    // --- Resources --------------------------------------------------------
    if (section === 'resources') {
      if (!sectionId && method === 'POST') return addResource(id, event);
      if (sectionId && method === 'PUT') return updateResource(id, sectionId, event);
      if (sectionId && method === 'DELETE') return deleteResource(id, sectionId, event);
      return createResponse(405, { error: `Method ${method} not allowed on resources` });
    }

    // --- Hackathon-level mentors (pool + individual assignment) -----------
    if (section === 'mentors') {
      if (method === 'POST') return addMentor(id, event);
      if (method === 'DELETE') return removeMentor(id, event);
      return createResponse(405, { error: `Method ${method} not allowed on mentors` });
    }

    // --- Teams ------------------------------------------------------------
    if (section === 'teams') {
      if (!sectionId) {
        if (method === 'GET') return listTeams(id, event);
        if (method === 'POST') return createTeam(id, event);
        return createResponse(405, { error: `Method ${method} not allowed on teams` });
      }

      // /teams/join is a literal, checked before treating the segment as an id
      if (sectionId === 'join' && method === 'POST') {
        return joinTeamByCode(id, event);
      }

      const teamId = sectionId;

      if (!subAction) {
        if (method === 'GET') return getTeamById(teamId, event);
        if (method === 'PUT') return updateTeam(id, teamId, event);
        if (method === 'DELETE') return deleteTeam(id, teamId, event);
        return createResponse(405, { error: `Method ${method} not allowed on team` });
      }

      if (subAction === 'members' && method === 'DELETE') {
        return removeMemberOrLeave(id, teamId, event);
      }

      if (subAction === 'invites') {
        const inviteAction = route[5];
        if (inviteAction === 'respond' && method === 'POST') {
          return respondToInvite(id, teamId, event);
        }
        if (method === 'POST') return inviteToTeam(id, teamId, event);
        if (method === 'DELETE') return revokeInvite(id, teamId, event);
        return createResponse(405, { error: `Method ${method} not allowed on invites` });
      }

      if (subAction === 'requests') {
        const requestId = route[5];
        if (requestId && method === 'POST') {
          return respondToJoinRequest(id, teamId, requestId, event);
        }
        if (!requestId && method === 'POST') return requestToJoinTeam(id, teamId, event);
        return createResponse(405, { error: `Method ${method} not allowed on requests` });
      }

      if (subAction === 'mentors') {
        if (method === 'POST') return assignTeamMentor(id, teamId, event);
        if (method === 'DELETE') return removeTeamMentor(id, teamId, event);
        return createResponse(405, { error: `Method ${method} not allowed on team mentors` });
      }

      return createResponse(404, { error: 'Not found' });
    }

    // --- Submissions ------------------------------------------------------
    if (section === 'submissions') {
      if (!sectionId) {
        if (method === 'GET') return listSubmissions(id, event);
        if (method === 'POST') return submitWork(id, event);
        return createResponse(405, { error: `Method ${method} not allowed on submissions` });
      }
      if (method === 'PUT') return reviewSubmission(id, sectionId, event);
      if (method === 'DELETE') return deleteSubmission(id, sectionId, event);
      return createResponse(405, { error: `Method ${method} not allowed on submission` });
    }

  console.log('Route not matched:', { method, route });
  return createResponse(404, { error: 'Not found' });
}

// ----------------------------------------------------------------------------
// Hackathon handlers
// ----------------------------------------------------------------------------

const DEFAULT_TEAM_CONFIG = {
  minSize: 1,
  maxSize: 4,
  joinPolicy: 'request',
  allowIndividuals: true,
  allowMentorRequests: true,
};

function normalizeTeamConfig(input) {
  const cfg = { ...DEFAULT_TEAM_CONFIG, ...(input || {}) };
  const minSize = Math.max(1, Number(cfg.minSize) || 1);
  const maxSize = Math.max(minSize, Number(cfg.maxSize) || minSize);
  const joinPolicy = ['invite_only', 'request', 'open'].includes(cfg.joinPolicy)
    ? cfg.joinPolicy
    : 'request';

  return {
    minSize,
    maxSize,
    joinPolicy,
    allowIndividuals: cfg.allowIndividuals !== false,
    allowMentorRequests: cfg.allowMentorRequests !== false,
    // Opt-in, unlike the others: defaults to false so joining stays frictionless.
    requireMemberProfile: cfg.requireMemberProfile === true,
  };
}

// ----------------------------------------------------------------------------
// Member profiles (experience level + skills)
//
// Captured on every join path so team browsing can show what a team already has
// and what it still needs. Stored on the TeamMember (and on the join request, so
// an approval carries the details across without asking again).
// ----------------------------------------------------------------------------

const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'];
const MAX_SKILLS_PER_MEMBER = 12;
const MAX_SKILL_LENGTH = 40;
const MAX_NOTE_LENGTH = 280;

/**
 * Clean a client-supplied skill list: trim, drop empties, de-duplicate
 * case-insensitively (so "React" and "react" collapse), and cap the count.
 *
 * Values are NOT restricted to hackathon.skillOptions — free entry is allowed by
 * design — but they are length-capped so a skill chip can't hold an essay.
 */
function sanitizeSkills(input) {
  const list = Array.isArray(input) ? input : (typeof input === 'string' ? input.split(',') : []);
  const seen = new Set();
  const out = [];

  for (const raw of list) {
    const skill = String(raw ?? '').trim().slice(0, MAX_SKILL_LENGTH);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS_PER_MEMBER) break;
  }

  return out;
}

/** The hackathon-level skill vocabulary. Same cleaning, a larger cap. */
function sanitizeSkillOptions(input) {
  const list = Array.isArray(input) ? input : (typeof input === 'string' ? input.split(',') : []);
  const seen = new Set();
  const out = [];

  for (const raw of list) {
    const skill = String(raw ?? '').trim().slice(0, MAX_SKILL_LENGTH);
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= 60) break;
  }

  return out;
}

/** Extract the self-declared profile fields from a request body. */
function sanitizeMemberProfile(body = {}) {
  const level = String(body.experienceLevel ?? '').trim().toLowerCase();
  const skills = sanitizeSkills(body.skills);
  const note = String(body.note ?? '').trim().slice(0, MAX_NOTE_LENGTH);

  return {
    experienceLevel: EXPERIENCE_LEVELS.includes(level) ? level : undefined,
    skills: skills.length > 0 ? skills : undefined,
    note: note || undefined,
  };
}

/**
 * Enforce the organiser's requireMemberProfile toggle. Returns an error response
 * or null. Applies to every join path so it can't be bypassed by picking a
 * different route onto the team.
 */
function memberProfileGate(config, profile) {
  if (!config.requireMemberProfile) return null;

  if (!profile.experienceLevel) {
    return createResponse(400, {
      error: 'This hackathon asks for your experience level before joining a team',
    });
  }
  if (!profile.skills || profile.skills.length === 0) {
    return createResponse(400, {
      error: 'This hackathon asks for at least one skill before joining a team',
    });
  }
  return null;
}

function deriveStatus(startDate, endDate, explicit) {
  if (explicit) return explicit;
  const today = todayStr();
  if (today < String(startDate)) return 'upcoming';
  if (today > String(endDate)) return 'completed';
  return 'active';
}

/**
 * Effective status for reads.
 *
 * The stored `status` is organiser-controlled, but 'upcoming' and 'active' are
 * really date facts. Without this, a hackathon whose end date has passed stays
 * 'active' forever unless an organiser edits it — which in turn keeps the
 * approved-work showcase in listSubmissions permanently shut. Explicit
 * organiser-only states (draft, registration, judging) are never overridden.
 */
function effectiveStatus(hackathon) {
  const stored = hackathon?.status;
  if (['draft', 'registration', 'judging', 'completed'].includes(stored)) return stored;
  if (!hackathon?.startDate || !hackathon?.endDate) return stored;
  return deriveStatus(hackathon.startDate, hackathon.endDate, null);
}

/** Whether team formation / registration is still open. Mirrors the client helper. */
function registrationOpen(hackathon) {
  const status = effectiveStatus(hackathon);
  if (status === 'draft' || status === 'judging' || status === 'completed') return false;

  const deadline = hackathon.registrationDeadline || hackathon.startDate;
  if (!deadline) return true;
  return isTodayOnOrBefore(deadline);
}

/**
 * Guard for the four team-formation entry points. These were previously gated
 * only in the browser, so a direct API call could form or join a team after the
 * deadline, or join a hackathon still in draft.
 */
function registrationGate(hackathon) {
  if (effectiveStatus(hackathon) === 'draft') {
    return createResponse(403, { error: 'This hackathon is not open yet' });
  }
  if (!registrationOpen(hackathon)) {
    return createResponse(403, {
      error: `Team formation closed on ${hackathon.registrationDeadline || hackathon.startDate}`,
    });
  }
  return null;
}

async function listHackathons(event) {
  const query = event.queryStringParameters || {};

  let items;
  if (query.sprintId) {
    const result = await docClient.send(new QueryCommand({
      TableName: HACKATHONS_TABLE,
      IndexName: 'sprintId-index',
      KeyConditionExpression: 'sprintId = :s',
      ExpressionAttributeValues: { ':s': query.sprintId },
    }));
    items = result.Items || [];
  } else if (query.status) {
    const result = await docClient.send(new QueryCommand({
      TableName: HACKATHONS_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': query.status },
    }));
    items = result.Items || [];
  } else {
    const result = await docClient.send(new ScanCommand({ TableName: HACKATHONS_TABLE }));
    items = result.Items || [];
  }

  // Drafts are unpublished: titles, prizes and rules must not be readable by
  // members just because the page hides them client-side.
  const { userId, user } = await resolveCaller(event);
  if (!isAdminUser(user, userId)) {
    items = items.filter(h => h.status !== 'draft');
  }

  // Newest first
  items.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));

  const admin = isAdminUser(user, userId);
  return createResponse(200, {
    hackathons: items.map(h => sanitizeHackathonForViewer(
      { ...h, status: effectiveStatus(h) },
      { userId, isAdmin: admin },
    )),
  });
}

async function getHackathonById(id, event) {
  const hackathon = await fetchHackathon(id);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const { userId, user } = await resolveCaller(event);
  if (hackathon.status === 'draft' && !isAdminUser(user, userId)) {
    // Same response as a genuinely missing hackathon, so drafts aren't
    // discoverable by probing ids.
    return createResponse(404, { error: 'Hackathon not found' });
  }

  // Counts are derived rather than stored, so they can't drift.
  const teams = await fetchTeamsByHackathon(id);
  const submissions = await fetchSubmissionsByHackathon(id);

  return createResponse(200, {
    hackathon: sanitizeHackathonForViewer(
      {
        ...hackathon,
        status: effectiveStatus(hackathon),
        teamCount: teams.length,
        submissionCount: submissions.length,
      },
      { userId, isAdmin: isAdminUser(user, userId) },
    ),
  });
}

async function createHackathon(event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });
  if (!isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only organisers can create a hackathon' });
  }

  const body = parseBody(event);
  const { title, description, startDate, endDate } = body;

  if (!title || !description || !startDate || !endDate) {
    return createResponse(400, {
      error: 'Missing required fields: title, description, startDate, endDate',
    });
  }

  if (new Date(endDate) < new Date(startDate)) {
    return createResponse(400, { error: 'End date must be on or after start date' });
  }

  const id = genId('hack');
  const timestamp = nowIso();

  const hackathon = compact({
    id,
    title,
    theme: body.theme || '',
    description,
    richDescription: body.richDescription || undefined,
    tracks: Array.isArray(body.tracks) ? body.tracks : [],
    // Skill vocabulary offered to joiners and in the browse filter.
    skillOptions: sanitizeSkillOptions(body.skillOptions),
    rules: body.rules || undefined,
    prizes: body.prizes || undefined,
    startDate,
    endDate,
    registrationDeadline: body.registrationDeadline || undefined,
    submissionDeadline: body.submissionDeadline || undefined,
    status: deriveStatus(startDate, endDate, body.status),
    bannerImage: body.bannerImage || undefined,
    chatUrl: isValidUrl(body.chatUrl) ? String(body.chatUrl).trim() : undefined,
    sprintId: body.sprintId || undefined,
    teamConfig: normalizeTeamConfig(body.teamConfig),
    mentors: (Array.isArray(body.mentors) ? body.mentors : [])
      .map(sanitizeMentor)
      .filter(Boolean),
    // Resources can be supplied up front at create time, so an organiser doesn't
    // have to save the hackathon first and then come back to add them.
    resources: normalizeResources(body.resources, userId),
    submissionFormConfig: body.submissionFormConfig || [],
    registeredUsers: [],
    individualMentors: {},
    participants: 0,
    createdAt: timestamp,
    createdBy: userId,
    updatedAt: timestamp,
  });

  await docClient.send(new PutCommand({ TableName: HACKATHONS_TABLE, Item: hackathon }));
  return createResponse(201, { hackathon });
}

async function updateHackathon(id, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });
  if (!isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only organisers can update a hackathon' });
  }

  const existing = await fetchHackathon(id);
  if (!existing) return createResponse(404, { error: 'Hackathon not found' });

  const body = parseBody(event);

  // Allow-list, mirroring the pattern in sprints-crud updateSprint. Anything
  // not listed here is ignored rather than silently written.
  const allowedFields = [
    'title', 'theme', 'description', 'richDescription', 'tracks', 'skillOptions',
    'rules', 'prizes',
    'startDate', 'endDate', 'registrationDeadline', 'submissionDeadline', 'status',
    'bannerImage', 'sprintId', 'submissionFormConfig', 'mentors', 'resources',
  ];

  const setExpressions = [];
  const names = {};
  const values = {};

  allowedFields.forEach(field => {
    if (body[field] === undefined) return;
    setExpressions.push(`#${field} = :${field}`);
    names[`#${field}`] = field;
    values[`:${field}`] = body[field];
  });

  if (body.teamConfig !== undefined) {
    setExpressions.push('#teamConfig = :teamConfig');
    names['#teamConfig'] = 'teamConfig';
    values[':teamConfig'] = normalizeTeamConfig({ ...existing.teamConfig, ...body.teamConfig });
  }

  // Re-derive ids/timestamps server-side rather than trusting the client copy.
  if (body.resources !== undefined) {
    values[':resources'] = normalizeResources(body.resources, userId);
  }

  // De-duplicated and length-capped, same treatment as member skills.
  if (body.skillOptions !== undefined) {
    values[':skillOptions'] = sanitizeSkillOptions(body.skillOptions);
  }

  // Validated rather than passed straight through, and clearable by sending ''.
  if (body.chatUrl !== undefined) {
    const trimmed = String(body.chatUrl || '').trim();
    if (trimmed && !isValidUrl(trimmed)) {
      return createResponse(400, { error: 'Chat link must be a valid http(s) URL' });
    }
    setExpressions.push('#chatUrl = :chatUrl');
    names['#chatUrl'] = 'chatUrl';
    values[':chatUrl'] = trimmed || null;
  }

  if (setExpressions.length === 0) {
    return createResponse(400, { error: 'No updatable fields supplied' });
  }

  setExpressions.push('#updatedAt = :updatedAt');
  names['#updatedAt'] = 'updatedAt';
  values[':updatedAt'] = nowIso();

  await docClient.send(new UpdateCommand({
    TableName: HACKATHONS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${setExpressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));

  const hackathon = await fetchHackathon(id);
  return createResponse(200, { hackathon });
}

async function deleteHackathon(id, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });
  if (!isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only organisers can delete a hackathon' });
  }

  const existing = await fetchHackathon(id);
  if (!existing) return createResponse(404, { error: 'Hackathon not found' });

  // Clear child records so no orphans are left behind.
  const teams = await fetchTeamsByHackathon(id);
  await Promise.all(teams.map(team => docClient.send(new DeleteCommand({
    TableName: TEAMS_TABLE,
    Key: { id: team.id },
  }))));

  // Reverse awarded points before removing the submissions, so deleting a
  // hackathon doesn't leave its awards stranded on member profiles.
  const submissions = await fetchSubmissionsByHackathon(id);
  for (const sub of submissions) {
    await reconcileSubmissionPoints(sub, {
      status: 'rejected',
      points: 0,
      reviewedBy: userId,
      hackathonTitle: existing.title || id,
    });
    await docClient.send(new DeleteCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: sub.id } }));
  }

  // Clear the linkage on any meetups pointing here, so they don't keep a
  // reference to a hackathon that no longer exists.
  let unlinkedMeetups = 0;
  try {
    const linked = await docClient.send(new ScanCommand({
      TableName: MEETUPS_TABLE,
      FilterExpression: 'hackathonId = :h',
      ExpressionAttributeValues: { ':h': id },
      ProjectionExpression: 'id',
    }));

    await Promise.all((linked.Items || []).map(meetup => docClient.send(new UpdateCommand({
      TableName: MEETUPS_TABLE,
      Key: { id: meetup.id },
      UpdateExpression: 'REMOVE hackathonId SET updatedAt = :u',
      ExpressionAttributeValues: { ':u': nowIso() },
    }))));

    unlinkedMeetups = (linked.Items || []).length;
  } catch (error) {
    // Non-fatal: the hackathon still goes away, and a stale id on a meetup only
    // means the linkage renders as nothing.
    console.error('Failed to clear meetup linkage:', error.message);
  }

  await docClient.send(new DeleteCommand({ TableName: HACKATHONS_TABLE, Key: { id } }));

  return createResponse(200, {
    message: 'Hackathon deleted',
    id,
    deletedTeams: teams.length,
    deletedSubmissions: submissions.length,
    unlinkedMeetups,
  });
}

async function registerForHackathon(id, event) {
  const { userId: callerId } = await resolveCaller(event);
  if (!callerId) return createResponse(401, { error: 'Authentication required' });

  const hackathon = await fetchHackathon(id);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const gate = registrationGate(hackathon);
  if (gate) return gate;

  const registered = hackathon.registeredUsers || [];
  if (registered.includes(callerId)) {
    // Still attempt the sprint mirror. Anyone who registered before the mirroring
    // existed would otherwise never be added to the linked sprint, and this makes
    // the endpoint self-healing rather than needing a one-off backfill script.
    if (hackathon.sprintId) await mirrorRegistrationToSprint(hackathon.sprintId, callerId);
    return createResponse(200, { hackathon, alreadyRegistered: true });
  }

  await registerParticipant(id, callerId);

  const fresh = await fetchHackathon(id);
  return createResponse(200, {
    // Now registered, so this response is where they first receive chatUrl.
    hackathon: sanitizeHackathonForViewer(
      { ...fresh, status: effectiveStatus(fresh) },
      { userId: callerId, isAdmin: false },
    ),
    message: 'Registered for hackathon',
  });
}

// ----------------------------------------------------------------------------
// Resource handlers
// ----------------------------------------------------------------------------

const RESOURCE_TYPES = ['doc', 'video', 'repo', 'slides', 'dataset', 'workshop', 'link'];

/**
 * Normalise a client-supplied resources array. Used by createHackathon (and by
 * updateHackathon via the allow-list) so ids and timestamps are always assigned
 * server-side rather than trusted from the client.
 */
function normalizeResources(input, addedBy) {
  if (!Array.isArray(input)) return [];

  return input
    .filter(r => r && r.title && r.url && isValidUrl(r.url))
    .map(r => compact({
      id: r.id || genId('res'),
      title: String(r.title),
      description: r.description || undefined,
      type: RESOURCE_TYPES.includes(r.type) ? r.type : 'link',
      url: String(r.url),
      registeredOnly: r.registeredOnly === true,
      category: r.category || undefined,
      addedAt: r.addedAt || nowIso(),
      addedBy: r.addedBy || addedBy || undefined,
    }));
}

async function requireAdminOn(id, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return { error: createResponse(401, { error: 'Authentication required' }) };
  if (!isAdminUser(user, userId)) {
    return { error: createResponse(403, { error: 'Organiser access required' }) };
  }
  const hackathon = await fetchHackathon(id);
  if (!hackathon) return { error: createResponse(404, { error: 'Hackathon not found' }) };
  return { userId, user, hackathon };
}

async function saveResources(id, resources) {
  await docClient.send(new UpdateCommand({
    TableName: HACKATHONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET #r = :r, updatedAt = :u',
    ExpressionAttributeNames: { '#r': 'resources' },
    ExpressionAttributeValues: { ':r': resources, ':u': nowIso() },
  }));
}

async function addResource(id, event) {
  const ctx = await requireAdminOn(id, event);
  if (ctx.error) return ctx.error;

  const body = parseBody(event);
  if (!body.title || !body.url) {
    return createResponse(400, { error: 'Resource requires a title and a url' });
  }
  if (!isValidUrl(body.url)) {
    return createResponse(400, { error: 'Resource url must be a valid http(s) URL' });
  }

  const resource = compact({
    id: genId('res'),
    title: body.title,
    description: body.description || undefined,
    type: RESOURCE_TYPES.includes(body.type) ? body.type : 'link',
    url: body.url,
    registeredOnly: body.registeredOnly === true,
    category: body.category || undefined,
    addedAt: nowIso(),
    addedBy: ctx.userId,
  });

  const resources = [...(ctx.hackathon.resources || []), resource];
  await saveResources(id, resources);

  return createResponse(201, { hackathon: { ...ctx.hackathon, resources } });
}

async function updateResource(id, resourceId, event) {
  const ctx = await requireAdminOn(id, event);
  if (ctx.error) return ctx.error;

  const body = parseBody(event);
  const resources = ctx.hackathon.resources || [];
  const index = resources.findIndex(r => r.id === resourceId);
  if (index === -1) return createResponse(404, { error: 'Resource not found' });

  if (body.url !== undefined && !isValidUrl(body.url)) {
    return createResponse(400, { error: 'Resource url must be a valid http(s) URL' });
  }

  const updated = compact({
    ...resources[index],
    title: body.title !== undefined ? body.title : resources[index].title,
    description: body.description !== undefined ? body.description : resources[index].description,
    type: body.type !== undefined && RESOURCE_TYPES.includes(body.type) ? body.type : resources[index].type,
    url: body.url !== undefined ? body.url : resources[index].url,
    registeredOnly: body.registeredOnly !== undefined ? body.registeredOnly === true : resources[index].registeredOnly,
    category: body.category !== undefined ? body.category : resources[index].category,
  });

  const next = [...resources];
  next[index] = updated;
  await saveResources(id, next);

  return createResponse(200, { hackathon: { ...ctx.hackathon, resources: next } });
}

async function deleteResource(id, resourceId, event) {
  const ctx = await requireAdminOn(id, event);
  if (ctx.error) return ctx.error;

  const resources = ctx.hackathon.resources || [];
  const next = resources.filter(r => r.id !== resourceId);
  if (next.length === resources.length) {
    return createResponse(404, { error: 'Resource not found' });
  }

  await saveResources(id, next);
  return createResponse(200, { hackathon: { ...ctx.hackathon, resources: next } });
}

// ----------------------------------------------------------------------------
// Mentor handlers (hackathon pool + individual assignment)
// ----------------------------------------------------------------------------

function sanitizeMentor(input) {
  if (!input || !input.name) return null;
  return compact({
    userId: input.userId || undefined,
    name: input.name,
    email: input.email ? normalizeEmail(input.email) : undefined,
    photo: input.photo || undefined,
    designation: input.designation || undefined,
    company: input.company || undefined,
    linkedIn: input.linkedIn || undefined,
    expertise: Array.isArray(input.expertise) ? input.expertise : undefined,
  });
}

/** Stable key for a mentor: userId when present, else the email. */
function mentorKey(mentor) {
  return mentor?.userId || normalizeEmail(mentor?.email) || null;
}

/** Drop a mentor's email while keeping everything a browser needs to display. */
function stripMentorContact(mentor) {
  if (!mentor) return mentor;
  const { email, ...rest } = mentor;
  return rest;
}

/**
 * Project a hackathon down to what the caller may see.
 *
 * Three things here are not public:
 *   - mentor emails in the pool (volunteers; contact belongs to their teams)
 *   - individualMentors, which is a map of EVERY solo participant's assignment.
 *     Returning it whole told each participant who mentors everyone else.
 *   - chatUrl, since a WhatsApp/Discord invite link is effectively a password.
 */
function sanitizeHackathonForViewer(hackathon, { userId, isAdmin }) {
  if (!hackathon) return hackathon;
  if (isAdmin) return hackathon;

  const registered = !!userId && (hackathon.registeredUsers || []).includes(userId);
  const ownMentor = userId ? (hackathon.individualMentors || {})[userId] : undefined;

  const next = {
    ...hackathon,
    mentors: (hackathon.mentors || []).map(stripMentorContact),
    // Only the caller's own assignment, and without the email — mentors are
    // reachable via LinkedIn, not by handing their inbox to participants.
    individualMentors: ownMentor ? { [userId]: stripMentorContact(ownMentor) } : {},
  };

  if (!registered) delete next.chatUrl;

  return next;
}

async function addMentor(id, event) {
  const ctx = await requireAdminOn(id, event);
  if (ctx.error) return ctx.error;

  const body = parseBody(event);
  const mentor = sanitizeMentor(body.mentor);
  if (!mentor) return createResponse(400, { error: 'Mentor requires at least a name' });

  const scope = body.scope === 'individual' ? 'individual' : 'pool';

  if (scope === 'individual') {
    const participantUserId = body.participantUserId;
    if (!participantUserId) {
      return createResponse(400, { error: 'participantUserId is required for individual mentors' });
    }

    const individualMentors = { ...(ctx.hackathon.individualMentors || {}) };
    individualMentors[participantUserId] = mentor;

    await docClient.send(new UpdateCommand({
      TableName: HACKATHONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET individualMentors = :m, updatedAt = :u',
      ExpressionAttributeValues: { ':m': individualMentors, ':u': nowIso() },
    }));

    return createResponse(200, { hackathon: { ...ctx.hackathon, individualMentors } });
  }

  const mentors = ctx.hackathon.mentors || [];
  const key = mentorKey(mentor);
  if (key && mentors.some(m => mentorKey(m) === key)) {
    return createResponse(409, { error: 'That mentor is already in the pool' });
  }

  const next = [...mentors, mentor];
  await docClient.send(new UpdateCommand({
    TableName: HACKATHONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET mentors = :m, updatedAt = :u',
    ExpressionAttributeValues: { ':m': next, ':u': nowIso() },
  }));

  return createResponse(200, { hackathon: { ...ctx.hackathon, mentors: next } });
}

async function removeMentor(id, event) {
  const ctx = await requireAdminOn(id, event);
  if (ctx.error) return ctx.error;

  const body = parseBody(event);
  const scope = body.scope === 'individual' ? 'individual' : 'pool';

  if (scope === 'individual') {
    const participantUserId = body.participantUserId;
    if (!participantUserId) {
      return createResponse(400, { error: 'participantUserId is required' });
    }
    const individualMentors = { ...(ctx.hackathon.individualMentors || {}) };
    delete individualMentors[participantUserId];

    await docClient.send(new UpdateCommand({
      TableName: HACKATHONS_TABLE,
      Key: { id },
      UpdateExpression: 'SET individualMentors = :m, updatedAt = :u',
      ExpressionAttributeValues: { ':m': individualMentors, ':u': nowIso() },
    }));

    return createResponse(200, { hackathon: { ...ctx.hackathon, individualMentors } });
  }

  const mentorUserId = body.mentorUserId;
  if (!mentorUserId) return createResponse(400, { error: 'mentorUserId is required' });

  const mentors = ctx.hackathon.mentors || [];
  const next = mentors.filter(m => mentorKey(m) !== mentorUserId && m.userId !== mentorUserId);

  if (next.length === mentors.length) {
    return createResponse(404, { error: 'That mentor is not in the pool' });
  }

  await docClient.send(new UpdateCommand({
    TableName: HACKATHONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET mentors = :m, updatedAt = :u',
    ExpressionAttributeValues: { ':m': next, ':u': nowIso() },
  }));

  return createResponse(200, { hackathon: { ...ctx.hackathon, mentors: next } });
}

async function assignTeamMentor(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const admin = isAdminUser(user, userId);
  const lead = team.leadUserId === userId;

  // Normalised, so a hackathon row saved without teamConfig doesn't block leads
  // here while the default (allowed) applies everywhere else.
  const config = normalizeTeamConfig(hackathon.teamConfig);

  // Leads may self-serve a mentor only when the organiser enabled it.
  if (!admin && !(lead && config.allowMentorRequests)) {
    return createResponse(403, { error: 'Not allowed to assign a mentor to this team' });
  }

  const mentor = sanitizeMentor(parseBody(event).mentor);
  if (!mentor) return createResponse(400, { error: 'Mentor requires at least a name' });

  // Non-admins can only pick someone already in the hackathon's mentor pool.
  if (!admin) {
    const pool = hackathon.mentors || [];
    const key = mentorKey(mentor);
    if (!key || !pool.some(m => mentorKey(m) === key)) {
      return createResponse(400, { error: 'Pick a mentor from the hackathon mentor pool' });
    }
  }

  const mentors = team.mentors || [];
  const key = mentorKey(mentor);
  if (key && mentors.some(m => mentorKey(m) === key)) {
    return createResponse(409, { error: 'That mentor is already assigned to this team' });
  }

  const updated = await putTeam({ ...team, mentors: [...mentors, mentor] });

  // Only the newly assigned mentor hears about this. Mentors already on the team
  // don't need a mail every time a co-mentor is added.
  await notifyTeamMentors(hackathon, updated, {
    only: mentor,
    heading: `You're mentoring ${updated.name}`,
    subject: `You're mentoring "${updated.name}" — ${hackathon.title}`,
    bodyHtml: `<p style="margin:0 0 16px;">You've been assigned as a mentor to <strong>${escapeBasic(updated.name)}</strong> for ${escapeBasic(hackathon.title)}.</p>`
      + (updated.projectName
        ? `<p style="margin:0 0 16px;">They're working on <strong>${escapeBasic(updated.projectName)}</strong>.</p>`
        : '')
      + ((updated.lookingForSkills || []).length > 0
        ? `<p style="margin:0 0 16px;">Skills they're still looking for: ${escapeBasic(updated.lookingForSkills.join(', '))}</p>`
        : ''),
  });

  return createResponse(200, { team: updated });
}

async function removeTeamMentor(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  if (!isAdminUser(user, userId) && team.leadUserId !== userId) {
    return createResponse(403, { error: 'Only the team lead or an organiser can do that' });
  }

  const { mentorUserId } = parseBody(event);
  if (!mentorUserId) return createResponse(400, { error: 'mentorUserId is required' });

  const mentors = (team.mentors || []).filter(
    m => mentorKey(m) !== mentorUserId && m.userId !== mentorUserId,
  );

  const updated = await putTeam({ ...team, mentors });
  return createResponse(200, { team: updated });
}

// ----------------------------------------------------------------------------
// Team handlers
// ----------------------------------------------------------------------------

/**
 * Project a team item down to what the viewer is allowed to see.
 *
 * A stored team nests single-use invite tokens, invitee emails, member emails
 * and join-request emails. None of that may go to arbitrary callers: the API
 * Gateway methods are authorization="NONE", so this is the only gate. Invite
 * tokens are never needed client-side at all — the invitee gets theirs by email.
 */
function sanitizeTeamForViewer(team, { userId, isAdmin }) {
  const isLead = !!userId && team.leadUserId === userId;
  const isMember = !!userId && (team.members || []).some(m => m.userId === userId);
  const privileged = isAdmin || isLead;

  return {
    ...team,
    // Mentors are volunteers, so their email never leaves the server for anyone
    // but an organiser — not even to the team they mentor. LinkedIn is the
    // contact route: it's a public profile by nature and the mentor controls who
    // gets through. Organisers keep the email because they administer the pool,
    // and mentorKey() falls back to it when a mentor has no userId.
    mentors: (team.mentors || []).map(mentor => (
      isAdmin ? mentor : stripMentorContact(mentor)
    )),
    members: (team.members || []).map(member => (
      privileged || isMember
        ? member
        // Emails are private. Everything else is deliberately public: skills and
        // experience exist precisely so people browsing teams can judge fit, so
        // stripping them here would defeat the feature.
        : {
          userId: member.userId,
          name: member.name,
          avatar: member.avatar,
          role: member.role,
          joinedAt: member.joinedAt,
          designation: member.designation,
          company: member.company,
          experienceLevel: member.experienceLevel,
          skills: member.skills,
          note: member.note,
        }
    )),
    // Leads and organisers see who's been invited, minus the token. Nobody else
    // sees the invite list at all.
    invites: privileged
      ? (team.invites || []).map(({ token, ...rest }) => rest)
      : [],
    // Leads and organisers see the queue. Everyone else sees only their own
    // request, which is what drives the "Requested" button state.
    joinRequests: privileged
      ? (team.joinRequests || [])
      : (team.joinRequests || [])
        .filter(r => userId && r.userId === userId)
        .map(({ userEmail, ...rest }) => rest),
  };
}

async function listTeams(hackathonId, event) {
  const { userId, user } = await resolveCaller(event);
  const isAdmin = isAdminUser(user, userId);

  const teams = await fetchTeamsByHackathon(hackathonId);
  teams.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  return createResponse(200, {
    teams: teams.map(team => sanitizeTeamForViewer(team, { userId, isAdmin })),
  });
}

async function getTeamById(teamId, event) {
  const team = await fetchTeam(teamId);
  if (!team) return createResponse(404, { error: 'Team not found' });

  const { userId, user } = await resolveCaller(event);
  return createResponse(200, {
    team: sanitizeTeamForViewer(team, { userId, isAdmin: isAdminUser(user, userId) }),
  });
}

async function createTeam(hackathonId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const gate = registrationGate(hackathon);
  if (gate) return gate;

  const body = parseBody(event);
  if (!body.name || !String(body.name).trim()) {
    return createResponse(400, { error: 'Team name is required' });
  }

  const profile = sanitizeMemberProfile(body);
  const profileGate = memberProfileGate(normalizeTeamConfig(hackathon.teamConfig), profile);
  if (profileGate) return profileGate;

  const existing = await findExistingMembership(hackathonId, userId);
  if (existing) {
    return createResponse(409, {
      error: `You are already on team "${existing.name}". Leave it before creating another.`,
    });
  }

  const teams = await fetchTeamsByHackathon(hackathonId);
  const desiredName = String(body.name).trim();
  if (teams.some(t => t.name.toLowerCase() === desiredName.toLowerCase())) {
    return createResponse(409, { error: 'A team with that name already exists' });
  }

  // Retry on the (unlikely) chance of a join-code collision.
  let joinCode = genJoinCode();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await fetchTeamByJoinCode(hackathonId, joinCode);
    if (!clash) break;
    joinCode = genJoinCode();
  }

  const timestamp = nowIso();
  const team = compact({
    id: genId('team'),
    hackathonId,
    name: desiredName,
    description: body.description || undefined,
    joinCode,
    leadUserId: userId,
    members: [compact({
      userId,
      name: body.userName || user?.name || 'Unknown',
      email: normalizeEmail(body.userEmail || user?.email) || undefined,
      avatar: body.userAvatar || user?.avatar || undefined,
      role: 'lead',
      joinedAt: timestamp,
      // Denormalised from the profile so rosters can show context without a join.
      designation: user?.designation || undefined,
      company: user?.company || undefined,
      ...profile,
    })],
    invites: [],
    joinRequests: [],
    mentors: [],
    projectName: body.projectName || undefined,
    track: body.track || undefined,
    lookingForMembers: body.lookingForMembers !== false,
    lookingForSkills: sanitizeSkills(body.lookingForSkills),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await docClient.send(new PutCommand({ TableName: TEAMS_TABLE, Item: team }));

  // Creating a team implies participating.
  await registerParticipant(hackathonId, userId);

  return createResponse(201, { team });
}

async function updateTeam(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  if (team.leadUserId !== userId && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only the team lead can edit the team' });
  }

  const body = parseBody(event);
  const updated = await putTeam({
    ...team,
    name: body.name !== undefined ? String(body.name).trim() || team.name : team.name,
    description: body.description !== undefined ? body.description : team.description,
    projectName: body.projectName !== undefined ? body.projectName : team.projectName,
    track: body.track !== undefined ? body.track : team.track,
    lookingForMembers: body.lookingForMembers !== undefined
      ? body.lookingForMembers === true
      : team.lookingForMembers,
    lookingForSkills: body.lookingForSkills !== undefined
      ? sanitizeSkills(body.lookingForSkills)
      : team.lookingForSkills,
  });

  return createResponse(200, { team: updated });
}

async function deleteTeam(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  if (team.leadUserId !== userId && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only the team lead can disband the team' });
  }

  // Remove the team's submissions along with it, reversing any points they were
  // awarded so a disbanded team doesn't leave credit behind.
  const hackathon = await fetchHackathon(hackathonId);
  const submissions = await fetchSubmissionsByHackathon(hackathonId);
  const teamSubmissions = submissions.filter(s => s.teamId === teamId);

  for (const submission of teamSubmissions) {
    await reconcileSubmissionPoints(submission, {
      status: 'rejected',
      points: 0,
      reviewedBy: userId,
      hackathonTitle: hackathon?.title || hackathonId,
    });
    await docClient.send(new DeleteCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: submission.id } }));
  }

  await docClient.send(new DeleteCommand({ TableName: TEAMS_TABLE, Key: { id: teamId } }));
  return createResponse(200, { message: 'Team disbanded', id: teamId });
}

async function joinTeamByCode(hackathonId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const gate = registrationGate(hackathon);
  if (gate) return gate;

  const body = parseBody(event);
  const joinCode = String(body.joinCode || '').trim().toUpperCase();
  if (!joinCode) return createResponse(400, { error: 'A join code is required' });

  const config = normalizeTeamConfig(hackathon.teamConfig);
  if (config.joinPolicy === 'invite_only') {
    return createResponse(403, {
      error: 'This hackathon is invite-only. Ask the team lead to email you an invite.',
    });
  }

  const profile = sanitizeMemberProfile(body);
  const profileGate = memberProfileGate(config, profile);
  if (profileGate) return profileGate;

  const team = await fetchTeamByJoinCode(hackathonId, joinCode);
  if (!team) return createResponse(404, { error: 'No team matches that join code' });

  const existing = await findExistingMembership(hackathonId, userId);
  if (existing) {
    return createResponse(409, {
      error: existing.id === team.id
        ? 'You are already on this team'
        : `You are already on team "${existing.name}"`,
    });
  }

  if ((team.members || []).length >= config.maxSize) {
    return createResponse(409, { error: 'That team is already full' });
  }

  // With the 'request' policy a code doesn't grant instant entry — it files a
  // request for the lead to approve.
  if (config.joinPolicy === 'request') {
    return fileJoinRequest(team, { userId, user, body });
  }

  const member = compact({
    userId,
    name: body.userName || user?.name || 'Unknown',
    email: normalizeEmail(body.userEmail || user?.email) || undefined,
    avatar: body.userAvatar || user?.avatar || undefined,
    role: 'member',
    joinedAt: nowIso(),
    designation: user?.designation || undefined,
    company: user?.company || undefined,
    ...profile,
  });

  const updated = await putTeam({ ...team, members: [...(team.members || []), member] });
  await ensureRegistered(hackathon, userId);
  await discardStaleSoloSubmission(hackathonId, userId);
  await notifyMemberJoined(hackathon, updated, member);

  // `joined` lets the client tell an instant join apart from a filed request —
  // both return 200 with a team, and the messages differ.
  return createResponse(200, {
    team: sanitizeTeamForViewer(updated, { userId, isAdmin: false }),
    joined: true,
    message: `You joined ${team.name}`,
  });
}

/**
 * Add a participant to registeredUsers without losing concurrent writes.
 *
 * A read-modify-write of the whole array drops entries when two people register
 * in the same window. list_append against the stored value is applied
 * server-side by DynamoDB, so concurrent appends both survive; the
 * attribute_not_contains condition keeps it idempotent.
 */
async function registerParticipant(hackathonId, userId) {
  if (!userId) return;

  let added = true;
  try {
    await docClient.send(new UpdateCommand({
      TableName: HACKATHONS_TABLE,
      Key: { id: hackathonId },
      UpdateExpression:
        'SET registeredUsers = list_append(if_not_exists(registeredUsers, :empty), :entry), updatedAt = :u',
      ConditionExpression:
        'attribute_not_exists(registeredUsers) OR NOT contains(registeredUsers, :userId)',
      ExpressionAttributeValues: {
        ':entry': [userId],
        ':empty': [],
        ':userId': userId,
        ':u': nowIso(),
      },
    }));
  } catch (error) {
    // Already registered — the condition failing is the expected no-op here.
    if (error.name !== 'ConditionalCheckFailedException') throw error;
    added = false;
  }

  const fresh = await fetchHackathon(hackathonId);
  if (!fresh) return;

  if (added) {
    // participants is a denormalised count, so re-derive it from the stored array
    // rather than incrementing a second racy counter.
    await docClient.send(new UpdateCommand({
      TableName: HACKATHONS_TABLE,
      Key: { id: hackathonId },
      UpdateExpression: 'SET participants = :p',
      ExpressionAttributeValues: { ':p': (fresh.registeredUsers || []).length },
    }));
  }

  // A hackathon running under a sprint means its participants are sprint
  // participants too, so mirror them across. Deliberately attempted even when
  // the hackathon add was a no-op, so people who registered before this existed
  // get backfilled the next time they touch the hackathon. The sprint write is
  // itself conditional, so a repeat is harmless.
  if (fresh.sprintId) {
    await mirrorRegistrationToSprint(fresh.sprintId, userId);
  }
}

/**
 * Add a hackathon participant to the sprint the hackathon belongs to.
 *
 * Uses a conditional list_append on registeredUsers rather than a
 * read-modify-write of the sprint item. That matters here: a sprint item also
 * holds sessions[] and submissions[] in the same record, so rewriting it wholesale
 * risks clobbering a submission landing at the same moment.
 *
 * Never throws — a failure here must not fail the hackathon registration.
 */
async function mirrorRegistrationToSprint(sprintId, userId) {
  try {
    await docClient.send(new UpdateCommand({
      TableName: SPRINTS_TABLE,
      Key: { id: sprintId },
      UpdateExpression:
        'SET registeredUsers = list_append(if_not_exists(registeredUsers, :empty), :entry), updatedAt = :u',
      ConditionExpression:
        'attribute_exists(id) AND (attribute_not_exists(registeredUsers) OR NOT contains(registeredUsers, :userId))',
      ExpressionAttributeValues: {
        ':entry': [userId],
        ':empty': [],
        ':userId': userId,
        ':u': nowIso(),
      },
    }));
  } catch (error) {
    // Already in the sprint, or the sprint no longer exists. Both are no-ops.
    if (error.name !== 'ConditionalCheckFailedException') {
      console.error(`Failed to mirror registration to sprint ${sprintId}:`, error.message);
    }
    return;
  }

  // Keep the sprint's denormalised count in step with the array.
  try {
    const sprint = await docClient.send(new GetCommand({
      TableName: SPRINTS_TABLE,
      Key: { id: sprintId },
    }));
    if (!sprint.Item) return;

    await docClient.send(new UpdateCommand({
      TableName: SPRINTS_TABLE,
      Key: { id: sprintId },
      UpdateExpression: 'SET participants = :p',
      ExpressionAttributeValues: { ':p': (sprint.Item.registeredUsers || []).length },
    }));
    console.log(`Mirrored ${userId} into sprint ${sprintId}`);
  } catch (error) {
    console.error(`Failed to update sprint ${sprintId} participant count:`, error.message);
  }
}

async function ensureRegistered(hackathon, userId) {
  if ((hackathon.registeredUsers || []).includes(userId)) return;
  await registerParticipant(hackathon.id, userId);
}

async function removeMemberOrLeave(hackathonId, teamId, event) {
  const { userId: callerId, user } = await resolveCaller(event);
  if (!callerId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  const body = parseBody(event);
  const targetUserId = body.action === 'leave' ? callerId : body.userId;
  if (!targetUserId) return createResponse(400, { error: 'userId is required' });

  const isSelf = targetUserId === callerId;
  const isLead = team.leadUserId === callerId;

  if (!isSelf && !isLead && !isAdminUser(user, callerId)) {
    return createResponse(403, { error: 'Only the team lead can remove members' });
  }

  const members = team.members || [];
  if (!members.some(m => m.userId === targetUserId)) {
    return createResponse(404, { error: 'That person is not on this team' });
  }

  const remaining = members.filter(m => m.userId !== targetUserId);
  const departing = members.find(m => m.userId === targetUserId);

  // Only needed for the mentor mail (hackathon title + chat link), so skip the
  // extra read entirely when the team has no mentors to notify.
  const hackathon = (team.mentors || []).length > 0
    ? await fetchHackathon(hackathonId)
    : null;

  // The lead leaving either promotes the next member or disbands the team.
  if (team.leadUserId === targetUserId) {
    if (remaining.length === 0) {
      await docClient.send(new DeleteCommand({ TableName: TEAMS_TABLE, Key: { id: teamId } }));
      // Roster is empty by definition here, so the mail carries no member list.
      await notifyMemberLeft(hackathon, { ...team, members: [] }, departing, { disbanded: true });
      return createResponse(200, { message: 'You left and the team was disbanded', id: teamId });
    }

    const promoted = remaining[0];
    const updated = await putTeam({
      ...team,
      leadUserId: promoted.userId,
      members: remaining.map(m => (
        m.userId === promoted.userId ? { ...m, role: 'lead' } : m
      )),
    });
    await notifyMemberLeft(hackathon, updated, departing, { newLeadName: promoted.name });
    return createResponse(200, {
      team: sanitizeTeamForViewer(updated, { userId: callerId, isAdmin: isAdminUser(user, callerId) }),
      message: `You left the team. ${promoted.name} is now the lead.`,
    });
  }

  const updated = await putTeam({ ...team, members: remaining });
  await notifyMemberLeft(hackathon, updated, departing);
  return createResponse(200, {
    team: sanitizeTeamForViewer(updated, { userId: callerId, isAdmin: isAdminUser(user, callerId) }),
    message: isSelf ? 'You left the team' : 'Member removed',
  });
}

// ----------------------------------------------------------------------------
// Invite handlers
// ----------------------------------------------------------------------------

function inviteLink(hackathonId, teamId, token) {
  return `${APP_URL}/hackathons/${hackathonId}?invite=${token}&team=${teamId}`;
}

async function inviteToTeam(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  // Lead-only, matching the client (which renders InvitePanel only for the lead)
  // and the documented contract. Ordinary members must not be able to invite.
  if (team.leadUserId !== userId && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only the team lead can invite people' });
  }

  const body = parseBody(event);
  const rawEmails = Array.isArray(body.emails) ? body.emails : [body.emails];
  const emails = [...new Set(rawEmails.map(normalizeEmail).filter(Boolean))];

  if (emails.length === 0) return createResponse(400, { error: 'At least one email is required' });
  if (emails.length > MAX_INVITES_PER_CALL) {
    return createResponse(400, { error: `Send at most ${MAX_INVITES_PER_CALL} invites at a time` });
  }

  const config = normalizeTeamConfig(hackathon.teamConfig);
  const invites = [...(team.invites || [])];
  const members = team.members || [];

  const invited = [];
  const skipped = [];
  const timestamp = nowIso();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 86400000).toISOString();
  const invitedByName = body.invitedByName || user?.name || 'A team lead';

  for (const email of emails) {
    if (!isValidEmail(email)) {
      skipped.push({ email, reason: 'Not a valid email address' });
      continue;
    }
    if (members.some(m => normalizeEmail(m.email) === email)) {
      skipped.push({ email, reason: 'Already on the team' });
      continue;
    }
    if (invites.some(i => normalizeEmail(i.email) === email && i.status === 'pending')) {
      skipped.push({ email, reason: 'Already invited' });
      continue;
    }

    // Count invites already outstanding, not just the ones issued in this call.
    // Otherwise repeated calls oversubscribe the team and the overflow surfaces
    // to an invitee as "team is already full" after they've followed the link.
    const outstanding = invites.filter(i => i.status === 'pending').length;
    if (members.length + outstanding >= config.maxSize) {
      skipped.push({ email, reason: 'Team is full or has that many invites outstanding' });
      continue;
    }

    const existingUser = await findUserByEmail(email);
    const token = genToken();

    invites.push(compact({
      id: genId('inv'),
      email,
      userId: existingUser?.userId || undefined,
      invitedBy: userId,
      invitedByName,
      token,
      status: 'pending',
      invitedAt: timestamp,
      expiresAt,
    }));

    const link = inviteLink(hackathonId, teamId, token);
    const noteHtml = body.message
      ? `<p style="margin:0 0 16px; padding:12px 16px; background:#f4f5f7; border-radius:8px;">${escapeBasic(body.message)}</p>`
      : '';

    // sendEmail never throws — it returns { ok }. Without checking it, a rejected
    // SES send would still be reported to the lead as "Invite sent".
    const delivery = await sendEmail({
      to: email,
      subject: `${invitedByName} invited you to join "${team.name}" for ${hackathon.title}`,
      html: renderEmail({
        heading: `You're invited to join ${team.name}`,
        bodyHtml: `
          <p style="margin:0 0 16px;">
            <strong>${escapeBasic(invitedByName)}</strong> has invited you to join the team
            <strong>${escapeBasic(team.name)}</strong> for
            <strong>${escapeBasic(hackathon.title)}</strong>.
          </p>
          ${noteHtml}
          <p style="margin:0 0 16px;">
            Accept below to join the team. This invite expires in ${INVITE_TTL_DAYS} days.
          </p>
          ${chatLinkHtml(hackathon)}
        `,
        cta: { label: 'View invite', url: link },
        footerNote: 'If you were not expecting this invite, you can safely ignore this email.',
      }),
    });

    if (delivery.ok) {
      invited.push(email);
    } else {
      // Keep the invite row: the token stays valid, so the lead can resend or
      // pass the link on manually rather than losing the invite entirely.
      skipped.push({ email, reason: `Invite saved but the email failed to send (${delivery.error || 'unknown error'})` });
    }
  }

  const updated = await putTeam({ ...team, invites });
  return createResponse(200, { team: updated, invited, skipped });
}

/**
 * Chat link paragraph for team emails.
 *
 * Joining is the moment the link is actually useful, so it rides along with the
 * invite and the approval rather than making people go hunting for it.
 */
function chatLinkHtml(hackathon) {
  if (!hackathon?.chatUrl) return '';
  return `<p style="margin:0 0 16px;">Team chat for this hackathon: <a href="${escapeBasic(hackathon.chatUrl)}">${escapeBasic(hackathon.chatUrl)}</a></p>`;
}

/**
 * The team's current roster as a short list.
 *
 * Included in every mentor email so each one is self-contained — a mentor should
 * never have to reconstruct who's on the team from a sequence of notifications.
 */
function rosterHtml(team) {
  const members = team?.members || [];
  if (members.length === 0) return '';

  const rows = members.map(m => {
    const detail = [
      m.experienceLevel || null,
      (m.skills || []).length > 0 ? m.skills.join(', ') : null,
    ].filter(Boolean).join(' · ');

    return `<li>${escapeBasic(m.name)}${m.role === 'lead' ? ' <em>(lead)</em>' : ''}${
      detail ? ` — ${escapeBasic(detail)}` : ''
    }</li>`;
  }).join('');

  return `<p style="margin:0 0 8px;"><strong>Team now (${members.length}):</strong></p>`
    + `<ul style="margin:0 0 16px; padding-left:20px; color:#3a3a3a;">${rows}</ul>`;
}

/**
 * Email a team's mentors about something that changed on their team.
 *
 * Deliberately limited to roster changes and assignment. Activity churn (project
 * renames, join requests, skill edits) is not sent: a mentor has no action to
 * take on those, and burying the useful mail in noise is how people learn to
 * filter the sender.
 *
 * Never throws — a mail failure must not fail the join or removal that caused it.
 * Pass `only` to target a single mentor instead of the whole team.
 */
async function notifyTeamMentors(hackathon, team, { heading, subject, bodyHtml, only }) {
  const recipients = (only ? [only] : (team?.mentors || []))
    .filter(Boolean)
    .map(m => normalizeEmail(m.email))
    .filter(Boolean);

  // De-duplicate in case the same person is attached twice.
  const unique = [...new Set(recipients)];
  if (unique.length === 0) return;

  // sendEmail returns { ok } rather than throwing, but the surrounding render can
  // still fail. Swallowing it here is the point: none of these callers should
  // return a 500 to someone who successfully joined or left a team.
  try {
    const html = renderEmail({
      heading,
      bodyHtml: `${bodyHtml}${rosterHtml(team)}${chatLinkHtml(hackathon)}`,
      cta: { label: 'Open hackathon', url: `${APP_URL}/hackathons/${hackathon?.id || ''}` },
    });

    await Promise.all(unique.map(async to => {
      const result = await sendEmail({ to, subject, html });
      if (!result.ok) console.error(`Mentor notification to ${to} failed:`, result.error);
    }));
  } catch (error) {
    console.error('Mentor notification failed:', error.message);
  }
}

/**
 * Tell a team's mentors that someone joined.
 *
 * `team` must be the post-change team so the roster in the mail is accurate.
 */
async function notifyMemberJoined(hackathon, team, member) {
  const detail = [
    member?.designation,
    member?.company,
  ].filter(Boolean).join(' at ');

  await notifyTeamMentors(hackathon, team, {
    heading: `${member?.name || 'A new member'} joined ${team.name}`,
    subject: `${member?.name || 'A new member'} joined "${team.name}" — ${hackathon?.title || 'hackathon'}`,
    bodyHtml: `<p style="margin:0 0 16px;"><strong>${escapeBasic(member?.name || 'A new member')}</strong>`
      + `${detail ? ` (${escapeBasic(detail)})` : ''} just joined <strong>${escapeBasic(team.name)}</strong>,`
      + ` a team you're mentoring.</p>`
      + (member?.experienceLevel
        ? `<p style="margin:0 0 16px;">Experience level: ${escapeBasic(member.experienceLevel)}</p>`
        : '')
      + ((member?.skills || []).length > 0
        ? `<p style="margin:0 0 16px;">Skills: ${escapeBasic(member.skills.join(', '))}</p>`
        : ''),
  });
}

/**
 * Tell a team's mentors that someone left, was removed, or that the team is gone.
 *
 * The disband case is the one that matters most: without this nobody tells the
 * mentor their team no longer exists.
 */
async function notifyMemberLeft(hackathon, team, member, { disbanded = false, newLeadName = null } = {}) {
  const who = member?.name || 'A member';

  if (disbanded) {
    await notifyTeamMentors(hackathon, team, {
      heading: `${team.name} has disbanded`,
      subject: `"${team.name}" has disbanded — ${hackathon?.title || 'hackathon'}`,
      bodyHtml: `<p style="margin:0 0 16px;"><strong>${escapeBasic(team.name)}</strong>, a team you were mentoring for `
        + `${escapeBasic(hackathon?.title || 'this hackathon')}, has disbanded after its last member left.</p>`
        + `<p style="margin:0 0 16px;">Nothing to action — you're no longer mentoring this team.</p>`,
    });
    return;
  }

  await notifyTeamMentors(hackathon, team, {
    heading: `${who} left ${team.name}`,
    subject: `${who} left "${team.name}" — ${hackathon?.title || 'hackathon'}`,
    bodyHtml: `<p style="margin:0 0 16px;"><strong>${escapeBasic(who)}</strong> is no longer on `
      + `<strong>${escapeBasic(team.name)}</strong>, a team you're mentoring.</p>`
      + (newLeadName
        ? `<p style="margin:0 0 16px;"><strong>${escapeBasic(newLeadName)}</strong> is now the team lead.</p>`
        : ''),
  });
}

/** Minimal escaping for values interpolated into email HTML. */
function escapeBasic(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function revokeInvite(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  if (team.leadUserId !== userId && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only the team lead can revoke invites' });
  }

  const { inviteId } = parseBody(event);
  if (!inviteId) return createResponse(400, { error: 'inviteId is required' });

  const invites = (team.invites || []).filter(i => i.id !== inviteId);
  const updated = await putTeam({ ...team, invites });
  return createResponse(200, { team: updated });
}

async function respondToInvite(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const body = parseBody(event);
  const token = String(body.token || '').trim();
  const action = body.action === 'decline' ? 'decline' : 'accept';
  if (!token) return createResponse(400, { error: 'An invite token is required' });

  // Declining is always allowed; accepting has to respect the deadline.
  if (action === 'accept') {
    const gate = registrationGate(hackathon);
    if (gate) return gate;
  }

  const invites = [...(team.invites || [])];
  const index = invites.findIndex(i => i.token === token);
  if (index === -1) return createResponse(404, { error: 'That invite is no longer valid' });

  const invite = invites[index];

  if (invite.status !== 'pending') {
    return createResponse(409, { error: `That invite was already ${invite.status}` });
  }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    invites[index] = { ...invite, status: 'expired' };
    await putTeam({ ...team, invites });
    return createResponse(410, { error: 'That invite has expired' });
  }

  // The invite is bound to an email address. Confirm the caller owns it, so a
  // leaked or guessed token can't be redeemed by someone else.
  //
  // The address MUST come from the caller's own user record (resolved from the
  // JWT), never from the request body — otherwise the attacker supplies the very
  // value being compared. Fail closed when it can't be resolved.
  const callerEmail = normalizeEmail(user?.email);
  if (!callerEmail) {
    return createResponse(403, {
      error: 'Your account has no verified email address, so this invite cannot be confirmed',
    });
  }
  if (normalizeEmail(invite.email) !== callerEmail) {
    return createResponse(403, { error: 'This invite was sent to a different email address' });
  }

  if (action === 'decline') {
    invites[index] = { ...invite, status: 'declined', respondedAt: nowIso() };
    const updated = await putTeam({ ...team, invites });
    return createResponse(200, { team: updated, message: 'Invite declined' });
  }

  const existing = await findExistingMembership(hackathonId, userId);
  if (existing) {
    return createResponse(409, {
      error: existing.id === teamId
        ? 'You are already on this team'
        : `You are already on team "${existing.name}"`,
    });
  }

  const config = normalizeTeamConfig(hackathon.teamConfig);
  if ((team.members || []).length >= config.maxSize) {
    return createResponse(409, { error: 'That team is already full' });
  }

  invites[index] = { ...invite, status: 'accepted', respondedAt: nowIso(), userId };

  const member = compact({
    userId,
    name: user?.name || body.userName || 'Unknown',
    // Resolved server-side, so the roster can't be poisoned via the request body.
    email: callerEmail,
    avatar: user?.avatar || body.userAvatar || undefined,
    role: 'member',
    joinedAt: nowIso(),
    designation: user?.designation || undefined,
    company: user?.company || undefined,
    // Accepted from the accept-invite call when supplied, but deliberately NOT
    // gated by requireMemberProfile: the lead invited this person directly, and
    // blocking a one-click emailed link on a form would be a dead end.
    ...sanitizeMemberProfile(body),
  });

  const updated = await putTeam({
    ...team,
    invites,
    members: [...(team.members || []), member],
  });

  await ensureRegistered(hackathon, userId);
  await discardStaleSoloSubmission(hackathonId, userId);
  await notifyMemberJoined(hackathon, updated, member);

  return createResponse(200, {
    team: sanitizeTeamForViewer(updated, { userId, isAdmin: false }),
    joined: true,
    message: `You joined ${team.name}`,
  });
}

// ----------------------------------------------------------------------------
// Join request handlers
// ----------------------------------------------------------------------------

async function fileJoinRequest(team, { userId, user, body }) {
  const joinRequests = [...(team.joinRequests || [])];

  if (joinRequests.some(r => r.userId === userId && r.status === 'pending')) {
    return createResponse(409, { error: 'You already have a pending request for this team' });
  }

  const profile = sanitizeMemberProfile(body);

  joinRequests.push(compact({
    id: genId('req'),
    userId,
    userName: body.userName || user?.name || 'Unknown',
    userEmail: normalizeEmail(body.userEmail || user?.email) || undefined,
    userAvatar: body.userAvatar || user?.avatar || undefined,
    message: body.message || undefined,
    status: 'pending',
    requestedAt: nowIso(),
    // Kept on the request so the lead can judge fit, and so approval can copy
    // these onto the member without asking the applicant again.
    ...profile,
  }));

  const updated = await putTeam({ ...team, joinRequests });

  // Tell the lead there's something to review.
  const lead = (team.members || []).find(m => m.userId === team.leadUserId);
  const leadEmail = normalizeEmail(lead?.email);
  if (leadEmail) {
    const requesterName = body.userName || user?.name || 'Someone';
    await sendEmail({
      to: leadEmail,
      subject: `${requesterName} asked to join "${team.name}"`,
      html: renderEmail({
        heading: `New request to join ${team.name}`,
        bodyHtml: `
          <p style="margin:0 0 16px;">
            <strong>${escapeBasic(requesterName)}</strong> has asked to join your team
            <strong>${escapeBasic(team.name)}</strong>.
          </p>
          ${profile.experienceLevel || profile.skills ? `<p style="margin:0 0 16px; color:#555;">${
            [
              profile.experienceLevel ? `Experience: ${escapeBasic(profile.experienceLevel)}` : '',
              profile.skills ? `Skills: ${escapeBasic(profile.skills.join(', '))}` : '',
            ].filter(Boolean).join('<br>')
          }</p>` : ''}
          ${body.message ? `<p style="margin:0 0 16px; padding:12px 16px; background:#f4f5f7; border-radius:8px;">${escapeBasic(body.message)}</p>` : ''}
          <p style="margin:0 0 16px;">Open the hackathon page to approve or reject the request.</p>
        `,
        cta: { label: 'Review request', url: `${APP_URL}/hackathons/${team.hackathonId}` },
      }),
    });
  }

  return createResponse(200, {
    team: sanitizeTeamForViewer(updated, { userId, isAdmin: false }),
    joined: false,
    status: 'requested',
    message: 'Request sent to the team lead',
  });
}

async function requestToJoinTeam(hackathonId, teamId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const gate = registrationGate(hackathon);
  if (gate) return gate;

  const config = normalizeTeamConfig(hackathon.teamConfig);
  if (config.joinPolicy === 'invite_only') {
    return createResponse(403, { error: 'This hackathon is invite-only' });
  }

  const body = parseBody(event);
  const profile = sanitizeMemberProfile(body);
  const profileGate = memberProfileGate(config, profile);
  if (profileGate) return profileGate;

  const existing = await findExistingMembership(hackathonId, userId);
  if (existing) {
    return createResponse(409, { error: `You are already on team "${existing.name}"` });
  }

  if ((team.members || []).length >= config.maxSize) {
    return createResponse(409, { error: 'That team is already full' });
  }

  // Open policy means a request is unnecessary — join straight away.
  if (config.joinPolicy === 'open') {
    const member = compact({
      userId,
      name: body.userName || user?.name || 'Unknown',
      email: normalizeEmail(body.userEmail || user?.email) || undefined,
      avatar: body.userAvatar || user?.avatar || undefined,
      role: 'member',
      joinedAt: nowIso(),
      designation: user?.designation || undefined,
      company: user?.company || undefined,
      ...profile,
    });
    const updated = await putTeam({ ...team, members: [...(team.members || []), member] });
    await ensureRegistered(hackathon, userId);
    await discardStaleSoloSubmission(hackathonId, userId);
    await notifyMemberJoined(hackathon, updated, member);
    return createResponse(200, {
      team: sanitizeTeamForViewer(updated, { userId, isAdmin: false }),
      joined: true,
      message: `You joined ${team.name}`,
    });
  }

  // Deliberately no mentor mail here: a filed request is the lead's decision to
  // make, and the mentor has no part in it.
  return fileJoinRequest(team, { userId, user, body });
}

async function respondToJoinRequest(hackathonId, teamId, requestId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const team = await fetchTeam(teamId);
  if (!team || team.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Team not found' });
  }

  if (team.leadUserId !== userId && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Only the team lead can respond to join requests' });
  }

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const body = parseBody(event);
  const approve = body.action === 'approve';

  const joinRequests = [...(team.joinRequests || [])];
  const index = joinRequests.findIndex(r => r.id === requestId);
  if (index === -1) return createResponse(404, { error: 'Request not found' });

  const request = joinRequests[index];
  if (request.status !== 'pending') {
    return createResponse(409, { error: `That request was already ${request.status}` });
  }

  const timestamp = nowIso();
  joinRequests[index] = {
    ...request,
    status: approve ? 'approved' : 'rejected',
    respondedAt: timestamp,
    respondedBy: userId,
  };

  let members = team.members || [];
  let addedMember = null;

  if (approve) {
    const config = normalizeTeamConfig(hackathon.teamConfig);
    if (members.length >= config.maxSize) {
      return createResponse(409, { error: 'Your team is already full' });
    }

    // Guard against the requester having joined another team in the meantime.
    const existing = await findExistingMembership(hackathonId, request.userId);
    if (existing) {
      return createResponse(409, {
        error: `${request.userName} has already joined team "${existing.name}"`,
      });
    }

    addedMember = compact({
      userId: request.userId,
      name: request.userName,
      email: request.userEmail || undefined,
      avatar: request.userAvatar || undefined,
      role: 'member',
      joinedAt: timestamp,
      // Carried across from the request, so the applicant isn't asked twice.
      experienceLevel: request.experienceLevel || undefined,
      skills: request.skills || undefined,
      note: request.note || undefined,
    });
    members = [...members, addedMember];
  }

  const updated = await putTeam({ ...team, members, joinRequests });

  if (request.userEmail) {
    await sendEmail({
      to: request.userEmail,
      subject: approve
        ? `You're in — welcome to "${team.name}"`
        : `Update on your request to join "${team.name}"`,
      html: renderEmail({
        heading: approve ? `Welcome to ${team.name}` : `Request not accepted`,
        bodyHtml: approve
          ? `<p style="margin:0 0 16px;">Your request to join <strong>${escapeBasic(team.name)}</strong> for <strong>${escapeBasic(hackathon.title)}</strong> was approved.</p>${chatLinkHtml(hackathon)}`
          : `<p style="margin:0 0 16px;">Your request to join <strong>${escapeBasic(team.name)}</strong> was not accepted. You can still join another team or take part on your own.</p>`,
        cta: { label: 'Open hackathon', url: `${APP_URL}/hackathons/${hackathonId}` },
      }),
    });
  }

  if (approve) {
    await ensureRegistered(hackathon, request.userId);
    await discardStaleSoloSubmission(hackathonId, request.userId);
    await notifyMemberJoined(hackathon, updated, addedMember);
  }

  return createResponse(200, {
    team: sanitizeTeamForViewer(updated, { userId, isAdmin: isAdminUser(user, userId) }),
    message: approve ? `${request.userName} added to the team` : 'Request rejected',
  });
}

// ----------------------------------------------------------------------------
// Submission handlers
// ----------------------------------------------------------------------------

/**
 * Drop a participant's individual submission when they join a team.
 *
 * The submit dedupe key is teamId for team entries and userId for solo entries,
 * so the two never collide: without this, someone who submits solo and later
 * joins a team leaves a second live row that the participant UI can neither
 * display nor withdraw, and that shows up twice in admin review.
 *
 * An already-approved solo entry is left alone — that's a scored result, and
 * removing it silently would destroy a review decision.
 */
async function discardStaleSoloSubmission(hackathonId, userId) {
  if (!userId) return;

  const submissions = await fetchSubmissionsByHackathon(hackathonId);
  const solo = submissions.find(
    s => s.kind === 'individual' && s.userId === userId && s.status !== 'approved',
  );
  if (!solo) return;

  await docClient.send(new DeleteCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { id: solo.id },
  }));
  console.log(`Discarded stale solo submission ${solo.id} for ${userId} after joining a team`);
}

// ----------------------------------------------------------------------------
// Points
//
// Mirrors the shape sprints-crud writes on approval: points, redeemablePoints,
// a pointActivities entry and an activities entry, all on the users table item.
// Two things this adds over the sprint flow:
//   - a team submission credits every member, not just the lead who submitted;
//   - the award is recorded on the submission (awardedTo/awardedPoints) so it can
//     be reversed exactly if the decision is later changed, and can never be
//     applied twice.
// ----------------------------------------------------------------------------

/** Apply a signed point delta to one user, appending an audit trail entry. */
async function applyPointsToUser(userId, delta, { reason, awardedBy, hackathonId, submissionId }) {
  if (!userId || !delta) return false;

  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));

    if (!result.Item) {
      console.log(`Points skipped: no user record for ${userId}`);
      return false;
    }

    const user = result.Item;
    const currentPoints = user.points || 0;
    const currentRedeemable = user.redeemablePoints ?? currentPoints;

    // Never let a reversal push a balance negative.
    const nextPoints = Math.max(0, currentPoints + delta);
    const nextRedeemable = Math.max(0, currentRedeemable + delta);

    const timestamp = nowIso();
    const pointActivities = user.pointActivities || [];
    pointActivities.push({
      id: genId('pa'),
      userId,
      points: delta,
      reason,
      type: 'submission',
      awardedBy: awardedBy || undefined,
      awardedAt: timestamp,
    });

    const activities = user.activities || [];
    activities.push({
      type: delta > 0 ? 'hackathon_submission_approved' : 'hackathon_submission_points_revoked',
      hackathonId,
      submissionId,
      points: delta,
      reviewedBy: awardedBy,
      timestamp,
    });

    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression:
        'SET points = :p, redeemablePoints = :r, pointActivities = :pa, activities = :a, updatedAt = :u',
      ExpressionAttributeValues: {
        ':p': nextPoints,
        ':r': nextRedeemable,
        ':pa': pointActivities,
        ':a': activities,
        ':u': timestamp,
      },
    }));

    console.log(`Points ${delta > 0 ? '+' : ''}${delta} for ${userId} (${currentPoints} -> ${nextPoints})`);
    return true;
  } catch (error) {
    // A points failure must not roll back the review decision itself.
    console.error(`Failed to apply points to ${userId}:`, error.message);
    return false;
  }
}

/** Everyone who should be credited for a submission. */
async function pointRecipients(submission) {
  if (submission.kind !== 'team' || !submission.teamId) {
    return submission.userId ? [submission.userId] : [];
  }

  const team = await fetchTeam(submission.teamId);
  if (!team) return submission.userId ? [submission.userId] : [];

  // Every member is credited the full amount — this is a community leaderboard,
  // not a prize pot to divide.
  const ids = (team.members || []).map(m => m.userId).filter(Boolean);
  return ids.length > 0 ? ids : (submission.userId ? [submission.userId] : []);
}

/**
 * Reconcile the points recorded against a submission with its new state.
 * Returns the award metadata to persist on the submission.
 */
async function reconcileSubmissionPoints(submission, { status, points, reviewedBy, hackathonTitle }) {
  const previousPoints = submission.awardedPoints || 0;
  const previousRecipients = Array.isArray(submission.awardedTo) ? submission.awardedTo : [];
  const shouldAward = status === 'approved' && points > 0;

  // Reverse whatever was previously granted, if it no longer applies or changed.
  const needsReversal = previousPoints > 0
    && (!shouldAward || previousPoints !== points);

  if (needsReversal) {
    await Promise.all(previousRecipients.map(userId => applyPointsToUser(userId, -previousPoints, {
      reason: `Hackathon award revised: ${hackathonTitle}`,
      awardedBy: reviewedBy,
      hackathonId: submission.hackathonId,
      submissionId: submission.id,
    })));
  }

  if (!shouldAward) {
    return { awardedPoints: 0, awardedTo: [] };
  }

  // Already granted at exactly this amount — nothing to do, so re-approving is
  // idempotent rather than double-crediting.
  if (!needsReversal && previousPoints === points) {
    return { awardedPoints: previousPoints, awardedTo: previousRecipients };
  }

  const recipients = await pointRecipients(submission);
  const credited = [];

  for (const userId of recipients) {
    const ok = await applyPointsToUser(userId, points, {
      reason: `Hackathon submission approved: ${hackathonTitle}`,
      awardedBy: reviewedBy,
      hackathonId: submission.hackathonId,
      submissionId: submission.id,
    });
    if (ok) credited.push(userId);
  }

  return { awardedPoints: points, awardedTo: credited };
}

async function fetchSubmissionsByHackathon(hackathonId) {
  const result = await docClient.send(new QueryCommand({
    TableName: SUBMISSIONS_TABLE,
    IndexName: 'hackathonId-index',
    KeyConditionExpression: 'hackathonId = :h',
    ExpressionAttributeValues: { ':h': hackathonId },
  }));
  return result.Items || [];
}

async function listSubmissions(hackathonId, event) {
  const query = event.queryStringParameters || {};
  let submissions = await fetchSubmissionsByHackathon(hackathonId);

  // Visibility: organisers see everything (that's the admin review view).
  // Everyone else sees only their own entry, plus approved entries once the
  // hackathon is over — otherwise competing teams could read each other's
  // in-progress work straight off this endpoint.
  const { userId, user } = await resolveCaller(event);

  // Judges need the full list to score it; they just can't manage the hackathon.
  if (!canReviewSubmissions(user, userId)) {
    const hackathon = await fetchHackathon(hackathonId);
    const showcase = hackathon?.status === 'completed';

    let ownTeamId = null;
    if (userId) {
      const membership = await findExistingMembership(hackathonId, userId);
      ownTeamId = membership?.id || null;
    }

    submissions = submissions.filter(s => {
      const isOwn = userId && (s.userId === userId || (ownTeamId && s.teamId === ownTeamId));
      return isOwn || (showcase && s.status === 'approved');
    });
  }

  if (query.status) submissions = submissions.filter(s => s.status === query.status);
  if (query.teamId) submissions = submissions.filter(s => s.teamId === query.teamId);

  submissions.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
  return createResponse(200, { submissions });
}

async function submitWork(hackathonId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const hackathon = await fetchHackathon(hackathonId);
  if (!hackathon) return createResponse(404, { error: 'Hackathon not found' });

  const body = parseBody(event);
  const kind = body.kind === 'individual' ? 'individual' : 'team';
  const config = normalizeTeamConfig(hackathon.teamConfig);

  // Deadline gate. Note: unlike sprints-crud submitWork there is no forced
  // blog/GitHub URL requirement — the admin-built form is the contract.
  const deadline = hackathon.submissionDeadline || hackathon.endDate;
  if (deadline && !isTodayOnOrBefore(deadline)) {
    return createResponse(403, { error: 'Submissions for this hackathon have closed' });
  }
  if (hackathon.status === 'draft') {
    return createResponse(403, { error: 'This hackathon is not open yet' });
  }

  let team = null;

  if (kind === 'team') {
    if (!body.teamId) return createResponse(400, { error: 'teamId is required for a team submission' });

    team = await fetchTeam(body.teamId);
    if (!team || team.hackathonId !== hackathonId) {
      return createResponse(404, { error: 'Team not found' });
    }
    if (team.leadUserId !== userId) {
      return createResponse(403, { error: 'Only the team lead can submit on behalf of the team' });
    }
    if ((team.members || []).length < config.minSize) {
      return createResponse(400, {
        error: `Teams need at least ${config.minSize} member${config.minSize === 1 ? '' : 's'} to submit`,
      });
    }
  } else if (!config.allowIndividuals) {
    return createResponse(403, {
      error: 'This hackathon requires a team. Create or join one before submitting.',
    });
  }

  // Validate required fields against the admin-built form.
  const formConfig = hackathon.submissionFormConfig || [];
  const customFields = body.customFields || {};
  const documents = Array.isArray(body.supportingDocuments) ? body.supportingDocuments : [];

  // File fields are keyed per field id in customFields (the client records the
  // uploaded URLs there) and fall back to the flat documents array for older
  // clients. Checking only `documents.length` would let one upload satisfy every
  // required file field at once.
  for (const field of formConfig) {
    if (!field.required) continue;

    let value;
    if (field.type === 'file') {
      const perField = customFields[field.id];
      value = Array.isArray(perField)
        ? perField.length > 0
        : !!perField || documents.length > 0;
    } else {
      value = customFields[field.id];
    }

    if (!value && value !== false) {
      return createResponse(400, { error: `Missing required field: ${field.label}` });
    }
  }

  // One live submission per team (or per person). Re-submitting replaces it.
  const existingSubmissions = await fetchSubmissionsByHackathon(hackathonId);
  const previous = existingSubmissions.find(s => (
    kind === 'team' ? s.teamId === body.teamId : s.kind === 'individual' && s.userId === userId
  ));

  const timestamp = nowIso();

  if (previous && previous.status === 'approved') {
    return createResponse(409, {
      error: 'An approved submission already exists and cannot be replaced',
    });
  }

  const submission = compact({
    id: previous?.id || genId('hsub'),
    hackathonId,
    kind,
    teamId: kind === 'team' ? body.teamId : undefined,
    teamName: kind === 'team' ? team.name : undefined,
    userId,
    userName: body.userName || user?.name || 'Unknown',
    userAvatar: body.userAvatar || user?.avatar || undefined,
    projectName: body.projectName || team?.projectName || undefined,
    track: body.track || team?.track || undefined,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
    supportingDocuments: documents.length > 0 ? documents : undefined,
    submittedAt: previous?.submittedAt || timestamp,
    updatedAt: previous ? timestamp : undefined,
    points: previous?.points || 0,
    status: 'pending',
  });

  await docClient.send(new PutCommand({ TableName: SUBMISSIONS_TABLE, Item: submission }));

  return createResponse(previous ? 200 : 201, { submission });
}

async function reviewSubmission(hackathonId, submissionId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });
  if (!canReviewSubmissions(user, userId)) {
    return createResponse(403, { error: 'Organiser or judge access required to review submissions' });
  }

  const result = await docClient.send(new GetCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { id: submissionId },
  }));

  const submission = result.Item;
  if (!submission || submission.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Submission not found' });
  }

  const body = parseBody(event);
  if (!['approved', 'rejected'].includes(body.status)) {
    return createResponse(400, { error: "status must be 'approved' or 'rejected'" });
  }

  // A rejected submission scores nothing, whatever the form sent.
  const points = body.status === 'rejected'
    ? 0
    : (body.points !== undefined ? Math.max(0, Number(body.points) || 0) : submission.points || 0);

  const hackathon = await fetchHackathon(hackathonId);

  // Credit or reverse profile points before persisting, so awardedTo reflects
  // who was actually updated.
  const award = await reconcileSubmissionPoints(submission, {
    status: body.status,
    points,
    reviewedBy: userId,
    hackathonTitle: hackathon?.title || hackathonId,
  });

  const updated = compact({
    ...submission,
    status: body.status,
    points,
    feedback: body.feedback || submission.feedback || undefined,
    reviewedBy: userId,
    reviewerName: body.reviewerName || user?.name || undefined,
    reviewedAt: nowIso(),
    // Ledger of what was actually granted, so a later change reverses exactly.
    awardedPoints: award.awardedPoints,
    awardedTo: award.awardedTo,
  });

  await docClient.send(new PutCommand({ TableName: SUBMISSIONS_TABLE, Item: updated }));

  return createResponse(200, {
    submission: updated,
    pointsAwarded: award.awardedPoints,
    recipients: award.awardedTo,
  });
}

async function deleteSubmission(hackathonId, submissionId, event) {
  const { userId, user } = await resolveCaller(event);
  if (!userId) return createResponse(401, { error: 'Authentication required' });

  const result = await docClient.send(new GetCommand({
    TableName: SUBMISSIONS_TABLE,
    Key: { id: submissionId },
  }));

  const submission = result.Item;
  if (!submission || submission.hackathonId !== hackathonId) {
    return createResponse(404, { error: 'Submission not found' });
  }

  const isOwner = submission.userId === userId;
  if (!isOwner && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'Not allowed to delete this submission' });
  }
  if (submission.status === 'approved' && !isAdminUser(user, userId)) {
    return createResponse(403, { error: 'An approved submission can only be removed by an organiser' });
  }

  // Take back any points this submission granted, otherwise deleting it would
  // leave the award stranded on member profiles.
  const hackathon = await fetchHackathon(hackathonId);
  await reconcileSubmissionPoints(submission, {
    status: 'rejected',
    points: 0,
    reviewedBy: userId,
    hackathonTitle: hackathon?.title || hackathonId,
  });

  await docClient.send(new DeleteCommand({ TableName: SUBMISSIONS_TABLE, Key: { id: submissionId } }));
  return createResponse(200, { message: 'Submission deleted', id: submissionId });
}
