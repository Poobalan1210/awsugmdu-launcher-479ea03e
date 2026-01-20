const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const MEETUP_POSTERS_BUCKET = process.env.MEETUP_POSTERS_BUCKET || 'awsug-meetup-posters';
const PROFILE_PHOTOS_BUCKET = process.env.PROFILE_PHOTOS_BUCKET || 'awsug-profile-photos';
const CLOUDFRONT_PROFILE_PHOTOS = process.env.CLOUDFRONT_PROFILE_PHOTOS_DOMAIN || '';
const CLOUDFRONT_MEETUP_POSTERS = process.env.CLOUDFRONT_MEETUP_POSTERS_DOMAIN || '';

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
    // Don't include ContentType in the command - let the client set it
    // This avoids CORS issues with presigned URLs
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      CacheControl: 'public, max-age=31536000, immutable',
    });
    
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    
    // Generate public URL - use CloudFront if available, otherwise S3
    const publicUrl = bucketType === 'profile-photos' && CLOUDFRONT_PROFILE_PHOTOS
      ? `https://${CLOUDFRONT_PROFILE_PHOTOS}/${key}`
      : bucketType === 'meetup-posters' && CLOUDFRONT_MEETUP_POSTERS
      ? `https://${CLOUDFRONT_MEETUP_POSTERS}/${key}`
      : `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    
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
