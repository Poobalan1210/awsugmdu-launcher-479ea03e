import { callApi } from './api';

export interface CollegeTask {
  id: string;
  title: string;
  description: string;
  points: number;
  category: 'onboarding' | 'learning' | 'community' | 'event' | 'special';
  isPredefined: boolean;
  isDefault?: boolean; // If true, applies to all colleges automatically
  order?: number;
}

export interface CollegeTaskCompletion {
  taskId: string;
  completedAt: string;
  bonusPoints?: number;
}

export interface CollegeTaskSubmission {
  id: string;
  collegeId: string;
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

export interface CollegePointActivity {
  id: string;
  points: number;
  reason: string;
  awardedAt: string;
}

export interface CollegeEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'workshop' | 'webinar' | 'meetup' | 'hackathon';
  attendees: number;
  pointsAwarded: number;
  status: 'upcoming' | 'completed' | 'cancelled';
}

export interface College {
  id: string;
  name: string;
  shortName: string;
  location: string;
  champsLead: string;
  champsLeadId?: string;
  totalPoints: number;
  rank: number;
  joinedDate: string;
  completedTasks: CollegeTaskCompletion[];
  hostedEvents: CollegeEvent[];
  members: string[];
  assignedTaskIds?: string[]; // College-specific task IDs (in addition to default tasks)
  logo?: string;
  pointActivities?: CollegePointActivity[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCollegeData {
  id: string;
  name: string;
  shortName: string;
  location: string;
  champsLead: string;
  champsLeadId?: string;
  logo?: string;
}

export interface UpdateCollegeData {
  name?: string;
  shortName?: string;
  location?: string;
  champsLead?: string;
  champsLeadId?: string;
  totalPoints?: number;
  rank?: number;
  logo?: string;
  completedTasks?: CollegeTaskCompletion[];
  hostedEvents?: CollegeEvent[];
  members?: string[];
  pointActivities?: CollegePointActivity[];
}

// Get all colleges
export async function getAllColleges(): Promise<College[]> {
  const response = await callApi('/colleges', {
    method: 'GET',
  });
  
  if (Array.isArray(response)) {
    return response;
  } else if (response && Array.isArray(response.colleges)) {
    return response.colleges;
  }
  
  return [];
}

// Get single college by ID
export async function getCollege(collegeId: string): Promise<College> {
  return callApi(`/colleges/${collegeId}`, {
    method: 'GET',
  });
}

// Create new college
export async function createCollege(data: CreateCollegeData): Promise<{ success: boolean; college: College }> {
  return callApi('/colleges', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Update college
export async function updateCollege(collegeId: string, data: UpdateCollegeData): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Delete college
export async function deleteCollege(collegeId: string): Promise<{ success: boolean; message: string }> {
  return callApi(`/colleges/${collegeId}`, {
    method: 'DELETE',
  });
}

// Complete a task
export async function completeTask(collegeId: string, taskId: string, bonusPoints?: number, taskPoints?: number): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ taskId, bonusPoints, taskPoints }),
  });
}

// Update a completed task
export async function updateTask(collegeId: string, taskId: string, data: Partial<CollegeTaskCompletion>): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// Remove a completed task
export async function removeTask(collegeId: string, taskId: string): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

// Add an event
export async function addEvent(collegeId: string, event: CollegeEvent): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/events`, {
    method: 'POST',
    body: JSON.stringify(event),
  });
}

// Add a member to college
export async function addMember(collegeId: string, userId: string): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

// Remove a member from college
export async function removeMember(collegeId: string, userId: string): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/members`, {
    method: 'DELETE',
    body: JSON.stringify({ userId }),
  });
}

// Assign tasks to college
export async function assignTasksToCollege(collegeId: string, taskIds: string[]): Promise<{ success: boolean; college: College }> {
  return callApi(`/colleges/${collegeId}/assign-tasks`, {
    method: 'POST',
    body: JSON.stringify({ taskIds }),
  });
}

// Submit task for review
export async function submitTaskForReview(
  collegeId: string,
  taskId: string,
  comments: string,
  submittedBy: string,
  submittedByName: string,
  fileUrl?: string,
  fileName?: string
): Promise<{ success: boolean; submission: CollegeTaskSubmission }> {
  return callApi(`/colleges/${collegeId}/tasks/${taskId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ comments, fileUrl, fileName, submittedBy, submittedByName }),
  });
}

// Get all task submissions (admin)
export async function getAllTaskSubmissions(): Promise<CollegeTaskSubmission[]> {
  const response = await callApi('/colleges/submissions', {
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
export async function reviewTaskSubmission(
  submissionId: string,
  status: 'approved' | 'rejected' | 'needs_revision',
  reviewComments?: string,
  pointsAwarded?: number
): Promise<{ success: boolean; submission: CollegeTaskSubmission }> {
  return callApi(`/colleges/submissions/${submissionId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, reviewComments, pointsAwarded }),
  });
}

// ============ TASK MANAGEMENT ============
export async function createCollegeTask(taskData: {
  title: string;
  description: string;
  points: number;
  category: string;
  order: number;
  isDefault: boolean;
}): Promise<CollegeTask> {
  const response = await callApi<{ task: CollegeTask }>('/colleges/tasks', {
    method: 'POST',
    body: JSON.stringify(taskData),
  });
  return response.task;
}

export async function updateCollegeTask(taskId: string, taskData: {
  title: string;
  description: string;
  points: number;
  category: string;
  order: number;
  isDefault: boolean;
}): Promise<CollegeTask> {
  const response = await callApi<{ task: CollegeTask }>(`/colleges/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify(taskData),
  });
  return response.task;
}

export async function deleteCollegeTask(taskId: string): Promise<void> {
  await callApi(`/colleges/tasks/${taskId}`, {
    method: 'DELETE',
  });
}

export async function getAllCollegeTasks(): Promise<CollegeTask[]> {
  const response = await callApi<{ tasks: CollegeTask[] }>('/colleges/tasks', {
    method: 'GET',
  });
  return response.tasks;
}
