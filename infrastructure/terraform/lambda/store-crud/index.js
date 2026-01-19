const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sesClient = new SESClient({});

const STORE_ITEMS_TABLE = process.env.STORE_ITEMS_TABLE_NAME;
const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

// Email sending function
async function sendEmail(to, subject, htmlBody, textBody) {
  const params = {
    Source: process.env.SES_FROM_EMAIL || 'noreply@awsugmdu.com',
    Destination: {
      ToAddresses: [to]
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        },
        Text: {
          Data: textBody,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log('Email sent successfully to:', to);
  } catch (error) {
    console.error('Failed to send email:', error);
    // Don't throw - we don't want email failures to break the order
  }
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  const { httpMethod, path, pathParameters, body, queryStringParameters } = event;

  try {
    // Store Items Routes
    if (path === '/store/items' && httpMethod === 'GET') {
      return await listStoreItems();
    }
    
    if (path === '/store/items' && httpMethod === 'POST') {
      return await createStoreItem(JSON.parse(body));
    }
    
    if (path.match(/\/store\/items\/[^/]+$/) && httpMethod === 'GET') {
      return await getStoreItem(pathParameters.id);
    }
    
    if (path.match(/\/store\/items\/[^/]+$/) && httpMethod === 'PUT') {
      return await updateStoreItem(pathParameters.id, JSON.parse(body));
    }
    
    if (path.match(/\/store\/items\/[^/]+$/) && httpMethod === 'DELETE') {
      return await deleteStoreItem(pathParameters.id);
    }

    // Orders Routes
    if (path === '/store/orders' && httpMethod === 'GET') {
      const userId = queryStringParameters?.userId;
      return await listOrders(userId);
    }
    
    if (path === '/store/orders' && httpMethod === 'POST') {
      return await createOrder(JSON.parse(body));
    }
    
    if (path.match(/\/store\/orders\/[^/]+$/) && httpMethod === 'GET') {
      return await getOrder(pathParameters.id);
    }
    
    if (path.match(/\/store\/orders\/[^/]+\/status$/) && httpMethod === 'PATCH') {
      return await updateOrderStatus(pathParameters.id, JSON.parse(body));
    }

    if (path.match(/\/store\/orders\/[^/]+\/assign-code$/) && httpMethod === 'PATCH') {
      return await assignCodeToOrder(pathParameters.id, JSON.parse(body));
    }

    // Redeem Route
    if (path.match(/\/store\/items\/[^/]+\/redeem$/) && httpMethod === 'POST') {
      return await redeemItem(pathParameters.id, JSON.parse(body));
    }

    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Route not found' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: error.message })
    };
  }
};

// Store Items Functions
async function listStoreItems() {
  const params = {
    TableName: STORE_ITEMS_TABLE
  };

  const result = await docClient.send(new ScanCommand(params));
  
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Items || [])
  };
}

async function createStoreItem(data) {
  const item = {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: data.name,
    description: data.description,
    points: data.points,
    image: data.image,
    inStock: data.inStock !== undefined ? data.inStock : true,
    category: data.category || 'general',
    itemType: data.itemType || 'physical',
    availableCodes: data.availableCodes || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const params = {
    TableName: STORE_ITEMS_TABLE,
    Item: item
  };

  await docClient.send(new PutCommand(params));

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(item)
  };
}

async function getStoreItem(id) {
  const params = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id }
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Item not found' })
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Item)
  };
}

async function updateStoreItem(id, data) {
  const updateExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  if (data.name !== undefined) {
    updateExpressions.push('#name = :name');
    expressionAttributeNames['#name'] = 'name';
    expressionAttributeValues[':name'] = data.name;
  }
  if (data.description !== undefined) {
    updateExpressions.push('#description = :description');
    expressionAttributeNames['#description'] = 'description';
    expressionAttributeValues[':description'] = data.description;
  }
  if (data.points !== undefined) {
    updateExpressions.push('#points = :points');
    expressionAttributeNames['#points'] = 'points';
    expressionAttributeValues[':points'] = data.points;
  }
  if (data.image !== undefined) {
    updateExpressions.push('#image = :image');
    expressionAttributeNames['#image'] = 'image';
    expressionAttributeValues[':image'] = data.image;
  }
  if (data.inStock !== undefined) {
    updateExpressions.push('#inStock = :inStock');
    expressionAttributeNames['#inStock'] = 'inStock';
    expressionAttributeValues[':inStock'] = data.inStock;
  }
  if (data.category !== undefined) {
    updateExpressions.push('#category = :category');
    expressionAttributeNames['#category'] = 'category';
    expressionAttributeValues[':category'] = data.category;
  }
  if (data.itemType !== undefined) {
    updateExpressions.push('#itemType = :itemType');
    expressionAttributeNames['#itemType'] = 'itemType';
    expressionAttributeValues[':itemType'] = data.itemType;
  }
  if (data.availableCodes !== undefined) {
    updateExpressions.push('#availableCodes = :availableCodes');
    expressionAttributeNames['#availableCodes'] = 'availableCodes';
    expressionAttributeValues[':availableCodes'] = data.availableCodes;
  }

  updateExpressions.push('#updatedAt = :updatedAt');
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();

  const params = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await docClient.send(new UpdateCommand(params));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Attributes)
  };
}

