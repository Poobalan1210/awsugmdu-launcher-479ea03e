const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const DISCUSSIONS_TABLE = process.env.DISCUSSIONS_TABLE_NAME || 'awsug-discussions';

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
  
  // Handle CORS preflight
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
    
    // Parse path
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);
    
    const resource = routeParts[0]; // discussions
    const id = routeParts[1]; // post id
    const action = routeParts[2]; // replies, like, share
    const replyId = routeParts[3]; // reply id for nested operations
    
    // Route handling
    if (resource === 'discussions') {
      if (method === 'GET' && !id) {
        // GET /discussions?sprintId=xxx - List discussions by sprint
        return await listDiscussions(event);
      } else if (method === 'GET' && id && !action) {
        // GET /discussions/{id} - Get single discussion
        return await getDiscussion(id);
      } else if (method === 'POST' && !id) {
        // POST /discussions - Create discussion
        return await createDiscussion(event);
      } else if (method === 'PUT' && id && !action) {
        // PUT /discussions/{id} - Update discussion
        return await updateDiscussion(id, event);
      } else if (method === 'DELETE' && id && !action) {
        // DELETE /discussions/{id} - Delete discussion
        return await deleteDiscussion(id);
      } else if (method === 'POST' && id && action === 'like') {
        // POST /discussions/{id}/like - Like/unlike discussion
        return await toggleLike(id, event);
      } else if (method === 'POST' && id && action === 'replies' && replyId === 'like') {
        // POST /discussions/{id}/replies/like - Like/unlike reply
        return await toggleReplyLike(id, event);
      } else if (method === 'POST' && id && action === 'replies' && !replyId) {
        // POST /discussions/{id}/replies - Add reply
        return await addReply(id, event);
      } else if (method === 'PUT' && id && action === 'replies' && replyId && replyId !== 'like') {
        // PUT /discussions/{id}/replies/{replyId} - Update reply
        return await updateReply(id, replyId, event);
      } else if (method === 'DELETE' && id && action === 'replies' && replyId) {
        // DELETE /discussions/{id}/replies/{replyId} - Delete reply
        return await deleteReply(id, replyId);
      }
    }
    
    console.log('Route not matched:', { resource, id, action, method, path, routeParts });
    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

// List discussions by sprint
async function listDiscussions(event) {
  const queryParams = event.queryStringParameters || {};
  const sprintId = queryParams.sprintId;
  
  if (!sprintId) {
    return createResponse(400, { error: 'sprintId query parameter is required' });
  }
  
  // Query by sprintId using GSI
  const result = await docClient.send(new QueryCommand({
    TableName: DISCUSSIONS_TABLE,
    IndexName: 'sprintId-index',
    KeyConditionExpression: 'sprintId = :sprintId',
    ExpressionAttributeValues: {
      ':sprintId': sprintId
    },
    ScanIndexForward: false // Sort by newest first
  }));
  
  const discussions = result.Items || [];
  
  return createResponse(200, { discussions });
}

// Get single discussion
async function getDiscussion(id) {
  const result = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  return createResponse(200, { discussion: result.Item });
}

// Create discussion
async function createDiscussion(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    sprintId,
    userId,
    userName,
    userAvatar,
    title,
    content
  } = body;
  
  // Validation
  if (!sprintId || !userId || !userName || !title || !content) {
    return createResponse(400, { 
      error: 'Missing required fields: sprintId, userId, userName, title, content' 
    });
  }
  
  // Generate ID
  const id = `discussion-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  
  const discussion = {
    id,
    sprintId,
    userId,
    userName,
    userAvatar: userAvatar || '',
    title,
    content,
    createdAt: now,
    updatedAt: now,
    replies: [],
    likes: 0,
    likedBy: []
  };
  
  await docClient.send(new PutCommand({
    TableName: DISCUSSIONS_TABLE,
    Item: discussion
  }));
  
  return createResponse(201, { discussion });
}

// Update discussion
async function updateDiscussion(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  // Check if discussion exists
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const { title, content } = body;
  
  if (!title && !content) {
    return createResponse(400, { error: 'At least one field (title or content) must be provided' });
  }
  
  const updateExpressions = [];
  const expressionAttributeValues = {};
  
  if (title) {
    updateExpressions.push('title = :title');
    expressionAttributeValues[':title'] = title;
  }
  
  if (content) {
    updateExpressions.push('content = :content');
    expressionAttributeValues[':content'] = content;
  }
  
  updateExpressions.push('updatedAt = :updatedAt');
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeValues: expressionAttributeValues
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { discussion: updated.Item });
}

// Delete discussion
async function deleteDiscussion(id) {
  // Check if discussion exists
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  await docClient.send(new DeleteCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { message: 'Discussion deleted successfully' });
}

// Add reply to discussion
async function addReply(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    userId,
    userName,
    userAvatar,
    content
  } = body;
  
  if (!userId || !userName || !content) {
    return createResponse(400, { 
      error: 'Missing required fields: userId, userName, content' 
    });
  }
  
  // Check if discussion exists
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const discussion = existing.Item;
  const replyId = `reply-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  
  const reply = {
    id: replyId,
    postId: id,
    userId,
    userName,
    userAvatar: userAvatar || '',
    content,
    createdAt: now,
    likes: 0,
    likedBy: []
  };
  
  const updatedReplies = [...(discussion.replies || []), reply];
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET replies = :replies, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':replies': updatedReplies,
      ':updatedAt': now
    }
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(201, { discussion: updated.Item, reply });
}

