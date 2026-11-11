const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { CognitoIdentityProviderClient, AdminDeleteUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const COLLEGES_TABLE = process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';
const CLOUD_CLUBS_TABLE = process.env.CLOUD_CLUBS_TABLE_NAME || 'awsug-cloud_clubs';
const MEETUPS_TABLE = process.env.MEETUPS_TABLE_NAME || 'awsug-meetups';
const SPRINTS_TABLE = process.env.SPRINTS_TABLE_NAME || 'awsug-sprints';
const DISCUSSIONS_TABLE = process.env.DISCUSSIONS_TABLE_NAME || 'awsug-discussions';
const ORDERS_TABLE = process.env.ORDERS_TABLE_NAME || 'awsug-orders';
const BUILDER_CONTENT_TABLE = process.env.BUILDER_CONTENT_TABLE_NAME || '';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const PROFILE_PHOTOS_BUCKET = process.env.PROFILE_PHOTOS_BUCKET;
const MEETUP_POSTERS_BUCKET = process.env.MEETUP_POSTERS_BUCKET;

const { withVerifiedAuth, callerId, callerIsAdmin } = require('./verify-auth');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

// ── PII protection ────────────────────────────────────────────────
// GET /users is reachable without authentication and used to return every
// field of every member record — including email and meetupEmail — to anyone
// who called it. The API base is in the public JS bundle, so this was a live
// address-harvesting endpoint.
//
// Rather than add auth across every route (separate, larger work), the actual
// harm is removed by never serialising contact details to a caller who is not
// the owner or an organiser. The public leaderboard, profile slugs and member
// lists only ever needed name, avatar, points and id.

/** Fields that must never reach a caller who is not the owner or an organiser. */
const PRIVATE_USER_FIELDS = [
  'email',
  'meetupEmail',
  'meetupVerificationStatus',
];

/** Claims of the verified Cognito ID token (see verify-auth.js), or null. */
function extractClaims(event) {
  const claims = event?.verifiedClaims;
  return claims ? { sub: claims.sub, email: claims.email || null } : null;
}

/** Organiser by verified configured email, or by an admin/organiser role. */
async function callerIsOrganiser(event) {
  return callerIsAdmin(event);
}

// Fields only organisers may set. Points, badges and roles are awarded by
// organisers or by the server; a member setting them on their own record
// would let anyone give themselves admin or any number of points.
const ORGANISER_ONLY_FIELDS = [
  'role', 'roles', 'points', 'redeemablePoints', 'rank', 'badges',
  'pointActivities', 'activities', 'hideFromLeaderboard',
  'meetupVerified', 'meetupVerificationStatus',
  'isCollegeChamp', 'champCollegeId', 'isCloudClub', 'cloudClubId',
];

const SIGNUP_AFFILIATION_FIELDS = ['isCollegeChamp', 'champCollegeId', 'isCloudClub', 'cloudClubId'];

// Same rule as the meetup-verification Lambda: a membership URL for the AWS
// User Group Madurai group is accepted straight away.
const MEETUP_GROUP_PATH = '/group/36938462';

function redactUser(user) {
  if (!user) return user;
  const copy = { ...user };
  for (const field of PRIVATE_USER_FIELDS) delete copy[field];
  return copy;
}

const handleRequest = async (event) => {
  console.log('Request:', event.httpMethod, event.path || event.resource);
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: '',
    };
  }
  
  try {
    const { httpMethod, pathParameters, body: requestBody } = event;
    const userId = pathParameters?.userId;
    
    switch (httpMethod) {
      case 'GET':
        if (userId) {
          // Get single user by ID. Contact details only for the owner or an organiser.
          return await getUser(userId, event);
        } else {
          // Get all users. Contact details only for organisers.
          return await getAllUsers(event);
        }
      
      case 'POST':
        // Create new user: a member creates their own profile, an organiser anyone's.
        if (!callerId(event)) return forbidden(401, 'Please sign in again.');
        return await createUser(requestBody, event);
      
      case 'PUT':
        // Update user
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
        }
        if (!callerId(event)) return forbidden(401, 'Please sign in again.');
        if (callerId(event) !== userId && !(await callerIsAdmin(event))) {
          return forbidden(403, 'You can only edit your own profile.');
        }
        return await updateUser(userId, requestBody, event);
      
      case 'DELETE':
        // Delete user (complete wipe)
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
        }
        if (!callerId(event)) return forbidden(401, 'Please sign in again.');
        if (callerId(event) !== userId && !(await callerIsAdmin(event))) {
          return forbidden(403, 'You can only delete your own account.');
        }
        return await deleteUser(userId);
      
      default:
        return {
          statusCode: 405,
          headers: corsHeaders,
          body: JSON.stringify({ error: 'Method not allowed' }),
        };
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

