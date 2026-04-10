import { callApi } from './api';
import { SpotlightSubmission } from '@/data/mockData';

export interface SpotlightListResponse {
  submissions: SpotlightSubmission[];
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

// Submit a spotlight request
export async function submitSpotlight(data: SubmitSpotlightData): Promise<SpotlightSubmission> {
  const response = await callApi<SpotlightResponse>('/spotlight', {
    method: 'POST',
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

// Delete a spotlight submission
export async function deleteSpotlight(id: string): Promise<{ message: string }> {
  const response = await callApi<{ message: string }>(`/spotlight/${id}`, {
    method: 'DELETE',
  });
  return response;
}
