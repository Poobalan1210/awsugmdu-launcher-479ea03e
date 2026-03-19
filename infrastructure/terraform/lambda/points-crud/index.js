const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('./shared/auth');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';

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
  
  // Skip authorization for GET requests (read-only operations)
  if (event.httpMethod !== 'GET') {
    // Authorize request
    const authResult = await authorize(event, USERS_TABLE);
    if (!authResult.authorized) {
      return createUnauthorizedResponse(authResult.error, getCorsHeaders());
    }
    
    // Add user context to event
    event.userContext = {
      userId: authResult.userId,
      roles: authResult.roles,
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
    
    // Route handling
    if (method === 'GET' && routeParts[0] === 'users' && routeParts[1] === 'points' && routeParts[2] === 'activities') {
      // GET /users/points/activities - Get all point activities
      return await getAllPointActivities();
    } else if (method === 'GET' && routeParts[0] === 'users' && routeParts[2] === 'points' && routeParts[3] === 'activities') {
      // GET /users/{userId}/points/activities - Get activities for specific user
      return await getUserPointActivities(routeParts[1]);
    } else if (method === 'GET' && routeParts[0] === 'users' && routeParts[2] === 'points' && !routeParts[3]) {
      // GET /users/{userId}/points - Get user's total points
      return await getUserPoints(routeParts[1]);
    } else if (method === 'POST' && routeParts[0] === 'users' && routeParts[1] === 'points' && routeParts[2] === 'award') {
      // POST /users/points/award - Award points to user
      return await awardPoints(event);
    }
    
    console.log('Route not matched:', { method, path, routeParts });
    return createResponse(404, { error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};

// Get all point activities
async function getAllPointActivities() {
  const result = await docClient.send(new ScanCommand({
    TableName: USERS_TABLE
  }));
  
  const users = result.Items || [];
  const allActivities = [];
  
  // Extract point activities from all users
  for (const user of users) {
    if (user.pointActivities && Array.isArray(user.pointActivities)) {
      allActivities.push(...user.pointActivities);
    }
  }
  
  // Sort by date descending
  allActivities.sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime());
  
  return createResponse(200, { activities: allActivities });
}

// Get point activities for a specific user
async function getUserPointActivities(userId) {
  const result = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'User not found' });
  }
  
  const activities = result.Item.pointActivities || [];
  
  // Sort by date descending
  activities.sort((a, b) => new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime());
  
  return createResponse(200, { activities });
}

// Get user's total points
async function getUserPoints(userId) {
  const result = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'User not found' });
  }
  
  const points = result.Item.points || 0;
  const redeemablePoints = result.Item.redeemablePoints ?? points;
  return createResponse(200, { points, redeemablePoints });
}

// Award points to user
async function awardPoints(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, points, reason, type, awardedBy } = body;

  if (!userId || !points || !reason || !type || !awardedBy) {
    return createResponse(400, { error: 'Missing required fields: userId, points, reason, type, awardedBy' });
  }

  // Validate type
  const validTypes = ['adhoc', 'submission', 'badge', 'event'];
  if (!validTypes.includes(type)) {
    return createResponse(400, { error: 'Invalid type. Must be one of: adhoc, submission, badge, event' });
  }

  // Validate points is a positive number
  const pointsNum = parseInt(points);
  if (isNaN(pointsNum) || pointsNum <= 0) {
    return createResponse(400, { error: 'Points must be a positive number' });
  }

  // Get user
  const userResult = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  }));

  if (!userResult.Item) {
    return createResponse(404, { error: 'User not found' });
  }

  const user = userResult.Item;
  const currentPoints = user.points || 0;
  const pointActivities = user.pointActivities || [];
  const activities = user.activities || [];

  // Create new point activity
  const newActivity = {
    id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    points: pointsNum,
    reason,
    type,
    awardedBy,
    awardedAt: new Date().toISOString()
  };

  pointActivities.push(newActivity);

  // Create general activity entry
  activities.push({
    type: 'points_awarded',
    points: pointsNum,
    reason,
    pointType: type,
    awardedBy,
    timestamp: new Date().toISOString()
  });

  // Update user with new points, point activity, and activity
  await docClient.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET points = :points, redeemablePoints = :redeemablePoints, pointActivities = :pointActivities, activities = :activities, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':points': currentPoints + pointsNum,
      ':redeemablePoints': (user.redeemablePoints || currentPoints) + pointsNum,
      ':pointActivities': pointActivities,
      ':activities': activities,
      ':updatedAt': new Date().toISOString()
    }
  }));

  return createResponse(201, { activity: newActivity });
}

