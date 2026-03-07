const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { PERMISSIONS, RESOURCE_PERMISSIONS } = require('./permissions');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * Extract user ID from Authorization header
 * Expected format: "Bearer {jwt-token}" or "Bearer {userId}" or just "{userId}"
 */
function extractUserId(authHeader) {
  if (!authHeader) {
    return null;
  }
  
  // Remove "Bearer " prefix if present
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  
  if (!token) {
    return null;
  }
  
  // Check if it's a JWT token (has 3 parts separated by dots)
  if (token.includes('.')) {
    try {
      // Decode JWT payload (second part)
      const parts = token.split('.');
      if (parts.length === 3) {
        // Base64 decode the payload
        const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64Payload, 'base64').toString('utf8');
        const payload = JSON.parse(jsonPayload);
        // Try common JWT claims for user ID
        return payload.sub || payload['cognito:username'] || payload.userId || payload.username || null;
      }
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }
  
  // Otherwise treat it as a plain userId
  return token;
}

/**
 * Get user roles from DynamoDB
 */
async function getUserRoles(userId, usersTableName) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: usersTableName,
      Key: { userId },
    }));
    
    if (!result.Item) {
      return [];
    }
    
    // Extract role names from roles array
    const roles = result.Item.roles || [];
    return roles.map(r => r.role);
  } catch (error) {
    console.error('Error fetching user roles:', error);
    return [];
  }
}

/**
 * Check if user has permission for the requested action
 */
function hasPermission(userRoles, resource, action) {
  // Check each role the user has
  for (const role of userRoles) {
    const rolePermissions = PERMISSIONS[role];
    if (!rolePermissions) {
      continue;
    }
    
    const resourcePermissions = rolePermissions[resource];
    if (resourcePermissions && resourcePermissions.includes(action)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalize path by removing stage prefix and replacing path parameters
 */
function normalizePath(path, pathParameters = {}) {
  // Remove stage prefix (dev, staging, prod)
  let normalizedPath = path.replace(/^\/(dev|staging|prod)/, '');
  
  // Replace actual path parameter values with placeholders
  Object.keys(pathParameters || {}).forEach(param => {
    const value = pathParameters[param];
    normalizedPath = normalizedPath.replace(`/${value}`, `/{${param}}`);
  });
  
  return normalizedPath;
}

/**
 * Get required permission for a route
 */
function getRequiredPermission(method, path, pathParameters) {
  const normalizedPath = normalizePath(path, pathParameters);
  const routeKey = `${method} ${normalizedPath}`;
  
  console.log('Checking permission for route:', routeKey);
  
  return RESOURCE_PERMISSIONS[routeKey] || null;
}

/**
 * Main authorization function
 * Returns { authorized: boolean, userId: string|null, roles: array, error: string|null }
 */
async function authorize(event, usersTableName) {
  try {
    // Extract user ID from Authorization header
    const authHeader = event.headers?.Authorization || event.headers?.authorization;
    const userId = extractUserId(authHeader);
    
    if (!userId) {
      return {
        authorized: false,
        userId: null,
        roles: [],
        error: 'Missing or invalid authorization header',
      };
    }
    
    // Get user roles
    const userRoles = await getUserRoles(userId, usersTableName);
    
    if (userRoles.length === 0) {
      return {
        authorized: false,
        userId,
        roles: [],
        error: 'User has no roles assigned',
      };
    }
    
    // Get required permission for this route
    const requiredPermission = getRequiredPermission(
      event.httpMethod,
      event.path,
      event.pathParameters
    );
    
    // If no permission defined for this route, allow access (backward compatibility)
    if (!requiredPermission) {
      console.log('No permission defined for route, allowing access');
      return {
        authorized: true,
        userId,
        roles: userRoles,
        error: null,
      };
    }
    
    // Check if user has required permission
    const authorized = hasPermission(
      userRoles,
      requiredPermission.resource,
      requiredPermission.action
    );
    
    if (!authorized) {
      return {
        authorized: false,
        userId,
        roles: userRoles,
        error: `Insufficient permissions. Required: ${requiredPermission.action} on ${requiredPermission.resource}`,
      };
    }
    
    return {
      authorized: true,
      userId,
      roles: userRoles,
      error: null,
    };
  } catch (error) {
    console.error('Authorization error:', error);
    return {
      authorized: false,
      userId: null,
      roles: [],
      error: 'Authorization failed',
    };
  }
}

/**
 * Create unauthorized response
 */
function createUnauthorizedResponse(error, corsHeaders = {}) {
  return {
    statusCode: 403,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...corsHeaders,
    },
    body: JSON.stringify({
      error: 'Forbidden',
      message: error,
    }),
  };
}

module.exports = {
  authorize,
  extractUserId,
  getUserRoles,
  hasPermission,
  createUnauthorizedResponse,
};
