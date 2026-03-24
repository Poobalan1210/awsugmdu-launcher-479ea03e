const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('./shared/auth');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const CLOUD_CLUBS_TABLE = process.env.CLOUD_CLUBS_TABLE_NAME || 'awsug-cloud_clubs';
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
  
  // Skip authorization for GET requests (read-only operations)
  // This allows public access to view cloudClubs, tasks, and submissions
  if (event.httpMethod !== 'GET') {
    // Authorize request for write operations
    const authResult = await authorize(event, USERS_TABLE);
    if (!authResult.authorized) {
      return createUnauthorizedResponse(authResult.error, corsHeaders);
    }
    
    // Add user context to event for use in handlers
    event.userContext = {
      userId: authResult.userId,
      roles: authResult.roles,
    };
  }
  
  try {
    const { httpMethod, path, pathParameters, body: requestBody } = event;
    const clubId = pathParameters?.id;
    const taskId = pathParameters?.taskId;
    const submissionId = pathParameters?.submissionId;
    
    // Route based on path and method
    if (path.includes('/submissions') && path.includes('/review')) {
      return await handleSubmissionsRoute(httpMethod, submissionId, requestBody);
    } else if (path === '/cloud-clubs/submissions' || path === '/dev/cloudClubs/submissions') {
      return await handleSubmissionsRoute(httpMethod, null, requestBody);
    } else if (path.includes('/submit')) {
      return await submitTaskForReview(clubId, taskId, requestBody);
    } else if (path.includes('/assign-tasks')) {
      return await handleAssignTasksRoute(httpMethod, clubId, requestBody);
    } else if (path === '/cloud-clubs/tasks' || path === '/dev/cloudClubs/tasks' || (path.includes('/tasks') && !clubId)) {
      return await handleGlobalTasksRoute(httpMethod, taskId, requestBody);
    } else if (path.includes('/tasks')) {
      return await handleTasksRoute(httpMethod, clubId, taskId, requestBody);
    } else if (path.includes('/events')) {
      return await handleEventsRoute(httpMethod, clubId, requestBody);
    } else if (path.includes('/members')) {
      return await handleMembersRoute(httpMethod, clubId, requestBody);
    } else {
      return await handleCloudClubsRoute(httpMethod, clubId, requestBody);
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

// ============ COLLEGES CRUD ============
async function handleCloudClubsRoute(httpMethod, clubId, requestBody) {
  switch (httpMethod) {
    case 'GET':
      if (clubId) {
        return await getCloudClub(clubId);
      } else {
        return await getAllCloudClubs();
      }
    
    case 'POST':
      return await createCloudClub(requestBody);
    
    case 'PUT':
      if (!clubId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'CloudClub ID is required' }),
        };
      }
      return await updateCloudClub(clubId, requestBody);
    
    case 'DELETE':
      if (!clubId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'CloudClub ID is required' }),
        };
      }
      return await deleteCloudClub(clubId);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function getCloudClub(clubId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting club:', error);
    throw error;
  }
}

async function getAllCloudClubs() {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: CLOUD_CLUBS_TABLE,
    }));
    
    // Filter out non-club records (tasks and submissions have a 'type' field)
    const cloudClubs = (result.Items || [])
      .filter(item => !item.type) // Only include items without a 'type' field (actual cloudClubs)
      .sort((a, b) => a.rank - b.rank);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        cloudClubs,
        count: cloudClubs.length,
      }),
    };
  } catch (error) {
    console.error('Error getting all cloudClubs:', error);
    throw error;
  }
}

async function createCloudClub(requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { 
      id, 
      name, 
      shortName, 
      location, 
      clubLead, 
      clubLeadId,
      logo 
    } = body;
    
    if (!id || !name || !shortName || !location || !clubLead) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: id, name, shortName, location, clubLead' 
        }),
      };
    }
    
    // Get current max rank to assign next rank
    const allCloudClubs = await docClient.send(new ScanCommand({
      TableName: CLOUD_CLUBS_TABLE,
      ProjectionExpression: '#rank',
      ExpressionAttributeNames: { '#rank': 'rank' }
    }));
    
    const maxRank = allCloudClubs.Items && allCloudClubs.Items.length > 0
      ? Math.max(...allCloudClubs.Items.map(c => c.rank || 0))
      : 0;
    
    const club = {
      id,
      name,
      shortName,
      location,
      clubLead,
      clubLeadId: clubLeadId || null,
      totalPoints: 0,
      rank: maxRank + 1,
      joinedDate: new Date().toISOString(),
      logo: logo || null,
      completedTasks: [],
      hostedEvents: [],
      members: clubLeadId ? [clubLeadId] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Item: club,
    }));
    
    // Update user's club info if clubLeadId provided
    if (clubLeadId) {
      await updateUserCloudClubInfo(clubLeadId, id, true);
    }
    
    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        club,
      }),
    };
  } catch (error) {
    console.error('Error creating club:', error);
    throw error;
  }
}

