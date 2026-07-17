const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE = process.env.ACHIEVEMENTS_TABLE_NAME;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': true,
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// Fields the client is allowed to set; everything else (id, timestamps) is server-managed.
const EDITABLE_FIELDS = ['title', 'imageUrl', 'linkedInUrl'];

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const resource = event.resource;
    const method = event.httpMethod;

    // /achievements
    if (resource === '/achievements') {
      if (method === 'GET') {
        const result = await docClient.send(new ScanCommand({ TableName: TABLE }));
        // Newest added shows first.
        const items = (result.Items || []).sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        return { statusCode: 200, headers, body: JSON.stringify(items) };
      }

      if (method === 'POST') {
        const body = JSON.parse(event.body || '{}');
        const now = new Date().toISOString();
        const item = {
          id: randomUUID(),
          title: body.title || '',
          imageUrl: body.imageUrl || '',
          linkedInUrl: body.linkedInUrl || '',
          createdAt: now,
          updatedAt: now,
        };
        await docClient.send(new PutCommand({ TableName: TABLE, Item: item }));
        return { statusCode: 201, headers, body: JSON.stringify(item) };
      }
    }

    // /achievements/{id}
    if (resource === '/achievements/{id}') {
      const id = event.pathParameters.id;

      if (method === 'PUT') {
        const body = JSON.parse(event.body || '{}');

        const sets = [];
        const names = {};
        const values = {};

        for (const key of EDITABLE_FIELDS) {
          if (body[key] !== undefined) {
            sets.push(`#${key} = :${key}`);
            names[`#${key}`] = key;
            values[`:${key}`] = body[key];
          }
        }

        // Always bump updatedAt
        sets.push('#updatedAt = :updatedAt');
        names['#updatedAt'] = 'updatedAt';
        values[':updatedAt'] = new Date().toISOString();

        const result = await docClient.send(new UpdateCommand({
          TableName: TABLE,
          Key: { id },
          UpdateExpression: `set ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ReturnValues: 'ALL_NEW',
        }));

        return { statusCode: 200, headers, body: JSON.stringify(result.Attributes) };
      }

      if (method === 'DELETE') {
        await docClient.send(new DeleteCommand({ TableName: TABLE, Key: { id } }));
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Achievement deleted' }) };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ message: 'Route not found' }) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error', error: error.message }),
    };
  }
};
