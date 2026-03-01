import { callApi } from './api';

export type CommunityRole = 'member' | 'volunteer' | 'organiser' | 'champ' | 'cloud_club_captain' | 'speaker' | 'admin';

export interface UserRoleAssignment {
  id: string;
  userId: string;
  role: CommunityRole;
  assignedAt: string;
  assignedBy: string;
}

export interface AssignRoleData {
  userId: string;
  role: CommunityRole;
  assignedBy: string;
}

export interface UserRolesResponse {
  roles: UserRoleAssignment[];
}

export interface RoleResponse {
  role: UserRoleAssignment;
}

// Get all role assignments
export async function getAllUserRoles(): Promise<UserRoleAssignment[]> {
  const response = await callApi<UserRolesResponse>('/users/roles');
  return response.roles || [];
}

// Get roles for a specific user
export async function getUserRoles(userId: string): Promise<UserRoleAssignment[]> {
  const response = await callApi<UserRolesResponse>(`/users/${userId}/roles`);
  return response.roles || [];
}

// Assign a role to a user
export async function assignRole(data: AssignRoleData): Promise<UserRoleAssignment> {
  const response = await callApi<RoleResponse>('/users/roles', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.role;
}

// Remove a role from a user
export async function removeRole(roleId: string): Promise<void> {
  await callApi(`/users/roles/${roleId}`, {
    method: 'DELETE',
  });
}
