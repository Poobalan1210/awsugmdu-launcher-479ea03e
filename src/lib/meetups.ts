import { callApi } from './api';
import { Meetup, MeetupType } from '@/data/mockData';

export type { MeetupType };

export interface CreateMeetupData {
  title: string;
  description?: string;
  richDescription?: string;
  date: string;
  time: string;
  duration?: string;
  type: MeetupType;
  location?: string;
  meetingLink?: string;
  meetupUrl?: string;
  image?: string;
  maxAttendees?: number;
  speakers?: any[];
  hosts?: any[];
  volunteers?: any[];
  sprintId?: string | null;
  certificationGroupId?: string | null;
  collegeId?: string | null;
  cloudClubId?: string | null;
  endDate?: string;
  sessionPoints?: number;
  speakerPoints?: number;
  volunteerPoints?: number;
  hostPoints?: number;
}

export interface UpdateMeetupData extends Partial<CreateMeetupData> {
  richDescription?: string;
}

export interface MeetupsResponse {
  meetups: Meetup[];
}

export interface MeetupResponse {
  meetup: Meetup;
}

/**
 * A speaker is "active" (shown publicly and counted) when either:
 *  - they were added directly by an organiser (no invite flow, so no inviteStatus), or
 *  - they accepted their invitation (inviteStatus === 'accepted').
 * Pending and declined invitations are hidden until accepted.
 */
export function isActiveSpeaker(speaker: { inviteStatus?: string } | undefined | null): boolean {
  if (!speaker) return false;
  return !speaker.inviteStatus || speaker.inviteStatus === 'accepted';
}

/** Filter a speakers array down to only the active (accepted/direct) speakers. */
export function getActiveSpeakers<T extends { inviteStatus?: string }>(speakers?: T[] | null): T[] {
  return (speakers || []).filter(isActiveSpeaker);
}

export async function getMeetups(status?: 'draft' | 'upcoming' | 'completed' | 'ongoing'): Promise<Meetup[]> {
  const queryParams = status ? `?status=${status}` : '';
  const response = await callApi<MeetupsResponse>(`/meetups${queryParams}`);
  return response.meetups || [];
}

export async function getMeetup(id: string): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${id}`);
  return response.meetup;
}

export async function createMeetup(data: CreateMeetupData): Promise<Meetup> {
  const response = await callApi<MeetupResponse>('/meetups', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.meetup;
}

export async function updateMeetup(id: string, data: UpdateMeetupData): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.meetup;
}

export async function publishMeetup(id: string, publish: boolean): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${id}/publish`, {
    method: 'PATCH',
    body: JSON.stringify({ publish }),
  });
  return response.meetup;
}

export async function deleteMeetup(id: string): Promise<void> {
  await callApi(`/meetups/${id}`, {
    method: 'DELETE',
  });
}

export async function endMeetup(id: string, endDate?: string): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${id}/end`, {
    method: 'PATCH',
    body: JSON.stringify(endDate ? { endDate } : { endNow: true }),
  });
  return response.meetup;
}

export interface RegisterMeetupResponse {
  meetup: Meetup;
  message: string;
  alreadyRegistered?: boolean;
}

export interface MeetupParticipant {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  designation?: string;
  company?: string;
}

export async function registerForMeetup(id: string, userId: string): Promise<RegisterMeetupResponse> {
  const response = await callApi<RegisterMeetupResponse>(`/meetups/${id}/register`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return response;
}

export async function getMeetupParticipants(id: string): Promise<MeetupParticipant[]> {
  try {
    const response = await callApi<{ participants: MeetupParticipant[] }>(`/meetups/${id}/participants`);
    return response.participants || [];
  } catch (error) {
    console.error('Error fetching participants:', error);
    return [];
  }
}

export async function getMeetupsBySprint(sprintId: string): Promise<Meetup[]> {
  try {
    const response = await callApi<MeetupsResponse>(`/meetups?sprintId=${sprintId}`);
    return response.meetups || [];
  } catch (error) {
    console.error('Error fetching sprint meetups:', error);
    return [];
  }
}

export async function getMeetupsByCertificationGroup(certificationGroupId: string): Promise<Meetup[]> {
  try {
    const response = await callApi<MeetupsResponse>(`/meetups?certificationGroupId=${certificationGroupId}`);
    return response.meetups || [];
  } catch (error) {
    console.error('Error fetching certification group meetups:', error);
    return [];
  }
}

export interface MarkAttendanceRequest {
  // Meetup member IDs (from the "Member ID" column of the Meetup attendees CSV)
  memberIds: string[];
  pointsPerAttendee?: number;
}

export interface MarkAttendanceResult {
  memberId: string;
  userId?: string;
  name?: string;
  pointsAwarded?: number;
  newTotal?: number;
  error?: string;
}

export interface MarkAttendanceResponse {
  message: string;
  results: {
    success: MarkAttendanceResult[];
    notFound: string[]; // member IDs with no matching member in our system
    alreadyMarked: MarkAttendanceResult[]; // already attended, not re-awarded
    notVerified: MarkAttendanceResult[]; // matched but not Meetup-verified
    errors: MarkAttendanceResult[];
  };
  summary: {
    total: number;
    successful: number;
    notFound: number;
    alreadyMarked: number;
    notVerified: number;
    errors: number;
  };
}

export async function markMeetupAttendance(
  meetupId: string,
  data: MarkAttendanceRequest
): Promise<MarkAttendanceResponse> {
  const response = await callApi<MarkAttendanceResponse>(`/meetups/${meetupId}/mark-attendance`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}


export interface MarkAttendanceData {
  attendedUserIds: string[];
  awardPoints?: boolean;
  attendeePoints?: number;
}

export async function markAttendance(meetupId: string, data: MarkAttendanceData): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${meetupId}/attendance`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.meetup;
}


