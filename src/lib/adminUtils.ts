/**
 * Admin utilities for checking admin status
 */

/**
 * Check if an email is an organiser email (admin access)
 */
export const isOrganiserEmail = (email: string): boolean => {
  const organiserEmails = import.meta.env.VITE_ADMIN_EMAILS?.split(',').map((e: string) => e.trim()) || [];
  return organiserEmails.includes(email);
};

/**
 * Get list of organiser emails
 */
export const getOrganiserEmails = (): string[] => {
  return import.meta.env.VITE_ADMIN_EMAILS?.split(',').map((e: string) => e.trim()) || [];
};

// Legacy alias for backward compatibility
export const isAdminEmail = isOrganiserEmail;
export const getAdminEmails = getOrganiserEmails;
