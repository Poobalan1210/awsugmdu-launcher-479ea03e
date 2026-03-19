/**
 * Generate a deterministic, human-readable profile slug from user name + userId.
 * Example: "Poobalan Pitchandi" with userId "abc123..." → "poobalan-pitchandi-a1b2"
 * The 4-char hash suffix ensures uniqueness even with duplicate names.
 */
export function generateProfileSlug(name: string, userId: string): string {
  const nameSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Generate a short hash from the userId for uniqueness
  const hash = shortHash(userId);

  return `${nameSlug}-${hash}`;
}

/**
 * Extract the hash suffix from a profile slug (last 4 chars after final hyphen).
 */
export function extractHashFromSlug(slug: string): string {
  const parts = slug.split('-');
  return parts[parts.length - 1];
}

/**
 * Check if a user matches a given profile slug.
 */
export function matchesSlug(slug: string, userName: string, userId: string): boolean {
  return generateProfileSlug(userName, userId) === slug;
}

/**
 * Get the internal route path for a user's profile.
 * Use this for all <Link to={...}> in the app.
 */
export function profilePath(name: string, userId: string): string {
  return `/u/${generateProfileSlug(name, userId)}`;
}

/**
 * Generate a shareable profile URL.
 */
export function getShareableProfileUrl(name: string, userId: string): string {
  const slug = generateProfileSlug(name, userId);
  return `${window.location.origin}/u/${slug}`;
}

/**
 * Simple deterministic 4-char hex hash from a string.
 */
function shortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to positive hex and take 4 chars
  return Math.abs(hash).toString(16).slice(0, 4).padStart(4, '0');
}
