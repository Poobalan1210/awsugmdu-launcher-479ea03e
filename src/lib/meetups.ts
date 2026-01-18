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
  sprintId?: string;
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
