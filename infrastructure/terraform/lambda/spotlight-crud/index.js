const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const SPOTLIGHT_TABLE = process.env.SPOTLIGHT_TABLE_NAME || 'awsug-spotlight';
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

  try {
    const method = event.httpMethod;
    const path = event.path || event.requestContext?.path || '';

    // Parse path
    const pathParts = path.split('/').filter(p => p);
    const stageIndex = pathParts.findIndex(p => ['dev', 'staging', 'prod'].includes(p));
    const startIndex = stageIndex >= 0 ? stageIndex + 1 : 0;
    const routeParts = pathParts.slice(startIndex);

    const resource = routeParts[0]; // 'spotlight'
    const id = routeParts[1];
    const action = routeParts[2]; // 'review'

    if (resource === 'spotlight') {
      if (method === 'GET' && !id) {
        // GET /spotlight — List submissions
        return await listSubmissions(event);
      } else if (method === 'POST' && !id) {
        // POST /spotlight — Create submission
        return await createSubmission(event);
      } else if (method === 'POST' && id && action === 'review') {
        // POST /spotlight/{id}/review — Review submission
        return await reviewSubmission(id, event);
      } else if (method === 'DELETE' && id && !action) {
        // DELETE /spotlight/{id} — Delete submission
        return await deleteSubmission(id);
      } else if (method === 'GET' && id && !action) {
        // GET /spotlight/{id} — Get single submission
        return await getSubmission(id);
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

// List submissions with optional filters
async function listSubmissions(event) {
  const queryParams = event.queryStringParameters || {};
  const { status, userId } = queryParams;

  let submissions;

  if (status) {
    // Query by status using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: SPOTLIGHT_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': status }
    }));
    submissions = result.Items || [];
  } else if (userId) {
    // Query by userId using GSI
    const result = await docClient.send(new QueryCommand({
      TableName: SPOTLIGHT_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));
    submissions = result.Items || [];
  } else {
    // Scan all
    const result = await docClient.send(new ScanCommand({
      TableName: SPOTLIGHT_TABLE
    }));
    submissions = result.Items || [];
  }

  // Sort by submittedAt descending
  submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

  return createResponse(200, { submissions });
}

// Get single submission
async function getSubmission(id) {
  const result = await docClient.send(new GetCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id }
  }));

  if (!result.Item) {
    return createResponse(404, { error: 'Spotlight submission not found' });
  }

  return createResponse(200, { submission: result.Item });
}

// Create a new spotlight submission
async function createSubmission(event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  const { userId, userName, userAvatar, title, description, type, url, imageUrl, tags } = body;

  if (!userId || !userName || !title || !description || !type || !url) {
    return createResponse(400, {
      error: 'Missing required fields: userId, userName, title, description, type, url'
    });
  }

  // Validate type
  const validTypes = ['project', 'blog', 'video', 'other'];
  if (!validTypes.includes(type)) {
    return createResponse(400, { error: 'Type must be one of: project, blog, video, other' });
  }

  const id = `spotlight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  const submission = {
    id,
    userId,
    userName,
    ...(userAvatar && { userAvatar }),
    title,
    description,
    type,
    url,
    ...(imageUrl && { imageUrl }),
    tags: tags || [],
    status: 'pending',
    points: 0,
    submittedAt: now,
    createdAt: now,
    updatedAt: now
  };

  await docClient.send(new PutCommand({
    TableName: SPOTLIGHT_TABLE,
    Item: submission
  }));

  return createResponse(201, { submission });
}

// Review a spotlight submission (approve/reject with optional points)
async function reviewSubmission(id, event) {
  const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;

  const { status, points, adminNotes, reviewedBy, reviewerName } = body;

  if (!status || !reviewedBy) {
    return createResponse(400, { error: 'Missing required fields: status, reviewedBy' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return createResponse(400, { error: 'Status must be either "approved" or "rejected"' });
  }

  // Check if submission exists
  const existing = await docClient.send(new GetCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Spotlight submission not found' });
  }

  const submission = existing.Item;

  // Don't allow re-reviewing already reviewed submissions 
  // (unless it's still pending)
  if (submission.status !== 'pending') {
    return createResponse(400, { error: 'Submission has already been reviewed' });
  }

  const awardedPoints = status === 'approved' ? (points || 0) : 0;
  const now = new Date().toISOString();

  // Update submission
  const updateExpression = 'SET #status = :status, points = :points, reviewedBy = :reviewedBy, reviewedAt = :reviewedAt, updatedAt = :updatedAt' +
    (reviewerName ? ', reviewerName = :reviewerName' : '') +
    (adminNotes ? ', adminNotes = :adminNotes' : '');

  const expressionAttributeValues = {
    ':status': status,
    ':points': awardedPoints,
    ':reviewedBy': reviewedBy,
    ':reviewedAt': now,
    ':updatedAt': now,
  };

  if (reviewerName) expressionAttributeValues[':reviewerName'] = reviewerName;
  if (adminNotes) expressionAttributeValues[':adminNotes'] = adminNotes;

  await docClient.send(new UpdateCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: expressionAttributeValues
  }));

  // If approved with points, update user's points and activities
  if (status === 'approved' && awardedPoints > 0) {
    try {
      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId: submission.userId }
      }));

      if (userResult.Item) {
        const user = userResult.Item;
        const currentPoints = user.points || 0;
        const currentRedeemable = user.redeemablePoints ?? currentPoints;
        const newPoints = currentPoints + awardedPoints;
        const newRedeemable = currentRedeemable + awardedPoints;
        const pointActivities = user.pointActivities || [];
        const activities = user.activities || [];

        // Create point activity record
        const pointActivity = {
          id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: submission.userId,
          points: awardedPoints,
          reason: `Community Spotlight approved: ${submission.title}`,
          type: 'submission',
          awardedBy: reviewedBy,
          awardedAt: now
        };
        pointActivities.push(pointActivity);

        // Create general activity entry
        activities.push({
          type: 'submission_approved',
          spotlightId: id,
          spotlightTitle: submission.title,
          points: awardedPoints,
          reviewedBy,
          timestamp: now,
          description: `Community Spotlight "${submission.title}" approved`
        });

        // Update user
        await docClient.send(new UpdateCommand({
          TableName: USERS_TABLE,
          Key: { userId: user.userId },
          UpdateExpression: 'SET points = :points, redeemablePoints = :redeemablePoints, pointActivities = :pointActivities, activities = :activities, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':points': newPoints,
            ':redeemablePoints': newRedeemable,
            ':pointActivities': pointActivities,
            ':activities': activities,
            ':updatedAt': now
          }
        }));

        console.log(`Awarded ${awardedPoints} points to user ${submission.userId} for spotlight ${id}`);
      }
    } catch (pointsError) {
      console.error('Error awarding points:', pointsError);
      // Don't fail the review just because points didn't update
    }
  }

  // Fetch updated submission
  const updated = await docClient.send(new GetCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id }
  }));

  return createResponse(200, { submission: updated.Item });
}

// Delete a spotlight submission
async function deleteSubmission(id) {
  const existing = await docClient.send(new GetCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id }
  }));

  if (!existing.Item) {
    return createResponse(404, { error: 'Spotlight submission not found' });
  }

  await docClient.send(new DeleteCommand({
    TableName: SPOTLIGHT_TABLE,
    Key: { id }
  }));

  return createResponse(200, { message: 'Spotlight submission deleted successfully', id });
}