async function updateCloudClub(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
    // First check if club exists
    const existingCloudClub = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!existingCloudClub.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Fields that can be updated
    const updatableFields = [
      'name', 'shortName', 'location', 'clubLead', 'clubLeadId',
      'totalPoints', 'rank', 'logo', 'completedTasks', 'hostedEvents', 'members', 'pointActivities'
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
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
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
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating club:', error);
    throw error;
  }
}

async function deleteCloudClub(clubId) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        message: 'CloudClub deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting club:', error);
    throw error;
  }
}

// ============ TASKS MANAGEMENT ============
async function handleAssignTasksRoute(httpMethod, clubId, requestBody) {
  if (!clubId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'CloudClub ID is required' }),
    };
  }
  
  if (httpMethod === 'POST') {
    return await assignTasksToCloudClub(clubId, requestBody);
  }
  
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
}

async function assignTasksToCloudClub(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { taskIds } = body;
    
    if (!Array.isArray(taskIds)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'taskIds must be an array' }),
      };
    }
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Update assigned tasks
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET assignedTaskIds = :taskIds, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':taskIds': taskIds,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error assigning tasks:', error);
    throw error;
  }
}

// ============ GLOBAL TASK MANAGEMENT ============
async function handleGlobalTasksRoute(httpMethod, taskId, requestBody) {
  switch (httpMethod) {
    case 'GET':
      return await getAllGlobalTasks();
    
    case 'POST':
      return await createGlobalTask(requestBody);
    
    case 'PUT':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await updateGlobalTask(taskId, requestBody);
    
    case 'DELETE':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await deleteGlobalTask(taskId);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function getAllGlobalTasks() {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: CLOUD_CLUBS_TABLE,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': 'global_task',
      },
    }));
    
    const tasks = (result.Items || []).map(item => {
      const { type, ...task } = item;
      return task;
    });
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ tasks }),
    };
  } catch (error) {
    console.error('Error getting global tasks:', error);
    throw error;
  }
}

async function createGlobalTask(requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { title, description, points, category, order, isDefault } = body;
    
    if (!title || !description || !points || !category) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }
    
    const task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'global_task',
      title,
      description,
      points,
      category,
      order: order || 999,
      isDefault: isDefault || false,
      createdAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Item: task,
    }));
    
    const { type, ...responseTask } = task;
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ task: responseTask }),
    };
  } catch (error) {
    console.error('Error creating global task:', error);
    throw error;
  }
}

async function updateGlobalTask(taskId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { title, description, points, category, order, isDefault } = body;
    
    const task = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: taskId },
    }));
    
    if (!task.Item || task.Item.type !== 'global_task') {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task not found' }),
      };
    }
    
    const updatedTask = {
      ...task.Item,
      ...(title && { title }),
      ...(description && { description }),
      ...(points && { points }),
      ...(category && { category }),
      ...(order !== undefined && { order }),
      ...(isDefault !== undefined && { isDefault }),
      updatedAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Item: updatedTask,
    }));
    
    const { type, ...responseTask } = updatedTask;
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ task: responseTask }),
    };
  } catch (error) {
    console.error('Error updating global task:', error);
    throw error;
  }
}

async function deleteGlobalTask(taskId) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: taskId },
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error('Error deleting global task:', error);
    throw error;
  }
}

async function handleTasksRoute(httpMethod, clubId, taskId, requestBody) {
  if (!clubId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'CloudClub ID is required' }),
    };
  }
  
  switch (httpMethod) {
    case 'POST':
      return await completeTask(clubId, requestBody);
    
    case 'PUT':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await updateTask(clubId, taskId, requestBody);
    
    case 'DELETE':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await removeTask(clubId, taskId);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function completeTask(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { taskId, bonusPoints = 0, taskPoints } = body;
    
    if (!taskId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task ID is required' }),
      };
    }
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Check if task already completed
    const completedTasks = club.Item.completedTasks || [];
    if (completedTasks.some(t => t.taskId === taskId)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task already completed' }),
      };
    }
    
    // Add completed task
    const taskCompletion = {
      taskId,
      completedAt: new Date().toISOString(),
      ...(bonusPoints > 0 && { bonusPoints }),
      ...(taskPoints !== undefined && { taskPoints })
    };
    
    completedTasks.push(taskCompletion);
    
    // Calculate new total points
    const currentPoints = club.Item.totalPoints || 0;
    const pointsToAdd = (taskPoints || 0) + bonusPoints;
    const newTotalPoints = currentPoints + pointsToAdd;
    
    // Update club with new tasks and points
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET completedTasks = :tasks, totalPoints = :points, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':tasks': completedTasks,
        ':points': newTotalPoints,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
}

