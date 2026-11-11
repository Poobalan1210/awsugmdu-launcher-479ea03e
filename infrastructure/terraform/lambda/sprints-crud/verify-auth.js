// Verified sign-in for every API Lambda.
//
// API Gateway has no authorizer, and the handlers read the caller from the
// Authorization header without checking its signature, so a hand-made token
// could claim any user id or email. withVerifiedAuth checks the Cognito ID
// token before the handler runs and removes the header when it is not genuine,
// so every check inside the handler only ever sees a real identity. A request
// without a valid token is treated exactly like one without a header.
//
// The canonical copy lives in lambda/shared/. deploy.sh copies it into each
// Lambda folder before packaging, so edit it here, not in the copies.

const crypto = require('crypto');

const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const COGNITO_ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_USER_POOL_ID.split('_')[0]}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : '';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const ADMIN_ROLE_NAMES = ['admin', 'organiser'];

const JWKS_REFETCH_MS = 60 * 1000;
let jwksCache = null; // { keys, fetchedAt }

if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) {
  console.error('verify-auth: COGNITO_USER_POOL_ID or COGNITO_CLIENT_ID is not set; every request is treated as signed out.');
}

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

function authHeaderOf(event) {
  return event?.headers?.Authorization || event?.headers?.authorization || null;
}

function stripAuthHeader(event) {
  for (const bag of [event.headers, event.multiValueHeaders]) {
    if (!bag) continue;
    for (const name of Object.keys(bag)) {
      if (name.toLowerCase() === 'authorization') delete bag[name];
    }
  }
}

/**
 * Wrap a handler so it only ever sees a verified Authorization header.
 * The verified claims are on event.verifiedClaims (null when signed out).
 */
function withVerifiedAuth(handler) {
  return async (event, context) => {
    if (event && typeof event === 'object') {
      const header = authHeaderOf(event);
      const claims = header && event.httpMethod !== 'OPTIONS' ? await verifyIdToken(header) : null;
      if (header && !claims) stripAuthHeader(event);
      event.verifiedClaims = claims;
    }
    return handler(event, context);
  };
}

/** The verified caller's user id, or null. */
function callerId(event) {
  return event?.verifiedClaims?.sub || null;
}

function hasAdminRole(user) {
  if (!user) return false;
  if (ADMIN_ROLE_NAMES.includes(String(user.role || '').toLowerCase())) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) =>
    ADMIN_ROLE_NAMES.includes(String((typeof r === 'string' ? r : r?.role) || '').toLowerCase()));
}

/**
 * Is the verified caller an organiser or admin? The same rule as the site's
 * AuthContext: a configured organiser email (only when Cognito has verified
 * it), or an admin/organiser role on their profile.
 */
async function callerIsAdmin(event) {
  const claims = event?.verifiedClaims;
  if (!claims) return false;
  const email = String(claims.email || '').toLowerCase();
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (email && emailVerified && ADMIN_EMAILS.includes(email)) return true;
  try {
    // Required lazily so Lambdas that never check admin do not load the SDK.
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
    callerIsAdmin.docClient ||= DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const r = await callerIsAdmin.docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: claims.sub },
    }));
    return hasAdminRole(r.Item);
  } catch (error) {
    console.error('verify-auth: admin lookup failed', error);
    return false;
  }
}

module.exports = {
  withVerifiedAuth,
  verifyIdToken,
  callerId,
  callerIsAdmin,
  hasAdminRole,
};
