/**
 * Generate a human-readable sprint slug from sprint title + sprintId.
 * Example: "Serverless with Lambda" with id "sprint-123..." → "serverless-with-lambda-a1b2"
 * The 4-char hash suffix ensures uniqueness even with duplicate titles.
 */
export function generateSprintSlug(title: string, sprintId: string): string {
  const titleSlug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const hash = shortHash(sprintId);
  return `${titleSlug}-${hash}`;
}

/**
 * Extract the hash suffix from a sprint slug (last 4 chars after final hyphen).
 */
export function extractHashFromSprintSlug(slug: string): string {
  const parts = slug.split('-');
  return parts[parts.length - 1];
}

/**
 * Check if a sprint matches a given slug.
 */
export function matchesSprintSlug(slug: string, title: string, sprintId: string): boolean {
  return generateSprintSlug(title, sprintId) === slug;
}

/**
 * Get the internal route path for a sprint.
 */
export function sprintPath(title: string, sprintId: string): string {
  return `/skill-sprint/${generateSprintSlug(title, sprintId)}`;
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
  return Math.abs(hash).toString(16).slice(0, 4).padStart(4, '0');
}
