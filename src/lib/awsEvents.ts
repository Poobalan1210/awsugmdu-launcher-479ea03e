import { callApi } from './api';
import { AWSEvent, AWSEventSubmission } from '@/data/mockData';

export async function getAWSEvents(): Promise<AWSEvent[]> {
  try {
    const data = await callApi('/aws-events', { method: 'GET' });
    // Sort by date descending
    return (data || []).sort((a: AWSEvent, b: AWSEvent) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  } catch (error) {
    console.error('Error fetching AWS Events:', error);
    return [];
  }
}

export async function createAWSEvent(data: { title: string; description: string; date: string; points: number }): Promise<AWSEvent> {
  return callApi('/aws-events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAWSEvent(id: string, data: Partial<AWSEvent>): Promise<AWSEvent> {
  return callApi(`/aws-events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAWSEvent(id: string): Promise<void> {
  return callApi(`/aws-events/${id}`, {
    method: 'DELETE',
  });
}

export async function submitEventProof(eventId: string, data: { userId: string; userName: string; userAvatar?: string; linkedInUrl: string; photoUrl: string }): Promise<AWSEventSubmission> {
  return callApi(`/aws-events/${eventId}/submissions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getPendingEventSubmissions(): Promise<AWSEventSubmission[]> {
  try {
    const data = await callApi('/aws-events/submissions/pending', { method: 'GET' });
    return (data || []).sort((a: AWSEventSubmission, b: AWSEventSubmission) => 
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );
  } catch (error) {
    console.error('Error fetching pending event submissions:', error);
    return [];
  }
}

export async function reviewEventSubmission(
  submissionId: string, 
  status: 'approved' | 'rejected', 
  reviewerName: string, 
  reviewerId: string
): Promise<AWSEventSubmission> {
  return callApi(`/aws-events/submissions/${submissionId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, reviewerName, reviewerId }),
  });
}

export async function getEventSubmissions(eventId: string): Promise<AWSEventSubmission[]> {
  try {
    return await callApi(`/aws-events/${eventId}/submissions`, { method: 'GET' });
  } catch (error) {
    console.error('Error fetching submissions for event:', error);
    return [];
  }
}