function forbidden(statusCode, error) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify({ error }) };
}

async function getUser(userId, event) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    if (!result.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }

    // The owner must still receive their own email — AuthContext builds the
    // signed-in User from this response. Everyone else gets the redacted view.
    const claims = extractClaims(event);
    const isOwner = Boolean(claims?.sub) && claims.sub === userId;
    const full = isOwner || (await callerIsOrganiser(event));

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(full ? result.Item : redactUser(result.Item)),
    };
  } catch (error) {
    console.error('Error getting user:', error);
    throw error;
  }
}

/**
 * Read every item of a table. A single Scan stops at 1 MB of data, and the
 * users table is past that, so one call silently dropped ~100 members from the
 * members tab, public profile links and every other list built from GET /users.
 */
async function scanAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new ScanCommand({ ...params, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function getAllUsers(event) {
  try {
    const items = await scanAll({ TableName: USERS_TABLE });
    // Organisers keep the full records — the admin members tab, meetup
    // verification and hackathon judging all need contact details.
    const full = await callerIsOrganiser(event);
    const users = full ? items : items.map(redactUser);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        users,
        count: users.length,
      }),
    };
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

async function createUser(requestBody, event) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    const organiser = await callerIsAdmin(event);
    if (!organiser) {
      // A member only ever creates their own profile, with the email Cognito
      // holds for them, and without organiser-only fields.
      if (body.userId && body.userId !== callerId(event)) {
        return forbidden(403, 'You can only create your own profile.');
      }
      body.userId = callerId(event);
      body.email = event.verifiedClaims.email || body.email;
      // Signup is where a member picks their own College Champ or Cloud Club.
      for (const field of ORGANISER_ONLY_FIELDS) {
        if (!SIGNUP_AFFILIATION_FIELDS.includes(field)) delete body[field];
      }
    }
    const { userId, email, name, ...profileData } = body;
    
    if (!userId || !email || !name) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ 
          error: 'Missing required fields: userId, email, name' 
        }),
      };
    }
    
    const now = new Date().toISOString();

    // A repeated POST (signup retried, or the sign-in recovery racing the
    // signup form) must never wipe what the member has already earned.
    const existing = (await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }))).Item;

    // Default role is 'member' for all users
    const userProfile = {
      userId,
      email,
      name,
      ...profileData,
      role: profileData.role || 'member',
      points: profileData.points || 0,
      redeemablePoints: profileData.redeemablePoints ?? profileData.points ?? 0,
      rank: profileData.rank || 0,
      badges: profileData.badges || [],
      pointActivities: [],
      activities: [],
      meetupVerified: profileData.meetupVerified || false,
      meetupVerificationStatus: profileData.meetupVerificationStatus || 'pending',
      joinedDate: now,
      createdAt: now,
      updatedAt: now,
    };
    if (existing) {
      for (const field of [...ORGANISER_ONLY_FIELDS, 'joinedDate', 'createdAt']) {
        if (existing[field] !== undefined) userProfile[field] = existing[field];
      }
    }
    
    await docClient.send(new PutCommand({
      TableName: USERS_TABLE,
      Item: userProfile,
    }));
    
    // If user selected College Champ, add them to the college's members list
    if (profileData.isCollegeChamp && profileData.champCollegeId) {
      try {
        const college = await docClient.send(new GetCommand({
          TableName: COLLEGES_TABLE,
          Key: { id: profileData.champCollegeId },
        }));
        
        if (college.Item) {
          const members = college.Item.members || [];
          if (!members.includes(userId)) {
            members.push(userId);
            await docClient.send(new UpdateCommand({
              TableName: COLLEGES_TABLE,
              Key: { id: profileData.champCollegeId },
              UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':members': members,
                ':updatedAt': new Date().toISOString(),
              },
            }));
          }
        }
      } catch (collegeError) {
        console.error('Failed to add user to college:', collegeError);
        // Non-blocking - profile was created successfully
      }
    }
    
    // If user selected Cloud Club, add them to the club's members list
    if (profileData.isCloudClub && profileData.cloudClubId) {
      try {
        const club = await docClient.send(new GetCommand({
          TableName: CLOUD_CLUBS_TABLE,
          Key: { id: profileData.cloudClubId },
        }));
        
        if (club.Item) {
          const members = club.Item.members || [];
          if (!members.includes(userId)) {
            members.push(userId);
            await docClient.send(new UpdateCommand({
              TableName: CLOUD_CLUBS_TABLE,
              Key: { id: profileData.cloudClubId },
              UpdateExpression: 'SET members = :members, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':members': members,
                ':updatedAt': new Date().toISOString(),
              },
            }));
          }
        }
      } catch (clubError) {
        console.error('Failed to add user to cloud club:', clubError);
        // Non-blocking - profile was created successfully
      }
    }
    
    return {
      statusCode: 201,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true, 
        userId,
        user: userProfile,
      }),
    };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  }
}

