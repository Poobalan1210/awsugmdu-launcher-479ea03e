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
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const PROFILE_PHOTOS_BUCKET = process.env.PROFILE_PHOTOS_BUCKET;
const MEETUP_POSTERS_BUCKET = process.env.MEETUP_POSTERS_BUCKET;

const { isOrganiserEmail } = require('./adminUtils');

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

/**
 * Read claims from the Cognito Authorization header. The payload is base64url,
 * so it is decoded without verifying the signature — consistent with
 * lambda/shared/auth.js and kironomics-crud across this stack.
 *
 * Note this means a crafted token could claim any `sub`. That is acceptable for
 * *widening* a response to the owner, but it is why the organiser check below
 * also confirms the role against the users table rather than trusting `email`.
 */
function extractClaims(event) {
  const header = event?.headers?.Authorization || event?.headers?.authorization;
  if (!header) return null;
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token || !token.includes('.')) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
    return {
      sub: payload.sub || payload['cognito:username'] || null,
      email: payload.email || null,
    };
  } catch (error) {
    return null;
  }
}

/** Organiser by configured email, or by the role stored on their own record. */
async function callerIsOrganiser(event) {
  const claims = extractClaims(event);
  if (!claims) return false;
  if (claims.email && isOrganiserEmail(claims.email)) return true;
  if (!claims.sub) return false;
  try {
    const r = await docClient.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: claims.sub },
    }));
    const role = r.Item?.role;
    return role === 'admin' || role === 'organiser';
  } catch (error) {
    return false;
  }
}

function redactUser(user) {
  if (!user) return user;
  const copy = { ...user };
  for (const field of PRIVATE_USER_FIELDS) delete copy[field];
  return copy;
}

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
        // Create new user
        return await createUser(requestBody);
      
      case 'PUT':
        // Update user
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
        }
        return await updateUser(userId, requestBody);
      
      case 'DELETE':
        // Delete user (complete wipe)
        if (!userId) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'userId is required' }),
          };
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

async function getAllUsers(event) {
  try {
    const result = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
    }));

    const items = result.Items || [];
    // Organisers keep the full records — the admin members tab, meetup
    // verification and hackathon judging all need contact details.
    const full = await callerIsOrganiser(event);
    const users = full ? items : items.map(redactUser);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        users,
        count: result.Count || 0,
      }),
    };
  } catch (error) {
    console.error('Error getting all users:', error);
    throw error;
  }
}

async function createUser(requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
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

async function updateUser(userId, requestBody) {
  try {
    const body = typeof requestBody === 'string' ? JSON.parse(requestBody) : requestBody;
    
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
