const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('../shared/auth');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
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
  
  try {
    const method = event.httpMethod;
    const path = event.path || event.requestContext?.path || '';
    
    // Parse path
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);
    
    // Route handling
    if (method === 'GET' && routeParts[0] === 'users' && routeParts[1] === 'roles' && !routeParts[2]) {
      // GET /users/roles - Get all role assignments
      return await getAllUserRoles();
    } else if (method === 'GET' && routeParts[0] === 'users' && routeParts[2] === 'roles') {
      // GET /users/{userId}/roles - Get roles for specific user
      return await getUserRoles(routeParts[1]);
    } else if (method === 'POST' && routeParts[0] === 'users' && routeParts[1] === 'roles') {
      // POST /users/roles - Assign role to user
      return await assignRole(event);
    } else if (method === 'DELETE' && routeParts[0] === 'users' && routeParts[1] === 'roles' && routeParts[2]) {
      // DELETE /users/roles/{roleId} - Remove role
      return await removeRole(routeParts[2]);
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

// Get all role assignments
async function getAllUserRoles() {
  const result = await docClient.send(new ScanCommand({
    TableName: USERS_TABLE
  }));
  
  const users = result.Items || [];
  const allRoles = [];
  
  // Extract roles from all users
  for (const user of users) {
    if (user.roles && Array.isArray(user.roles)) {
      allRoles.push(...user.roles);
    }
  }
  
  return createResponse(200, { roles: allRoles });
}

// Get roles for a specific user
async function getUserRoles(userId) {
  const result = await docClient.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { userId }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'User not found' });
  }
  
  const roles = result.Item.roles || [];
  return createResponse(200, { roles });
}

// Assign role to user
async function assignRole(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId, role, assignedBy } = body;
  
  if (!userId || !role || !assignedBy) {
    return createResponse(400, { error: 'Missing required fields: userId, role, assignedBy' });
  }
  
  // Validate role
  const validRoles = ['member', 'volunteer', 'organiser', 'champ', 'cloud_club_captain', 'speaker', 'admin'];
  if (!validRoles.includes(role)) {
    return createResponse(400, { error: 'Invalid role' });
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
  const roles = user.roles || [];
  
  // Check if user already has this role
  const existingRole = roles.find(r => r.role === role);
  if (existingRole) {
    return createResponse(200, { 
      role: existingRole,
      message: 'User already has this role'
    });
  }
  
  // Create new role assignment
  const newRole = {
    id: `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    role,
    assignedAt: new Date().toISOString(),
    assignedBy
  };
  
  roles.push(newRole);
  
  // Update user with new role
  await docClient.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      ...user,
      roles,
      updatedAt: new Date().toISOString()
    }
  }));
  
  return createResponse(201, { role: newRole });
}

// Remove role from user
async function removeRole(roleId) {
  // Scan all users to find the one with this role
  const result = await docClient.send(new ScanCommand({
    TableName: USERS_TABLE
  }));
  
  const users = result.Items || [];
  
  for (const user of users) {
    if (user.roles && Array.isArray(user.roles)) {
      const roleIndex = user.roles.findIndex(r => r.id === roleId);
      if (roleIndex !== -1) {
        // Remove the role
        user.roles.splice(roleIndex, 1);
        
        // Update user
        await docClient.send(new PutCommand({
          TableName: USERS_TABLE,
          Item: {
            ...user,
            updatedAt: new Date().toISOString()
          }
        }));
        
        return createResponse(200, { message: 'Role removed successfully' });
      }
    }
  }
  
  return createResponse(404, { error: 'Role not found' });
}
