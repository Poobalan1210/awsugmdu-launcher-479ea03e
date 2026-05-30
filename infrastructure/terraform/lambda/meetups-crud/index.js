const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, ScanCommand, QueryCommand, DeleteCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('./shared/auth');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
let docClient = DynamoDBDocumentClient.from(client);

const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';
const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const FEEDBACK_TABLE = process.env.MEETUP_FEEDBACK_TABLE_NAME || 'awsug-meetup-feedback';

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
  // EXCEPT for feedback paths which always require authentication so we can identify the user
  const _path = event.path || event.requestContext?.path || '';
  const _isFeedbackPath = _path.includes('/feedback');

  if (event.httpMethod !== 'GET' || _isFeedbackPath) {
    // Authorize request for write operations (and feedback reads)
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
      } else if (method === 'POST' && id && action === 'photos') {
        // POST /meetups/{id}/photos - Add post-event photos
        return await addEventPhotos(id, event);
      } else if (method === 'POST' && id && action === 'report') {
        // POST /meetups/{id}/report - Add post-event report (for college-champ sessions)
        return await addEventReport(id, event);
      } else if (method === 'DELETE' && id && action === 'photos') {
        // DELETE /meetups/{id}/photos - Remove a photo
        return await removeEventPhoto(id, event);
      } else if (method === 'POST' && id && action === 'feedback') {
        // POST /meetups/{id}/feedback - Submit feedback (and auto-mark attendance)
        return await submitFeedback(id, event);
      } else if (method === 'GET' && id && action === 'feedback' && routeParts[3] === 'me') {
        // GET /meetups/{id}/feedback/me - Get current user's feedback for this meetup
        return await getMyFeedback(id, event);
      } else if (method === 'GET' && id && action === 'feedback') {
        // GET /meetups/{id}/feedback - List all feedback for a meetup (admin only)
        return await listFeedback(id, event);
      } else if (method === 'PATCH' && id && action === 'feedback-settings') {
        // PATCH /meetups/{id}/feedback-settings - Update feedback settings (admin only)
        return await updateFeedbackSettings(id, event);
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
    sessionPoints,
    speakerPoints,
    volunteerPoints,
    hostPoints
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

  // Validate certification group selection if type is circles
  if (type === 'circles' && !certificationGroupId) {
    return createResponse(400, {
      error: 'Certification Group ID is required when type is circles'
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
    ...(type === 'circles' && certificationGroupId ? { certificationGroupId } : {}),
    ...(type === 'college-champ' && collegeId ? { collegeId } : {}),
    ...(type === 'college-champ' && sessionPoints ? { sessionPoints: parseInt(sessionPoints) || 0 } : {}),
    speakerPoints: speakerPoints ? parseInt(speakerPoints) : 0,
    volunteerPoints: volunteerPoints ? parseInt(volunteerPoints) : 0,
    hostPoints: hostPoints ? parseInt(hostPoints) : 0,
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
    'speakers', 'hosts', 'volunteers', 'sprintId', 'certificationGroupId', 'endDate', 'sessionPoints',
    'speakerPoints', 'volunteerPoints', 'hostPoints',
    'feedbackEnabled', 'attendeePoints'
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

  // Fetch user details for all registered users in batches (BatchGetItem
  // supports up to 100 keys per request). This replaces the previous
  // one-GetItem-per-user loop, which caused a multi-second delay for large
  // participant lists.
  const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';

  // De-duplicate userIds while preserving first-seen order
  const uniqueUserIds = [...new Set(registeredUsers)];

  // Map userId -> user item so we can return results in registration order
  const userById = new Map();

  // Chunk into groups of 100 (BatchGetItem hard limit)
  for (let i = 0; i < uniqueUserIds.length; i += 100) {
    const chunk = uniqueUserIds.slice(i, i + 100);
    let keys = chunk.map(userId => ({ userId }));

    // Retry any UnprocessedKeys with simple backoff
    let attempt = 0;
    while (keys.length > 0) {
      try {
        const resp = await docClient.send(new BatchGetCommand({
          RequestItems: {
            [USERS_TABLE]: { Keys: keys }
          }
        }));

        const returned = (resp.Responses && resp.Responses[USERS_TABLE]) || [];
        for (const user of returned) {
          userById.set(user.userId, user);
        }

        const unprocessed = resp.UnprocessedKeys
          && resp.UnprocessedKeys[USERS_TABLE]
          && resp.UnprocessedKeys[USERS_TABLE].Keys;

        keys = unprocessed && unprocessed.length > 0 ? unprocessed : [];

        if (keys.length > 0 && ++attempt <= 5) {
          await new Promise(r => setTimeout(r, 50 * attempt));
        } else if (keys.length > 0) {
          console.error(`Giving up on ${keys.length} unprocessed user keys after ${attempt} retries`);
          break;
        }
      } catch (error) {
        console.error('Error batch-fetching users:', error);
        // Fall back to individual GetItem calls (in parallel) so a BatchGetItem
        // failure never silently returns an incomplete participant list.
        const fallback = await Promise.all(keys.map(async (key) => {
          try {
            const r = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: key }));
            return r.Item || null;
          } catch (e) {
            console.error(`Error fetching user ${key.userId}:`, e);
            return null;
          }
        }));
        for (const user of fallback) {
          if (user) userById.set(user.userId, user);
        }
        keys = [];
      }
    }
  }

  // Build participant list in original registration order, skipping any
  // userIds that no longer resolve to a user record.
  const participants = [];
  for (const userId of uniqueUserIds) {
    const user = userById.get(userId);
    if (user) {
      participants.push({
        id: user.userId,
        name: user.name || 'Unknown User',
        email: user.email,
        avatar: user.avatar || user.profilePicture,
        designation: user.designation,
        company: user.company
      });
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

// Extract the numeric Meetup member ID from a stored membership URL.
// Verification stores the URL in user.meetupEmail, e.g.
//   https://www.meetup.com/members/456181201/group/36938462/
function extractMeetupMemberId(meetupUrl) {
  if (!meetupUrl || typeof meetupUrl !== 'string') {
    return null;
  }
  const match = meetupUrl.match(/\/members\/(\d+)/);
  return match ? match[1] : null;
}

// Determine whether a user counts as Meetup-verified.
// Mirrors the front-end derivation in src/lib/userProfile.ts. Because a member
// ID is only ever stored as a result of completing verification, any user we
// can match by member ID is verified by definition (final fallback).
function isMeetupVerified(user) {
  if (!user) return false;
  if (user.meetupVerified === true) return true;
  if (user.meetupVerificationStatus === 'approved') return true;
  const pointActivities = user.pointActivities || [];
  if (pointActivities.some(a =>
    a.type === 'signup' ||
    a.type === 'meetup_verification' ||
    (a.reason && a.reason.toLowerCase().includes('meetup'))
  )) {
    return true;
  }
  return !!extractMeetupMemberId(user.meetupEmail);
}

// Build a map of Meetup member ID -> user record by scanning the users table.
// There is no GSI on the member ID (it lives inside the meetupEmail URL), so a
// paginated scan is used. This is acceptable for the group's current scale.
async function buildMemberIdIndex() {
  const map = new Map();
  let lastKey;
  do {
    const resp = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'userId, email, #nm, points, redeemablePoints, meetupEmail, meetupVerified, meetupVerificationStatus, pointActivities, activities',
      ExpressionAttributeNames: { '#nm': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of resp.Items || []) {
      const memberId = extractMeetupMemberId(item.meetupEmail);
      if (memberId && !map.has(memberId)) {
        map.set(memberId, item);
      }
    }
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return map;
}

// Atomically award attendance points to a user for a meetup, exactly once.
//
// Idempotency is enforced at the database level: each award adds the meetup ID
// to a per-user string set (attendedMeetupIds) under a ConditionExpression that
// the meetup ID is not already present. Concurrent attempts (e.g. a CSV import
// and a feedback submission landing at the same time) therefore cannot
// double-award - the first write wins and any subsequent one fails the
// condition. Point/redeemable increments use additive server-side expressions
// so they remain correct regardless of read staleness.
//
// Returns { status: 'awarded', newTotal, pointActivity } on success,
// or { status: 'already' } if points were already awarded for this meetup.
async function awardAttendancePointsAtomic(user, meetup, meetupId, points, opts = {}) {
  const userId = user.userId;
  const now = new Date().toISOString();

  // Legacy idempotency guard: awards made before attendedMeetupIds existed only
  // left a meetup_attended activity. Honour that so a re-run doesn't double-award
  // users who earned points under the previous implementation.
  const existingActivities = Array.isArray(user.activities) ? user.activities : [];
  if (existingActivities.some(a => a.type === 'meetup_attended' && a.meetupId === meetupId)) {
    return { status: 'already' };
  }

  const pointActivity = {
    id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId,
    points,
    reason: opts.reason || `Attended ${meetup.title}`,
    type: 'event',
    awardedBy: opts.awardedBy || 'system',
    awardedAt: now,
  };

  const activity = {
    type: 'meetup_attended',
    meetupId,
    meetupTitle: meetup.title,
    points,
    timestamp: now,
  };
  if (opts.source) {
    activity.source = opts.source;
  }

  // Baseline only used if redeemablePoints doesn't exist yet (legacy users):
  // mirrors the historic `redeemablePoints ?? points` semantics.
  const redeemBaseline = user.redeemablePoints != null
    ? user.redeemablePoints
    : (user.points || 0);

  try {
    const result = await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression:
        'SET points = if_not_exists(points, :zero) + :p, ' +
        'redeemablePoints = if_not_exists(redeemablePoints, :rb) + :p, ' +
        'activities = list_append(if_not_exists(activities, :empty), :actList), ' +
        'pointActivities = list_append(if_not_exists(pointActivities, :empty), :paList), ' +
        'updatedAt = :now ' +
        'ADD attendedMeetupIds :midSet',
      ConditionExpression: 'attribute_not_exists(attendedMeetupIds) OR NOT contains(attendedMeetupIds, :mid)',
      ExpressionAttributeValues: {
        ':p': points,
        ':zero': 0,
        ':rb': redeemBaseline,
        ':empty': [],
        ':actList': [activity],
        ':paList': [pointActivity],
        ':now': now,
        ':midSet': new Set([meetupId]),
        ':mid': meetupId,
      },
      ReturnValues: 'UPDATED_NEW',
    }));

    const newTotal = result.Attributes?.points ?? ((user.points || 0) + points);
    return { status: 'awarded', newTotal, pointActivity };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { status: 'already' };
    }
    throw err;
  }
}

