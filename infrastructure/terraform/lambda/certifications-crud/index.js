const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const GROUPS_TABLE = process.env.CERTIFICATION_GROUPS_TABLE_NAME || 'awsug-certification-groups';

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...getCorsHeaders(), ...headers },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: getCorsHeaders(), body: '' };
  }
  
  try {
    const method = event.httpMethod;
    const path = event.path || event.requestContext?.path || '';
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);
    
    const resource = routeParts[0]; // certification-groups
    const id = routeParts[1]; // group id
    const action = routeParts[2]; // join, leave, messages, sessions
    const subId = routeParts[3]; // messageId or sessionId
    const subAction = routeParts[4]; // like, replies
    const replyId = routeParts[5]; // reply id

    if (resource === 'certification-groups') {
      if (method === 'GET' && !id) return await listGroups(event);
      if (method === 'GET' && id && !action) return await getGroup(id);
      if (method === 'POST' && !id) return await createGroup(event);
      if (method === 'PUT' && id && !action) return await updateGroup(id, event);
      if (method === 'DELETE' && id && !action) return await deleteGroup(id);
      if (method === 'POST' && id && action === 'join') return await joinGroup(id, event);
      if (method === 'POST' && id && action === 'leave') return await leaveGroup(id, event);
      if (method === 'POST' && id && action === 'messages' && !subId) return await postMessage(id, event);
      if (method === 'PUT' && id && action === 'messages' && subId && !subAction) return await updateMessage(id, subId, event);
      if (method === 'DELETE' && id && action === 'messages' && subId && !subAction) return await deleteMessage(id, subId);
      if (method === 'POST' && id && action === 'messages' && subId && subAction === 'like') return await toggleMessageLike(id, subId, event);
      if (method === 'POST' && id && action === 'messages' && subId && subAction === 'replies' && !replyId) return await addReply(id, subId, event);
      if (method === 'PUT' && id && action === 'messages' && subId && subAction === 'replies' && replyId && !routeParts[6]) return await updateReply(id, subId, replyId, event);
      if (method === 'DELETE' && id && action === 'messages' && subId && subAction === 'replies' && replyId && !routeParts[6]) return await deleteReply(id, subId, replyId);
      if (method === 'POST' && id && action === 'messages' && subId && subAction === 'replies' && replyId && routeParts[6] === 'like') return await toggleReplyLike(id, subId, replyId, event);
      if (method === 'POST' && id && action === 'sessions' && !subId) return await createSession(id, event);
      if (method === 'PUT' && id && action === 'sessions' && subId) return await updateSession(id, subId, event);
      if (method === 'DELETE' && id && action === 'sessions' && subId) return await deleteSession(id, subId);
    }
    
    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { error: 'Internal server error', message: error.message });
  }
};

async function listGroups(event) {
  const queryParams = event.queryStringParameters || {};
  const level = queryParams.level;
  
  if (level) {
    const result = await docClient.send(new QueryCommand({
      TableName: GROUPS_TABLE,
      IndexName: 'level-index',
      KeyConditionExpression: '#level = :level',
      ExpressionAttributeNames: { '#level': 'level' },
      ExpressionAttributeValues: { ':level': level }
    }));
    return createResponse(200, { groups: result.Items || [] });
  }
  
  const result = await docClient.send(new ScanCommand({ TableName: GROUPS_TABLE }));
  return createResponse(200, { groups: result.Items || [] });
}

async function getGroup(id) {
  const result = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!result.Item) return createResponse(404, { error: 'Group not found' });
  return createResponse(200, { group: result.Item });
}