async function updateTask(clubId, taskId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Update task in completedTasks array
    const completedTasks = club.Item.completedTasks || [];
    const taskIndex = completedTasks.findIndex(t => t.taskId === taskId);
    
    if (taskIndex === -1) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Task not found' }),
      };
    }
    
    completedTasks[taskIndex] = {
      ...completedTasks[taskIndex],
      ...body,
      taskId, // Ensure taskId doesn't change
    };
    
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET completedTasks = :tasks, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':tasks': completedTasks,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

async function removeTask(clubId, taskId) {
  try {
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Remove task from completedTasks array
    const completedTasks = (club.Item.completedTasks || []).filter(t => t.taskId !== taskId);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET completedTasks = :tasks, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':tasks': completedTasks,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error removing task:', error);
    throw error;
  }
}

// ============ EVENTS MANAGEMENT ============
async function handleEventsRoute(httpMethod, clubId, requestBody) {
  if (!clubId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'CloudClub ID is required' }),
    };
  }
  
  if (httpMethod === 'POST') {
    return await addEvent(clubId, requestBody);
  }
  
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
}

async function addEvent(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { id, title, description, date, type, attendees = 0, pointsAwarded = 0, status = 'upcoming' } = body;
    
    if (!id || !title || !date || !type) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: id, title, date, type' 
        }),
      };
    }
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Add event
    const hostedEvents = club.Item.hostedEvents || [];
    const event = {
      id,
      title,
      description: description || '',
      date,
      type,
      attendees,
      pointsAwarded,
      status,
    };
    
    hostedEvents.push(event);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET hostedEvents = :events, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':events': hostedEvents,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error adding event:', error);
    throw error;
  }
}

// ============ MEMBERS MANAGEMENT ============
async function handleMembersRoute(httpMethod, clubId, requestBody) {
  if (!clubId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'CloudClub ID is required' }),
    };
  }
  
  switch (httpMethod) {
    case 'POST':
      return await addMember(clubId, requestBody);
    
    case 'DELETE':
      return await removeMember(clubId, requestBody);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function addMember(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { userId } = body;
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' }),
      };
    }
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Add member if not already present
    const members = club.Item.members || [];
    if (!members.includes(userId)) {
      members.push(userId);
      
      const result = await docClient.send(new UpdateCommand({
        TableName: CLOUD_CLUBS_TABLE,
        Key: { id: clubId },
        UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':members': members,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }));
      
      // Update user's club info
      await updateUserCloudClubInfo(userId, clubId, false);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          club: result.Attributes,
        }),
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'User already a member',
        club: club.Item,
      }),
    };
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
}

async function removeMember(clubId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { userId } = body;
    
    if (!userId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User ID is required' }),
      };
    }
    
    // Get club
    const club = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
    }));
    
    if (!club.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'CloudClub not found' }),
      };
    }
    
    // Remove member
    const members = (club.Item.members || []).filter(m => m !== userId);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: clubId },
      UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':members': members,
        ':updatedAt': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        club: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error removing member:', error);
    throw error;
  }
}

// ============ HELPER FUNCTIONS ============

// ============ TASK SUBMISSIONS ============
async function handleSubmissionsRoute(httpMethod, submissionId, requestBody) {
  switch (httpMethod) {
    case 'GET':
      return await getAllSubmissions();
    
    case 'POST':
      if (submissionId) {
        // Review submission
        return await reviewSubmission(submissionId, requestBody);
      }
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid submission route' }),
      };
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function submitTaskForReview(clubId, taskId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { comments, fileUrl, fileName, submittedBy, submittedByName } = body;
    
    if (!comments) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Comments are required' }),
      };
    }
    
    // Create submission
    const submission = {
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      clubId,
      taskId,
      submittedBy: submittedBy || 'unknown',
      submittedByName: submittedByName || 'Unknown User',
      comments,
      ...(fileUrl && { fileUrl }),
      ...(fileName && { fileName }),
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    
    // Store submission in DynamoDB (using cloudClubs table with a different partition key pattern)
    await docClient.send(new PutCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Item: {
        id: submission.id,  // Use the submission ID directly
        type: 'task_submission',
        ...submission,
        createdAt: new Date().toISOString(),
      },
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        submission,
      }),
    };
  } catch (error) {
    console.error('Error submitting task:', error);
    throw error;
  }
}

