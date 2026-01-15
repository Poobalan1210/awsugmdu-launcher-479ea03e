const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';

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

// Helper function to parse path parameters
function parsePath(event) {
  // API Gateway proxy integration provides path in event.path
  // Path parameters are also available in event.pathParameters
  const path = event.path || event.requestContext?.path || '';
  const pathParts = path.split('/').filter(p => p);
  
  // Remove stage name if present (e.g., /dev/meetups -> meetups)
  const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
  const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
  const relevantParts = pathParts.slice(startIndex);
  
  // Also check pathParameters (from API Gateway)
  const pathParams = event.pathParameters || {};
  
  const resource = relevantParts[0] || pathParams.resource;
  const id = pathParams.id || relevantParts[1];
  const action = relevantParts[2] || pathParams.action;
  
  return { resource, id, action };
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
    
    // Parse path - handle both /dev/meetups and /meetups formats
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);
    
    const resource = routeParts[0];
    const id = routeParts[1];
    const action = routeParts[2];
    
    // Route handling
    if (resource === 'meetups') {
      if (method === 'GET' && !id) {
        // GET /meetups - List all meetups
        return await listMeetups(event);
      } else if (method === 'GET' && id && !action) {
        // GET /meetups/{id} - Get single meetup
        return await getMeetup(id);
      } else if (method === 'POST' && !id) {
        // POST /meetups - Create meetup
        return await createMeetup(event);
      } else if (method === 'PUT' && id && !action) {
        // PUT /meetups/{id} - Update meetup
        return await updateMeetup(id, event);
      } else if (method === 'PATCH' && id && action === 'publish') {
        // PATCH /meetups/{id}/publish - Publish/unpublish meetup
        return await publishMeetup(id, event);
      } else if (method === 'POST' && id && action === 'register') {
        // POST /meetups/{id}/register - Register user for meetup
        return await registerForMeetup(id, event);
      }
    }
    
    // Log for debugging
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

// List all meetups
async function listMeetups(event) {
  const queryParams = event.queryStringParameters || {};
  const status = queryParams.status; // 'draft', 'upcoming', 'completed'
  
  let meetups;
  
  if (status) {
    // Query by status using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: MEETUPS_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status
      }
    }));
    meetups = result.Items || [];
  } else {
    // Scan all meetups
    const result = await docClient.send(new ScanCommand({
      TableName: MEETUPS_TABLE
    }));
    meetups = result.Items || [];
  }
  
  // Sort by date (newest first)
  meetups.sort((a, b) => {
    const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
    const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
    return dateB - dateA;
  });
  
  // Auto-update status for past events
  const now = new Date();
  for (const meetup of meetups) {
    const eventDate = new Date(meetup.date + 'T' + (meetup.time || '00:00'));
    if (eventDate < now && meetup.status === 'upcoming') {
      // Update status to completed
      await docClient.send(new UpdateCommand({
        TableName: MEETUPS_TABLE,
        Key: { id: meetup.id },
        UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': 'completed',
          ':updatedAt': new Date().toISOString()
        }
      }));
      meetup.status = 'completed';
    }
  }
  
  return createResponse(200, { meetups });
}

// Get single meetup
async function getMeetup(id) {
  const result = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  if (!result.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }
  
  return createResponse(200, { meetup: result.Item });
}

// Create meetup
async function createMeetup(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  const {
    title,
    description,
    richDescription,
    date,
    time,
    type,
    location,
    meetingLink,
    meetupUrl,
    image,
    maxAttendees
  } = body;
  
  // Validation
  if (!title || !date || !time || !type) {
    return createResponse(400, { 
      error: 'Missing required fields: title, date, time, type' 
    });
  }
  
  // Generate ID
  const id = `meetup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const now = new Date().toISOString();
  const eventDate = new Date(date + 'T' + time);
  const isPast = eventDate < new Date();
  
  // Determine initial status
  let status = 'draft'; // Always start as draft
  
  const meetup = {
    id,
    title,
    description: description || '',
    richDescription: richDescription || '',
    date,
    time,
    type,
    location: location || undefined,
    meetingLink: meetingLink || undefined,
    meetupUrl: meetupUrl || undefined,
    image: image || undefined,
    status,
    attendees: 0,
    maxAttendees: maxAttendees ? parseInt(maxAttendees) : undefined,
    registeredUsers: [],
    speakers: [],
    createdAt: now,
    updatedAt: now
  };
  
  await docClient.send(new PutCommand({
    TableName: MEETUPS_TABLE,
    Item: meetup
  }));
  
  return createResponse(201, { meetup });
}

// Update meetup
async function updateMeetup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  
  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }
  
  // Build update expression
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  
  const allowedFields = [
    'title', 'description', 'richDescription', 'date', 'time', 'type',
    'location', 'meetingLink', 'meetupUrl', 'image', 'maxAttendees'
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
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues
  }));
  
  // Fetch updated meetup
  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { meetup: updated.Item });
}

// Publish/unpublish meetup
async function publishMeetup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { publish } = body; // true to publish, false to unpublish
  
  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }
  
  const meetup = existing.Item;
  const eventDate = new Date(meetup.date + 'T' + (meetup.time || '00:00'));
  const now = new Date();
  
  let newStatus;
  if (publish) {
    // Publish: change from draft to upcoming (if not past) or completed (if past)
    if (eventDate < now) {
      newStatus = 'completed';
    } else {
      newStatus = 'upcoming';
    }
  } else {
    // Unpublish: change to draft
    newStatus = 'draft';
  }
  
  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': newStatus,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated meetup
  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { meetup: updated.Item });
}

// Register user for meetup
async function registerForMeetup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { userId } = body;
  
  if (!userId) {
    return createResponse(400, { error: 'Missing required field: userId' });
  }
  
  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }
  
  const meetup = existing.Item;
  
  // Check if user is already registered
  const registeredUsers = meetup.registeredUsers || [];
  if (registeredUsers.includes(userId)) {
    return createResponse(200, { 
      meetup: meetup,
      message: 'User already registered',
      alreadyRegistered: true
    });
  }
  
  // Check if meetup is at capacity
  if (meetup.maxAttendees && registeredUsers.length >= meetup.maxAttendees) {
    return createResponse(400, { error: 'Meetup is at full capacity' });
  }
  
  // Add user to registeredUsers array and increment attendees
  const updatedRegisteredUsers = [...registeredUsers, userId];
  const newAttendeesCount = updatedRegisteredUsers.length;
  
  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET registeredUsers = :registeredUsers, attendees = :attendees, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':registeredUsers': updatedRegisteredUsers,
      ':attendees': newAttendeesCount,
      ':updatedAt': new Date().toISOString()
    }
  }));
  
  // Fetch updated meetup
  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));
  
  return createResponse(200, { 
    meetup: updated.Item,
    message: 'Successfully registered for meetup',
    alreadyRegistered: false
  });
}
