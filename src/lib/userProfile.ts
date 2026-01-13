import { callApi } from './api';
import { User } from '@/data/mockData';

export interface CreateUserProfileData {
  userId: string;
  email: string;
  name: string;
  avatar?: string;
  userType: 'student' | 'professional';
  meetupEmail?: string;
  collegeName?: string;
  collegeCity?: string;
  isCollegeChamp?: boolean;
  champCollegeId?: string;
  designation?: string;
  companyName?: string;
  companyCity?: string;
  country?: string;
  linkedIn?: string;
  github?: string;
  twitter?: string;
}

export async function createUserProfile(data: CreateUserProfileData): Promise<{ success: boolean; userId: string }> {
  return callApi('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getUserProfile(userId: string): Promise<User> {
  // For now, this would need a GET endpoint
  // You can implement this later or fetch from DynamoDB directly
  throw new Error('getUserProfile not yet implemented - needs GET /users/:userId endpoint');
}

export async function updateUserProfile(userId: string, data: Partial<CreateUserProfileData>): Promise<User> {
  // For now, this would need a PUT/PATCH endpoint
  throw new Error('updateUserProfile not yet implemented - needs PUT /users/:userId endpoint');
}
