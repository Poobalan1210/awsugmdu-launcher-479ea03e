/**
 * Admin utilities for Lambda functions
 */

/**
 * Check if an email is an organiser email (admin access)
 * @param {string} email - Email to check
 * @returns {boolean} - True if email is organiser
 */
function isOrganiserEmail(email) {
  const organiserEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);
  
  return organiserEmails.includes(email);
}

/**
 * Get list of organiser emails
 * @returns {string[]} - Array of organiser emails
 */
function getOrganiserEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(e => e.length > 0);
}

// Legacy aliases for backward compatibility
const isAdminEmail = isOrganiserEmail;
const getAdminEmails = getOrganiserEmails;

module.exports = {
  isOrganiserEmail,
  getOrganiserEmails,
  isAdminEmail,
  getAdminEmails,
};
