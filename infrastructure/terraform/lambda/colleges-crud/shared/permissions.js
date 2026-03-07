// Permission definitions for role-based access control

const PERMISSIONS = {
  // Admin has full access
  admin: {
    colleges: ['read', 'create', 'update', 'delete'],
    tasks: ['read', 'create', 'update', 'delete', 'assign'],
    submissions: ['read', 'submit', 'review'],
    events: ['read', 'create', 'update', 'delete'],
    members: ['read', 'add', 'remove'],
    roles: ['read', 'assign', 'remove'],
    points: ['read', 'award', 'update'],
    meetups: ['read', 'create', 'update', 'delete'],
    users: ['read', 'create', 'update', 'delete'],
  },
  
  // Volunteer has admin-level permissions (as requested)
  volunteer: {
    colleges: ['read', 'create', 'update', 'delete'],
    tasks: ['read', 'create', 'update', 'delete', 'assign'],
    submissions: ['read', 'submit', 'review'],
    events: ['read', 'create', 'update', 'delete'],
    members: ['read', 'add', 'remove'],
    roles: ['read', 'assign', 'remove'],
    points: ['read', 'award', 'update'],
    meetups: ['read', 'create', 'update', 'delete'],
    users: ['read', 'create', 'update', 'delete'],
  },
  
  // Champ Lead can only submit tasks
  champ: {
    colleges: ['read'],
    tasks: ['read'],
    submissions: ['read', 'submit'],
    events: ['read'],
    members: ['read'],
    roles: [],
    points: ['read'],
    meetups: ['read'],
    users: ['read'],
  },
};

// Resource to permission mapping
const RESOURCE_PERMISSIONS = {
  // Colleges endpoints
  'GET /colleges': { resource: 'colleges', action: 'read' },
  'GET /colleges/{id}': { resource: 'colleges', action: 'read' },
  'POST /colleges': { resource: 'colleges', action: 'create' },
  'PUT /colleges/{id}': { resource: 'colleges', action: 'update' },
  'DELETE /colleges/{id}': { resource: 'colleges', action: 'delete' },
  
  // Tasks endpoints
  'GET /colleges/tasks': { resource: 'tasks', action: 'read' },
  'POST /colleges/tasks': { resource: 'tasks', action: 'create' },
  'PUT /colleges/tasks/{taskId}': { resource: 'tasks', action: 'update' },
  'DELETE /colleges/tasks/{taskId}': { resource: 'tasks', action: 'delete' },
  'POST /colleges/{id}/assign-tasks': { resource: 'tasks', action: 'assign' },
  'POST /colleges/{id}/tasks': { resource: 'tasks', action: 'update' },
  'PUT /colleges/{id}/tasks/{taskId}': { resource: 'tasks', action: 'update' },
  'DELETE /colleges/{id}/tasks/{taskId}': { resource: 'tasks', action: 'delete' },
  
  // Submissions endpoints
  'POST /colleges/{id}/tasks/{taskId}/submit': { resource: 'submissions', action: 'submit' },
  'GET /colleges/submissions': { resource: 'submissions', action: 'read' },
  'POST /colleges/submissions/{submissionId}/review': { resource: 'submissions', action: 'review' },
  
  // Events endpoints
  'POST /colleges/{id}/events': { resource: 'events', action: 'create' },
  
  // Members endpoints
  'POST /colleges/{id}/members': { resource: 'members', action: 'add' },
  'DELETE /colleges/{id}/members': { resource: 'members', action: 'remove' },
  
  // Roles endpoints
  'GET /users/roles': { resource: 'roles', action: 'read' },
  'GET /users/{userId}/roles': { resource: 'roles', action: 'read' },
  'POST /users/roles': { resource: 'roles', action: 'assign' },
  'DELETE /users/roles/{roleId}': { resource: 'roles', action: 'remove' },
  
  // Points endpoints
  'GET /points': { resource: 'points', action: 'read' },
  'POST /points': { resource: 'points', action: 'award' },
  'PUT /points/{id}': { resource: 'points', action: 'update' },
  
  // Meetups endpoints
  'GET /meetups': { resource: 'meetups', action: 'read' },
  'POST /meetups': { resource: 'meetups', action: 'create' },
  'PUT /meetups/{id}': { resource: 'meetups', action: 'update' },
  'DELETE /meetups/{id}': { resource: 'meetups', action: 'delete' },
  
  // Users endpoints
  'GET /users': { resource: 'users', action: 'read' },
  'GET /users/{userId}': { resource: 'users', action: 'read' },
  'POST /users': { resource: 'users', action: 'create' },
  'PUT /users/{userId}': { resource: 'users', action: 'update' },
  'DELETE /users/{userId}': { resource: 'users', action: 'delete' },
};

module.exports = {
  PERMISSIONS,
  RESOURCE_PERMISSIONS,
};