// Post-event photos
export async function addMeetupPhotos(meetupId: string, photoUrls: string[]): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${meetupId}/photos`, {
    method: 'POST',
    body: JSON.stringify({ photoUrls }),
  });
  return response.meetup;
}

export async function removeMeetupPhoto(meetupId: string, photoUrl: string): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${meetupId}/photos`, {
    method: 'DELETE',
    body: JSON.stringify({ photoUrl }),
  });
  return response.meetup;
}

// Post-event report (for college-champ sessions)
export async function addMeetupReport(meetupId: string, url: string, fileName: string): Promise<Meetup> {
  const response = await callApi<MeetupResponse>(`/meetups/${meetupId}/report`, {
    method: 'POST',
    body: JSON.stringify({ url, fileName }),
  });
  return response.meetup;
}

// ============== Speaker invitations + code of conduct ==============

export interface SpeakerInviteData {
  email: string;
  name?: string;
  topic?: string;
  sessionDetails?: string;
  // Optional: link the invite to an existing platform user
  userId?: string;
}

export interface SpeakerInviteResponse {
  meetup: Meetup;
  message: string;
  inviteUrl: string;
  emailSent: boolean;
}

/**
 * Admin action: invite a speaker to a meetup. Sends an email asking them to
 * review the Speaker Code of Conduct and accept the invitation. The speaker is
 * NOT added to the speaker list / registered until they accept.
 */
export async function inviteSpeaker(
  meetupId: string,
  data: SpeakerInviteData
): Promise<SpeakerInviteResponse> {
  return callApi<SpeakerInviteResponse>(`/meetups/${meetupId}/invite-speaker`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface SpeakerInviteDetails {
  meetupId: string;
  meetupTitle: string;
  meetupDate: string;
  meetupTime: string;
  speakerName: string;
  invitedEmail: string;
  topic?: string;
  inviteStatus: 'pending' | 'accepted' | 'declined';
}

/**
 * Public: look up the details of a speaker invitation by token.
 * Used to render the acceptance page before the speaker signs in.
 */
export async function getSpeakerInvite(
  meetupId: string,
  token: string
): Promise<SpeakerInviteDetails> {
  const response = await callApi<{ invite: SpeakerInviteDetails }>(
    `/meetups/${meetupId}/speaker-invite/${token}`
  );
  return response.invite;
}

export interface RespondSpeakerInviteData {
  token: string;
  // The signed-in user's id and email (must match the invited email)
  userId: string;
  agreedToCodeOfConduct: boolean;
  codeOfConductVersion?: string;
}

export interface RespondSpeakerInviteResponse {
  meetup: Meetup;
  message: string;
}

/**
 * Authenticated: the invited speaker accepts the invitation after agreeing to
 * the Speaker Code of Conduct. On success they are added as a speaker and
 * registered for the meetup, bypassing the Meetup.com membership gate (the
 * organiser's invite is the trust signal here).
 */
export async function acceptSpeakerInvite(
  meetupId: string,
  data: RespondSpeakerInviteData
): Promise<RespondSpeakerInviteResponse> {
  const { token, ...rest } = data;
  return callApi<RespondSpeakerInviteResponse>(`/meetups/${meetupId}/speaker-invite/${token}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'accept', ...rest }),
  });
}

export async function declineSpeakerInvite(
  meetupId: string,
  token: string
): Promise<{ message: string }> {
  return callApi<{ message: string }>(`/meetups/${meetupId}/speaker-invite/${token}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'decline' }),
  });
}
