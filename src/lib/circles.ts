import { API_BASE_URL } from './aws-config';

export interface AgentConfig {
  enabled: boolean;
  type: 'aws-news-digest' | 'aws-jobs';
  frequency: 'hourly' | 'daily' | 'weekly';
  botName: string;
  botAvatar?: string;
  mode: 'replace' | 'append';
  lastRunAt?: string | null;
  lastRunStatus?: string | null;
}

export interface Circle {
  id: string;
  name: string;
  level: 'General' | 'Foundational' | 'Associate' | 'Professional' | 'Specialty' | 'AI-Curated';
  description: string;
  members: string[];
  owners: string[];
  color: string;
  scheduledSessions: GroupSession[];
  messages: GroupMessage[];
  agentConfig?: AgentConfig | null;
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
  digestRunId?: string; // Groups posts from same agent run
  isDigestLead?: boolean; // First/summary post of a digest run
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

// List all circles or filter by level
export async function listCircles(level?: string): Promise<Circle[]> {
  const url = level 
    ? `${API_BASE_URL}/circles?level=${encodeURIComponent(level)}`
    : `${API_BASE_URL}/circles`;
  
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to fetch circles');
  const data = await response.json();
  return data.groups;
}

// Get a single circle
export async function getCircle(id: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${id}`);
  if (!response.ok) throw new Error('Failed to fetch circle');
  const data = await response.json();
  return data.group;
}

// Create a new circle
export async function createCircle(group: {
  name: string;
  level: string;
  description: string;
  ownerId?: string;
  ownerIds?: string[];
  color?: string;
}): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(group)
  });
  if (!response.ok) throw new Error('Failed to create circle');
  const data = await response.json();
  return data.group;
}

// Update a circle
export async function updateCircle(id: string, updates: {
  name?: string;
  level?: string;
  description?: string;
  color?: string;
  agentConfig?: AgentConfig | null;
}): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update circle');
  const data = await response.json();
  return data.group;
}

// Delete a circle
export async function deleteCircle(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/circles/${id}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete circle');
}

// Join a circle
export async function joinCircle(id: string, userId: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${id}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('Failed to join circle');
  const data = await response.json();
  return data.group;
}

// Leave a circle
export async function leaveCircle(id: string, userId: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${id}/leave`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  });
  if (!response.ok) throw new Error('Failed to leave circle');
  const data = await response.json();
  return data.group;
}

// Post a message to a circle
export async function postGroupMessage(groupId: string, message: {
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  isPinned?: boolean;
}): Promise<{ group: Circle; message: GroupMessage }> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages`, {
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
}): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update message');
  const data = await response.json();
  return data.group;
}

// Delete a message
export async function deleteGroupMessage(groupId: string, messageId: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete message');
  const data = await response.json();
  return data.group;
}

// Toggle like on a message
export async function toggleMessageLike(groupId: string, messageId: string, userId: string): Promise<{ group: Circle; liked: boolean }> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}/like`, {
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
}): Promise<{ group: Circle; reply: GroupReply }> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reply)
  });
  if (!response.ok) throw new Error('Failed to add reply');
  return await response.json();
}

// Update a reply
export async function updateMessageReply(groupId: string, messageId: string, replyId: string, content: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}/replies/${replyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!response.ok) throw new Error('Failed to update reply');
  const data = await response.json();
  return data.group;
}

// Delete a reply
export async function deleteMessageReply(groupId: string, messageId: string, replyId: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}/replies/${replyId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete reply');
  const data = await response.json();
  return data.group;
}

// Toggle like on a reply
export async function toggleReplyLike(groupId: string, messageId: string, replyId: string, userId: string): Promise<{ group: Circle; liked: boolean }> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/messages/${messageId}/replies/${replyId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, replyId })
  });
  if (!response.ok) throw new Error('Failed to toggle reply like');
  return await response.json();
}

// Group agent posts by digest run (digestRunId or date)
export function groupAgentPostsByDigest(messages: GroupMessage[]): Map<string, GroupMessage[]> {
  const agentMessages = messages.filter(m => m.userId?.startsWith('agent-'));
  const grouped = new Map<string, GroupMessage[]>();

  for (const msg of agentMessages) {
    const key = msg.digestRunId || msg.createdAt.split('T')[0]; // Group by runId or date
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(msg);
  }

  return grouped;
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
}): Promise<{ group: Circle; session: GroupSession }> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/sessions`, {
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
}): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  if (!response.ok) throw new Error('Failed to update session');
  const data = await response.json();
  return data.group;
}

// Delete a session
export async function deleteGroupSession(groupId: string, sessionId: string): Promise<Circle> {
  const response = await fetch(`${API_BASE_URL}/circles/${groupId}/sessions/${sessionId}`, {
    method: 'DELETE'
  });
  if (!response.ok) throw new Error('Failed to delete session');
  const data = await response.json();
  return data.group;
}