// Mark attendance for meetup (by Meetup member ID).
//
// Matches each member ID against verified members, awards attendance points,
// and registers them as participants (added to both attendedUsers and
// registeredUsers). Idempotent: a member already in attendedUsers is not
// awarded again. Body: { memberIds: string[], pointsPerAttendee?: number }
async function markAttendance(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  // Check if meetup exists
  const meetupResult = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!meetupResult.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const meetup = meetupResult.Item;

  // Default points: explicit body value > meetup.attendeePoints > 50 (legacy default)
  const pointsPerAttendee = body.pointsPerAttendee != null
    ? body.pointsPerAttendee
    : (meetup.attendeePoints != null ? meetup.attendeePoints : 50);

  // Normalize and de-duplicate incoming member IDs
  const memberIds = [...new Set(
    (Array.isArray(body.memberIds) ? body.memberIds : [])
      .map(m => String(m).trim())
      .filter(Boolean)
  )];

  if (memberIds.length === 0) {
    return createResponse(400, { error: 'Missing required field: memberIds (array)' });
  }

  // Build member ID -> user index from the users table
  const memberIdToUser = await buildMemberIdIndex();

  const results = {
    success: [],
    notFound: [],
    alreadyMarked: [],
    notVerified: [],
    errors: []
  };

  // Track attendance and participation as sets so we can persist once at the end
  const attendedUsers = new Set(meetup.attendedUsers || []);
  const registeredUsers = new Set(meetup.registeredUsers || []);

  for (const memberId of memberIds) {
    try {
      const user = memberIdToUser.get(memberId);

      // No matching member in our system
      if (!user) {
        results.notFound.push(memberId);
        continue;
      }

      const userId = user.userId;

      // They appear in the attendees CSV, so record attendance and register
      // them as a participant regardless of verification status.
      attendedUsers.add(userId);
      registeredUsers.add(userId);

      // Enforce Meetup verification: only verified members earn points.
      // Unverified members are still recorded as attended/participants above.
      if (!isMeetupVerified(user)) {
        results.notVerified.push({ memberId, userId, name: user.name });
        continue;
      }

      // Award points atomically (idempotent per meetup, race-safe across the
      // CSV import and feedback flows). A re-run also awards points to someone
      // who attended while unverified and has since verified.
      const award = await awardAttendancePointsAtomic(user, meetup, id, pointsPerAttendee, {
        awardedBy: event.userContext?.userId || 'system'
      });

      if (award.status === 'already') {
        results.alreadyMarked.push({ memberId, userId, name: user.name });
        continue;
      }

      results.success.push({
        memberId,
        userId,
        name: user.name,
        pointsAwarded: pointsPerAttendee,
        newTotal: award.newTotal
      });
    } catch (error) {
      console.error(`Error processing member ID ${memberId}:`, error);
      results.errors.push({ memberId, error: error.message });
    }
  }

  // Persist attendance + participation on the meetup
  const registeredArray = [...registeredUsers];
  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET attendedUsers = :attendedUsers, registeredUsers = :registeredUsers, attendees = :attendees, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':attendedUsers': [...attendedUsers],
      ':registeredUsers': registeredArray,
      ':attendees': registeredArray.length,
      ':updatedAt': new Date().toISOString()
    }
  }));

  return createResponse(200, {
    message: 'Attendance marked successfully',
    results,
    summary: {
      total: memberIds.length,
      successful: results.success.length,
      notFound: results.notFound.length,
      alreadyMarked: results.alreadyMarked.length,
      notVerified: results.notVerified.length,
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
  const isTransitioningToCompleted = shouldCompleteNow && meetup.status !== 'completed';

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

  // Assign points to hosts, speakers, and volunteers if transitioning to completed
  if (isTransitioningToCompleted) {
    try {
      const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
      
      const rolesToAward = [
        { users: meetup.hosts || [], requiredPoints: meetup.hostPoints || 0, roleName: 'organizer' },
        { users: meetup.speakers || [], requiredPoints: meetup.speakerPoints || 0, roleName: 'speaker' },
        { users: meetup.volunteers || [], requiredPoints: meetup.volunteerPoints || 0, roleName: 'volunteer' }
      ];

      for (const roleDef of rolesToAward) {
        if (roleDef.requiredPoints > 0 && roleDef.users.length > 0) {
          for (const person of roleDef.users) {
            if (!person.userId) continue;

            try {
              // Fetch user
              const userResult = await docClient.send(new GetCommand({
                TableName: USERS_TABLE,
                Key: { userId: person.userId }
              }));

              if (userResult.Item) {
                const user = userResult.Item;
                const currentPoints = user.points || 0;
                const currentRedeemable = user.redeemablePoints ?? currentPoints;
                const newPoints = currentPoints + roleDef.requiredPoints;
                const newRedeemable = currentRedeemable + roleDef.requiredPoints;

                const pointActivity = {
                  id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  userId: person.userId,
                  points: roleDef.requiredPoints,
                  reason: `Hosted/Spoke/Volunteered at ${meetup.title} as ${roleDef.roleName}`,
                  type: 'event',
                  awardedBy: event.userContext?.userId || 'system',
                  awardedAt: now.toISOString()
                };

                const pointActivities = user.pointActivities || [];
                pointActivities.push(pointActivity);

                const activity = {
                  type: 'meetup_organized',
                  meetupId: id,
                  meetupTitle: meetup.title,
                  points: roleDef.requiredPoints,
                  role: roleDef.roleName,
                  timestamp: now.toISOString()
                };

                const userActivities = user.activities || [];
                userActivities.push(activity);

                await docClient.send(new UpdateCommand({
                  TableName: USERS_TABLE,
                  Key: { userId: person.userId },
                  UpdateExpression: 'SET points = :points, redeemablePoints = :redeemablePoints, activities = :activities, pointActivities = :pointActivities, updatedAt = :updatedAt',
                  ExpressionAttributeValues: {
                    ':points': newPoints,
                    ':redeemablePoints': newRedeemable,
                    ':activities': userActivities,
                    ':pointActivities': pointActivities,
                    ':updatedAt': now.toISOString()
                  }
                }));
              }
            } catch (error) {
              console.error(`Error awarding points to ${roleDef.roleName} ${person.userId}:`, error);
            }
          }
        }
      }
    } catch (globalError) {
      console.error('Failed to process team points assignment', globalError);
    }
  }

  // If this is a college-champ meetup and it's being completed, update the college's hostedEvents
  if (isTransitioningToCompleted && meetup.collegeId) {
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

// Add post-event photos to a meetup
async function addEventPhotos(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { photoUrls } = body;

  if (!photoUrls || !Array.isArray(photoUrls) || photoUrls.length === 0) {
    return createResponse(400, { error: 'photoUrls array is required' });
  }

  // Check if meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  // Append new photos to existing ones
  const existingPhotos = existing.Item.eventPhotos || [];
  const updatedPhotos = [...existingPhotos, ...photoUrls];

  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET eventPhotos = :photos, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':photos': updatedPhotos,
      ':updatedAt': new Date().toISOString()
    }
  }));

  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  return createResponse(200, { meetup: updated.Item });
}