async function updateUser(userId, requestBody, event) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    if (!(await callerIsAdmin(event))) {
      // The owner's own Meetup verification is the one organiser-only change a
      // member may make, and only on the same terms as the verification Lambda.
      const wantsVerified = body.meetupVerified === true;
      const wantsStatus = body.meetupVerificationStatus;
      for (const field of ORGANISER_ONLY_FIELDS) delete body[field];
      const url = String(body.meetupEmail || '');
      if (wantsVerified && url.includes(MEETUP_GROUP_PATH)) {
        body.meetupVerified = true;
        body.meetupVerificationStatus = 'approved';
      } else if (wantsStatus === 'pending') {
        body.meetupVerificationStatus = 'pending';
      }
    }
    
    // First check if user exists
    const existingUser = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    if (!existingUser.Item) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'User not found' }),
      };
    }
    
    // Build update expression
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Check if meetupVerified is being updated from false to true
    if (body.meetupVerified === true && existingUser.Item.meetupVerified !== true) {
      const existingPointActivities = existingUser.Item.pointActivities || [];
      const hasLegacySignupBonus = existingPointActivities.some(a => a.type === 'signup');

      // Only award verification points if the user hasn't received the legacy signup bonus
      if (!hasLegacySignupBonus) {
        const VERIFICATION_BONUS = 100;
        const now = new Date().toISOString();
        const newPoints = (existingUser.Item.points || 0) + VERIFICATION_BONUS;
        const newRedeemable = (existingUser.Item.redeemablePoints || 0) + VERIFICATION_BONUS;
        
        const verificationPointActivity = {
          id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId,
          points: VERIFICATION_BONUS,
          reason: 'Meetup verification bonus',
          type: 'meetup_verification',
          awardedBy: 'system',
          awardedAt: now,
        };

        const verificationActivity = {
          type: 'points_awarded',
          points: VERIFICATION_BONUS,
          reason: 'Meetup verification bonus',
          pointType: 'meetup_verification',
          awardedBy: 'system',
          timestamp: now,
        };

        const existingActivities = existingUser.Item.activities || [];
        
        body.points = newPoints;
        body.redeemablePoints = newRedeemable;
        body.pointActivities = [...existingPointActivities, verificationPointActivity];
        body.activities = [...existingActivities, verificationActivity];
      }
    }
    
    // Fields that can be updated
    const updatableFields = [
      'name', 'avatar', 'bio', 'designation', 'company', 'companyCity', 'country',
      'collegeName', 'collegeCity', 'isCollegeChamp', 'champCollegeId',
      'isCloudClub', 'cloudClubId',
      'linkedIn', 'github', 'twitter', 'meetupEmail', 'userType',
      'points', 'redeemablePoints', 'rank', 'badges', 'role', 'meetupVerified', 'meetupVerificationStatus',
      'pointActivities', 'activities', 'hideFromLeaderboard'
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
      TableName: USERS_TABLE,
      Key: { userId },
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
        user: result.Attributes,
      }),
    };
  } catch (error) {
    console.error('Error updating user:', error);
    throw error;
  }
}

