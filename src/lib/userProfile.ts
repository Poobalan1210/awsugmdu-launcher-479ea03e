import { callApi } from './api';
import { User } from '@/data/mockData';
import { isOrganiserEmail } from './adminUtils';

export interface CreateUserProfileData {
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  bio?: string;
  // Optional: a profile recovered at sign-in (see AuthContext) has no signup
  // answers yet. The edit-profile dialog infers it until the member picks one.
  userType?: 'student' | 'professional';
  meetupEmail?: string;
  collegeName?: string;
  collegeCity?: string;
  isCollegeChamp?: boolean;
  champCollegeId?: string;
  isCloudClub?: boolean;
  cloudClubId?: string;
  designation?: string;
  companyName?: string;
  companyCity?: string;
  country?: string;
  linkedIn?: string;
  github?: string;
  twitter?: string;
  meetupVerified?: boolean;
  meetupVerificationStatus?: string;
  hideFromLeaderboard?: boolean;
}

// User IDs whose profile row this browser tab has created or is creating.
// POST /users overwrites an existing row, so AuthContext checks this before
// recovering a "missing" profile: the 404 may only be a read lagging the signup
// write (DynamoDB reads are eventually consistent), and a second POST would
// replace the full signup profile with a bare one.
const profilesCreatedThisSession = new Set<string>();

export async function createUserProfile(
  data: CreateUserProfileData
): Promise<{ success: boolean; userId: string; user?: User }> {
  // Recorded before the request so a concurrent recovery in this tab backs off
  // while the write is in flight; cleared again if the write fails.
  profilesCreatedThisSession.add(data.userId);
  try {
    return await callApi('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch (error) {
    profilesCreatedThisSession.delete(data.userId);
    throw error;
  }
}

export function hasCreatedProfileThisSession(userId: string): boolean {
  return profilesCreatedThisSession.has(userId);
}

export async function getUserProfile(userId: string): Promise<User> {
  return callApi(`/users/${userId}`, {
    method: 'GET',
  });
}

export async function updateUserProfile(userId: string, data: Partial<CreateUserProfileData>): Promise<{ success: boolean; user: User }> {
  return callApi(`/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function getAllUsers(): Promise<User[]> {
  const response = await callApi('/users', {
    method: 'GET',
  });
  
  let users: any[] = [];
  
  // Handle different response formats
  if (Array.isArray(response)) {
    users = response;
  } else if (response && Array.isArray(response.data)) {
    users = response.data;
  } else if (response && Array.isArray(response.users)) {
    users = response.users;
  } else {
    console.error('Unexpected API response format:', response);
    return [];
  }
  
  // Map userId to id for compatibility with frontend User interface
  return users.map(user => ({
    ...user,
    id: user.userId || user.id, // Use userId if available, fallback to id
    avatar: user.avatar || user.profilePicture, // Also handle avatar/profilePicture
    // Support legacy verification status (older users with signup bonus)
    meetupVerified: !!user.meetupVerified || 
                    user.meetupVerificationStatus === 'approved' || 
                    (user.pointActivities && user.pointActivities.some(pa => 
                      pa.type === 'signup' || 
                      pa.type === 'meetup_verification' ||
                      pa.reason?.toLowerCase().includes('meetup')
                    )) || 
                    isOrganiserEmail(user.email)
  }));
}
export async function deleteUserProfile(userId: string): Promise<{ success: boolean; message: string }> {
  return callApi(`/users/${userId}`, {
    method: 'DELETE',
  });
}
