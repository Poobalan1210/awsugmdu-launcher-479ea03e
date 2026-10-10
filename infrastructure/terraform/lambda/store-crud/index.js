const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand, TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
// Mirrored from lambda/shared/checkout.js by deploy.sh — edit the master copy.
// Prize claims in the campaign Lambda use the same checks.
const { validateCheckout } = require('./shared/checkout');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sesClient = new SESClient({});

const STORE_ITEMS_TABLE = process.env.STORE_ITEMS_TABLE_NAME;
const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME;
const USERS_TABLE = process.env.USERS_TABLE_NAME;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
};

function respond(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function parseBody(body) {
  if (!body) return {};
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Sign-in ───────────────────────────────────────────────────────
// Every route except the public catalogue verifies the Cognito ID token's
// signature, the same check the campaign Lambda's admin routes make. Before
// this, redeem trusted a userId in the request body, so anyone who knew a
// member's id (they are public on the leaderboards) could spend that member's
// points, and anyone could list every order with its address and phone.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || '';
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';
const COGNITO_ISSUER = COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${COGNITO_USER_POOL_ID.split('_')[0]}.amazonaws.com/${COGNITO_USER_POOL_ID}`
  : '';
const JWKS_REFETCH_MS = 60 * 1000;
let jwksCache = null; // { keys, fetchedAt }

async function cognitoSigningKey(kid) {
  const find = () => (jwksCache ? jwksCache.keys.find((k) => k.kid === kid) : null) || null;
  let key = find();
  // An unknown key id usually means Cognito rotated its keys. Refetch, but at
  // most once a minute, so junk tokens cannot make us hammer the endpoint.
  if (!key && (!jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_REFETCH_MS)) {
    const r = await fetch(`${COGNITO_ISSUER}/.well-known/jwks.json`);
    if (!r.ok) return null;
    const body = await r.json();
    jwksCache = { keys: Array.isArray(body?.keys) ? body.keys : [], fetchedAt: Date.now() };
    key = find();
  }
  return key;
}

/** Claims of a genuine, unexpired ID token from this site's user pool, or null. */
async function verifyIdToken(authHeader) {
  if (!COGNITO_ISSUER || !COGNITO_CLIENT_ID) return null;
  const parts = String(authHeader || '').replace(/^Bearer\s+/i, '').trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    const header = decode(parts[0]);
    const claims = decode(parts[1]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;
    const jwk = await cognitoSigningKey(header.kid);
    if (!jwk) return null;
    const signed = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    if (!signed) return null;
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== COGNITO_ISSUER || claims.aud !== COGNITO_CLIENT_ID) return null;
    if (claims.token_use !== 'id' || typeof claims.sub !== 'string') return null;
    if (typeof claims.exp !== 'number' || now > claims.exp + 60) return null; // 60s clock skew
    return claims;
  } catch {
    return null;
  }
}

// Who the site treats as an admin (see AuthContext): the profile's `role`, or
// an admin or organiser role from the Members tab, kept in the `roles` list.
const ADMIN_ROLE_NAMES = ['admin', 'organiser'];

function hasAdminRole(user) {
  if (!user) return false;
  if (ADMIN_ROLE_NAMES.includes(String(user.role || '').toLowerCase())) return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) =>
    ADMIN_ROLE_NAMES.includes(String((typeof r === 'string' ? r : r?.role) || '').toLowerCase()));
}

/**
 * The signed-in caller, or null without a valid token. Whether they are an
 * admin is looked up only when a route asks.
 */
async function getCaller(event) {
  const claims = await verifyIdToken(event.headers?.Authorization || event.headers?.authorization);
  if (!claims) return null;
  let admin;
  return {
    userId: claims.sub,
    async isAdmin() {
      if (admin === undefined) {
        const email = String(claims.email || '').toLowerCase();
        const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
        if (email && emailVerified && ADMIN_EMAILS.includes(email)) {
          admin = true;
        } else {
          try {
            const r = await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId: claims.sub } }));
            admin = hasAdminRole(r.Item);
          } catch {
            admin = false;
          }
        }
      }
      return admin;
    },
  };
}

/**
 * For the public catalogue: 'anonymous' without a sign-in, 'invalid' when a
 * token was sent but fails verification, or the caller's admin status.
 */
async function catalogueViewer(event) {
  const header = event.headers?.Authorization || event.headers?.authorization;
  if (!header) return 'anonymous';
  const caller = await getCaller(event);
  if (!caller) return 'invalid';
  return (await caller.isAdmin()) ? 'admin' : 'member';
}

// Email sending function
async function sendEmail(to, subject, htmlBody, textBody) {
  const params = {
    Source: process.env.SES_FROM_EMAIL || 'info@awsugmdu.in',
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

// Replace {{code}}, {{itemName}}, {{points}}, {{name}} placeholders
function applyPlaceholders(template, vars) {
  return String(template)
    .replace(/\{\{\s*code\s*\}\}/g, vars.code ?? '')
    .replace(/\{\{\s*itemName\s*\}\}/g, vars.itemName ?? '')
    .replace(/\{\{\s*points\s*\}\}/g, vars.points ?? '')
    .replace(/\{\{\s*name\s*\}\}/g, vars.name ?? '');
}

// Build the code-delivery email. Uses the item's custom subject/message/image
// when provided, otherwise falls back to the default template.
function buildCodeEmail(item, { code, points, name }) {
  const itemName = item.name;
  const vars = { code, itemName, points: String(points), name: name || 'there' };

  const codeBoxHtml = `
      <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 18px; text-align: center; margin: 20px 0;">
        <strong>${code}</strong>
      </div>`;

  const imageHtml = item.emailImageUrl
    ? `<div style="text-align: center; margin-bottom: 16px;"><img src="${item.emailImageUrl}" alt="${itemName}" style="max-width: 100%; height: auto; border-radius: 8px;" /></div>`
    : '';

  // Subject: custom (with placeholders) or default
  const subject = item.emailSubject
    ? applyPlaceholders(item.emailSubject, vars)
    : `Your ${itemName} Code`;

  // Custom message path
  if (item.emailMessage && item.emailMessage.trim()) {
    const hasCodePlaceholder = /\{\{\s*code\s*\}\}/.test(item.emailMessage);
    const messageWithVars = applyPlaceholders(item.emailMessage, vars);
    const messageHtml = messageWithVars.replace(/\n/g, '<br>');

    const htmlBody = `
      ${imageHtml}
      <div>${messageHtml}</div>
      ${hasCodePlaceholder ? '' : codeBoxHtml}
    `;

    const textBody = `${messageWithVars}${hasCodePlaceholder ? '' : `\n\nYour code: ${code}`}\n`;

    return { subject, htmlBody, textBody };
  }

  // Default template path
  const htmlBody = `
    ${imageHtml}
    <h2>Congratulations! 🎉</h2>
    <p>You have successfully redeemed <strong>${itemName}</strong> for ${points} points.</p>
    <p>Here is your code:</p>
    ${codeBoxHtml}
    <p>Thank you for being part of our community!</p>
    <p>Best regards,<br>AWS User Group MDU Team</p>
  `;
  const textBody = `
Congratulations!

You have successfully redeemed ${itemName} for ${points} points.

Your code: ${code}

Thank you for being part of our community!

Best regards,
AWS User Group MDU Team
  `;
  return { subject, htmlBody, textBody };
}

exports.handler = async (event) => {
  const { httpMethod, path, pathParameters, body, queryStringParameters } = event;
  // Method and path only: the full event carries the sign-in token, and
  // checkout bodies carry addresses and phone numbers.
  console.log('Request:', httpMethod, path);

  try {
    const isItemPath = /\/store\/items\/[^/]+$/.test(path);
    const isOrderPath = /\/store\/orders\/[^/]+$/.test(path);

    // The catalogue is public. Unredeemed codes are for organisers only. A
    // token that fails verification is refused rather than quietly treated as
    // a visitor's: an admin given the visitor's view, which has no codes,
    // would save the item back with its codes gone.
    if ((path === '/store/items' || isItemPath) && httpMethod === 'GET') {
      const viewer = await catalogueViewer(event);
      if (viewer === 'invalid') return respond(401, { message: 'Sign in again to continue.' });
      return path === '/store/items'
        ? await listStoreItems(viewer === 'admin')
        : await getStoreItem(pathParameters.id, viewer === 'admin');
    }

    // Everything else needs a verified sign-in.
    const caller = await getCaller(event);
    if (!caller) return respond(401, { message: 'Sign in again to continue.' });

    if (/\/store\/items\/[^/]+\/redeem$/.test(path) && httpMethod === 'POST') {
      return await redeemItem(pathParameters.id, parseBody(body), caller.userId);
    }

    // Members see their own orders. Admins see anyone's, or all of them.
    if (path === '/store/orders' && httpMethod === 'GET') {
      const requested = queryStringParameters?.userId;
      if (await caller.isAdmin()) return await listOrders(requested);
      if (requested && requested !== caller.userId) {
        return respond(403, { message: 'You can only see your own orders.' });
      }
      return await listOrders(caller.userId);
    }
    if (isOrderPath && httpMethod === 'GET') {
      return await getOrder(pathParameters.id, caller);
    }

    // The rest manages the store.
    if (!(await caller.isAdmin())) return respond(403, { message: 'Only organisers can do that.' });

    if (path === '/store/items' && httpMethod === 'POST') {
      return await createStoreItem(parseBody(body));
    }
    if (isItemPath && httpMethod === 'PUT') {
      return await updateStoreItem(pathParameters.id, parseBody(body));
    }
    if (isItemPath && httpMethod === 'DELETE') {
      return await deleteStoreItem(pathParameters.id);
    }
    if (path === '/store/orders' && httpMethod === 'POST') {
      return await createOrder(parseBody(body));
    }
    if (/\/store\/orders\/[^/]+\/status$/.test(path) && httpMethod === 'PATCH') {
      return await updateOrderStatus(pathParameters.id, parseBody(body));
    }
    if (/\/store\/orders\/[^/]+\/assign-code$/.test(path) && httpMethod === 'PATCH') {
      return await assignCodeToOrder(pathParameters.id, parseBody(body));
    }

    return respond(404, { message: 'Route not found' });
  } catch (error) {
    console.error('Error:', error);
    return respond(500, { message: error.message });
  }
};

/**
 * A store item as members see it. Unredeemed codes are what members spend
 * points on, so only organisers get them; everyone else gets a count.
 */
function forCatalogue(item, includeCodes) {
  if (includeCodes || !Array.isArray(item.availableCodes)) return item;
  const { availableCodes, ...rest } = item;
  return { ...rest, availableCodeCount: availableCodes.length };
}

// Store Items Functions
async function listStoreItems(includeCodes) {
  const params = {
    TableName: STORE_ITEMS_TABLE
  };

  const result = await docClient.send(new ScanCommand(params));

  return respond(200, (result.Items || []).map((item) => forCatalogue(item, includeCodes)));
}

async function createStoreItem(data) {
  const quantity = data.quantity !== undefined ? data.quantity : null;
  const inStock = data.itemType === 'physical'
    ? (quantity !== null ? quantity > 0 : (data.inStock !== undefined ? data.inStock : true))
    : (data.availableCodes && data.availableCodes.length > 0 ? true : (data.inStock !== undefined ? data.inStock : true));

  const item = {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: data.name,
    description: data.description,
    points: data.points,
    image: data.image,
    inStock,
    quantity: data.itemType === 'physical' ? (quantity !== null ? quantity : 0) : undefined,
    category: data.category || 'general',
    itemType: data.itemType || 'physical',
    availableCodes: data.availableCodes || [],
    emailSubject: data.emailSubject || '',
    emailMessage: data.emailMessage || '',
    emailImageUrl: data.emailImageUrl || '',
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

async function getStoreItem(id, includeCodes) {
  const params = {
    TableName: STORE_ITEMS_TABLE,
    Key: { id }
  };

  const result = await docClient.send(new GetCommand(params));

  if (!result.Item) {
    return respond(404, { message: 'Item not found' });
  }

  return respond(200, forCatalogue(result.Item, includeCodes));
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
  if (data.inStock !== undefined && data.quantity === undefined) {
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
  if (data.emailSubject !== undefined) {
    updateExpressions.push('#emailSubject = :emailSubject');
    expressionAttributeNames['#emailSubject'] = 'emailSubject';
    expressionAttributeValues[':emailSubject'] = data.emailSubject;
  }
  if (data.emailMessage !== undefined) {
    updateExpressions.push('#emailMessage = :emailMessage');
    expressionAttributeNames['#emailMessage'] = 'emailMessage';
    expressionAttributeValues[':emailMessage'] = data.emailMessage;
  }
  if (data.emailImageUrl !== undefined) {
    updateExpressions.push('#emailImageUrl = :emailImageUrl');
    expressionAttributeNames['#emailImageUrl'] = 'emailImageUrl';
    expressionAttributeValues[':emailImageUrl'] = data.emailImageUrl;
  }
  if (data.quantity !== undefined) {
    updateExpressions.push('#quantity = :quantity');
    expressionAttributeNames['#quantity'] = 'quantity';
    expressionAttributeValues[':quantity'] = data.quantity;
    // Auto-update inStock based on quantity for physical items
    if (data.itemType === 'physical' || (!data.itemType && data.quantity !== undefined)) {
      updateExpressions.push('#inStock = :inStock');
      expressionAttributeNames['#inStock'] = 'inStock';
      expressionAttributeValues[':inStock'] = data.quantity > 0;
    }
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

async function getOrder(id, caller) {
  const params = {
    TableName: ORDERS_TABLE,
    Key: { id }
  };

  const result = await docClient.send(new GetCommand(params));
  const order = result.Item;

  // Someone else's order looks the same as a missing one.
  if (!order || (order.userId !== caller.userId && !(await caller.isAdmin()))) {
    return respond(404, { message: 'Order not found' });
  }

  return respond(200, order);
}

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'];

/**
 * The email a member gets when their physical order is marked completed. The
 * wording follows how it reached them: shipped, or collected at an event.
 */
function buildCompletionEmail(order, adminNotes) {
  const itemHtml = `<strong>${escapeHtml(order.itemName)}</strong>`;
  const notes = typeof adminNotes === 'string' ? adminNotes.trim() : '';
  const copy = order.fulfillmentMethod === 'pickup'
    ? {
        subject: `You've collected your ${order.itemName}`,
        heading: 'Enjoy your prize! 🎉',
        html: `You collected your ${itemHtml} at our event.`,
        text: `You collected your ${order.itemName} at our event.`,
      }
    : order.fulfillmentMethod === 'ship'
      ? {
          subject: `Your ${order.itemName} has been shipped`,
          heading: 'It is on its way! 🎉',
          html: `Your ${itemHtml} has been shipped to the address you gave us.`,
          text: `Your ${order.itemName} has been shipped to the address you gave us.`,
        }
      : {
          subject: `Your ${order.itemName} Order is Complete`,
          heading: 'Order Completed! 🎉',
          html: `Your order for ${itemHtml} has been processed and completed.`,
          text: `Your order for ${order.itemName} has been processed and completed.`,
        };

  const htmlBody = `
    <h2>${copy.heading}</h2>
    <p>${copy.html}</p>
    ${notes ? `
    <div style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; margin: 20px 0;">
      <strong>Notes from the organisers:</strong><br>
      ${escapeHtml(notes).replace(/\n/g, '<br>')}
    </div>
    ` : ''}
    <p>Thank you for being part of our community!</p>
    <p>Best regards,<br>AWS User Group MDU Team</p>
  `;
  const textBody = `
${copy.text}

${notes ? `Notes from the organisers:\n${notes}\n\n` : ''}Thank you for being part of our community!

Best regards,
AWS User Group MDU Team
  `;
  return { subject: copy.subject, htmlBody, textBody };
}

