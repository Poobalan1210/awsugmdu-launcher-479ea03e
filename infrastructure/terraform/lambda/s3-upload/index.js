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
      : bucketType === 'college-logos' || bucketType === 'cloud-club-logos' || bucketType === 'cloud-club-files'
      ? PROFILE_PHOTOS_BUCKET // Reuse profile photos bucket for college and cloud club documents
      : MEETUP_POSTERS_BUCKET; // Also used for meetup-photos, meetup-reports, and spotlight-images
    
    // Validate content type - allow documents for college-logos bucket
    const allowedImageTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    const allowedDocumentTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'application/x-zip-compressed',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/octet-stream'
    ];
    
    const allowedTypes = (bucketType === 'college-logos' || bucketType === 'meetup-reports' || bucketType === 'cloud-club-logos' || bucketType === 'cloud-club-files' || bucketType === 'spotlight-images')
      ? [...allowedImageTypes, ...allowedDocumentTypes]
      : allowedImageTypes;
    
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
      : bucketType === 'college-logos'
      ? `college-documents/${timestamp}-${sanitizedFileName}`
      : bucketType === 'cloud-club-logos'
      ? `cloud-club-logos/${timestamp}-${sanitizedFileName}`
      : bucketType === 'cloud-club-files'
      ? `cloud-club-documents/${timestamp}-${sanitizedFileName}`
      : bucketType === 'meetup-photos'
      ? `event-photos/${timestamp}-${sanitizedFileName}`
      : bucketType === 'meetup-reports'
      ? `event-reports/${timestamp}-${sanitizedFileName}`
      : bucketType === 'spotlight-images'
      ? `spotlight-images/${timestamp}-${sanitizedFileName}`
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
