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
 * Share URL for social platforms. The Vercel function at /og/badge/ serves the
 * preview (badge card image, title) to crawlers and sends people on to the
 * badge page. `u` lets it confirm the award before naming the member.
 */
export const getOgProxyUrl = (
  badge: Badge,
  userName: string,
  userId: string
): string => {
  const slug = generateProfileSlug(userName, userId);
  return `${BASE_URL}/og/badge/${badge.id}/${slug}?u=${encodeURIComponent(userId)}`;
};

// ─── Download helpers ─────────────────────────────────────────────────────────

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;

/** Save a server response as a file, or throw a message the member can act on. */
async function downloadFromApi(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_ENDPOINT}${path}`);
  if (res.status === 404) {
    throw new Error('This badge has no Open Badges credential yet. Ask an organiser to award it again.');
  }
  if (res.status === 410) throw new Error('This badge has been revoked.');
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Download the hosted OB v2 Assertion JSON, the file Badgr, Credly or any
 * Open Badges backpack imports.
 */
export async function downloadBadgeAssertion(
  badge: Badge,
  recipient: Pick<User, 'id'>
): Promise<void> {
  await downloadFromApi(
    `/ob2/assertions/${encodeURIComponent(`${badge.id}-${recipient.id}`)}.json`,
    `awsugmdu-${badge.id}-assertion.json`,
  );
}

/**
 * Download the baked badge: the badge SVG with its signed-off assertion
 * embedded (OB v2 baking), so the file itself verifies, even offline.
 */
export async function downloadBakedBadge(
  badge: Badge,
  recipient: Pick<User, 'id'>
): Promise<void> {
  await downloadFromApi(
    `/ob2/assertions/${encodeURIComponent(`${badge.id}-${recipient.id}`)}.svg`,
    `awsugmdu-${badge.id}-badge.svg`,
  );
}

// ─── Verification helpers ─────────────────────────────────────────────────────

/** URL of the hosted assertion JSON — this IS the verification URL for HostedBadge */
export function getBadgeVerificationUrl(badgeId: string, userId: string): string {
  return assertionUrl(badgeId, userId);
}

/**
 * LinkedIn "Add to profile" → Licenses & certifications, prefilled. The
 * credential URL is the public badge page, so profile visitors land on it.
 */
export function getLinkedInBadgeUrl(
  badge: Badge,
  earnedDate: string,
  recipient?: Pick<User, 'id' | 'name'>
): string {
  const date = new Date(earnedDate);
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: badge.name,
    organizationName: 'AWS User Group Madurai',
    issueYear: date.getFullYear().toString(),
    issueMonth: (date.getMonth() + 1).toString(),
    certUrl: recipient ? getPublicBadgeUrl(badge, recipient.name, recipient.id) : badgeClassUrl(badge.id),
    certId: recipient ? `${badge.id}-${recipient.id}` : badge.id,
  });
  return `https://www.linkedin.com/profile/add?${params.toString()}`;
}

/** The text a member posts on LinkedIn about a badge, ending with its link. */
export function linkedInPostText(badge: Badge, shareUrl: string): string {
  return [
    `I'm happy to share that I've earned the "${badge.name}" badge from AWS User Group Madurai! 🎉`,
    badge.description,
    'Grateful to the community for the learning and support.',
    `Verify it here: ${shareUrl}`,
    '#AWS #AWSUserGroup #AWSCommunity #CloudComputing #OpenBadges',
  ].filter(Boolean).join('\n\n');
}

/**
 * LinkedIn's post composer with the text already in it. LinkedIn builds the
 * preview card (badge image and title) from the link in the text.
 */
export function getLinkedInPostUrl(text: string): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
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
    // OB v2 hosted verification: a revoked assertion answers 410 Gone.
    if (res.status === 410) {
      const body = await res.json().catch(() => ({}));
      steps.push({ label: 'Badge has not been revoked', status: 'fail', detail: body.revocationReason || 'Revoked by the issuer' });
      return { valid: false, steps };
    }
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
    // Credly (and so AWS certification badges) uses "hosted"; both are valid OB v2.
    [['HostedBadge', 'hosted'].includes(assertion.verification?.type ?? ''), 'verification is hosted', assertion.verification?.type],
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
