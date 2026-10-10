import { callApi } from './api';

/** 'coupon' is written only by redeeming a prize coupon, never by an admin award. */
export type PointActivityType = 'adhoc' | 'submission' | 'badge' | 'event' | 'coupon';

export interface PointActivity {
  id: string;
  userId: string;
  points: number;
  reason: string;
  type: PointActivityType;
  awardedBy?: string;
  awardedAt: string;
}

export interface AwardPointsData {
  userId: string;
  points: number;
  reason: string;
  type: Exclude<PointActivityType, 'coupon'>;
  awardedBy: string;
}

export interface PointActivitiesResponse {
  activities: PointActivity[];
}

export interface PointActivityResponse {
  activity: PointActivity;
}

// Get all point activities
export async function getAllPointActivities(): Promise<PointActivity[]> {
  const response = await callApi<PointActivitiesResponse>('/users/points/activities');
  return response.activities || [];
}

// Get point activities for a specific user
export async function getUserPointActivities(userId: string): Promise<PointActivity[]> {
  const response = await callApi<PointActivitiesResponse>(`/users/${userId}/points/activities`);
  return response.activities || [];
}

// Award points to a user
export async function awardPoints(data: AwardPointsData): Promise<PointActivity> {
  const response = await callApi<PointActivityResponse>('/users/points/award', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.activity;
}

// Get user's total points
export async function getUserPoints(userId: string): Promise<{ points: number; redeemablePoints: number }> {
  const response = await callApi<{ points: number; redeemablePoints: number }>(`/users/${userId}/points`);
  return {
    points: response.points || 0,
    redeemablePoints: response.redeemablePoints ?? response.points ?? 0,
  };
}
