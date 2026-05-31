const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';
const SPRINTS_TABLE = process.env.SPRINTS_TABLE_NAME || 'awsug-sprints';

// How long to serve cached results from a warm container (ms).
const CACHE_TTL = 60 * 1000; // 1 minute

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  // Let API Gateway / browsers cache the response briefly too.
  'Cache-Control': 'public, max-age=60',
};

// In-memory cache that survives across warm Lambda invocations.
let statsCache = null;
let statsCacheTime = 0;

/**
 * Count members and sum badges using a projected scan so we only pull the
 * `badges` attribute instead of the entire user record. Handles pagination.
 */
async function getUserStats() {
  let memberCount = 0;
  let badgeCount = 0;
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression: 'badges',
      ExclusiveStartKey,
    }));

    const items = result.Items || [];
    memberCount += items.length;
    for (const item of items) {
      badgeCount += Array.isArray(item.badges) ? item.badges.length : 0;
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return { memberCount, badgeCount };
}

/**
 * Count meetups. Uses a Select: COUNT scan so no item data crosses the wire.
 */
async function getMeetupCount() {
  let meetupCount = 0;
  let ExclusiveStartKey;

  do {
    const result = await docClient.send(new ScanCommand({
      TableName: MEETUPS_TABLE,
      Select: 'COUNT',
      ExclusiveStartKey,
    }));
    meetupCount += result.Count || 0;
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return meetupCount;
}

/**
 * Find the currently active sprint (if any) via the status GSI, projecting
 * only the fields the hero badge needs.
 */
async function getActiveSprint() {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: SPRINTS_TABLE,
      IndexName: 'status-index',
      KeyConditionExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
      ProjectionExpression: 'id, title, #s',
      Limit: 1,
    }));
    const sprint = (result.Items || [])[0];
    return sprint || null;
  } catch (error) {
    // GSI query is best-effort; never fail the whole stats call for it.
    console.error('Error querying active sprint:', error);
    return null;
  }
}

async function buildStats() {
  const [{ memberCount, badgeCount }, meetupCount, activeSprint] = await Promise.all([
    getUserStats(),
    getMeetupCount(),
    getActiveSprint(),
  ]);

  return {
    memberCount,
    badgeCount,
    meetupCount,
    activeSprint,
    generatedAt: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const now = Date.now();
    if (statsCache && (now - statsCacheTime) < CACHE_TTL) {
      return {
        statusCode: 200,
        headers: { ...corsHeaders, 'X-Cache': 'HIT' },
        body: JSON.stringify(statsCache),
      };
    }

    const stats = await buildStats();
    statsCache = stats;
    statsCacheTime = now;

    return {
      statusCode: 200,
      headers: { ...corsHeaders, 'X-Cache': 'MISS' },
      body: JSON.stringify(stats),
    };
  } catch (error) {
    console.error('Error building stats:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Failed to compute stats' }),
    };
  }
};