async function deleteUser(userId) {
  try {
    console.log(`Starting complete wipe for user: ${userId}`);
    
    // 0. Fetch user profile first to get identifying file links
    const userResult = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId }
    }));
    const userProfile = userResult.Item;
    
    // 1. Clean up Meetups
    await cleanupTableEntries(MEETUPS_TABLE, userId, ['registeredUsers', 'speakers', 'hosts', 'volunteers']);
    
    // 2. Clean up Sprints (includes S3 deletion for submissions)
    await cleanupTableEntries(SPRINTS_TABLE, userId, ['registeredUsers', 'submissions']);
    
    // 3. Clean up Colleges
    await cleanupTableEntries(COLLEGES_TABLE, userId, ['members']);
    
    // 4. Clean up Cloud Clubs
    await cleanupTableEntries(CLOUD_CLUBS_TABLE, userId, ['members']);
    
    // 5. Clean up Orders
    await deleteUserOrders(userId);
    
    // 6. Clean up Discussions
    await cleanupDiscussions(userId);

    // 6b. Clean up Builder Center suggestions and claims
    await cleanupBuilderContent(userId);
    
    // 7. Clean up S3 assets (Avatar)
    if (userProfile?.avatar) {
      await deleteS3ObjectFromUrl(userProfile.avatar);
    }
    
    // 8. Delete from Cognito
    if (USER_POOL_ID) {
      try {
        await cognitoClient.send(new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: userId
        }));
        console.log(`Deleted user ${userId} from Cognito`);
      } catch (cognitoError) {
        console.error(`Error deleting user ${userId} from Cognito:`, cognitoError);
        // If user doesn't exist in Cognito, continue
      }
    }
    
    // 9. Delete from Users table
    await docClient.send(new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }));
    
    console.log(`Successfully completed wipe for user: ${userId}`);
    
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        message: 'Account and all associated data deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error during user deletion:', error);
    throw error;
  }
}

/**
 * Helper to delete an S3 object from its public/CloudFront URL
 */
async function deleteS3ObjectFromUrl(url) {
  try {
    if (!url || typeof url !== 'string') return;
    
    console.log(`Attempting to delete S3 asset: ${url}`);
    
    let bucketName = '';
    let key = '';
    
    // Extract key from URL
    // Examples:
    // https://awsug-profile-photos.s3.region.amazonaws.com/profiles/123-file.png
    // https://d123.cloudfront.net/profiles/123-file.png
    
    const urlObj = new URL(url);
    const path = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
    
    if (url.includes('profile-photos')) {
      bucketName = PROFILE_PHOTOS_BUCKET;
    } else if (url.includes('meetup-posters')) {
      bucketName = MEETUP_POSTERS_BUCKET;
    } else {
      // Fallback: try to guess bucket from hostname or just check common prefixes
      if (path.startsWith('profiles/') || path.startsWith('college-documents/') || path.startsWith('cloud-club-')) {
        bucketName = PROFILE_PHOTOS_BUCKET;
      } else if (path.startsWith('posters/') || path.startsWith('event-')) {
        bucketName = MEETUP_POSTERS_BUCKET;
      }
    }
    
    if (bucketName && path) {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: path
      }));
      console.log(`Deleted S3 object: ${bucketName}/${path}`);
    }
  } catch (error) {
    console.error(`Failed to delete S3 asset ${url}:`, error);
  }
}

/**
 * Generic function to remove userId from arrays in table items
 */
