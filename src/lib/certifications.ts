import { API_BASE_URL } from './aws-config';

export interface CertificationGroup {
  id: string;
  name: string;
  level: 'Foundational' | 'Associate' | 'Professional' | 'Specialty';
  description: string;
  members: string[];
  owners: string[];
  color: string;
  scheduledSessions: GroupSession[];
  messages: GroupMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupSession {
  id: string;
  groupId: string;
  title: string;
  description: string;
  date: string;
  time: string;
  hostId: string;
  hostName: string;
  meetingLink?: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  replies: GroupReply[];
  likes: number;
  likedBy: string[];
  isPinned?: boolean;
}

export interface GroupReply {
  id: string;
  messageId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  likes: number;
  likedBy: string[];
}

// List all certification groups or filter by level
export async function listCertificationGroups(level?: string): Promise<CertificationGroup[]> {
  const url = level 
    ? `${API_BASE_URL}/certification-groups?level=${encodeURIComponent(level)}`
    : `${API_BASE_URL}/certification-groups`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch certification groups');
  const data = await response.json();
  return data.groups;
}

// Get a single certification group
export async function getCertificationGroup(id: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${id}`);
  if (!response.ok) throw new Error('Failed to fetch certification group');
  const data = await response.json();
  return data.group;
}

// Create a new certification group
export async function createCertificationGroup(group: {
  name: string;
  level: string;
  description: string;
  ownerId?: string;
  ownerIds?: string[];
  color?: string;
}): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group)
  });
  if (!response.ok) throw new Error('Failed to create certification group');
  const data = await response.json();
  return data.group;
}

// Update a certification group
export async function updateCertificationGroup(id: string, updates: {
  name?: string;
  description?: string;
  color?: string;
}): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update certification group');
  const data = await response.json();
  return data.group;
}

// Delete a certification group
export async function deleteCertificationGroup(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete certification group');
}

// Join a certification group
export async function joinCertificationGroup(id: string, userId: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('Failed to join certification group');
  const data = await response.json();
  return data.group;
}

// Leave a certification group
export async function leaveCertificationGroup(id: string, userId: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${id}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('Failed to leave certification group');
  const data = await response.json();
  return data.group;
}

// Post a message to a group
export async function postGroupMessage(groupId: string, message: {
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  isPinned?: boolean;
}): Promise<{ group: CertificationGroup; message: GroupMessage }> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  if (!response.ok) throw new Error('Failed to post message');
  return await response.json();
}

// Update a message
export async function updateGroupMessage(groupId: string, messageId: string, updates: {
  content?: string;
  isPinned?: boolean;
}): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update message');
  const data = await response.json();
  return data.group;
}

// Delete a message
export async function deleteGroupMessage(groupId: string, messageId: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete message');
  const data = await response.json();
  return data.group;
}

// Toggle like on a message
export async function toggleMessageLike(groupId: string, messageId: string, userId: string): Promise<{ group: CertificationGroup; liked: boolean }> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('Failed to toggle message like');
  return await response.json();
}

// Add a reply to a message
export async function addMessageReply(groupId: string, messageId: string, reply: {
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
}): Promise<{ group: CertificationGroup; reply: GroupReply }> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reply)
  });
  if (!response.ok) throw new Error('Failed to add reply');
  return await response.json();
}

// Update a reply
export async function updateMessageReply(groupId: string, messageId: string, replyId: string, content: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}/replies/${replyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error('Failed to update reply');
  const data = await response.json();
  return data.group;
}

// Delete a reply
export async function deleteMessageReply(groupId: string, messageId: string, replyId: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}/replies/${replyId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete reply');
  const data = await response.json();
  return data.group;
}

// Toggle like on a reply
export async function toggleReplyLike(groupId: string, messageId: string, replyId: string, userId: string): Promise<{ group: CertificationGroup; liked: boolean }> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/messages/${messageId}/replies/${replyId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, replyId })
  });
  if (!response.ok) throw new Error('Failed to toggle reply like');
  return await response.json();
}

// Create a session
export async function createGroupSession(groupId: string, session: {
  title: string;
  description: string;
  date: string;
  time: string;
  hostId: string;
  hostName: string;
  meetingLink?: string;
}): Promise<{ group: CertificationGroup; session: GroupSession }> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session)
  });
  if (!response.ok) throw new Error('Failed to create session');
  return await response.json();
}

// Update a session
export async function updateGroupSession(groupId: string, sessionId: string, updates: {
  title?: string;
  description?: string;
  date?: string;
  time?: string;
  meetingLink?: string;
}): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update session');
  const data = await response.json();
  return data.group;
}

// Delete a session
export async function deleteGroupSession(groupId: string, sessionId: string): Promise<CertificationGroup> {
  const response = await fetch(`${API_BASE_URL}/certification-groups/${groupId}/sessions/${sessionId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete session');
  const data = await response.json();
  return data.group;
}
