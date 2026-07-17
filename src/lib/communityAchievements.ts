import { callApi } from './api';

/**
 * Admin-managed achievement cards (image + title + LinkedIn URL) shown on the
 * public Achievements page. Backed by the `/achievements` REST endpoint.
 *
 * Note: this is distinct from the static `src/data/achievements.ts` (which holds
 * the hero milestones / stat band). This module is the dynamic, CRUD-able list.
 */
export interface Achievement {
  id: string;
  title: string;
  /** Public image URL (uploaded via S3 or pasted). */
  imageUrl: string;
  /** LinkedIn post URL the card links to. */
  linkedInUrl: string;
  createdAt?: string;
  updatedAt?: string;
}

export type AchievementInput = Pick<Achievement, 'title' | 'imageUrl' | 'linkedInUrl'>;

/** Fetch all achievements, newest first. Returns [] on failure. */
export async function getAchievements(): Promise<Achievement[]> {
  try {
    const data = await callApi<Achievement[]>('/achievements', { method: 'GET' });
    const items = Array.isArray(data) ? data : [];
    // Newest added shows first.
    return items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch (error) {
    console.error('Error fetching achievements:', error);
    return [];
  }
}

export async function createAchievement(data: AchievementInput): Promise<Achievement> {
  return callApi<Achievement>('/achievements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAchievement(id: string, updates: Partial<AchievementInput>): Promise<Achievement> {
  return callApi<Achievement>(`/achievements/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

export async function deleteAchievement(id: string): Promise<void> {
  await callApi(`/achievements/${id}`, { method: 'DELETE' });
}
