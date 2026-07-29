import { callApi } from './api';
import { SpotlightSubmission } from '@/data/mockData';

/**
 * Days an approved submission stays listed in the public spotlight.
 * Mirrors the SPOTLIGHT_VISIBILITY_DAYS default on the spotlight-crud Lambda and
 * is only used as a fallback when the API response predates that field.
 */
export const SPOTLIGHT_VISIBILITY_DAYS = 30;

export interface SpotlightListResponse {
  submissions: SpotlightSubmission[];
  visibilityDays?: number;
}

export interface SpotlightResponse {
  submission: SpotlightSubmission;
}

export interface SubmitSpotlightData {
  userId: string;
  userName: string;
  userAvatar?: string;
  title: string;
  description: string;
  type: 'project' | 'blog' | 'video' | 'other';
  url: string;
  imageUrl?: string;
  tags: string[];
}

export interface UpdateSpotlightData {
  /** Owner of the submission — the backend rejects the request if it does not match. */
  userId: string;
  title: string;
  description: string;
  type: 'project' | 'blog' | 'video' | 'other';
  url: string;
  imageUrl?: string;
  tags: string[];
}

export interface ReviewSpotlightData {
  status: 'approved' | 'rejected';
  points?: number;
  adminNotes?: string;
  reviewedBy: string;
  reviewerName?: string;
}

// Get spotlight submissions (filter by status and/or userId)
export async function getSpotlightSubmissions(
  status?: 'pending' | 'approved' | 'rejected',
  userId?: string
): Promise<SpotlightSubmission[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (userId) params.set('userId', userId);
  const qs = params.toString();
  const response = await callApi<SpotlightListResponse>(`/spotlight${qs ? `?${qs}` : ''}`);
  return response.submissions || [];
}

// Approved submissions currently listed in the public spotlight.
// Anything past its visibility window is dropped server-side.
export async function getVisibleSpotlightSubmissions(): Promise<SpotlightSubmission[]> {
  const response = await callApi<SpotlightListResponse>('/spotlight?status=approved&visibleOnly=1');
  return response.submissions || [];
}

/** End of an approved submission's public listing window, or null if not applicable. */
export function getSpotlightExpiresAt(item: SpotlightSubmission): Date | null {
  if (item.status !== 'approved') return null;

  if (item.expiresAt) {
    const fromApi = new Date(item.expiresAt);
    if (!Number.isNaN(fromApi.getTime())) return fromApi;
  }

  // Fallback for responses without the derived field: approval time, else submission time.
  const publishedAt = item.publishedAt || item.reviewedAt || item.submittedAt;
  if (!publishedAt) return null;

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;

  return new Date(published.getTime() + SPOTLIGHT_VISIBILITY_DAYS * 24 * 60 * 60 * 1000);
}

/** True once an approved submission has rotated out of the public spotlight. */
export function isSpotlightExpired(item: SpotlightSubmission): boolean {
  if (item.status !== 'approved') return false;
  if (typeof item.expired === 'boolean') return item.expired;

  const expiresAt = getSpotlightExpiresAt(item);
  return !!expiresAt && Date.now() >= expiresAt.getTime();
}

// Submit a spotlight request
export async function submitSpotlight(data: SubmitSpotlightData): Promise<SpotlightSubmission> {
  const response = await callApi<SpotlightResponse>('/spotlight', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.submission;
}

// Update an existing submission (owner only, while pending or rejected)
export async function updateSpotlight(
  id: string,
  data: UpdateSpotlightData
): Promise<SpotlightSubmission> {
  const response = await callApi<SpotlightResponse>(`/spotlight/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.submission;
}

// Review a spotlight submission (admin)
export async function reviewSpotlight(
  id: string,
  data: ReviewSpotlightData
): Promise<SpotlightSubmission> {
  const response = await callApi<SpotlightResponse>(`/spotlight/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.submission;
}

// Delete a spotlight submission.
// Pass userId when the submitter deletes their own entry so the backend can
// verify ownership. Admin callers omit it.
export async function deleteSpotlight(id: string, userId?: string): Promise<{ message: string }> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const response = await callApi<{ message: string }>(`/spotlight/${id}${qs}`, {
    method: 'DELETE',
  });
  return response;
}