async function deleteStoreItem(id) {
  const params = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id }
  };

  await docClient.send(new DeleteCommand(params));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({ message: 'Item deleted successfully' })
  };
}

// Orders Functions
async function listOrders(userId) {
  let params;
  
  if (userId) {
    params = {
      TableName: ORDERS_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    };
    const result = await docClient.send(new QueryCommand(params));
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Items || [])
    };
  } else {
    params = {
      TableName: ORDERS_TABLE
    };
    const result = await docClient.send(new ScanCommand(params));
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(result.Items || [])
    };
  }
}

async function createOrder(data) {
  const order = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: data.userId,
    itemId: data.itemId,
    itemName: data.itemName,
    itemType: data.itemType,
    points: data.points,
    status: 'pending',
    shippingAddress: data.shippingAddress || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const params = {
    TableName: ORDERS_TABLE,
    Item: order
  };

  await docClient.send(new PutCommand(params));

  return {
    statusCode: 201,
    headers: corsHeaders,
    body: JSON.stringify(order)
  };
}

async function getOrder(id) {
  const params = {
    TableName: ORDERS_TABLE,
    Key: { id }
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Order not found' })
    };
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Item)
  };
}

async function updateOrderStatus(id, data) {
  const updateExpressions = ['#status = :status', '#updatedAt = :updatedAt'];
  const expressionAttributeNames = {
    '#status': 'status',
    '#updatedAt': 'updatedAt'
  };
  const expressionAttributeValues = {
    ':status': data.status,
    ':updatedAt': new Date().toISOString()
  };

  if (data.adminNotes !== undefined) {
    updateExpressions.push('#adminNotes = :adminNotes');
    expressionAttributeNames['#adminNotes'] = 'adminNotes';
    expressionAttributeValues[':adminNotes'] = data.adminNotes;
  }

  const params = {
    TableName: ORDERS_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  const result = await docClient.send(new UpdateCommand(params));
  const order = result.Attributes;

  // Send email notification when order is completed
  if (data.status === 'completed' && order.itemType === 'physical') {
    const userParams = {
      TableName: USERS_TABLE,
      Key: { userId: order.userId }
    };
    const userResult = await docClient.send(new GetCommand(userParams));
    
    if (userResult.Item && userResult.Item.email) {
      const user = userResult.Item;
      const subject = `Your ${order.itemName} Order is Complete`;
      const htmlBody = `
        <h2>Order Completed! 🎉</h2>
        <p>Your order for <strong>${order.itemName}</strong> has been processed and completed.</p>
        ${data.adminNotes ? `
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <strong>Admin Notes:</strong><br>
          ${data.adminNotes}
        </div>
        ` : ''}
        <p>Thank you for being part of our community!</p>
        <p>Best regards,<br>AWS User Group MDU Team</p>
      `;
      const textBody = `
Order Completed!

Your order for ${order.itemName} has been processed and completed.

${data.adminNotes ? `Admin Notes:\n${data.adminNotes}\n\n` : ''}
Thank you for being part of our community!

Best regards,
AWS User Group MDU Team
      `;
      await sendEmail(user.email, subject, htmlBody, textBody);
    }
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Attributes)
  };
}

