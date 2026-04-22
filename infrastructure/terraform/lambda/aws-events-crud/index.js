const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.AWS_EVENTS_TABLE_NAME;
const SUBMISSIONS_TABLE = process.env.AWS_EVENT_SUBMISSIONS_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const resource = event.resource;
    const method = event.httpMethod;

    // Route: /aws-events
    if (resource === '/aws-events') {
      if (method === 'GET') {
        const result = await docClient.send(new ScanCommand({ TableName: EVENTS_TABLE }));
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.Items)
        };
      }
      
      if (method === 'POST') {
        const body = JSON.parse(event.body);
        const newEvent = {
          id: uuidv4(),
          title: body.title,
          description: body.description,
          date: body.date,
          points: body.points || 0,
          createdAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({
          TableName: EVENTS_TABLE,
          Item: newEvent
        }));

        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(newEvent)
        };
      }
    }

    // Route: /aws-events/{id}
    if (resource === '/aws-events/{id}') {
      const id = event.pathParameters.id;

      if (method === 'PUT') {
        const body = JSON.parse(event.body);
        
        let updateExpr = 'set ';
        const expAttrNames = {};
        const expAttrVals = {};
        let isFirst = true;

        for (const [key, value] of Object.entries(body)) {
          if (key !== 'id') {
            if (!isFirst) updateExpr += ', ';
            updateExpr += `#${key} = :${key}`;
            expAttrNames[`#${key}`] = key;
            expAttrVals[`:${key}`] = value;
            isFirst = false;
          }
        }

        const result = await docClient.send(new UpdateCommand({
          TableName: EVENTS_TABLE,
          Key: { id },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: expAttrNames,
          ExpressionAttributeValues: expAttrVals,
          ReturnValues: 'ALL_NEW'
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.Attributes)
        };
      }

      if (method === 'DELETE') {
        await docClient.send(new DeleteCommand({
          TableName: EVENTS_TABLE,
          Key: { id }
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ message: 'Event deleted' })
        };
      }
    }

    // Route: /aws-events/{id}/submissions
    if (resource === '/aws-events/{id}/submissions') {
      const eventId = event.pathParameters.id;

      if (method === 'GET') {
        const result = await docClient.send(new QueryCommand({
          TableName: SUBMISSIONS_TABLE,
          IndexName: 'EventIdIndex',
          KeyConditionExpression: 'eventId = :eventId',
          ExpressionAttributeValues: { ':eventId': eventId }
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.Items)
        };
      }

      if (method === 'POST') {
        const body = JSON.parse(event.body);
        
        const submission = {
          id: uuidv4(),
          eventId: eventId,
          userId: body.userId,
          userName: body.userName,
          userAvatar: body.userAvatar,
          linkedInUrl: body.linkedInUrl,
          photoUrl: body.photoUrl,
          status: 'pending',
          submittedAt: new Date().toISOString()
        };

        await docClient.send(new PutCommand({
          TableName: SUBMISSIONS_TABLE,
          Item: submission
        }));

        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(submission)
        };
      }
    }

    // Route: /aws-events/submissions/pending
    if (resource === '/aws-events/submissions/pending') {
      if (method === 'GET') {
        const result = await docClient.send(new QueryCommand({
          TableName: SUBMISSIONS_TABLE,
          IndexName: 'StatusIndex',
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': 'pending' }
        }));

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.Items)
        };
      }
    }

    // Route: /aws-events/submissions/{id}/review
    if (resource === '/aws-events/submissions/{id}/review') {
      if (method === 'POST') {
        const submissionId = event.pathParameters.id;
        const body = JSON.parse(event.body);
        const { status, reviewerName, reviewerId } = body;

        // 1. Get submission
        const getSubResult = await docClient.send(new GetCommand({
          TableName: SUBMISSIONS_TABLE,
          Key: { id: submissionId }
        }));
        
        const submission = getSubResult.Item;
        if (!submission) {
          return { statusCode: 404, headers, body: JSON.stringify({ message: 'Submission not found' }) };
        }

        // 2. Update submission
        const result = await docClient.send(new UpdateCommand({
          TableName: SUBMISSIONS_TABLE,
          Key: { id: submissionId },
          UpdateExpression: 'set #status = :status, reviewedBy = :reviewedBy, reviewerName = :reviewerName, reviewedAt = :reviewedAt',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':status': status,
            ':reviewedBy': reviewerId || 'system',
            ':reviewerName': reviewerName || 'Admin',
            ':reviewedAt': new Date().toISOString()
          },
          ReturnValues: 'ALL_NEW'
        }));

        // 3. Award points if approved
        if (status === 'approved') {
          // Get event to find points
          const getEventResult = await docClient.send(new GetCommand({
            TableName: EVENTS_TABLE,
            Key: { id: submission.eventId }
          }));
          
          const awsEvent = getEventResult.Item;
          const pointsToAward = awsEvent ? (awsEvent.points || 0) : 0;

          if (pointsToAward > 0) {
            const userResult = await docClient.send(new GetCommand({
              TableName: USERS_TABLE,
              Key: { userId: submission.userId }
            }));
            
            if (userResult.Item) {
              const user = userResult.Item;
              const currentPoints = user.points || 0;
              const pointActivities = user.pointActivities || [];
              const activities = user.activities || [];
              
              const newActivity = {
                id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                userId: submission.userId,
                points: pointsToAward,
                reason: `Attendance approved for ${awsEvent.title}`,
                type: 'event',
                awardedBy: reviewerId || 'system',
                awardedAt: new Date().toISOString()
              };
              
              pointActivities.push(newActivity);
              
              activities.push({
                type: 'points_awarded',
                points: pointsToAward,
                reason: `Attendance approved for ${awsEvent.title}`,
                pointType: 'event',
                awardedBy: reviewerId || 'system',
                timestamp: new Date().toISOString()
              });

              await docClient.send(new UpdateCommand({
                TableName: USERS_TABLE,
                Key: { userId: submission.userId },
                UpdateExpression: 'set points = :points, redeemablePoints = :redeemablePoints, pointActivities = :pointActivities, activities = :activities, updatedAt = :updatedAt',
                ExpressionAttributeValues: {
                  ':points': currentPoints + pointsToAward,
                  ':redeemablePoints': (user.redeemablePoints || currentPoints) + pointsToAward,
                  ':pointActivities': pointActivities,
                  ':activities': activities,
                  ':updatedAt': new Date().toISOString()
                }
              }));
            }
          }
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(result.Attributes)
        };
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Route not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error', error: error.message })
    };
  }
};