// Update reply
async function updateReply(id, replyId, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { content } = body;
  
  if (!content) {
    return createResponse(400, { error: 'Content is required' });
  }
  
  // Get discussion
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const discussion = existing.Item;
  const replies = discussion.replies || [];
  const replyIndex = replies.findIndex(r => r.id === replyId);
  
  if (replyIndex === -1) {
    return createResponse(404, { error: 'Reply not found' });
  }
  
  // Update reply
  replies[replyIndex].content = content;
  replies[replyIndex].updatedAt = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET replies = :replies, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':replies': replies,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { discussion: updated.Item });
}

// Delete reply
async function deleteReply(id, replyId) {
  // Get discussion
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const discussion = existing.Item;
  const replies = discussion.replies || [];
  const updatedReplies = replies.filter(r => r.id !== replyId);
  
  if (replies.length === updatedReplies.length) {
    return createResponse(404, { error: 'Reply not found' });
  }
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET replies = :replies, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':replies': updatedReplies,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { discussion: updated.Item });
}

// Toggle like on discussion
async function toggleLike(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  
  if (!userId) {
    return createResponse(400, { error: 'userId is required' });
  }
  
  // Get discussion
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const discussion = existing.Item;
  const likedBy = discussion.likedBy || [];
  const hasLiked = likedBy.includes(userId);
  
  let updatedLikedBy;
  let updatedLikes;
  
  if (hasLiked) {
    // Unlike
    updatedLikedBy = likedBy.filter(id => id !== userId);
    updatedLikes = Math.max(0, (discussion.likes || 0) - 1);
  } else {
    // Like
    updatedLikedBy = [...likedBy, userId];
    updatedLikes = (discussion.likes || 0) + 1;
  }
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET likes = :likes, likedBy = :likedBy, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':likes': updatedLikes,
      ':likedBy': updatedLikedBy,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { discussion: updated.Item, liked: !hasLiked });
}

// Toggle like on reply
async function toggleReplyLike(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, replyId } = body;
  
  if (!userId || !replyId) {
    return createResponse(400, { error: 'userId and replyId are required' });
  }
  
  // Get discussion
  const existing = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Discussion not found' });
  }
  
  const discussion = existing.Item;
  const replies = discussion.replies || [];
  const replyIndex = replies.findIndex(r => r.id === replyId);
  
  if (replyIndex === -1) {
    return createResponse(404, { error: 'Reply not found' });
  }
  
  const reply = replies[replyIndex];
  const likedBy = reply.likedBy || [];
  const hasLiked = likedBy.includes(userId);
  
  if (hasLiked) {
    // Unlike
    reply.likedBy = likedBy.filter(id => id !== userId);
    reply.likes = Math.max(0, (reply.likes || 0) - 1);
  } else {
    // Like
    reply.likedBy = [...likedBy, userId];
    reply.likes = (reply.likes || 0) + 1;
  }
  
  replies[replyIndex] = reply;
  
  await docClient.send(new UpdateCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id },
    UpdateExpression: 'SET replies = :replies, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':replies': replies,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated discussion
  const updated = await docClient.send(new GetCommand({
    TableName: DISCUSSIONS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { discussion: updated.Item, liked: !hasLiked });
}