async function updateOrderStatus(id, data) {
  if (!ORDER_STATUSES.includes(data.status)) {
    return respond(400, { message: `Unknown status. Use one of: ${ORDER_STATUSES.join(', ')}.` });
  }

  const updateExpressions = ['#status = :status', '#updatedAt = :updatedAt'];
  const expressionAttributeNames = {
    '#id': 'id',
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
    // Without this, a status update for a mistyped id would create a stub order.
    ConditionExpression: 'attribute_exists(#id)',
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  };

  let result;
  try {
    result = await docClient.send(new UpdateCommand(params));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return respond(404, { message: 'Order not found' });
    throw err;
  }
  const order = result.Attributes;

  // Send email notification when order is completed
  if (data.status === 'completed' && order.itemType === 'physical') {
    const userParams = {
      TableName: USERS_TABLE,
      Key: { userId: order.userId }
    };
    const userResult = await docClient.send(new GetCommand(userParams));

    if (userResult.Item && userResult.Item.email) {
      const { subject, htmlBody, textBody } = buildCompletionEmail(order, data.adminNotes);
      await sendEmail(userResult.Item.email, subject, htmlBody, textBody);
    }
  }

  return respond(200, order);
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
    const emailItem = itemResult.Item || { name: order.itemName };
    const { subject, htmlBody, textBody } = buildCodeEmail(emailItem, {
      code: data.code,
      points: order.points,
      name: user.name,
    });
    await sendEmail(user.email, subject, htmlBody, textBody);
  }

  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(result.Attributes)
  };
}

