import { callApi } from './api';

export interface CloudClubTask {
  id: string;
  title: string;
  description: string;
  points: number;
  category: 'onboarding' | 'learning' | 'community' | 'event' | 'special';
  isPredefined: boolean;
  isDefault?: boolean;
  order?: number;
}

export interface CloudClubTaskCompletion {
  taskId: string;
  completedAt: string;
  bonusPoints?: number;
  taskPoints?: number;
}

export interface CloudClubTaskSubmission {
  id: string;
  clubId: string;
  taskId: string;
  submittedBy: string;
  submittedByName: string;
  comments: string;
  fileUrl?: string;
  fileName?: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_revision';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewComments?: string;
  pointsAwarded?: number;
}

export interface CloudClubPointActivity {
  id: string;
  points: number;
  reason: string;
  awardedAt: string;
  date?: string;
}

export interface CloudClubEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'workshop' | 'webinar' | 'meetup' | 'hackathon';
  attendees: number;
  pointsAwarded: number;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export interface CloudClub {
  id: string;
  name: string;
  shortName: string;
  location: string;
  clubLead: string;
  clubLeadId?: string;
  totalPoints: number;
  rank: number;
  joinedDate: string;
  completedTasks: CloudClubTaskCompletion[];
  hostedEvents: CloudClubEvent[];
  members: string[];
  assignedTaskIds?: string[];
  logo?: string;
  pointActivities?: CloudClubPointActivity[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCloudClubData {
  id: string;
  name: string;
  shortName: string;
  location: string;
  clubLead: string;
  clubLeadId?: string;
  logo?: string;
}

export interface UpdateCloudClubData {
  name?: string;
  shortName?: string;
  location?: string;
  clubLead?: string;
  clubLeadId?: string;
  totalPoints?: number;
  rank?: number;
  logo?: string;
  completedTasks?: CloudClubTaskCompletion[];
  hostedEvents?: CloudClubEvent[];
  members?: string[];
  pointActivities?: CloudClubPointActivity[];
}

// Get all cloud clubs
export async function getAllCloudClubs(): Promise<CloudClub[]> {
  const response = await callApi('/cloud-clubs', {
    method: 'GET',
  });
  
  if (Array.isArray(response)) {
    return response;
  } else if (response && Array.isArray(response.cloudClubs)) {
    return response.cloudClubs;
  }
  
  return [];
}

// Get single cloud club by ID
export async function getCloudClub(clubId: string): Promise<CloudClub> {
  return callApi(`/cloud-clubs/${clubId}`, {
    method: 'GET',
  });
}

// Create new cloud club
export async function createCloudClub(data: CreateCloudClubData): Promise<{ success: boolean; club: CloudClub }> {
  return callApi('/cloud-clubs', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update cloud club
export async function updateCloudClub(clubId: string, data: UpdateCloudClubData): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete cloud club
export async function deleteCloudClub(clubId: string): Promise<{ success: boolean; message: string }> {
  return callApi(`/cloud-clubs/${clubId}`, {
    method: 'DELETE',
  });
}

// Complete a task
export async function completeClubTask(clubId: string, taskId: string, bonusPoints?: number, taskPoints?: number): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ taskId, bonusPoints, taskPoints }),
  });
}

// Update a completed task
export async function updateClubTask(clubId: string, taskId: string, data: Partial<CloudClubTaskCompletion>): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Remove a completed task
export async function removeClubTask(clubId: string, taskId: string): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// Add an event
export async function addClubEvent(clubId: string, event: CloudClubEvent): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

// Add a member to cloud club
export async function addClubMember(clubId: string, userId: string): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

// Remove a member from cloud club
export async function removeClubMember(clubId: string, userId: string): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/members`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// Assign tasks to cloud club
export async function assignTasksToClub(clubId: string, taskIds: string[]): Promise<{ success: boolean; club: CloudClub }> {
  return callApi(`/cloud-clubs/${clubId}/assign-tasks`, {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  });
}

// Submit task for review
export async function submitClubTaskForReview(
  clubId: string,
  taskId: string,
  comments: string,
  submittedBy: string,
  submittedByName: string,
  fileUrl?: string,
  fileName?: string
): Promise<{ success: boolean; submission: CloudClubTaskSubmission }> {
  return callApi(`/cloud-clubs/${clubId}/tasks/${taskId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ comments, fileUrl, fileName, submittedBy, submittedByName }),
  });
}

// Get all task submissions (admin)
export async function getAllClubTaskSubmissions(): Promise<CloudClubTaskSubmission[]> {
  const response = await callApi('/cloud-clubs/submissions', {
    method: 'GET',
  });
  
  if (Array.isArray(response)) {
    return response;
  } else if (response && Array.isArray(response.submissions)) {
    return response.submissions;
  }
  
  return [];
}

// Review task submission (admin)
export async function reviewClubTaskSubmission(
  submissionId: string,
  status: 'approved' | 'rejected' | 'needs_revision',
  reviewComments?: string,
  pointsAwarded?: number
): Promise<{ success: boolean; submission: CloudClubTaskSubmission }> {
  return callApi(`/cloud-clubs/submissions/${submissionId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, reviewComments, pointsAwarded }),
  });
}

// ============ TASK MANAGEMENT ============
export async function createCloudClubTask(taskData: {
  title: string;
  description: string;
  points: number;
  category: string;
  order: number;
  isDefault: boolean;
}): Promise<CloudClubTask> {
  const response = await callApi<{ task: CloudClubTask }>('/cloud-clubs/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
  return response.task;
}

export async function updateCloudClubTask(taskId: string, taskData: {
  title: string;
  description: string;
  points: number;
  category: string;
  order: number;
  isDefault: boolean;
}): Promise<CloudClubTask> {
  const response = await callApi<{ task: CloudClubTask }>(`/cloud-clubs/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(taskData),
  });
  return response.task;
}

export async function deleteCloudClubTask(taskId: string): Promise<void> {
  await callApi(`/cloud-clubs/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export async function getAllCloudClubTasks(): Promise<CloudClubTask[]> {
  const response = await callApi<{ tasks: CloudClubTask[] }>('/cloud-clubs/tasks', {
    method: 'GET',
  });
  return response.tasks;
}
