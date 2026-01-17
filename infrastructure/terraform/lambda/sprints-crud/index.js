const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const SPRINTS_TABLE = process.env.SPRINTS_TABLE_NAME || 'awsug-sprints';

// Helper function to generate CORS headers
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  };
}

// Helper function to generate response
function createResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(),
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight - must be first
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: ''
    };
  }
  
  try {
    const method = event.httpMethod;
    const path = event.path || event.requestContext?.path || '';
    
    // Parse path - handle both /dev/sprints and /sprints formats
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);
    
    const resource = routeParts[0];
    const id = routeParts[1];
    const action = routeParts[2];
    const subAction = routeParts[3];
    
    // Route handling
    if (resource === 'sprints') {
      if (method === 'GET' && !id) {
        // GET /sprints - List all sprints
        return await listSprints(event);
      } else if (method === 'GET' && id && !action) {
        // GET /sprints/{id} - Get single sprint
        return await getSprint(id);
      } else if (method === 'POST' && !id) {
        // POST /sprints - Create sprint
        return await createSprint(event);
      } else if (method === 'PUT' && id && !action) {
        // PUT /sprints/{id} - Update sprint
        return await updateSprint(id, event);
      } else if (method === 'POST' && id && action === 'sessions') {
        // POST /sprints/{id}/sessions - Add session to sprint
        return await addSession(id, event);
      } else if (method === 'PUT' && id && action === 'sessions' && subAction) {
        // PUT /sprints/{id}/sessions/{sessionId} - Update session
        return await updateSession(id, subAction, event);
      } else if (method === 'DELETE' && id && action === 'sessions' && subAction) {
        // DELETE /sprints/{id}/sessions/{sessionId} - Delete session
        return await deleteSession(id, subAction, event);
      } else if (method === 'DELETE' && id && !action) {
        // DELETE /sprints/{id} - Delete sprint
        return await deleteSprint(id, event);
      } else if (method === 'POST' && id && action === 'sessions' && subAction && routeParts[4] === 'register') {
        // POST /sprints/{id}/sessions/{sessionId}/register - Register user for session
        return await registerForSession(id, subAction, event);
      } else if (method === 'POST' && id && action === 'register') {
        // POST /sprints/{id}/register - Register user for sprint
        return await registerForSprint(id, event);
      } else if (method === 'POST' && id && action === 'submit') {
        // POST /sprints/{id}/submit - Submit work for sprint
        return await submitWork(id, event);
      } else if (method === 'POST' && id && action === 'forum') {
        // POST /sprints/{id}/forum - Create forum post
        return await createForumPost(id, event);
      } else if (method === 'POST' && id && action === 'forum' && subAction && routeParts[4] === 'reply') {
        // POST /sprints/{id}/forum/{postId}/reply - Reply to forum post
        return await replyToForumPost(id, subAction, event);
      }
    }
    
    // Log for debugging
    console.log('Route not matched:', { resource, id, action, subAction, method, path, routeParts });
    
    // For OPTIONS requests, always return CORS headers even for unmatched routes
    if (method === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: getCorsHeaders(),
        body: ''
      };
    }
    
    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

// List all sprints
async function listSprints(event) {
  const queryParams = event.queryStringParameters || {};
  const status = queryParams.status; // 'upcoming', 'active', 'completed'
  
  let sprints;
  
  if (status) {
    // Query by status using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: SPRINTS_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status
      }
    }));
    sprints = result.Items || [];
  } else {
    // Scan all sprints
    const result = await docClient.send(new ScanCommand({
      TableName: SPRINTS_TABLE
    }));
    sprints = result.Items || [];
  }
  
  // Sort by start date (newest first)
  sprints.sort((a, b) => {
    const dateA = new Date(a.startDate);
    const dateB = new Date(b.startDate);
    return dateB - dateA;
  });
  
  // Auto-update status based on dates
  const now = new Date();
  for (const sprint of sprints) {
    const startDate = new Date(sprint.startDate);
    const endDate = new Date(sprint.endDate);
    
    let newStatus = sprint.status;
    if (now < startDate && sprint.status !== 'upcoming') {
      newStatus = 'upcoming';
    } else if (now >= startDate && now <= endDate && sprint.status !== 'active') {
      newStatus = 'active';
    } else if (now > endDate && sprint.status !== 'completed') {
      newStatus = 'completed';
    }
    
    if (newStatus !== sprint.status) {
      await docClient.send(new UpdateCommand({
        TableName: SPRINTS_TABLE,
        Key: { id: sprint.id },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': newStatus,
          ':updatedAt': new Date().toISOString()
        }
      }));
      sprint.status = newStatus;
    }
  }
  
  return createResponse(200, { sprints });
}