async function getAllSubmissions() {
  try {
    // Scan for all submissions
    const result = await docClient.send(new ScanCommand({
      TableName: CLOUD_CLUBS_TABLE,
      FilterExpression: '#type = :type',
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': 'task_submission',
      },
    }));
    
    const submissions = (result.Items || []).map(item => {
      const { type, ...submission } = item;
      return submission;
    });
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ submissions }),
    };
  } catch (error) {
    console.error('Error getting submissions:', error);
    throw error;
  }
}

async function reviewSubmission(submissionId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { status, reviewComments, pointsAwarded, reviewedBy } = body;
    
    console.log('Reviewing submission:', submissionId);
    console.log('Looking for key:', `submission-${submissionId}`);
    
    if (!status || !['approved', 'rejected', 'needs_revision'].includes(status)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Valid status is required' }),
      };
    }
    
    // Get submission
    const submission = await docClient.send(new GetCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Key: { id: submissionId },  // Use submission ID directly
    }));
    
    console.log('Submission found:', submission.Item ? 'yes' : 'no');
    
    if (!submission.Item) {
      console.error('Submission not found:', submissionId);
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Submission not found' }),
      };
    }
    
    // Update submission
    const updatedSubmission = {
      ...submission.Item,
      status,
      reviewedBy: reviewedBy || 'admin',
      reviewedAt: new Date().toISOString(),
      ...(reviewComments && { reviewComments }),
      ...(pointsAwarded && { pointsAwarded }),
    };
    
    await docClient.send(new PutCommand({
      TableName: CLOUD_CLUBS_TABLE,
      Item: updatedSubmission,
    }));
    
    // If approved, mark task as completed and award points
    if (status === 'approved') {
      const { clubId, taskId, submittedBy } = submission.Item;
      const points = pointsAwarded || 0;
      
      // Award points to the club
      await completeTask(clubId, JSON.stringify({ 
        taskId, 
        taskPoints: points 
      }));
      
      // Log activity on the user's profile (without awarding personal points)
      // Points for club tasks go only to the club, not the champ lead
      if (submittedBy) {
        try {
          const userResult = await docClient.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId: submittedBy }
          }));
          
          if (userResult.Item) {
            const user = userResult.Item;
            const activities = user.activities || [];
            
            // Create general activity entry (no personal points)
            activities.push({
              type: 'club_task_approved',
              clubId,
              taskId,
              points,
              reviewedBy: reviewedBy || 'admin',
              timestamp: new Date().toISOString()
            });
            
            await docClient.send(new UpdateCommand({
              TableName: USERS_TABLE,
              Key: { userId: submittedBy },
              UpdateExpression: 'SET activities = :activities, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':activities': activities,
                ':updatedAt': new Date().toISOString()
              }
            }));
            
            console.log(`Logged club task ${taskId} approval for user ${submittedBy} (points awarded to club ${clubId} only)`);
          }
        } catch (error) {
          console.error('Error logging activity for user:', error);
          // Don't fail the review if user activity update fails
        }
      }
    }
    
    const { type, ...responseSubmission } = updatedSubmission;
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        submission: responseSubmission,
      }),
    };
  } catch (error) {
    console.error('Error reviewing submission:', error);
    throw error;
  }
}

// ============ HELPER FUNCTIONS ============
async function updateUserCloudClubInfo(userId, clubId, isLead) {
  try {
    // Update club info on user
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET champCloudClubId = :clubId, isCloudClubChamp = :isChamp, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':clubId': clubId,
        ':isChamp': true,
        ':updatedAt': new Date().toISOString(),
      },
    }));

    // If user is a champs lead, ensure they have the 'champ' role for permissions
    if (isLead) {
      const userResult = await docClient.send(new GetCommand({
        TableName: USERS_TABLE,
        Key: { userId },
      }));

      if (userResult.Item) {
        const roles = userResult.Item.roles || [];
        const hasChampRole = roles.some(r => r.role === 'champ');

        if (!hasChampRole) {
          const newRole = {
            id: `role-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId,
            role: 'champ',
            assignedAt: new Date().toISOString(),
            assignedBy: 'system',
          };
          roles.push(newRole);

          await docClient.send(new UpdateCommand({
            TableName: USERS_TABLE,
            Key: { userId },
            UpdateExpression: 'SET #roles = :roles, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#roles': 'roles' },
            ExpressionAttributeValues: {
              ':roles': roles,
              ':updatedAt': new Date().toISOString(),
            },
          }));
        }
      }
    }
  } catch (error) {
    console.error('Error updating user club info:', error);
    // Don't throw - this is a non-critical operation
  }
}
