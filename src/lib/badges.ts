/**
 * Badge definitions API client
 * Manages the badge catalog stored in DynamoDB via the badges-crud Lambda.
 *
 * Endpoints:
 *   GET    /badges        → list all badges (built-in + custom)
 *   GET    /badges/{id}   → get single badge
 *   POST   /badges        → create badge (admin only)
 *   PUT    /badges/{id}   → update badge (admin only)
 *   DELETE /badges/{id}   → delete badge (admin only)
 */

import { callApi } from './api';
import { Badge, BadgeCriteria, mockBadges } from '@/data/mockData';

export interface BadgeListResponse {
  badges: Badge[];
}

export interface BadgeResponse {
  badge: Badge;
}

export interface CreateBadgeData {
  name: string;
  description: string;
  icon: string;
  imageUrl?: string;
  criteria: BadgeCriteria;
}

/** Fetch all badges from the API. Falls back to mockBadges if API is unavailable. */
export async function getBadges(): Promise<Badge[]> {
  try {
    const res = await callApi<BadgeListResponse>('/badges');
    return res.badges || [];
  } catch (err) {
    console.warn('Failed to fetch badges from API, using mock data:', err);
    return mockBadges;
  }
}

/** Create a new badge. Returns the created badge. */
export async function createBadge(data: CreateBadgeData): Promise<Badge> {
  const res = await callApi<BadgeResponse>('/badges', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.badge;
}

/** Update an existing badge. */
export async function updateBadge(id: string, data: Partial<CreateBadgeData>): Promise<Badge> {
  const res = await callApi<BadgeResponse>(`/badges/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res.badge;
}

/** Delete a badge by ID. */
export async function deleteBadge(id: string): Promise<void> {
  await callApi(`/badges/${id}`, { method: 'DELETE' });
}