// Get single sprint
async function getSprint(id) {
  const result = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  // Auto-update status based on dates
  const sprint = result.Item;
  const now = new Date();
  const startDate = new Date(sprint.startDate);
  const endDate = new Date(sprint.endDate);
  
  let newStatus = sprint.status;
  if (now < startDate && sprint.status !== 'upcoming') {
    newStatus = 'upcoming';
  } else if (now >= startDate && now <= endDate && sprint.status !== 'active') {
    newStatus = 'active';
  } else if (now > endDate && sprint.status !== 'completed') {
    newStatus = 'completed';
  }
  
  if (newStatus !== sprint.status) {
    await docClient.send(new UpdateCommand({
      TableName: SPRINTS_TABLE,
      Key: { id: sprint.id },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': newStatus,
        ':updatedAt': new Date().toISOString()
      }
    }));
    sprint.status = newStatus;
  }
  
  return createResponse(200, { sprint });
}

// Create sprint
async function createSprint(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    title,
    theme,
    description,
    startDate,
    endDate,
    githubRepo
  } = body;
  
  // Validation
  if (!title || !description || !startDate || !endDate) {
    return createResponse(400, { 
      error: 'Missing required fields: title, description, startDate, endDate' 
    });
  }
  
  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) {
    return createResponse(400, { 
      error: 'End date must be after start date' 
    });
  }
  
  // Generate ID
  const id = `sprint-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const now = new Date().toISOString();
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const currentDate = new Date();
  
  // Determine initial status based on dates
  let status = 'upcoming';
  if (currentDate >= startDateObj && currentDate <= endDateObj) {
    status = 'active';
  } else if (currentDate > endDateObj) {
    status = 'completed';
  }
  
  const sprint = {
    id,
    title,
    theme: theme || '', // Default to empty string if not provided
    description,
    startDate,
    endDate,
    status,
    participants: 0,
    sessions: [],
    submissions: [],
    registeredUsers: [],
    githubRepo: githubRepo || undefined,
    createdAt: now,
    updatedAt: now
  };
  
  await docClient.send(new PutCommand({
    TableName: SPRINTS_TABLE,
    Item: sprint
  }));
  
  return createResponse(201, { sprint });
}

// Update sprint
async function updateSprint(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const allowedFields = [
    'title', 'theme', 'description', 'startDate', 'endDate', 'githubRepo', 'status'
  ];
  
  allowedFields.forEach(field => {
    if (body[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = body[field];
    }
  });
  
  // Always update updatedAt
  updateExpressions.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  
  if (updateExpressions.length === 0) {
    return createResponse(400, { error: 'No fields to update' });
  }
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { sprint: updated.Item });
}

// Add session to sprint
async function addSession(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const sessions = sprint.sessions || [];
  
  // Generate session ID
  const sessionId = `ses-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newSession = {
    id: sessionId,
    ...body,
    registeredUsers: [], // Initialize empty registeredUsers array
    createdAt: new Date().toISOString()
  };
  
  // Add session to array
  const updatedSessions = [...sessions, newSession];
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id },
    UpdateExpression: 'SET sessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':sessions': updatedSessions,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(201, { sprint: updated.Item, session: newSession });
}

// Update session in sprint
async function updateSession(sprintId, sessionId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const sessions = sprint.sessions || [];
  
  // Find and update session
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    return createResponse(404, { error: 'Session not found' });
  }
  
  const updatedSession = {
    ...sessions[sessionIndex],
    ...body,
    updatedAt: new Date().toISOString()
  };
  
  sessions[sessionIndex] = updatedSession;
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId },
    UpdateExpression: 'SET sessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':sessions': sessions,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  return createResponse(200, { sprint: updated.Item, session: updatedSession });
}

// Register user for sprint
async function registerForSprint(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  
  if (!userId) {
    return createResponse(400, { error: 'Missing required field: userId' });
  }
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  
  // Check if user is already registered
  const registeredUsers = sprint.registeredUsers || [];
  if (registeredUsers.includes(userId)) {
    return createResponse(200, { 
      sprint: sprint,
      message: 'User already registered',
      alreadyRegistered: true
    });
  }
  
  // Add user to registeredUsers array and increment participants
  const updatedRegisteredUsers = [...registeredUsers, userId];
  const newParticipantsCount = updatedRegisteredUsers.length;
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id },
    UpdateExpression: 'SET registeredUsers = :registeredUsers, participants = :participants, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':registeredUsers': updatedRegisteredUsers,
      ':participants': newParticipantsCount,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { 
    sprint: updated.Item,
    message: 'Successfully registered for sprint',
    alreadyRegistered: false
  });
}

// Register user for session
async function registerForSession(sprintId, sessionId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  
  if (!userId) {
    return createResponse(400, { error: 'Missing required field: userId' });
  }
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const sessions = sprint.sessions || [];
  
  // Find session
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    return createResponse(404, { error: 'Session not found' });
  }
  
  const session = sessions[sessionIndex];
  const registeredUsers = session.registeredUsers || [];
  
  // Check if user is already registered
  if (registeredUsers.includes(userId)) {
    return createResponse(200, { 
      sprint: sprint,
      session: session,
      message: 'User already registered for this session',
      alreadyRegistered: true
    });
  }
  
  // Add user to session's registeredUsers array
  const updatedRegisteredUsers = [...registeredUsers, userId];
  const updatedSession = {
    ...session,
    registeredUsers: updatedRegisteredUsers,
    updatedAt: new Date().toISOString()
  };
  
  sessions[sessionIndex] = updatedSession;
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId },
    UpdateExpression: 'SET sessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':sessions': sessions,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  return createResponse(200, { 
    sprint: updated.Item,
    session: updatedSession,
    message: 'Successfully registered for session',
    alreadyRegistered: false
  });
}

