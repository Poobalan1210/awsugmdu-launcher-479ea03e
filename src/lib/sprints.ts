import { callApi } from './api';
import { Sprint, Session, Submission } from '@/data/mockData';

export interface CreateSprintData {
  title: string;
  theme?: string;
  description: string;
  startDate: string;
  endDate: string;
  githubRepo?: string;
}

export interface UpdateSprintData extends Partial<CreateSprintData> {
  status?: 'upcoming' | 'active' | 'completed';
}

export interface SprintsResponse {
  sprints: Sprint[];
}

export interface SprintResponse {
  sprint: Sprint;
}

export interface CreateSessionData {
  title: string;
  speaker: string;
  speakerId?: string;
  speakerPhoto?: string;
  speakerDesignation?: string;
  speakerCompany?: string;
  speakerBio?: string;
  speakerLinkedIn?: string;
  hosts?: any[];
  speakers?: any[];
  volunteers?: any[];
  date: string;
  time: string;
  duration?: string;
  description: string;
  richDescription?: string;
  agenda?: string[];
  meetingLink?: string;
  meetupUrl?: string;
  recordingUrl?: string;
  youtubeUrl?: string;
  slidesUrl?: string;
  posterImage?: string;
}

export interface AddSessionResponse {
  sprint: Sprint;
  session: Session;
}

export interface RegisterSprintResponse {
  sprint: Sprint;
  message: string;
  alreadyRegistered?: boolean;
}

export interface RegisterSessionResponse {
  sprint: Sprint;
  session: Session;
  message: string;
  alreadyRegistered?: boolean;
}

export async function registerForSprint(id: string, userId: string): Promise<RegisterSprintResponse> {
  const response = await callApi<RegisterSprintResponse>(`/sprints/${id}/register`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return response;
}

export async function registerForSession(sprintId: string, sessionId: string, userId: string): Promise<RegisterSessionResponse> {
  const response = await callApi<RegisterSessionResponse>(`/sprints/${sprintId}/sessions/${sessionId}/register`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return response;
}

export interface SubmitWorkData {
  userId: string;
  userName: string;
  userAvatar?: string;
  blogUrl?: string;
  repoUrl?: string;
  description?: string;
}

export interface SubmitWorkResponse {
  sprint: Sprint;
  submission: Submission;
}

export async function getSprints(status?: 'upcoming' | 'active' | 'completed'): Promise<Sprint[]> {
  const queryParams = status ? `?status=${status}` : '';
  const response = await callApi<SprintsResponse>(`/sprints${queryParams}`);
  return response.sprints || [];
}

export async function getSprint(id: string): Promise<Sprint> {
  const response = await callApi<SprintResponse>(`/sprints/${id}`);
  return response.sprint;
}

export async function createSprint(data: CreateSprintData): Promise<Sprint> {
  const response = await callApi<SprintResponse>('/sprints', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.sprint;
}

export async function updateSprint(id: string, data: UpdateSprintData): Promise<Sprint> {
  const response = await callApi<SprintResponse>(`/sprints/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.sprint;
}

export async function addSession(sprintId: string, data: CreateSessionData): Promise<AddSessionResponse> {
  const response = await callApi<AddSessionResponse>(`/sprints/${sprintId}/sessions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}

export async function updateSession(sprintId: string, sessionId: string, data: Partial<CreateSessionData>): Promise<AddSessionResponse> {
  const response = await callApi<AddSessionResponse>(`/sprints/${sprintId}/sessions/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response;
}

export async function deleteSprint(id: string): Promise<{ message: string; id: string }> {
  const response = await callApi<{ message: string; id: string }>(`/sprints/${id}`, {
    method: 'DELETE',
  });
  return response;
}

export async function deleteSession(sprintId: string, sessionId: string): Promise<AddSessionResponse> {
  const response = await callApi<AddSessionResponse>(`/sprints/${sprintId}/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  return response;
}

export async function submitWork(sprintId: string, data: SubmitWorkData): Promise<SubmitWorkResponse> {
  const response = await callApi<SubmitWorkResponse>(`/sprints/${sprintId}/submit`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}
