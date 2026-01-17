const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }
  
  try {
    const { httpMethod, pathParameters, body: requestBody } = event;
    const userId = pathParameters?.userId;
    
    switch (httpMethod) {
      case 'GET':
        if (userId) {
          // Get single user by ID
          return await getUser(userId);
        } else {
          // Get all users (for admin)
          return await getAllUsers();
        }
      
      case 'POST':
        // Create new user
        return await createUser(requestBody);
      
      case 'PUT':
        // Update user
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
        }
        return await updateUser(userId, requestBody);
      
      case 'DELETE':
        // Delete user (admin only)
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
        }
        return await deleteUser(userId);
      
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ 
        error: error.message || 'Internal server error'
      }),
    };
  }
};

async function getUser(userId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

async function getAllUsers() {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        users: result.Items || [],
        count: result.Count || 0,
      }),
    };
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

async function createUser(requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { userId, email, name, ...profileData } = body;
    
    if (!userId || !email || !name) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: userId, email, name' 
        }),
      };
    }
    
    // Default role is 'member' for all users
    const userProfile = {
      userId,
      email,
      name,
      ...profileData,
      role: profileData.role || 'member',
      points: profileData.points || 0,
      rank: profileData.rank || 0,
      badges: profileData.badges || [],
      meetupVerified: profileData.meetupVerified || false,
      meetupVerificationStatus: profileData.meetupVerificationStatus || 'pending',
      joinedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: userProfile,
    }));
    
    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        userId,
        user: userProfile,
      }),
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function updateUser(userId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
    // First check if user exists
    const existingUser = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    if (!existingUser.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Fields that can be updated
    const updatableFields = [
      'name', 'avatar', 'bio', 'designation', 'company', 'companyCity', 'country',
      'collegeName', 'collegeCity', 'isCollegeChamp', 'champCollegeId',
      'linkedIn', 'github', 'twitter', 'meetupEmail', 'userType',
      'points', 'rank', 'badges', 'role', 'meetupVerified', 'meetupVerificationStatus'
    ];
    
    updatableFields.forEach(field => {
      if (body[field] !== undefined) {
        updateExpressions.push(`#${field} = :${field}`);
        expressionAttributeNames[`#${field}`] = field;
        expressionAttributeValues[`:${field}`] = body[field];
      }
    });
    
    if (updateExpressions.length === 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'No valid fields to update' }),
      };
    }
    
    // Always update the updatedAt timestamp
    updateExpressions.push('#updatedAt = :updatedAt');
    expressionAttributeNames['#updatedAt'] = 'updatedAt';
    expressionAttributeValues[':updatedAt'] = new Date().toISOString();
    
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        user: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

async function deleteUser(userId) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        message: 'User deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting user:', error);
    throw error;
  }
}