// Delete session from sprint
async function deleteSession(sprintId, sessionId, event) {
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const sessions = sprint.sessions || [];
  
  // Find and remove session
  const sessionIndex = sessions.findIndex(s => s.id === sessionId);
  if (sessionIndex === -1) {
    return createResponse(404, { error: 'Session not found' });
  }
  
  // Remove session from array
  const updatedSessions = sessions.filter(s => s.id !== sessionId);
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId },
    UpdateExpression: 'SET sessions = :sessions, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':sessions': updatedSessions,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  return createResponse(200, { 
    sprint: updated.Item,
    message: 'Session deleted successfully'
  });
}

// Delete sprint
async function deleteSprint(id, event) {
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  // Delete sprint (this will also delete all sessions since they're stored in the sprint object)
  await docClient.send(new DeleteCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { 
    message: 'Sprint deleted successfully',
    id: id
  });
}

// Submit work for sprint
async function submitWork(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    userId,
    userName,
    userAvatar,
    blogUrl,
    repoUrl,
    description
  } = body;
  
  if (!userId || !userName) {
    return createResponse(400, { error: 'Missing required fields: userId, userName' });
  }
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const submissions = sprint.submissions || [];
  
  // Check if user already has a submission
  const existingSubmission = submissions.find(s => s.userId === userId && s.status === 'pending');
  if (existingSubmission) {
    return createResponse(400, { error: 'You already have a pending submission for this sprint' });
  }
  
  // Generate submission ID
  const submissionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newSubmission = {
    id: submissionId,
    sprintId: id,
    userId,
    userName,
    userAvatar: userAvatar || undefined,
    blogUrl: blogUrl || undefined,
    repoUrl: repoUrl || undefined,
    description: description || undefined,
    submittedAt: new Date().toISOString(),
    points: 0,
    status: 'pending'
  };
  
  // Add submission to array
  const updatedSubmissions = [...submissions, newSubmission];
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id },
    UpdateExpression: 'SET submissions = :submissions, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':submissions': updatedSubmissions,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(201, { sprint: updated.Item, submission: newSubmission });
}

// Create forum post
async function createForumPost(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    userId,
    userName,
    userAvatar,
    title,
    content
  } = body;
  
  if (!userId || !userName || !title || !content) {
    return createResponse(400, { error: 'Missing required fields: userId, userName, title, content' });
  }
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const forumPosts = sprint.forumPosts || [];
  
  // Generate post ID
  const postId = `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newPost = {
    id: postId,
    sprintId: id,
    userId,
    userName,
    userAvatar: userAvatar || undefined,
    title,
    content,
    createdAt: new Date().toISOString(),
    replies: [],
    likes: 0
  };
  
  // Add post to array
  const updatedForumPosts = [...forumPosts, newPost];
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id },
    UpdateExpression: 'SET forumPosts = :forumPosts, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':forumPosts': updatedForumPosts,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id }
  }));
  
  return createResponse(201, { sprint: updated.Item, post: newPost });
}

// Reply to forum post
async function replyToForumPost(sprintId, postId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    userId,
    userName,
    userAvatar,
    content
  } = body;
  
  if (!userId || !userName || !content) {
    return createResponse(400, { error: 'Missing required fields: userId, userName, content' });
  }
  
  // Check if sprint exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Sprint not found' });
  }
  
  const sprint = existing.Item;
  const forumPosts = sprint.forumPosts || [];
  
  // Find post
  const postIndex = forumPosts.findIndex(p => p.id === postId);
  if (postIndex === -1) {
    return createResponse(404, { error: 'Post not found' });
  }
  
  const post = forumPosts[postIndex];
  const replies = post.replies || [];
  
  // Generate reply ID
  const replyId = `reply-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const newReply = {
    id: replyId,
    postId,
    userId,
    userName,
    userAvatar: userAvatar || undefined,
    content,
    createdAt: new Date().toISOString(),
    likes: 0
  };
  
  // Add reply to array
  post.replies = [...replies, newReply];
  forumPosts[postIndex] = post;
  
  await docClient.send(new UpdateCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId },
    UpdateExpression: 'SET forumPosts = :forumPosts, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':forumPosts': forumPosts,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated sprint
  const updated = await docClient.send(new GetCommand({
    TableName: SPRINTS_TABLE,
    Key: { id: sprintId }
  }));
  
  return createResponse(201, { sprint: updated.Item, reply: newReply });
}
