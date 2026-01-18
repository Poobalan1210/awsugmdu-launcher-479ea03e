import { callApi } from './api';

export interface ForumPost {
  id: string;
  sprintId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  replies: ForumReply[];
  likes: number;
  likedBy?: string[];
}

export interface ForumReply {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  likes: number;
  likedBy?: string[];
}

export interface CreateDiscussionData {
  sprintId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  title: string;
  content: string;
}

export interface UpdateDiscussionData {
  title?: string;
  content?: string;
}

export interface CreateReplyData {
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
}

export interface DiscussionsResponse {
  discussions: ForumPost[];
}

export interface DiscussionResponse {
  discussion: ForumPost;
}

export interface ReplyResponse {
  discussion: ForumPost;
  reply: ForumReply;
}

export interface LikeResponse {
  discussion: ForumPost;
  liked: boolean;
}

// Get discussions by sprint
export async function getDiscussionsBySprint(sprintId: string): Promise<ForumPost[]> {
  const response = await callApi<DiscussionsResponse>(`/discussions?sprintId=${sprintId}`);
  return response.discussions || [];
}

// Get single discussion
export async function getDiscussion(id: string): Promise<ForumPost> {
  const response = await callApi<DiscussionResponse>(`/discussions/${id}`);
  return response.discussion;
}

// Create discussion
export async function createDiscussion(data: CreateDiscussionData): Promise<ForumPost> {
  const response = await callApi<DiscussionResponse>('/discussions', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.discussion;
}

// Update discussion
export async function updateDiscussion(id: string, data: UpdateDiscussionData): Promise<ForumPost> {
  const response = await callApi<DiscussionResponse>(`/discussions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.discussion;
}

// Delete discussion
export async function deleteDiscussion(id: string): Promise<{ message: string }> {
  const response = await callApi<{ message: string }>(`/discussions/${id}`, {
    method: 'DELETE',
  });
  return response;
}

// Add reply to discussion
export async function addReply(discussionId: string, data: CreateReplyData): Promise<ReplyResponse> {
  const response = await callApi<ReplyResponse>(`/discussions/${discussionId}/replies`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response;
}

// Update reply
export async function updateReply(discussionId: string, replyId: string, content: string): Promise<ForumPost> {
  const response = await callApi<DiscussionResponse>(`/discussions/${discussionId}/replies/${replyId}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return response.discussion;
}

// Delete reply
export async function deleteReply(discussionId: string, replyId: string): Promise<ForumPost> {
  const response = await callApi<DiscussionResponse>(`/discussions/${discussionId}/replies/${replyId}`, {
    method: 'DELETE',
  });
  return response.discussion;
}

// Toggle like on discussion
export async function toggleDiscussionLike(discussionId: string, userId: string): Promise<LikeResponse> {
  const response = await callApi<LikeResponse>(`/discussions/${discussionId}/like`, {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return response;
}

// Toggle like on reply
export async function toggleReplyLike(discussionId: string, replyId: string, userId: string): Promise<LikeResponse> {
  const response = await callApi<LikeResponse>(`/discussions/${discussionId}/replies/like`, {
    method: 'POST',
    body: JSON.stringify({ userId, replyId }),
  });
  return response;
}
