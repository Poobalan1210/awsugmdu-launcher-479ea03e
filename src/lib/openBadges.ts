/**
 * Open Badges v2.0 — 1EdTech (IMS Global) compliant implementation
 *
 * Spec: https://www.imsglobal.org/spec/ob/v2p0/
 *
 * Key differences from our previous OB v3 draft:
 *  - @context  → "https://w3id.org/openbadges/v2"  (single string, not array)
 *  - type      → "Assertion" (not "OpenBadgeCredential")
 *  - recipient → hashed identity object (sha256 + salt), never plain email
 *  - badge     → URL string pointing to the hosted BadgeClass JSON
 *  - verification → { type: "HostedBadge" }
 *  - issuedOn  → ISO-8601 date string (not "issuanceDate")
 *  - issuer    → URL string in Assertion (full object only in issuer.json)
 *  - image     → URL string (not an object)
 *  - criteria  → { id: URL } or { narrative: string } (not nested object with both)
 */

import { Badge, User } from '@/data/mockData';
import { generateProfileSlug } from '@/lib/profileSlug';

// ─── Constants ────────────────────────────────────────────────────────────────

export const OB2_CONTEXT = 'https://w3id.org/openbadges/v2';
export const BASE_URL = typeof window !== 'undefined'
  ? window.location.origin
  : 'https://www.awsugmdu.in';

// ─── OB v2 Type Definitions ───────────────────────────────────────────────────

/** OB v2 §4.1 — Profile (Issuer) */
export interface OB2Issuer {
  '@context': typeof OB2_CONTEXT;
  id: string;           // MUST be a public URL: GET returns this JSON
  type: 'Issuer' | 'Profile';
  name: string;
  url: string;
  email: string;
  description?: string;
  image?: string;       // URL to issuer logo image
}

/** OB v2 §4.2 — BadgeClass */
export interface OB2BadgeClass {
  '@context': typeof OB2_CONTEXT;
  id: string;           // MUST be a public URL: GET returns this JSON
  type: 'BadgeClass';
  name: string;
  description: string;
  image: string;        // URL to badge image (PNG or SVG)
  criteria: {
    id?: string;        // URL to criteria page (optional)
    narrative?: string; // Human-readable criteria text
  };
  issuer: string;       // URL to issuer JSON (not the full object)
  tags?: string[];
  alignment?: OB2Alignment[];
}

/** OB v2 §4.3 — Assertion */
export interface OB2Assertion {
  '@context': typeof OB2_CONTEXT;
  id: string;           // MUST be a public URL: GET returns this JSON
  type: 'Assertion';
  recipient: OB2RecipientProfile;
  badge: string;        // URL to BadgeClass JSON
  verification: OB2Verification;
  issuedOn: string;     // ISO-8601 datetime
  expires?: string;     // ISO-8601 datetime
  evidence?: OB2Evidence[];
  narrative?: string;
  image?: string;       // URL to baked badge image (optional)
}

/** OB v2 §4.4 — IdentityObject (hashed recipient) */
export interface OB2RecipientProfile {
  type: 'email';
  hashed: true;
  salt: string;
  identity: string;     // "sha256$<hex>" — sha256(email + salt)
}

/** OB v2 §4.5 — VerificationObject */
export interface OB2Verification {
  type: 'HostedBadge';  // We use hosted verification (URL-based)
}

/** OB v2 §4.6 — Evidence */
export interface OB2Evidence {
  id?: string;          // URL to evidence
  type?: 'Evidence';
  narrative?: string;
  name?: string;
  description?: string;
  genre?: string;
  audience?: string;
}