// Remove a photo from a meetup
async function removeEventPhoto(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { photoUrl } = body;

  if (!photoUrl) {
    return createResponse(400, { error: 'photoUrl is required' });
  }

  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const existingPhotos = existing.Item.eventPhotos || [];
  const updatedPhotos = existingPhotos.filter(url => url !== photoUrl);

  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET eventPhotos = :photos, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':photos': updatedPhotos,
      ':updatedAt': new Date().toISOString()
    }
  }));

  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  return createResponse(200, { meetup: updated.Item });
}

// Add post-event report to a meetup (primarily for college-champ sessions)
async function addEventReport(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
  const { url, fileName } = body;

  if (!url || !fileName) {
    return createResponse(400, { error: 'url and fileName are required' });
  }

  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id },
    UpdateExpression: 'SET eventReport = :report, updatedAt = :updatedAt',
    ExpressionAttributeValues: {
      ':report': { url, fileName },
      ':updatedAt': new Date().toISOString()
    }
  }));

  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id }
  }));

  return createResponse(200, { meetup: updated.Item });
}




// =====================================================
// FEEDBACK / SELF-SERVICE ATTENDANCE
// =====================================================

// Roles that can read all feedback / change feedback settings
const ADMIN_ROLES = new Set(['admin', 'organiser', 'volunteer']);