async function createGroup(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { name, level, description, ownerId, ownerIds, color } = body;
  
  if (!name || !level || !description) {
    return createResponse(400, { error: 'Missing required fields: name, level, description' });
  }
  
  // Support both single ownerId and multiple ownerIds
  let owners = [];
  if (ownerIds && Array.isArray(ownerIds) && ownerIds.length > 0) {
    owners = ownerIds;
  } else if (ownerId) {
    owners = [ownerId];
  } else {
    return createResponse(400, { error: 'At least one owner is required' });
  }
  
  const id = `group-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  
  const group = {
    id, name, level, description,
    members: owners, // Owners are automatically members
    owners: owners,
    color: color || 'bg-blue-500',
    scheduledSessions: [],
    messages: [],
    createdAt: now,
    updatedAt: now
  };
  
  await docClient.send(new PutCommand({ TableName: GROUPS_TABLE, Item: group }));
  return createResponse(201, { group });
}

async function updateGroup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const { name, description, color } = body;
  const updates = [];
  const values = { ':updatedAt': new Date().toISOString() };
  
  if (name) { updates.push('name = :name'); values[':name'] = name; }
  if (description) { updates.push('description = :description'); values[':description'] = description; }
  if (color) { updates.push('color = :color'); values[':color'] = color; }
  updates.push('updatedAt = :updatedAt');
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: `SET ${updates.join(', ')}`,
    ExpressionAttributeValues: values
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function deleteGroup(id) {
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  await docClient.send(new DeleteCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { message: 'Group deleted successfully' });
}

async function joinGroup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  if (!userId) return createResponse(400, { error: 'userId is required' });
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  if (group.members.includes(userId)) {
    return createResponse(400, { error: 'User already a member' });
  }
  
  const updatedMembers = [...group.members, userId];
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':members': updatedMembers,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function leaveGroup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  if (!userId) return createResponse(400, { error: 'userId is required' });
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  if (group.owners.includes(userId)) {
    return createResponse(400, { error: 'Owners cannot leave the group' });
  }
  
  const updatedMembers = group.members.filter(m => m !== userId);
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':members': updatedMembers,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function postMessage(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, userName, userAvatar, content, isPinned } = body;
  
  if (!userId || !userName || !content) {
    return createResponse(400, { error: 'Missing required fields: userId, userName, content' });
  }
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  
  const message = {
    id: messageId, groupId: id, userId, userName,
    userAvatar: userAvatar || '', content, createdAt: now,
    replies: [], likes: 0, likedBy: [], isPinned: isPinned || false
  };
  
  const updatedMessages = [...(group.messages || []), message];
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': updatedMessages, ':updatedAt': now }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(201, { group: updated.Item, message });
}

async function updateMessage(id, messageId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { content, isPinned } = body;
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  if (content) messages[msgIndex].content = content;
  if (isPinned !== undefined) messages[msgIndex].isPinned = isPinned;
  messages[msgIndex].updatedAt = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function deleteMessage(id, messageId) {
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const updatedMessages = messages.filter(m => m.id !== messageId);
  
  if (messages.length === updatedMessages.length) {
    return createResponse(404, { error: 'Message not found' });
  }
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': updatedMessages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function toggleMessageLike(id, messageId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  if (!userId) return createResponse(400, { error: 'userId is required' });
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  const message = messages[msgIndex];
  const likedBy = message.likedBy || [];
  const hasLiked = likedBy.includes(userId);
  
  if (hasLiked) {
    message.likedBy = likedBy.filter(id => id !== userId);
    message.likes = Math.max(0, (message.likes || 0) - 1);
  } else {
    message.likedBy = [...likedBy, userId];
    message.likes = (message.likes || 0) + 1;
  }
  
  messages[msgIndex] = message;
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item, liked: !hasLiked });
}

async function addReply(id, messageId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, userName, userAvatar, content } = body;
  
  if (!userId || !userName || !content) {
    return createResponse(400, { error: 'Missing required fields: userId, userName, content' });
  }
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  const replyId = `reply-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  
  const reply = {
    id: replyId, messageId, userId, userName,
    userAvatar: userAvatar || '', content, createdAt: now,
    likes: 0, likedBy: []
  };
  
  messages[msgIndex].replies = [...(messages[msgIndex].replies || []), reply];
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': now }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(201, { group: updated.Item, reply });
}