// ── Checkout ──────────────────────────────────────────────────────
/**
 * Spend points on an item. The points, the stock or code, and the order are
 * written in one transaction, each guarded by a condition on what was read.
 * Two redeems at once cannot both spend the same points, take the last item or
 * get the same code, and a failure never leaves points spent without an order.
 */
async function redeemItem(itemId, data, userId) {
  if (data.userId && data.userId !== userId) {
    return respond(403, { message: 'You can only redeem with your own account.' });
  }

  const item = (await docClient.send(new GetCommand({ TableName: STORE_ITEMS_TABLE, Key: { id: itemId } }))).Item;
  if (!item) return respond(404, { message: 'Item not found' });
  if (!item.inStock) return respond(400, { message: 'Item is out of stock' });

  const itemType = item.itemType === 'virtual' ? 'virtual' : 'physical';
  const checkout = validateCheckout(itemType, data);
  if (checkout.error) return respond(400, { message: checkout.error });

  const user = (await docClient.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId } }))).Item;
  if (!user) return respond(404, { message: 'User not found' });

  const price = Number(item.points) || 0;
  // Profiles from before redeemable points existed have none: their balance is their total.
  const hasBalance = typeof user.redeemablePoints === 'number';
  const balance = hasBalance ? user.redeemablePoints : (Number(user.points) || 0);
  if (balance < price) return respond(400, { message: 'Insufficient points' });

  const now = new Date().toISOString();
  const order = {
    id: `order_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`,
    userId,
    itemId,
    itemName: item.name || '',
    itemType,
    points: price,
    status: 'pending',
    createdAt: now,
    updatedAt: now
  };
  if (checkout.method) {
    order.fulfillmentMethod = checkout.method;
    order.shippingAddress = checkout.contact;
    if (checkout.notes) order.customerNotes = checkout.notes;
  }

  // 1. The points, only while the balance still covers them. Overall points
  //    stay the same: spending never lowers what a member has earned.
  const transactItems = [{
    Update: {
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: hasBalance
        ? 'SET #rp = #rp - :price, #ac = list_append(if_not_exists(#ac, :empty), :act), #ua = :now'
        : 'SET #rp = :after, #ac = list_append(if_not_exists(#ac, :empty), :act), #ua = :now',
      ConditionExpression: hasBalance ? '#rp >= :price' : 'attribute_not_exists(#rp)',
      ExpressionAttributeNames: { '#rp': 'redeemablePoints', '#ac': 'activities', '#ua': 'updatedAt' },
      ExpressionAttributeValues: {
        ...(hasBalance ? { ':price': price } : { ':after': balance - price }),
        ':empty': [],
        ':act': [{
          type: 'store_redeemed',
          itemId,
          itemName: order.itemName,
          points: price,
          orderId: order.id,
          timestamp: now
        }],
        ':now': now
      }
    }
  }];

  // 2. Stock: one fewer, only if nobody took one since it was read.
  if (itemType === 'physical' && typeof item.quantity === 'number' && item.quantity > 0) {
    const left = item.quantity - 1;
    transactItems.push({
      Update: {
        TableName: STORE_ITEMS_TABLE,
        Key: { id: itemId },
        UpdateExpression: 'SET #q = :left, #is = :inStock',
        ConditionExpression: '#q = :q',
        ExpressionAttributeNames: { '#q': 'quantity', '#is': 'inStock' },
        ExpressionAttributeValues: { ':left': left, ':inStock': left > 0, ':q': item.quantity }
      }
    });
  }

  // 3. Virtual items: hand out the next code, only if it is still the next one.
  let code = null;
  if (itemType === 'virtual' && Array.isArray(item.availableCodes) && item.availableCodes.length > 0) {
    code = item.availableCodes[0];
    const rest = item.availableCodes.slice(1);
    order.code = code;
    order.status = 'completed';
    transactItems.push({
      Update: {
        TableName: STORE_ITEMS_TABLE,
        Key: { id: itemId },
        UpdateExpression: 'SET #codes = :rest, #is = :inStock',
        ConditionExpression: 'size(#codes) = :n AND #codes[0] = :code',
        ExpressionAttributeNames: { '#codes': 'availableCodes', '#is': 'inStock' },
        ExpressionAttributeValues: {
          ':rest': rest,
          ':inStock': rest.length > 0,
          ':n': item.availableCodes.length,
          ':code': code
        }
      }
    });
  }

  // 4. The order.
  transactItems.push({
    Put: {
      TableName: ORDERS_TABLE,
      Item: order,
      ConditionExpression: 'attribute_not_exists(#id)',
      ExpressionAttributeNames: { '#id': 'id' }
    }
  });

  try {
    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      const reasons = (err.CancellationReasons || []).map((r) => r && r.Code);
      if (reasons[0] === 'ConditionalCheckFailed') {
        return respond(400, { message: 'Insufficient points. Refresh the page to see your current balance.' });
      }
      if (reasons.includes('ConditionalCheckFailed')) {
        return respond(409, { message: 'Someone redeemed this item at the same moment. Try again.' });
      }
      return respond(409, { message: 'The redemption could not be completed. Try again.' });
    }
    throw err;
  }

  // The code goes out only once the order is safely written.
  if (code && user.email) {
    const { subject, htmlBody, textBody } = buildCodeEmail(item, {
      code,
      points: price,
      name: user.name,
    });
    await sendEmail(user.email, subject, htmlBody, textBody);
  }

  return respond(200, {
    message: 'Item redeemed successfully',
    order,
    remainingPoints: balance - price
  });
}
