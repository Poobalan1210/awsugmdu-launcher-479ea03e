const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { userId, email, name, ...profileData } = body;
    
    if (!userId || !email || !name) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: userId, email, name' 
        }),
      };
    }
    
    const userProfile = {
      userId,
      email,
      name,
      ...profileData,
      role: profileData.role || 'participant',
      points: 0,
      rank: 0,
      badges: [],
      meetupVerified: false,
      meetupVerificationStatus: 'pending',
      joinedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: process.env.USERS_TABLE_NAME || 'awsug-users',
      Item: userProfile,
    }));
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({ success: true, userId }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
    };
  }
};
