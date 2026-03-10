const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('./shared/auth');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';
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

  // Skip authorization for GET requests (read-only operations)
  // This allows public access to view meetups
  if (event.httpMethod !== 'GET') {
    // Authorize request for write operations
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
      } else if (method === 'GET' && id && action === 'participants') {
        // GET /meetups/{id}/participants - Get meetup participants
        return await getMeetupParticipants(id);
      } else if (method === 'POST' && !id) {
        // POST /meetups - Create meetup
        return await createMeetup(event);
      } else if (method === 'PUT' && id && !action) {
        // PUT /meetups/{id} - Update meetup
        return await updateMeetup(id, event);
      } else if (method === 'DELETE' && id && !action) {
        // DELETE /meetups/{id} - Delete meetup
        return await deleteMeetup(id);
      } else if (method === 'PATCH' && id && action === 'publish') {
        // PATCH /meetups/{id}/publish - Publish/unpublish meetup
        return await publishMeetup(id, event);
      } else if (method === 'POST' && id && action === 'register') {
        // POST /meetups/{id}/register - Register user for meetup
        return await registerForMeetup(id, event);
      } else if (method === 'POST' && id && action === 'mark-attendance') {
        // POST /meetups/{id}/mark-attendance - Mark attendance for users
        return await markAttendance(id, event);
      } else if (method === 'PATCH' && id && action === 'end') {
        // PATCH /meetups/{id}/end - End a meetup event
        return await endMeetup(id, event);
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
  const sprintId = queryParams.sprintId; // Filter by sprint
  const certificationGroupId = queryParams.certificationGroupId; // Filter by certification group

  let meetups;

  if (sprintId) {
    // Query by sprintId using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: MEETUPS_TABLE,
      IndexName: 'sprintId-index',
      KeyConditionExpression: 'sprintId = :sprintId',
      ExpressionAttributeValues: {
        ':sprintId': sprintId
      }
    }));
    meetups = result.Items || [];

    // Further filter by status if provided
    if (status) {
      meetups = meetups.filter(m => m.status === status);
    }
  } else if (certificationGroupId) {
    // Query by certificationGroupId using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: MEETUPS_TABLE,
      IndexName: 'certificationGroupId-index',
      KeyConditionExpression: 'certificationGroupId = :certificationGroupId',
      ExpressionAttributeValues: {
        ':certificationGroupId': certificationGroupId
      }
    }));
    meetups = result.Items || [];

    // Further filter by status if provided
    if (status) {
      meetups = meetups.filter(m => m.status === status);
    }
  } else if (status) {
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
    if (meetup.status !== 'upcoming') continue;

    const eventDate = new Date(meetup.date + 'T' + (meetup.time || '00:00'));
    const endDate = meetup.endDate ? new Date(meetup.endDate + 'T23:59:59') : null;

    // Mark as completed if: event date has passed, OR endDate has passed
    const shouldComplete = eventDate < now || (endDate && endDate < now);

    if (shouldComplete) {
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
    duration,
    type,
    location,
    meetingLink,
    meetupUrl,
    image,
    maxAttendees,
    speakers,
    hosts,
    volunteers,
    sprintId,
    certificationGroupId,
    collegeId,
    sessionPoints
  } = body;

  // Validation
  if (!title || !date || !time || !type) {
    return createResponse(400, {
      error: 'Missing required fields: title, date, time, type'
    });
  }

  // Validate sprint selection if type is skill-sprint
  if (type === 'skill-sprint' && !sprintId) {
    return createResponse(400, {
      error: 'Sprint ID is required when type is skill-sprint'
    });
  }

  // Validate certification group selection if type is certification-circle
  if (type === 'certification-circle' && !certificationGroupId) {
    return createResponse(400, {
      error: 'Certification Group ID is required when type is certification-circle'
    });
  }

  // Validate college selection if type is college-champ
  if (type === 'college-champ' && !collegeId) {
    return createResponse(400, {
      error: 'College ID is required when type is college-champ'
    });
  }

  // Generate ID
  const id = `meetup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const now = new Date().toISOString();
  const eventDate = new Date(date + 'T' + time);
  const isPast = eventDate < new Date();

  // Determine initial status
  let status = 'draft'; // Always start as draft

  // Auto-register organizers, speakers, and volunteers
  const autoRegisteredUsers = new Set();

  // Add speakers
  if (speakers && Array.isArray(speakers)) {
    speakers.forEach(speaker => {
      if (speaker.userId) {
        autoRegisteredUsers.add(speaker.userId);
      }
    });
  }

  // Add hosts (organizers)
  if (hosts && Array.isArray(hosts)) {
    hosts.forEach(host => {
      if (host.userId) {
        autoRegisteredUsers.add(host.userId);
      }
    });
  }

  // Add volunteers
  if (volunteers && Array.isArray(volunteers)) {
    volunteers.forEach(volunteer => {
      if (volunteer.userId) {
        autoRegisteredUsers.add(volunteer.userId);
      }
    });
  }

  const registeredUsers = Array.from(autoRegisteredUsers);
  const attendees = registeredUsers.length;

  const meetup = {
    id,
    title,
    description: description || '',
    richDescription: richDescription || '',
    date,
    time,
    duration: duration || undefined,
    type,
    location: location || undefined,
    meetingLink: meetingLink || undefined,
    meetupUrl: meetupUrl || undefined,
    image: image || undefined,
    status,
    attendees,
    maxAttendees: maxAttendees ? parseInt(maxAttendees) : undefined,
    registeredUsers,
    ...(type === 'skill-sprint' && sprintId ? { sprintId } : {}),
    ...(type === 'certification-circle' && certificationGroupId ? { certificationGroupId } : {}),
    ...(type === 'college-champ' && collegeId ? { collegeId } : {}),
    ...(type === 'college-champ' && sessionPoints ? { sessionPoints: parseInt(sessionPoints) || 0 } : {}),
    speakers: speakers || [],
    hosts: hosts || [],
    volunteers: volunteers || [],
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: MEETUPS_TABLE,
    Item: meetup
  }));

  // If college-champ type, add event to college's hostedEvents
  if (type === 'college-champ' && collegeId) {
    try {
      const COLLEGES_TABLE = process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';

      // Get college
      const college = await docClient.send(new GetCommand({
        TableName: COLLEGES_TABLE,
        Key: { id: collegeId }
      }));

      if (college.Item) {
        const hostedEvents = college.Item.hostedEvents || [];
        hostedEvents.push({
          id,
          title,
          description: description || '',
          date,
          type: 'meetup',
          attendees: 0,
          pointsAwarded: 0,
          status: 'upcoming'
        });

        await docClient.send(new UpdateCommand({
          TableName: COLLEGES_TABLE,
          Key: { id: collegeId },
          UpdateExpression: 'SET hostedEvents = :events, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':events': hostedEvents,
            ':updatedAt': now
          }
        }));
      }
    } catch (error) {
      console.error('Error adding event to college:', error);
      // Don't fail the meetup creation if college update fails
    }
  }

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
    'title', 'description', 'richDescription', 'date', 'time', 'duration', 'type',
    'location', 'meetingLink', 'meetupUrl', 'image', 'maxAttendees',
    'speakers', 'hosts', 'volunteers', 'sprintId', 'certificationGroupId', 'endDate', 'sessionPoints'
  ];

  allowedFields.forEach(field => {
    if (body[field] !== undefined) {
      updateExpressions.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = body[field];
    }
  });

  // Auto-register organizers, speakers, and volunteers when they are updated
  if (body.speakers || body.hosts || body.volunteers) {
    const autoRegisteredUsers = new Set(existing.Item.registeredUsers || []);

    // Add speakers
    if (body.speakers && Array.isArray(body.speakers)) {
      body.speakers.forEach(speaker => {
        if (speaker.userId) {
          autoRegisteredUsers.add(speaker.userId);
        }
      });
    } else if (existing.Item.speakers) {
      // Keep existing speakers registered
      existing.Item.speakers.forEach(speaker => {
        if (speaker.userId) {
          autoRegisteredUsers.add(speaker.userId);
        }
      });
    }

    // Add hosts (organizers)
    if (body.hosts && Array.isArray(body.hosts)) {
      body.hosts.forEach(host => {
        if (host.userId) {
          autoRegisteredUsers.add(host.userId);
        }
      });
    } else if (existing.Item.hosts) {
      // Keep existing hosts registered
      existing.Item.hosts.forEach(host => {
        if (host.userId) {
          autoRegisteredUsers.add(host.userId);
        }
      });
    }

    // Add volunteers
    if (body.volunteers && Array.isArray(body.volunteers)) {
      body.volunteers.forEach(volunteer => {
        if (volunteer.userId) {
          autoRegisteredUsers.add(volunteer.userId);
        }
      });
    } else if (existing.Item.volunteers) {
      // Keep existing volunteers registered
      existing.Item.volunteers.forEach(volunteer => {
        if (volunteer.userId) {
          autoRegisteredUsers.add(volunteer.userId);
        }
      });
    }

    const registeredUsers = Array.from(autoRegisteredUsers);
    updateExpressions.push('registeredUsers = :registeredUsers');
    expressionAttributeValues[':registeredUsers'] = registeredUsers;

    updateExpressions.push('attendees = :attendees');
    expressionAttributeValues[':attendees'] = registeredUsers.length;
  }

  // Handle sprintId - add it if provided, remove it if explicitly set to null
  if (body.sprintId === null) {
    // Remove the sprintId attribute
    updateExpressions.push('REMOVE sprintId');
  } else if (body.sprintId !== undefined) {
    // Add or update sprintId
    updateExpressions.push('sprintId = :sprintId');
    expressionAttributeValues[':sprintId'] = body.sprintId;
  }

  // Handle certificationGroupId - add it if provided, remove it if explicitly set to null
  if (body.certificationGroupId === null) {
    // Remove the certificationGroupId attribute
    updateExpressions.push('REMOVE certificationGroupId');
  } else if (body.certificationGroupId !== undefined) {
    // Add or update certificationGroupId
    updateExpressions.push('certificationGroupId = :certificationGroupId');
    expressionAttributeValues[':certificationGroupId'] = body.certificationGroupId;
  }

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

// Get meetup participants
async function getMeetupParticipants(id) {
  // Check if meetup exists
  const meetupResult = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!meetupResult.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const meetup = meetupResult.Item;
  const registeredUsers = meetup.registeredUsers || [];

  if (registeredUsers.length === 0) {
    return createResponse(200, { participants: [] });
  }

  // Fetch user details for all registered users
  const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
  const participants = [];

  for (const userId of registeredUsers) {
    try {
      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId }
      }));

      if (userResult.Item) {
        const user = userResult.Item;
        participants.push({
          id: user.userId,
          name: user.name || 'Unknown User',
          email: user.email,
          avatar: user.avatar || user.profilePicture,
          designation: user.designation,
          company: user.company
        });
      }
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
      // Continue with other users even if one fails
    }
  }

  return createResponse(200, { participants });
}

// Delete meetup
async function deleteMeetup(id) {
  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  // Delete the meetup
  await docClient.send(new DeleteCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  return createResponse(200, { message: 'Meetup deleted successfully' });
}

// Mark attendance for meetup
async function markAttendance(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const {
    emails,
    pointsPerAttendee = 50,
    awardVolunteerPoints = true,
    volunteerPoints = 75,
    awardSpeakerPoints = true,
    speakerPoints = 100
  } = body;

  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return createResponse(400, { error: 'Missing required field: emails (array)' });
  }

  // Check if meetup exists
  const meetupResult = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!meetupResult.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const meetup = meetupResult.Item;

  // Get volunteer and speaker user IDs
  const volunteerIds = new Set((meetup.volunteers || []).map(v => v.userId).filter(Boolean));
  const speakerIds = new Set((meetup.speakers || []).map(s => s.userId).filter(Boolean));

  // Fetch users by email
  const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
  const results = {
    success: [],
    notFound: [],
    alreadyMarked: [],
    errors: [],
    volunteersAwarded: [],
    speakersAwarded: []
  };

  // Get current attendedUsers list
  const attendedUsers = meetup.attendedUsers || [];
  const attendedEmails = new Set();

  // Build a map of already attended users
  for (const userId of attendedUsers) {
    try {
      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId }
      }));
      if (userResult.Item) {
        attendedEmails.add(userResult.Item.email.toLowerCase());
      }
    } catch (error) {
      console.error(`Error fetching user ${userId}:`, error);
    }
  }

  // Process each email
  for (const email of emails) {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      continue;
    }

    // Check if already marked
    if (attendedEmails.has(normalizedEmail)) {
      results.alreadyMarked.push(email);
      continue;
    }

    try {
      // Find user by email using GSI
      const userQueryResult = await docClient.send(new QueryCommand({
        TableName: USERS_TABLE,
        IndexName: 'email-index',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: {
          ':email': normalizedEmail
        }
      }));

      if (!userQueryResult.Items || userQueryResult.Items.length === 0) {
        results.notFound.push(email);
        continue;
      }

      const user = userQueryResult.Items[0];
      const userId = user.userId;

      // Add to attendedUsers list
      attendedUsers.push(userId);
      attendedEmails.add(normalizedEmail);

      // Determine points based on role
      let pointsToAward = pointsPerAttendee;
      let role = 'attendee';

      if (speakerIds.has(userId) && awardSpeakerPoints) {
        pointsToAward = speakerPoints;
        role = 'speaker';
      } else if (volunteerIds.has(userId) && awardVolunteerPoints) {
        pointsToAward = volunteerPoints;
        role = 'volunteer';
      }

      // Award points to user
      const currentPoints = user.points || 0;
      const newPoints = currentPoints + pointsToAward;

      // Create point activity
      const pointActivity = {
        id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId,
        points: pointsToAward,
        reason: `Attended ${meetup.title} as ${role}`,
        type: 'event',
        awardedBy: event.userContext?.userId || 'system',
        awardedAt: new Date().toISOString()
      };

      const pointActivities = user.pointActivities || [];
      pointActivities.push(pointActivity);

      // Update user's points and add activity
      const activity = {
        type: 'meetup_attended',
        meetupId: id,
        meetupTitle: meetup.title,
        points: pointsToAward,
        timestamp: new Date().toISOString()
      };

      const userActivities = user.activities || [];
      userActivities.push(activity);

      await docClient.send(new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId },
        UpdateExpression: 'SET points = :points, activities = :activities, pointActivities = :pointActivities, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':points': newPoints,
          ':activities': userActivities,
          ':pointActivities': pointActivities,
          ':updatedAt': new Date().toISOString()
        }
      }));

      const result = {
        email,
        userId,
        name: user.name,
        role,
        pointsAwarded: pointsToAward,
        newTotal: newPoints
      };

      results.success.push(result);

      if (role === 'volunteer') {
        results.volunteersAwarded.push(result);
      } else if (role === 'speaker') {
        results.speakersAwarded.push(result);
      }
    } catch (error) {
      console.error(`Error processing email ${email}:`, error);
      results.errors.push({
        email,
        error: error.message
      });
    }
  }

  // Update meetup with new attendedUsers list
  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET attendedUsers = :attendedUsers, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':attendedUsers': attendedUsers,
      ':updatedAt': new Date().toISOString()
    }
  }));

  return createResponse(200, {
    message: 'Attendance marked successfully',
    results,
    summary: {
      total: emails.length,
      successful: results.success.length,
      attendees: results.success.length - results.volunteersAwarded.length - results.speakersAwarded.length,
      volunteers: results.volunteersAwarded.length,
      speakers: results.speakersAwarded.length,
      notFound: results.notFound.length,
      alreadyMarked: results.alreadyMarked.length,
      errors: results.errors.length
    }
  });
}

// End a meetup event
async function endMeetup(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { endDate, endNow } = body;

  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const meetup = existing.Item;
  const now = new Date();

  // If endNow is true or no endDate provided, end immediately
  // Otherwise check if the scheduled end date is in the past
  const shouldCompleteNow = endNow || !endDate || new Date(endDate) <= now;
  const newStatus = shouldCompleteNow ? 'completed' : meetup.status;

  const updateExpression = 'SET #status = :status, endDate = :endDate, updatedAt = :updatedAt';

  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': newStatus,
      ':endDate': endDate || now.toISOString().split('T')[0],
      ':updatedAt': now.toISOString()
    }
  }));

  // If this is a college-champ meetup and it's being completed, update the college's hostedEvents
  if (shouldCompleteNow && meetup.collegeId) {
    try {
      const COLLEGES_TABLE = process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';

      const college = await docClient.send(new GetCommand({
        TableName: COLLEGES_TABLE,
        Key: { id: meetup.collegeId }
      }));

      if (college.Item) {
        let updateExpression = 'SET hostedEvents = :events, updatedAt = :updatedAt';
        const expressionAttributeValues = {
          ':updatedAt': now.toISOString()
        };

        const hostedEvents = college.Item.hostedEvents || [];
        const eventIndex = hostedEvents.findIndex(e => e.id === id);

        // Award points if configured
        const pointsToAward = meetup.sessionPoints || 0;

        if (eventIndex !== -1) {
          // Update the existing event's status, attendees, and points awarded
          hostedEvents[eventIndex].status = 'completed';
          hostedEvents[eventIndex].attendees = (meetup.attendedUsers || []).length;
          hostedEvents[eventIndex].pointsAwarded = pointsToAward;

          expressionAttributeValues[':events'] = hostedEvents;
        }

        // Add to totalPoints if there are points to award
        if (pointsToAward > 0) {
          const currentTotal = college.Item.totalPoints || 0;
          updateExpression += ', totalPoints = :totalPoints';
          expressionAttributeValues[':totalPoints'] = currentTotal + pointsToAward;
        }

        if (eventIndex !== -1 || pointsToAward > 0) {
          await docClient.send(new UpdateCommand({
            TableName: COLLEGES_TABLE,
            Key: { id: meetup.collegeId },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: expressionAttributeValues
          }));
        }
      }
    } catch (error) {
      console.error('Error updating college hostedEvents and points on meetup end:', error);
      // Don't fail the end operation if college update fails
    }
  }

  // Fetch updated meetup
  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  return createResponse(200, {
    meetup: updated.Item,
    message: shouldCompleteNow
      ? 'Meetup ended successfully'
      : `Meetup scheduled to end on ${endDate}`
  });
}

