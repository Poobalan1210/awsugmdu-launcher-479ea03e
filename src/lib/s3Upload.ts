import { callApi } from './api';

export interface PresignedUrlResponse {
  presignedUrl: string;
  publicUrl: string;
  key: string;
  bucket: string;
}

export interface UploadFileParams {
  fileName: string;
  contentType: string;
  bucketType?: 'meetup-posters' | 'profile-photos';
}

export async function getPresignedUrl(params: UploadFileParams): Promise<PresignedUrlResponse> {
  const response = await callApi<PresignedUrlResponse>('/upload', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  return response;
}

export async function uploadFileToS3(
  file: File,
  bucketType: 'meetup-posters' | 'profile-photos' = 'meetup-posters'
): Promise<string> {
  try {
    // Check if API endpoint is configured
    const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;
    if (!API_ENDPOINT) {
      throw new Error(
        'API endpoint not configured. Please set VITE_API_ENDPOINT in your .env.local file. ' +
        'For now, you can paste an image URL directly in the field.'
      );
    }

    // Get presigned URL
    const { presignedUrl, publicUrl } = await getPresignedUrl({
      fileName: file.name,
      contentType: file.type,
      bucketType,
    });

    // Upload file to S3 using presigned URL
    // Note: Don't set Content-Type header as it's handled by the presigned URL
    // Setting custom headers can cause CORS issues
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: file,
      // Don't set Content-Type header - let browser set it automatically
      // or let S3 infer it from the file
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    // Return public URL
    return publicUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}
