import { callApi } from './api';

/**
 * 'coupon' is written only by redeeming a prize coupon, and 'builder_center'
 * only by claiming Builder Center articles, never by an admin award.
 */
export type PointActivityType = 'adhoc' | 'submission' | 'badge' | 'event' | 'coupon' | 'builder_center';

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
  type: Exclude<PointActivityType, 'coupon' | 'builder_center'>;
  awardedBy: string;
}

export interface PointActivitiesResponse {
  activities: PointActivity[];
}

export interface PointActivityResponse {
  activity: PointActivity;
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