async function cleanupTableEntries(tableName, userId, arrayFields) {
  try {
    console.log(`Cleaning up ${tableName} for user ${userId}`);
    const result = await docClient.send(new ScanCommand({
      TableName: tableName
    }));
    
    for (const item of (result.Items || [])) {
      let needsUpdate = false;
      const updates = {};
      
      for (const field of arrayFields) {
        if (item[field] && Array.isArray(item[field])) {
          const originalLength = item[field].length;
          
          // Handle S3 document deletion for Sprint Submissions
          if (tableName === SPRINTS_TABLE && field === 'submissions') {
            const userSubmissions = item[field].filter(s => s.userId === userId);
            for (const sub of userSubmissions) {
              if (sub.supportingDocuments && Array.isArray(sub.supportingDocuments)) {
                for (const doc of sub.supportingDocuments) {
                  if (doc.url) await deleteS3ObjectFromUrl(doc.url);
                }
              }
            }
          }
          
          // Filter out user from arrays
          item[field] = item[field].filter(entry => {
            const entryId = typeof entry === 'string' ? entry : entry.userId;
            return entryId !== userId;
          });
          
          if (item[field].length !== originalLength) {
            needsUpdate = true;
            updates[field] = item[field];
          }
        }
      }
      
      if (needsUpdate) {
        const updateExpressions = Object.keys(updates).map(f => `#${f} = :${f}`);
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        Object.keys(updates).forEach(f => {
          expressionAttributeNames[`#${f}`] = f;
          expressionAttributeValues[`:${f}`] = updates[f];
        });
        
        await docClient.send(new UpdateCommand({
          TableName: tableName,
          Key: { id: item.id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        }));
      }
    }
  } catch (error) {
    console.error(`Error cleaning up ${tableName}:`, error);
    // Don't fail the whole process if one table cleanup fails
  }
}

/** Delete one of the Builder Center table's locks if this member holds it. */
async function releaseBuilderLock(partition, itemKey, userId) {
  try {
    await docClient.send(new DeleteCommand({
      TableName: BUILDER_CONTENT_TABLE,
      Key: { userId: partition, itemKey },
      ConditionExpression: 'ownerUserId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }));
  } catch (lockError) {
    if (lockError.name !== 'ConditionalCheckFailedException') throw lockError;
  }
}

/**
 * Remove the member's Builder Center items, and the locks they hold: claim
 * locks, so another account matched to the same author can claim those
 * articles, and the lock on a Builder Center account they linked.
 */
async function cleanupBuilderContent(userId) {
  // Partitions starting with "__" hold the table's settings, locks and sync state.
  if (!BUILDER_CONTENT_TABLE || String(userId).startsWith('__')) return;
  try {
    const items = [];
    let ExclusiveStartKey;
    do {
      const page = await docClient.send(new QueryCommand({
        TableName: BUILDER_CONTENT_TABLE,
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': userId },
        ExclusiveStartKey,
      }));
      items.push(...(page.Items || []));
      ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);

    for (const item of items) {
      const key = String(item.itemKey || '');
      if (key.startsWith('article#') && item.status === 'claimed') {
        await releaseBuilderLock('__claimed__', key, userId);
      }
      if (key.startsWith('link#') && item.status === 'verified' && item.alias) {
        await releaseBuilderLock('__aliases__', item.alias, userId);
      }
      await docClient.send(new DeleteCommand({
        TableName: BUILDER_CONTENT_TABLE,
        Key: { userId, itemKey: item.itemKey },
      }));
    }
    console.log(`Deleted ${items.length} Builder Center items for user ${userId}`);
  } catch (error) {
    console.error('Error cleaning up Builder Center items:', error);
    // Don't fail the whole process if one table cleanup fails
  }
}

async function deleteUserOrders(userId) {
  try {
    console.log(`Deleting orders for user ${userId}`);
    const result = await docClient.send(new QueryCommand({
      TableName: ORDERS_TABLE,
      IndexName: 'userId-index', // Assuming this GSI exists based on common patterns
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId }
    }));
    
    for (const order of (result.Items || [])) {
      await docClient.send(new DeleteCommand({
        TableName: ORDERS_TABLE,
        Key: { id: order.id }
      }));
    }
  } catch (error) {
    console.error(`Error deleting orders:`, error);
  }
}

async function cleanupDiscussions(userId) {
  try {
    console.log(`Cleaning up discussions for user ${userId}`);
    const result = await docClient.send(new ScanCommand({
      TableName: DISCUSSIONS_TABLE
    }));
    
    for (const post of (result.Items || [])) {
      // 1. Delete posts made by user
      if (post.userId === userId) {
        await docClient.send(new DeleteCommand({
          TableName: DISCUSSIONS_TABLE,
          Key: { id: post.id }
        }));
        continue;
      }
      
      // 2. Remove from replies and likedBy in others' posts
      let needsUpdate = false;
      const updates = {};
      
      if (post.replies && Array.isArray(post.replies)) {
        const originalLength = post.replies.length;
        post.replies = post.replies.filter(r => r.userId !== userId);
        if (post.replies.length !== originalLength) {
          needsUpdate = true;
          updates.replies = post.replies;
        }
      }
      
      if (post.likedBy && Array.isArray(post.likedBy)) {
        const originalLength = post.likedBy.length;
        post.likedBy = post.likedBy.filter(uId => uId !== userId);
        if (post.likedBy.length !== originalLength) {
          needsUpdate = true;
          updates.likedBy = post.likedBy;
          updates.likes = post.likedBy.length;
        }
      }
      
      if (needsUpdate) {
        const updateExpressions = Object.keys(updates).map(f => `#${f} = :${f}`);
        const expressionAttributeNames = {};
        const expressionAttributeValues = {};
        
        Object.keys(updates).forEach(f => {
          expressionAttributeNames[`#${f}`] = f;
          expressionAttributeValues[`:${f}`] = updates[f];
        });
        
        await docClient.send(new UpdateCommand({
          TableName: DISCUSSIONS_TABLE,
          Key: { id: post.id },
          UpdateExpression: `SET ${updateExpressions.join(', ')}`,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues
        }));
      }
    }
  } catch (error) {
    console.error('Error cleaning up discussions:', error);
  }
}

exports.handler = withVerifiedAuth(handleRequest);