/** OB v2 §4.7 — AlignmentObject */
export interface OB2Alignment {
  targetName: string;
  targetUrl: string;
  targetDescription?: string;
  targetFramework?: string;
  targetCode?: string;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

/** Hosted JSON endpoint for the issuer profile */
export const issuerUrl = () => `${BASE_URL}/ob2/issuer.json`;

/** Hosted JSON endpoint for a BadgeClass */
export const badgeClassUrl = (badgeId: string) =>
  `${BASE_URL}/ob2/badges/${badgeId}.json`;

/** Hosted JSON endpoint for an Assertion */
export const assertionUrl = (badgeId: string, userId: string) =>
  `${BASE_URL}/ob2/assertions/${badgeId}-${userId}.json`;

/** Public human-readable badge page — use for internal links */
export const getPublicBadgeUrl = (
  badge: Badge,
  userName: string,
  userId: string
): string => {
  const slug = generateProfileSlug(userName, userId);
  return `${BASE_URL}/badges/${badge.id}/${slug}`;
};

/**
 * OG proxy URL — use this as the share URL on all social platforms.
 *
 * The image version is embedded in the PATH so LinkedIn treats each new
 * badge image as a completely new URL and re-crawls it fresh.
 *
 * Format: /og/badge/{badgeId}/{userSlug}/{imageVersion}?img=...&name=...&desc=...
 */
export const getOgProxyUrl = (
  badge: Badge,
  userName: string,
  userId: string
): string => {
  const slug = generateProfileSlug(userName, userId);
  // Version = last 8 chars of the S3 filename (changes when image changes)
  const version = badge.imageUrl
    ? badge.imageUrl.split('/').pop()?.split('.')[0]?.slice(-8) || 'v1'
    : 'v1';
  const base = `${BASE_URL}/og/badge/${badge.id}/${slug}/${version}`;
  const params = new URLSearchParams();
  if (badge.imageUrl) params.set('img', badge.imageUrl);
  params.set('name', badge.name);
  params.set('desc', badge.description);
  return `${base}?${params.toString()}`;
};

// ─── Recipient hashing ────────────────────────────────────────────────────────

/**
 * Hash a recipient email using SHA-256 + salt.
 * OB v2 §4.4 requires: identity = "sha256$" + hex(sha256(email + salt))
 *
 * Uses the Web Crypto API (available in all modern browsers and Node 18+).
 */
export async function hashRecipientEmail(
  email: string,
  salt: string
): Promise<string> {
  const input = email.toLowerCase().trim() + salt;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `sha256$${hex}`;
}

/**
 * Build the OB v2 recipient identity object.
 * The salt is derived deterministically from the userId so the same
 * assertion always produces the same hash (needed for HostedBadge verification).
 */
export async function buildRecipient(
  email: string,
  userId: string
): Promise<OB2RecipientProfile> {
  // Deterministic salt: "awsugmdu-" + first 8 chars of userId
  const salt = `awsugmdu-${userId.slice(0, 8)}`;
  const identity = await hashRecipientEmail(email, salt);
  return { type: 'email', hashed: true, salt, identity };
}

// ─── OB v2 Document Generators ───────────────────────────────────────────────

/**
 * Generate the Issuer Profile document.
 * Served at: GET /ob2/issuer.json
 */
export function generateOB2Issuer(): OB2Issuer {
  return {
    '@context': OB2_CONTEXT,
    id: issuerUrl(),
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

/**
 * Generate a BadgeClass document.
 * Served at: GET /ob2/badges/{badgeId}.json
 */
export function generateOB2BadgeClass(badge: Badge): OB2BadgeClass {
  const id = badgeClassUrl(badge.id);
  return {
    '@context': OB2_CONTEXT,
    id,
    type: 'BadgeClass',
    name: badge.name,
    description: badge.description,
    // Prefer the uploaded image URL; fall back to the Lambda-served SVG
    image: badge.imageUrl || `${BASE_URL}/ob2/badge-images/${badge.id}.svg`,
    criteria: {
      id: `${id}/criteria`,
      narrative: badge.criteria.description,
    },
    issuer: issuerUrl(),
    tags: ['AWS', 'Cloud', 'Community', 'AWSUG'],
  };
}

/**
 * Generate an Assertion document (async — needs email hashing).
 * Served at: GET /ob2/assertions/{badgeId}-{userId}.json
 */
export async function generateOB2Assertion(
  badge: Badge,
  recipient: Pick<User, 'id' | 'name' | 'email'>
): Promise<OB2Assertion> {
  const id = assertionUrl(badge.id, recipient.id);
  const recipientProfile = await buildRecipient(recipient.email, recipient.id);

  return {
    '@context': OB2_CONTEXT,
    id,
    type: 'Assertion',
    recipient: recipientProfile,
    badge: badgeClassUrl(badge.id),
    verification: { type: 'HostedBadge' },
    issuedOn: new Date(badge.earnedDate).toISOString(),
    evidence: [
      {
        type: 'Evidence',
        id: `${BASE_URL}/u/${generateProfileSlug(recipient.name, recipient.id)}`,
        name: `${recipient.name}'s AWS UG Madurai Profile`,
        description:
          `View ${recipient.name}'s full profile and achievements on AWS User Group Madurai.`,
      },
    ],
    narrative:
      `${recipient.name} earned the "${badge.name}" badge from AWS User Group Madurai ` +
      `for: ${badge.criteria.description}`,
  };
}

// ─── Download helpers ─────────────────────────────────────────────────────────

/**
 * Download the OB v2 Assertion JSON.
 * This is the file that can be uploaded to Badgr, Credly, or any OB2 platform.
 */
export async function downloadBadgeAssertion(
  badge: Badge,
  recipient: Pick<User, 'id' | 'name' | 'email'>
): Promise<void> {
  const assertion = await generateOB2Assertion(badge, recipient);
  const json = JSON.stringify(assertion, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `ob2-assertion-${badge.id}-${recipient.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download a baked SVG badge.
 * OB v2 baking spec: embed the assertion URL in an SVG <metadata> tag.
 * The verifier fetches the assertion URL to verify.
 *
 * Note: OB v2 baking officially supports PNG (via iTXt chunk) and SVG.
 * We use SVG since we generate it client-side.
 */
export async function downloadBakedBadge(
  badge: Badge,
  recipient: Pick<User, 'id' | 'name' | 'email'>
): Promise<void> {
  const assertion = await generateOB2Assertion(badge, recipient);
  // OB v2 SVG baking: embed the assertion URL (not the full JSON) in <metadata>
  const svg = generateBadgeSvg(badge.icon, badge.name, badge.description, assertion.id, badge.imageUrl);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `badge-${badge.id}-${recipient.name.toLowerCase().replace(/\s+/g, '-')}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── SVG Badge Generator ──────────────────────────────────────────────────────

/**
 * Generate a 200×200 SVG badge image.
 * When assertionUrl is provided the SVG is "baked" per the OB v2 spec.
 * When imageUrl is provided it is embedded as a <image> element instead of the emoji.
 */
export function generateBadgeSvg(
  icon: string,
  name: string,
  description?: string,
  assertionHref?: string,
  imageUrl?: string
): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const escapedName = esc(name);
  const escapedDesc = esc(description || '');
  const nameLines = wrapText(escapedName, 18);

  // OB v2 SVG baking: <openbadges:assertion> contains the assertion URL
  const metadataBlock = assertionHref
    ? `  <metadata xmlns:openbadges="https://w3id.org/openbadges/v2">
    <openbadges:assertion verify="${esc(assertionHref)}" />
  </metadata>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="${escapedName} badge">
  <title>${escapedName}</title>
  <desc>${escapedDesc}</desc>
${metadataBlock}
  <circle cx="100" cy="100" r="96" fill="#FF9900"/>
  <circle cx="100" cy="100" r="88" fill="#1a1a2e"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#FF9900" stroke-width="2" stroke-dasharray="8 4"/>
  ${imageUrl
    ? `<clipPath id="iconClip"><circle cx="100" cy="88" r="36"/></clipPath>
  <image href="${esc(imageUrl)}" x="64" y="52" width="72" height="72" clip-path="url(#iconClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="100" y="90" text-anchor="middle" dominant-baseline="middle"
        font-size="48" font-family="Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,sans-serif">${icon}</text>`
  }
  ${nameLines.map((line, i) =>
    `<text x="100" y="${118 + i * 18}" text-anchor="middle" font-size="13" font-weight="bold"
        fill="#FFFFFF" font-family="system-ui,-apple-system,sans-serif">${line}</text>`
  ).join('\n  ')}
  <text x="100" y="172" text-anchor="middle" font-size="9" fill="#FF9900" letter-spacing="1"
        font-family="system-ui,-apple-system,sans-serif">AWS UG MADURAI</text>
</svg>`;
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
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

// ─── Verification helpers ─────────────────────────────────────────────────────

/** URL of the hosted assertion JSON — this IS the verification URL for HostedBadge */
export function getBadgeVerificationUrl(badgeId: string, userId: string): string {
  return assertionUrl(badgeId, userId);
}

/** LinkedIn "Add to Profile" deep-link */
export function getLinkedInBadgeUrl(badge: Badge, earnedDate: string): string {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: badge.name,
    organizationName: 'AWS User Group Madurai',
    issueYear: new Date(earnedDate).getFullYear().toString(),
    issueMonth: (new Date(earnedDate).getMonth() + 1).toString(),
    certUrl: badgeClassUrl(badge.id),
    certId: badge.id,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

// ─── Client-side verification ─────────────────────────────────────────────────

export interface VerificationResult {
  valid: boolean;
  steps: VerificationStep[];
  assertion?: OB2Assertion;
  badgeClass?: OB2BadgeClass;
  issuer?: OB2Issuer;
}

export interface VerificationStep {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail?: string;
}

/**
 * Verify an OB v2 Assertion by its hosted URL.
 * Implements the HostedBadge verification algorithm from the spec.
 *
 * Steps:
 *  1. Fetch assertion JSON from assertionUrl
 *  2. Validate assertion structure
 *  3. Fetch BadgeClass JSON from assertion.badge
 *  4. Validate BadgeClass structure
 *  5. Fetch Issuer JSON from badgeClass.issuer
 *  6. Validate Issuer structure
 *  7. Cross-check URL consistency
 */
export async function verifyOB2Assertion(
  assertionHref: string
): Promise<VerificationResult> {
  const steps: VerificationStep[] = [];
  let assertion: OB2Assertion | undefined;
  let badgeClass: OB2BadgeClass | undefined;
  let issuer: OB2Issuer | undefined;

  // Step 1 — Fetch assertion
  try {
    const res = await fetch(assertionHref, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    assertion = await res.json();
    steps.push({ label: 'Fetch assertion JSON', status: 'pass', detail: assertionHref });
  } catch (e: any) {
    steps.push({ label: 'Fetch assertion JSON', status: 'fail', detail: e.message });
    return { valid: false, steps };
  }

  // Step 2 — Validate assertion structure
  const assertionChecks: [boolean, string, string][] = [
    [assertion['@context'] === OB2_CONTEXT, '@context is correct OB v2 URL', assertion['@context']],
    [assertion.type === 'Assertion', 'type is "Assertion"', assertion.type],
    [typeof assertion.id === 'string' && assertion.id.startsWith('http'), 'id is a public URL', assertion.id],
    [assertion.id === assertionHref, 'id matches the URL it was fetched from', assertion.id],
    [typeof assertion.badge === 'string', 'badge is a URL string', String(assertion.badge)],
    [assertion.verification?.type === 'HostedBadge', 'verification.type is "HostedBadge"', assertion.verification?.type],
    [typeof assertion.issuedOn === 'string', 'issuedOn is present', assertion.issuedOn],
    [assertion.recipient?.hashed === true, 'recipient is hashed', String(assertion.recipient?.hashed)],
    [assertion.recipient?.type === 'email', 'recipient.type is "email"', assertion.recipient?.type],
    [typeof assertion.recipient?.salt === 'string', 'recipient.salt is present', ''],
    [assertion.recipient?.identity?.startsWith('sha256$') ?? false, 'recipient.identity uses sha256', assertion.recipient?.identity?.slice(0, 12)],
  ];
  for (const [ok, label, detail] of assertionChecks) {
    steps.push({ label, status: ok ? 'pass' : 'fail', detail });
  }
  if (steps.some(s => s.status === 'fail')) {
    return { valid: false, steps, assertion };
  }

  // Step 3 — Fetch BadgeClass
  try {
    const res = await fetch(assertion.badge, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    badgeClass = await res.json();
    steps.push({ label: 'Fetch BadgeClass JSON', status: 'pass', detail: assertion.badge });
  } catch (e: any) {
    steps.push({ label: 'Fetch BadgeClass JSON', status: 'fail', detail: e.message });
    return { valid: false, steps, assertion };
  }

  // Step 4 — Validate BadgeClass
  const bcChecks: [boolean, string, string][] = [
    [badgeClass!['@context'] === OB2_CONTEXT, 'BadgeClass @context is correct', badgeClass!['@context']],
    [badgeClass!.type === 'BadgeClass', 'BadgeClass type is "BadgeClass"', badgeClass!.type],
    [typeof badgeClass!.id === 'string', 'BadgeClass id is a URL', badgeClass!.id],
    [badgeClass!.id === assertion.badge, 'BadgeClass id matches assertion.badge', badgeClass!.id],
    [typeof badgeClass!.issuer === 'string', 'BadgeClass issuer is a URL', String(badgeClass!.issuer)],
    [typeof badgeClass!.image === 'string', 'BadgeClass image is a URL', String(badgeClass!.image)],
    [typeof badgeClass!.criteria === 'object', 'BadgeClass criteria is present', ''],
  ];
  for (const [ok, label, detail] of bcChecks) {
    steps.push({ label, status: ok ? 'pass' : 'fail', detail });
  }
  if (steps.some(s => s.status === 'fail')) {
    return { valid: false, steps, assertion, badgeClass };
  }

  // Step 5 — Fetch Issuer
  try {
    const res = await fetch(badgeClass!.issuer, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    issuer = await res.json();
    steps.push({ label: 'Fetch Issuer JSON', status: 'pass', detail: badgeClass!.issuer });
  } catch (e: any) {
    steps.push({ label: 'Fetch Issuer JSON', status: 'fail', detail: e.message });
    return { valid: false, steps, assertion, badgeClass };
  }

  // Step 6 — Validate Issuer
  const issuerChecks: [boolean, string, string][] = [
    [issuer!['@context'] === OB2_CONTEXT, 'Issuer @context is correct', issuer!['@context']],
    [issuer!.type === 'Profile' || issuer!.type === 'Issuer', 'Issuer type is "Profile" or "Issuer"', issuer!.type],
    [typeof issuer!.id === 'string', 'Issuer id is a URL', issuer!.id],
    [issuer!.id === badgeClass!.issuer, 'Issuer id matches badgeClass.issuer', issuer!.id],
    [typeof issuer!.name === 'string', 'Issuer name is present', issuer!.name],
    [typeof issuer!.email === 'string', 'Issuer email is present', issuer!.email],
  ];
  for (const [ok, label, detail] of issuerChecks) {
    steps.push({ label, status: ok ? 'pass' : 'fail', detail });
  }

  // Step 7 — Expiry check
  if (assertion.expires) {
    const expired = new Date(assertion.expires) < new Date();
    steps.push({
      label: 'Badge not expired',
      status: expired ? 'fail' : 'pass',
      detail: assertion.expires,
    });
  }

  const valid = steps.every(s => s.status !== 'fail');
  return { valid, steps, assertion, badgeClass, issuer };
}
