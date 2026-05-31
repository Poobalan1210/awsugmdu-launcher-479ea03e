import { callApi } from './api';

export interface CommunityStats {
  memberCount: number;
  badgeCount: number;
  meetupCount: number;
  activeSprint: {
    id: string;
    title: string;
    status: string;
  } | null;
  generatedAt: string;
}

/**
 * Fetch lightweight aggregate community stats for the home page hero.
 *
 * This hits the dedicated `/stats` endpoint which returns only the counts we
 * need (members, badges, meetups, active sprint) instead of scanning and
 * transferring every full user record like `getAllUsers` does.
 */
export async function getCommunityStats(): Promise<CommunityStats> {
  return callApi<CommunityStats>('/stats', { method: 'GET' });
}
