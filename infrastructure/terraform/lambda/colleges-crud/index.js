const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { authorize, createUnauthorizedResponse } = require('./shared/auth');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const COLLEGES_TABLE = process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';
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
  // This allows public access to view colleges, tasks, and submissions
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
    const collegeId = pathParameters?.id;
    const taskId = pathParameters?.taskId;
    const submissionId = pathParameters?.submissionId;
    
    // Route based on path and method
    if (path.includes('/submissions') && path.includes('/review')) {
      return await handleSubmissionsRoute(httpMethod, submissionId, requestBody);
    } else if (path === '/colleges/submissions' || path === '/dev/colleges/submissions') {
      return await handleSubmissionsRoute(httpMethod, null, requestBody);
    } else if (path.includes('/submit')) {
      return await submitTaskForReview(collegeId, taskId, requestBody);
    } else if (path.includes('/assign-tasks')) {
      return await handleAssignTasksRoute(httpMethod, collegeId, requestBody);
    } else if (path === '/colleges/tasks' || path === '/dev/colleges/tasks' || (path.includes('/tasks') && !collegeId)) {
      return await handleGlobalTasksRoute(httpMethod, taskId, requestBody);
    } else if (path.includes('/tasks')) {
      return await handleTasksRoute(httpMethod, collegeId, taskId, requestBody);
    } else if (path.includes('/events')) {
      return await handleEventsRoute(httpMethod, collegeId, requestBody);
    } else if (path.includes('/members')) {
      return await handleMembersRoute(httpMethod, collegeId, requestBody);
    } else {
      return await handleCollegesRoute(httpMethod, collegeId, requestBody);
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
async function handleCollegesRoute(httpMethod, collegeId, requestBody) {
  switch (httpMethod) {
    case 'GET':
      if (collegeId) {
        return await getCollege(collegeId);
      } else {
        return await getAllColleges();
      }
    
    case 'POST':
      return await createCollege(requestBody);
    
    case 'PUT':
      if (!collegeId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'College ID is required' }),
        };
      }
      return await updateCollege(collegeId, requestBody);
    
    case 'DELETE':
      if (!collegeId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'College ID is required' }),
        };
      }
      return await deleteCollege(collegeId);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function getCollege(collegeId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting college:', error);
    throw error;
  }
}

async function getAllColleges() {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: COLLEGES_TABLE,
    }));
    
    // Filter out non-college records (tasks and submissions have a 'type' field)
    const colleges = (result.Items || [])
      .filter(item => !item.type) // Only include items without a 'type' field (actual colleges)
      .sort((a, b) => a.rank - b.rank);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        colleges,
        count: colleges.length,
      }),
    };
  } catch (error) {
    console.error('Error getting all colleges:', error);
    throw error;
  }
}

async function createCollege(requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const { 
      id, 
      name, 
      shortName, 
      location, 
      champsLead, 
      champsLeadId,
      logo 
    } = body;
    
    if (!id || !name || !shortName || !location || !champsLead) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: id, name, shortName, location, champsLead' 
        }),
      };
    }
    
    // Get current max rank to assign next rank
    const allColleges = await docClient.send(new ScanCommand({
      TableName: COLLEGES_TABLE,
      ProjectionExpression: '#rank',
      ExpressionAttributeNames: { '#rank': 'rank' }
    }));
    
    const maxRank = allColleges.Items && allColleges.Items.length > 0
      ? Math.max(...allColleges.Items.map(c => c.rank || 0))
      : 0;
    
    const college = {
      id,
      name,
      shortName,
      location,
      champsLead,
      champsLeadId: champsLeadId || null,
      totalPoints: 0,
      rank: maxRank + 1,
      joinedDate: new Date().toISOString(),
      logo: logo || null,
      completedTasks: [],
      hostedEvents: [],
      members: champsLeadId ? [champsLeadId] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await docClient.send(new PutCommand({
      TableName: COLLEGES_TABLE,
      Item: college,
    }));
    
    // Update user's college info if champsLeadId provided
    if (champsLeadId) {
      await updateUserCollegeInfo(champsLeadId, id, true);
    }
    
    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        college,
      }),
    };
  } catch (error) {
    console.error('Error creating college:', error);
    throw error;
  }
}

async function updateCollege(collegeId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
    // First check if college exists
    const existingCollege = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!existingCollege.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Fields that can be updated
    const updatableFields = [
      'name', 'shortName', 'location', 'champsLead', 'champsLeadId',
      'totalPoints', 'rank', 'logo', 'completedTasks', 'hostedEvents', 'members'
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
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating college:', error);
    throw error;
  }
}

async function deleteCollege(collegeId) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        message: 'College deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting college:', error);
    throw error;
  }
}

// ============ TASKS MANAGEMENT ============
async function handleAssignTasksRoute(httpMethod, collegeId, requestBody) {
  if (!collegeId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'College ID is required' }),
    };
  }
  
  if (httpMethod === 'POST') {
    return await assignTasksToCollege(collegeId, requestBody);
  }
  
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
}

async function assignTasksToCollege(collegeId, requestBody) {
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
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Update assigned tasks
    const result = await docClient.send(new UpdateCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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

async function handleTasksRoute(httpMethod, collegeId, taskId, requestBody) {
  if (!collegeId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'College ID is required' }),
    };
  }
  
  switch (httpMethod) {
    case 'POST':
      return await completeTask(collegeId, requestBody);
    
    case 'PUT':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await updateTask(collegeId, taskId, requestBody);
    
    case 'DELETE':
      if (!taskId) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Task ID is required' }),
        };
      }
      return await removeTask(collegeId, taskId);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function completeTask(collegeId, requestBody) {
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
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Check if task already completed
    const completedTasks = college.Item.completedTasks || [];
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
      ...(bonusPoints > 0 && { bonusPoints })
    };
    
    completedTasks.push(taskCompletion);
    
    // Calculate new total points
    const currentPoints = college.Item.totalPoints || 0;
    const pointsToAdd = (taskPoints || 0) + bonusPoints;
    const newTotalPoints = currentPoints + pointsToAdd;
    
    // Update college with new tasks and points
    const result = await docClient.send(new UpdateCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error completing task:', error);
    throw error;
  }
}

