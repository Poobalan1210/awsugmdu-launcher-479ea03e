const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const MEETUP_POSTERS_BUCKET = process.env.MEETUP_POSTERS_BUCKET || 'awsug-meetup-posters';
const PROFILE_PHOTOS_BUCKET = process.env.PROFILE_PHOTOS_BUCKET || 'awsug-profile-photos';

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
    return createResponse(200, {});
  }
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { fileName, contentType, bucketType = 'meetup-posters' } = body;
    
    if (!fileName || !contentType) {
      return createResponse(400, { 
        error: 'Missing required fields: fileName, contentType' 
      });
    }
    
    // Validate bucket type
    const bucketName = bucketType === 'profile-photos' 
      ? PROFILE_PHOTOS_BUCKET 
      : MEETUP_POSTERS_BUCKET;
    
    // Validate content type
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (!allowedTypes.includes(contentType.toLowerCase())) {
      return createResponse(400, { 
        error: 'Invalid content type. Allowed types: ' + allowedTypes.join(', ') 
      });
    }
    
    // Generate unique file name with timestamp
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = bucketType === 'profile-photos' 
      ? `profiles/${timestamp}-${sanitizedFileName}`
      : `posters/${timestamp}-${sanitizedFileName}`;
    
    // Generate presigned URL (valid for 5 minutes)
    // Include ContentType in command so S3 stores it correctly
    // The presigned URL will enforce this content type
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    
    // Generate public URL for the uploaded file
    const publicUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
    return createResponse(200, {
      presignedUrl,
      publicUrl,
      key,
      bucket: bucketName
    });
  } catch (error) {
    console.error('Error:', error);
    return createResponse(500, { 
      error: 'Internal server error',
      message: error.message 
    });
  }
};