async function assignCodeToOrder(id, data) {
  // Get the order first to get user info
  const getOrderParams = {
    TableName: ORDERS_TABLE,
    Key: { id }
  };
  const orderResult = await docClient.send(new GetCommand(getOrderParams));
  
  if (!orderResult.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Order not found' })
    };
  }

  const existingOrder = orderResult.Item;

  const params = {
    TableName: ORDERS_TABLE,
    Key: { id },
    UpdateExpression: 'SET #code = :code, #status = :status, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#code': 'code',
      '#status': 'status',
      '#updatedAt': 'updatedAt'
    },
    ExpressionAttributeValues: {
      ':code': data.code,
      ':status': 'completed',
      ':updatedAt': new Date().toISOString()
    },
    ReturnValues: 'ALL_NEW'
  };

  const result = await docClient.send(new UpdateCommand(params));

  // Remove the code from the item's available codes
  const order = result.Attributes;
  const itemParams = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id: order.itemId }
  };
  const itemResult = await docClient.send(new GetCommand(itemParams));
  
  if (itemResult.Item && itemResult.Item.availableCodes) {
    const updatedCodes = itemResult.Item.availableCodes.filter(c => c !== data.code);
    const updateItemParams = {
      TableName: STORE_ITEMS_TABLE,
      Key: { id: order.itemId },
      UpdateExpression: 'SET #availableCodes = :codes, #inStock = :inStock',
      ExpressionAttributeNames: {
        '#availableCodes': 'availableCodes',
        '#inStock': 'inStock'
      },
      ExpressionAttributeValues: {
        ':codes': updatedCodes,
        ':inStock': updatedCodes.length > 0
      }
    };
    await docClient.send(new UpdateCommand(updateItemParams));
  }

  // Get user email and send notification
  const userParams = {
    TableName: USERS_TABLE,
    Key: { userId: order.userId }
  };
  const userResult = await docClient.send(new GetCommand(userParams));
  
  if (userResult.Item && userResult.Item.email) {
    const user = userResult.Item;
    const subject = `Your ${order.itemName} Code`;
    const htmlBody = `
      <h2>Congratulations! 🎉</h2>
      <p>You have successfully redeemed <strong>${order.itemName}</strong> for ${order.points} points.</p>
      <p>Here is your code:</p>
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
        <strong>${data.code}</strong>
      </div>
      <p>Thank you for being part of our community!</p>
      <p>Best regards,<br>AWS User Group MDU Team</p>
    `;
    const textBody = `
Congratulations!

You have successfully redeemed ${order.itemName} for ${order.points} points.

Your code: ${data.code}

Thank you for being part of our community!

Best regards,
AWS User Group MDU Team
    `;
    await sendEmail(user.email, subject, htmlBody, textBody);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Attributes)
  };
}

// Redeem Item Function
async function redeemItem(itemId, data) {
  const { userId } = data;

  // Get the item
  const itemParams = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id: itemId }
  };
  const itemResult = await docClient.send(new GetCommand(itemParams));
  
  if (!itemResult.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Item not found' })
    };
  }

  const item = itemResult.Item;

  if (!item.inStock) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Item is out of stock' })
    };
  }

  // Get user
  const userParams = {
    TableName: USERS_TABLE,
    Key: { userId }
  };
  const userResult = await docClient.send(new GetCommand(userParams));
  
  if (!userResult.Item) {
    return {
      statusCode: 404,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'User not found' })
    };
  }

  const user = userResult.Item;
  const currentPoints = user.points || 0;

  if (currentPoints < item.points) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Insufficient points' })
    };
  }

  // Deduct points from user
  const updateUserParams = {
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression: 'SET #points = :points',
    ExpressionAttributeNames: {
      '#points': 'points'
    },
    ExpressionAttributeValues: {
      ':points': currentPoints - item.points
    }
  };
  await docClient.send(new UpdateCommand(updateUserParams));

  // Create order
  const order = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    itemId,
    itemName: item.name,
    itemType: item.itemType,
    points: item.points,
    status: 'pending',
    shippingAddress: data.shippingAddress || {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // For virtual items, auto-assign a code if available
  if (item.itemType === 'virtual' && item.availableCodes && item.availableCodes.length > 0) {
    const code = item.availableCodes[0];
    order.code = code;
    order.status = 'completed';

    // Remove the code from available codes
    const updatedCodes = item.availableCodes.slice(1);
    const updateItemParams = {
      TableName: STORE_ITEMS_TABLE,
      Key: { id: itemId },
      UpdateExpression: 'SET #availableCodes = :codes, #inStock = :inStock',
      ExpressionAttributeNames: {
        '#availableCodes': 'availableCodes',
        '#inStock': 'inStock'
      },
      ExpressionAttributeValues: {
        ':codes': updatedCodes,
        ':inStock': updatedCodes.length > 0
      }
    };
    await docClient.send(new UpdateCommand(updateItemParams));

    // Send email with the code
    if (user.email) {
      const subject = `Your ${item.name} Code`;
      const htmlBody = `
        <h2>Congratulations! 🎉</h2>
        <p>You have successfully redeemed <strong>${item.name}</strong> for ${item.points} points.</p>
        <p>Here is your code:</p>
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
          <strong>${code}</strong>
        </div>
        <p>Thank you for being part of our community!</p>
        <p>Best regards,<br>AWS User Group MDU Team</p>
      `;
      const textBody = `
Congratulations!

You have successfully redeemed ${item.name} for ${item.points} points.

Your code: ${code}

Thank you for being part of our community!

Best regards,
AWS User Group MDU Team
      `;
      await sendEmail(user.email, subject, htmlBody, textBody);
    }
  }

  const orderParams = {
    TableName: ORDERS_TABLE,
    Item: order
  };
  await docClient.send(new PutCommand(orderParams));

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      message: 'Item redeemed successfully',
      order,
      remainingPoints: currentPoints - item.points
    })
  };
}
