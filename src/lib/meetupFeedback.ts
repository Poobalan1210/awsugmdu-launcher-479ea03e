import { callApi } from './api';
import { Meetup, MeetupFeedback } from '@/data/mockData';

export interface SubmitFeedbackPayload {
  rating: number;
  wouldRecommend: boolean;
  learnings: string;
  suggestions: string;
  favoritePart?: string;
}

export interface SubmitFeedbackResponse {
  feedback: MeetupFeedback;
  pointsAwarded: number;
  alreadyAttended: boolean;
  message: string;
}

/** Submit feedback for a completed meetup (also records attendance + awards points). */
export async function submitMeetupFeedback(
  meetupId: string,
  payload: SubmitFeedbackPayload
): Promise<SubmitFeedbackResponse> {
  return callApi<SubmitFeedbackResponse>(`/meetups/${meetupId}/feedback`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Get the current user's feedback for a meetup (or null if not submitted yet). */
export async function getMyMeetupFeedback(meetupId: string): Promise<MeetupFeedback | null> {
  try {
    const res = await callApi<{ feedback: MeetupFeedback | null }>(
      `/meetups/${meetupId}/feedback/me`
    );
    return res.feedback || null;
  } catch (error) {
    // 401/403 indicates user not authenticated yet - treat as "no feedback"
    console.warn('getMyMeetupFeedback failed:', error);
    return null;
  }
}

/** Admin: list all feedback submitted for a meetup. */
export async function listMeetupFeedback(meetupId: string): Promise<MeetupFeedback[]> {
  const res = await callApi<{ feedback: MeetupFeedback[] }>(`/meetups/${meetupId}/feedback`);
  return res.feedback || [];
}

export interface FeedbackSettingsPayload {
  feedbackEnabled?: boolean;
  attendeePoints?: number;
}

/** Admin: toggle feedback on/off and set attendee point value. */
export async function updateMeetupFeedbackSettings(
  meetupId: string,
  settings: FeedbackSettingsPayload
): Promise<Meetup> {
  const res = await callApi<{ meetup: Meetup }>(`/meetups/${meetupId}/feedback-settings`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
  return res.meetup;
}
