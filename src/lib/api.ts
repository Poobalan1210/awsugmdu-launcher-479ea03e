import { fetchAuthSession } from 'aws-amplify/auth';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT;

export interface ApiResponse<T = any> {
  success?: boolean;
  error?: string;
  data?: T;
}

export async function callApi<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  if (!API_ENDPOINT) {
    throw new Error('API endpoint not configured. Please check your .env.local file.');
  }

  try {
    let token: string | undefined;
    try {
      const session = await fetchAuthSession();
      token = session.tokens?.idToken?.toString();
    } catch (authError) {
      // If auth session fetch fails, continue without token
      // Some endpoints might not require auth (like user creation during signup)
      console.warn('Could not fetch auth session, proceeding without token:', authError);
    }

    const url = `${API_ENDPOINT}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorData.error || errorMessage;
      } catch {
        // If JSON parsing fails, use status text
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('API call failed:', error);
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Failed to fetch. Please check your internet connection and API endpoint configuration.');
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred');
  }
}
