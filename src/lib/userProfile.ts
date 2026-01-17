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