function isAdminUser(userContext) {
  if (!userContext || !Array.isArray(userContext.roles)) return false;
  return userContext.roles.some(r => ADMIN_ROLES.has(r));
}

// POST /meetups/{id}/feedback
// Authenticated user submits feedback. If they are not already in attendedUsers
// for this meetup, this submission also marks attendance and awards points
// (using meetup.attendeePoints, falling back to 50 for backward compatibility).
async function submitFeedback(meetupId, event) {
  const userContext = event.userContext || {};
  const userId = userContext.userId;
  if (!userId) {
    return createResponse(401, { error: 'Authentication required' });
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (e) {
    return createResponse(400, { error: 'Invalid JSON body' });
  }

  // Validate body
  const ratingNum = Number(body.rating);
  if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return createResponse(400, { error: 'rating must be a number between 1 and 5' });
  }

  // Load meetup
  const meetupResult = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id: meetupId }
  }));

  if (!meetupResult.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const meetup = meetupResult.Item;

  if (meetup.feedbackEnabled !== true) {
    return createResponse(403, { error: 'Feedback is not enabled for this meetup' });
  }

  // Reject duplicate submissions for the same user/meetup
  try {
    const existing = await docClient.send(new QueryCommand({
      TableName: FEEDBACK_TABLE,
      IndexName: 'meetupId-index',
      KeyConditionExpression: 'meetupId = :m',
      FilterExpression: 'userId = :u',
      ExpressionAttributeValues: {
        ':m': meetupId,
        ':u': userId
      }
    }));

    if (existing.Items && existing.Items.length > 0) {
      return createResponse(409, {
        error: 'You have already submitted feedback for this meetup',
        feedback: existing.Items[0]
      });
    }
  } catch (queryError) {
    console.error('Error checking existing feedback:', queryError);
    // Continue - allow submission. Worst case duplicate at db level.
  }

  // Load user (needed for denormalized fields and points update)
  let user = null;
  try {
    const userResult = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId }
    }));
    user = userResult.Item || null;
  } catch (e) {
    console.error('Error fetching user:', e);
  }

  if (!user) {
    return createResponse(404, { error: 'User profile not found' });
  }

  const now = new Date().toISOString();
  const attendedUsers = Array.isArray(meetup.attendedUsers) ? [...meetup.attendedUsers] : [];
  const wasAlreadyAttended = attendedUsers.includes(userId);

  // Enforce Meetup verification: only verified members earn attendance points.
  // Unverified members still get their feedback saved and attendance recorded.
  const verified = isMeetupVerified(user);

  const attendeePoints = (meetup.attendeePoints != null ? Number(meetup.attendeePoints) : 50) || 0;

  // Award points atomically. The helper is idempotent and race-safe across the
  // feedback and CSV import flows (a per-user/meetup conditional write), so a
  // concurrent CSV import cannot cause a double award. Unverified members are
  // not awarded here but still have their attendance recorded below.
  let pointsToAward = 0;
  let pointActivityId = null;
  if (verified && attendeePoints > 0) {
    try {
      const award = await awardAttendancePointsAtomic(user, meetup, meetupId, attendeePoints, {
        reason: `Submitted feedback for ${meetup.title}`,
        source: 'feedback'
      });
      if (award.status === 'awarded') {
        pointsToAward = attendeePoints;
        pointActivityId = award.pointActivity.id;
      }
      // status 'already' -> pointsToAward stays 0 (already awarded for this meetup)
    } catch (e) {
      console.error('Error updating user points:', e);
      return createResponse(500, { error: 'Failed to award points' });
    }
  }

  // Record attendance and participation regardless of verification/points
  // (they did attend). Mirrors the CSV import which also registers participants.
  if (!wasAlreadyAttended) {
    attendedUsers.push(userId);
    const registeredUsers = Array.isArray(meetup.registeredUsers) ? [...meetup.registeredUsers] : [];
    if (!registeredUsers.includes(userId)) {
      registeredUsers.push(userId);
    }
    try {
      await docClient.send(new UpdateCommand({
        TableName: MEETUPS_TABLE,
        Key: { id: meetupId },
        UpdateExpression: 'SET attendedUsers = :a, registeredUsers = :r, attendees = :n, updatedAt = :u',
        ExpressionAttributeValues: {
          ':a': attendedUsers,
          ':r': registeredUsers,
          ':n': registeredUsers.length,
          ':u': now
        }
      }));
    } catch (e) {
      console.error('Error updating attendedUsers:', e);
      // Continue - feedback is more important; points already awarded
    }
  }

  // Save feedback record
  const feedbackId = `fb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const feedback = {
    id: feedbackId,
    meetupId,
    userId,
    userName: user.name || '',
    userEmail: user.email || '',
    userAvatar: user.avatar || user.profilePicture || '',
    rating: ratingNum,
    wouldRecommend: body.wouldRecommend === true,
    learnings: typeof body.learnings === 'string' ? body.learnings : '',
    suggestions: typeof body.suggestions === 'string' ? body.suggestions : '',
    favoritePart: typeof body.favoritePart === 'string' ? body.favoritePart : '',
    submittedAt: now,
    pointsAwarded: pointsToAward,
    pointActivityId: pointActivityId
  };

  try {
    await docClient.send(new PutCommand({
      TableName: FEEDBACK_TABLE,
      Item: feedback
    }));
  } catch (e) {
    console.error('Error saving feedback:', e);
    return createResponse(500, { error: 'Failed to save feedback' });
  }

  return createResponse(201, {
    feedback,
    pointsAwarded: pointsToAward,
    alreadyAttended: wasAlreadyAttended,
    verified,
    message: pointsToAward > 0
      ? `Feedback submitted. +${pointsToAward} points awarded.`
      : (!verified
          ? 'Feedback submitted. Complete Meetup verification to earn your attendance points.'
          : 'Feedback submitted. Your attendance points were already awarded for this meetup.')
  });
}

// GET /meetups/{id}/feedback/me
async function getMyFeedback(meetupId, event) {
  const userId = event.userContext && event.userContext.userId;
  if (!userId) {
    return createResponse(401, { error: 'Authentication required' });
  }

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: FEEDBACK_TABLE,
      IndexName: 'meetupId-index',
      KeyConditionExpression: 'meetupId = :m',
      FilterExpression: 'userId = :u',
      ExpressionAttributeValues: {
        ':m': meetupId,
        ':u': userId
      }
    }));

    return createResponse(200, {
      feedback: (result.Items && result.Items[0]) || null
    });
  } catch (e) {
    console.error('Error fetching my feedback:', e);
    return createResponse(500, { error: 'Failed to fetch feedback' });
  }
}

// GET /meetups/{id}/feedback - admin only
async function listFeedback(meetupId, event) {
  if (!isAdminUser(event.userContext)) {
    return createResponse(403, { error: 'Admin access required' });
  }

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: FEEDBACK_TABLE,
      IndexName: 'meetupId-index',
      KeyConditionExpression: 'meetupId = :m',
      ExpressionAttributeValues: {
        ':m': meetupId
      }
    }));

    const items = (result.Items || []).slice().sort((a, b) => {
      const ta = a.submittedAt || '';
      const tb = b.submittedAt || '';
      return tb.localeCompare(ta);
    });

    return createResponse(200, { feedback: items });
  } catch (e) {
    console.error('Error listing feedback:', e);
    return createResponse(500, { error: 'Failed to list feedback' });
  }
}

// PATCH /meetups/{id}/feedback-settings - admin only
async function updateFeedbackSettings(meetupId, event) {
  if (!isAdminUser(event.userContext)) {
    return createResponse(403, { error: 'Admin access required' });
  }

  let body = {};
  try {
    body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
  } catch (e) {
    return createResponse(400, { error: 'Invalid JSON body' });
  }

  // Verify meetup exists
  const existing = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id: meetupId }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Meetup not found' });
  }

  const updateExpressions = [];
  const expressionAttributeValues = {};

  if (typeof body.feedbackEnabled === 'boolean') {
    updateExpressions.push('feedbackEnabled = :fe');
    expressionAttributeValues[':fe'] = body.feedbackEnabled;
  }

  if (body.attendeePoints !== undefined && body.attendeePoints !== null) {
    const ap = Number(body.attendeePoints);
    if (!Number.isFinite(ap) || ap < 0) {
      return createResponse(400, { error: 'attendeePoints must be a non-negative number' });
    }
    updateExpressions.push('attendeePoints = :ap');
    expressionAttributeValues[':ap'] = ap;
  }

  if (updateExpressions.length === 0) {
    return createResponse(400, { error: 'No settings provided to update' });
  }

  updateExpressions.push('updatedAt = :u');
  expressionAttributeValues[':u'] = new Date().toISOString();

  await docClient.send(new UpdateCommand({
    TableName: MEETUPS_TABLE,
    Key: { id: meetupId },
    UpdateExpression: 'SET ' + updateExpressions.join(', '),
    ExpressionAttributeValues: expressionAttributeValues
  }));

  const updated = await docClient.send(new GetCommand({
    TableName: MEETUPS_TABLE,
    Key: { id: meetupId }
  }));

  return createResponse(200, { meetup: updated.Item });
}

// Test-only hooks. Not used in production; allows unit tests to inject a fake
// DynamoDB document client and exercise the pure award/verification helpers.
exports.__test__ = {
  extractMeetupMemberId,
  isMeetupVerified,
  awardAttendancePointsAtomic,
  __setDocClient: (fake) => { docClient = fake; },
  __getCommands: () => ({ UpdateCommand, GetCommand, ScanCommand }),
};