async function updateReply(id, messageId, replyId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { content } = body;
  if (!content) return createResponse(400, { error: 'content is required' });
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  const replies = messages[msgIndex].replies || [];
  const replyIndex = replies.findIndex(r => r.id === replyId);
  if (replyIndex === -1) return createResponse(404, { error: 'Reply not found' });
  
  replies[replyIndex].content = content;
  replies[replyIndex].updatedAt = new Date().toISOString();
  messages[msgIndex].replies = replies;
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function deleteReply(id, messageId, replyId) {
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  const replies = messages[msgIndex].replies || [];
  const updatedReplies = replies.filter(r => r.id !== replyId);
  
  if (replies.length === updatedReplies.length) {
    return createResponse(404, { error: 'Reply not found' });
  }
  
  messages[msgIndex].replies = updatedReplies;
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function toggleReplyLike(id, messageId, replyId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  if (!userId) return createResponse(400, { error: 'userId is required' });
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const messages = group.messages || [];
  const msgIndex = messages.findIndex(m => m.id === messageId);
  if (msgIndex === -1) return createResponse(404, { error: 'Message not found' });
  
  const replies = messages[msgIndex].replies || [];
  const replyIndex = replies.findIndex(r => r.id === replyId);
  if (replyIndex === -1) return createResponse(404, { error: 'Reply not found' });
  
  const reply = replies[replyIndex];
  const likedBy = reply.likedBy || [];
  const hasLiked = likedBy.includes(userId);
  
  if (hasLiked) {
    reply.likedBy = likedBy.filter(id => id !== userId);
    reply.likes = Math.max(0, (reply.likes || 0) - 1);
  } else {
    reply.likedBy = [...likedBy, userId];
    reply.likes = (reply.likes || 0) + 1;
  }
  
  replies[replyIndex] = reply;
  messages[msgIndex].replies = replies;
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':messages': messages, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item, liked: !hasLiked });
}

async function createSession(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { title, description, date, time, hostId, hostName, meetingLink } = body;
  
  if (!title || !description || !date || !time || !hostId || !hostName) {
    return createResponse(400, { error: 'Missing required fields: title, description, date, time, hostId, hostName' });
  }
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  const session = {
    id: sessionId, groupId: id, title, description, date, time,
    hostId, hostName, meetingLink: meetingLink || ''
  };
  
  const updatedSessions = [...(group.scheduledSessions || []), session];
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET scheduledSessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':sessions': updatedSessions, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(201, { group: updated.Item, session });
}

async function updateSession(id, sessionId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const sessions = group.scheduledSessions || [];
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) return createResponse(404, { error: 'Session not found' });
  
  const { title, description, date, time, meetingLink } = body;
  if (title) sessions[sessionIndex].title = title;
  if (description) sessions[sessionIndex].description = description;
  if (date) sessions[sessionIndex].date = date;
  if (time) sessions[sessionIndex].time = time;
  if (meetingLink !== undefined) sessions[sessionIndex].meetingLink = meetingLink;
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET scheduledSessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':sessions': sessions, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}

async function deleteSession(id, sessionId) {
  const existing = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  if (!existing.Item) return createResponse(404, { error: 'Group not found' });
  
  const group = existing.Item;
  const sessions = group.scheduledSessions || [];
  const updatedSessions = sessions.filter(s => s.id !== sessionId);
  
  if (sessions.length === updatedSessions.length) {
    return createResponse(404, { error: 'Session not found' });
  }
  
  await docClient.send(new UpdateCommand({
    TableName: GROUPS_TABLE, Key: { id },
    UpdateExpression: 'SET scheduledSessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: { ':sessions': updatedSessions, ':updatedAt': new Date().toISOString() }
  }));
  
  const updated = await docClient.send(new GetCommand({ TableName: GROUPS_TABLE, Key: { id } }));
  return createResponse(200, { group: updated.Item });
}