async function updateTask(collegeId, taskId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Update task in completedTasks array
    const completedTasks = college.Item.completedTasks || [];
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
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

async function removeTask(collegeId, taskId) {
  try {
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Remove task from completedTasks array
    const completedTasks = (college.Item.completedTasks || []).filter(t => t.taskId !== taskId);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error removing task:', error);
    throw error;
  }
}

// ============ EVENTS MANAGEMENT ============
async function handleEventsRoute(httpMethod, collegeId, requestBody) {
  if (!collegeId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'College ID is required' }),
    };
  }
  
  if (httpMethod === 'POST') {
    return await addEvent(collegeId, requestBody);
  }
  
  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
}

async function addEvent(collegeId, requestBody) {
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
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Add event
    const hostedEvents = college.Item.hostedEvents || [];
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
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error adding event:', error);
    throw error;
  }
}

// ============ MEMBERS MANAGEMENT ============
async function handleMembersRoute(httpMethod, collegeId, requestBody) {
  if (!collegeId) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'College ID is required' }),
    };
  }
  
  switch (httpMethod) {
    case 'POST':
      return await addMember(collegeId, requestBody);
    
    case 'DELETE':
      return await removeMember(collegeId, requestBody);
    
    default:
      return {
        statusCode: 405,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
  }
}

async function addMember(collegeId, requestBody) {
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
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Add member if not already present
    const members = college.Item.members || [];
    if (!members.includes(userId)) {
      members.push(userId);
      
      const result = await docClient.send(new UpdateCommand({
        TableName: COLLEGES_TABLE,
        Key: { id: collegeId },
        UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':members': members,
          ':updatedAt': new Date().toISOString(),
        },
        ReturnValues: 'ALL_NEW',
      }));
      
      // Update user's college info
      await updateUserCollegeInfo(userId, collegeId, false);
      
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          college: result.Attributes,
        }),
      };
    }
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: 'User already a member',
        college: college.Item,
      }),
    };
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
}

async function removeMember(collegeId, requestBody) {
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
    
    // Get college
    const college = await docClient.send(new GetCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
    }));
    
    if (!college.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'College not found' }),
      };
    }
    
    // Remove member
    const members = (college.Item.members || []).filter(m => m !== userId);
    
    const result = await docClient.send(new UpdateCommand({
      TableName: COLLEGES_TABLE,
      Key: { id: collegeId },
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
        college: result.Attributes,
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

async function submitTaskForReview(collegeId, taskId, requestBody) {
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
      collegeId,
      taskId,
      submittedBy: submittedBy || 'unknown',
      submittedByName: submittedByName || 'Unknown User',
      comments,
      ...(fileUrl && { fileUrl }),
      ...(fileName && { fileName }),
      submittedAt: new Date().toISOString(),
      status: 'pending',
    };
    
    // Store submission in DynamoDB (using colleges table with a different partition key pattern)
    await docClient.send(new PutCommand({
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
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
      TableName: COLLEGES_TABLE,
      Item: updatedSubmission,
    }));
    
    // If approved, mark task as completed and award points
    if (status === 'approved') {
      const { collegeId, taskId, submittedBy } = submission.Item;
      const points = pointsAwarded || 0;
      
      // Award points to the college
      await completeTask(collegeId, JSON.stringify({ 
        taskId, 
        taskPoints: points 
      }));
      
      // Award points to the submitting user's profile
      if (submittedBy && points > 0) {
        try {
          const userResult = await docClient.send(new GetCommand({
            TableName: USERS_TABLE,
            Key: { userId: submittedBy }
          }));
          
          if (userResult.Item) {
            const user = userResult.Item;
            const currentPoints = user.points || 0;
            const pointActivities = user.pointActivities || [];
            const activities = user.activities || [];
            
            // Create point activity record
            const pointActivity = {
              id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: submittedBy,
              points,
              reason: `College task approved: ${taskId} for college ${collegeId}`,
              type: 'submission',
              awardedBy: reviewedBy || 'admin',
              awardedAt: new Date().toISOString()
            };
            pointActivities.push(pointActivity);
            
            // Create general activity entry
            activities.push({
              type: 'college_task_approved',
              collegeId,
              taskId,
              points,
              reviewedBy: reviewedBy || 'admin',
              timestamp: new Date().toISOString()
            });
            
            await docClient.send(new UpdateCommand({
              TableName: USERS_TABLE,
              Key: { userId: submittedBy },
              UpdateExpression: 'SET points = :points, pointActivities = :pointActivities, activities = :activities, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':points': currentPoints + points,
                ':pointActivities': pointActivities,
                ':activities': activities,
                ':updatedAt': new Date().toISOString()
              }
            }));
            
            console.log(`Awarded ${points} points to user ${submittedBy} for college task ${taskId}`);
          }
        } catch (error) {
          console.error('Error awarding points to user:', error);
          // Don't fail the review if user points update fails
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
async function updateUserCollegeInfo(userId, collegeId, isLead) {
  try {
    await docClient.send(new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET champCollegeId = :collegeId, isCollegeChamp = :isChamp, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':collegeId': collegeId,
        ':isChamp': true,
        ':updatedAt': new Date().toISOString(),
      },
    }));
  } catch (error) {
    console.error('Error updating user college info:', error);
    // Don't throw - this is a non-critical operation
  }
}
