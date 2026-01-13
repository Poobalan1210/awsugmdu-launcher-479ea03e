/**
 * Meetup API integration for verifying user membership
 * 
 * This module handles verification of whether a user is a member of
 * AWS User Group Madurai on Meetup.
 * 
 * Since Meetup OAuth requires a Pro subscription, this implementation
 * uses URL-based verification where users provide their membership details URL.
 * The URL format is: https://www.meetup.com/members/{user_id}/group/{group_id}/
 * 
 * We verify membership by checking if the URL contains the correct group ID,
 * which is common for all members of the same group.
 */

// Update this with your actual Meetup group URL name
// Example: If your Meetup URL is https://www.meetup.com/aws-user-group-madurai/
// Then set this to 'aws-user-group-madurai' (lowercase, hyphens instead of spaces)
const MEETUP_GROUP_URLNAME = 'AWS-User-Group-Madurai';

// Update this with your Meetup group ID
// You can find this in the membership details URL: https://www.meetup.com/members/{user_id}/group/{group_id}/
// The group_id part (e.g., 36938462) is what we use to verify membership
const MEETUP_GROUP_ID = '36938462'; // Update with your actual group ID
const MEETUP_API_BASE_URL = 'https://api.meetup.com';

export interface MeetupVerificationResult {
  isMember: boolean;
  isPending?: boolean;
  meetupName?: string;
  meetupId?: string;
  meetupProfileUrl?: string;
  error?: string;
}

export interface MeetupVerificationRequest {
  email: string;
  meetupProfileUrl: string;
}

/**
 * Submit Meetup membership details URL for verification
 * 
 * Since Meetup OAuth requires Pro subscription, users provide their
 * membership details URL from the AWS User Group Madurai page.
 * The URL format should be: https://www.meetup.com/members/{user_id}/group/{group_id}/
 * 
 * @param email - User's email address
 * @param meetupMembershipUrl - User's Meetup membership details URL for the group
 * @returns Promise with verification result
 */
export async function submitMeetupVerification(
  email: string,
  meetupMembershipUrl: string
): Promise<MeetupVerificationResult> {
  try {
    // Normalize the URL
    const normalizedUrl = normalizeMeetupProfileUrl(meetupMembershipUrl);
    
    // Validate Meetup membership URL format
    if (!isValidMeetupMembershipUrl(normalizedUrl)) {
      return {
        isMember: false,
        isPending: false,
        error: `Please provide a valid Meetup membership details URL. The URL should be from your membership details page for AWS User Group Madurai (format: https://www.meetup.com/members/.../group/.../)`,
      };
    }

    // Verify the URL contains the correct group ID
    // Accept both formats: /group/{id}/ and /group/{id} (with or without trailing slash)
    const groupIdPattern = `/group/${MEETUP_GROUP_ID}`;
    if (!normalizedUrl.includes(groupIdPattern)) {
      return {
        isMember: false,
        isPending: false,
        error: `The URL you provided is not for AWS User Group Madurai. Please make sure you're copying the membership details URL from the correct group. Expected group ID: ${MEETUP_GROUP_ID}`,
      };
    }

    // Simple frontend validation - if group ID matches, approve
    // No Lambda API call needed for this simple validation
    return {
      isMember: true, // Auto-approved since group ID matches
      isPending: false,
      meetupName: 'AWS User Group Madurai',
      meetupProfileUrl: normalizedUrl,
      error: undefined,
    };
  } catch (error) {
    return {
      isMember: false,
      isPending: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Validate Meetup membership details URL format
 * Expected format: https://www.meetup.com/members/{user_id}/group/{group_id}/
 */
function isValidMeetupMembershipUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // Must be meetup.com
    if (!urlObj.hostname.includes('meetup.com')) {
      return false;
    }
    // Must contain /members/ and /group/ in the path
    return urlObj.pathname.includes('/members/') && urlObj.pathname.includes('/group/');
  } catch {
    return false;
  }
}

/**
 * Normalize Meetup membership URL
 * Ensures URL is properly formatted with https://
 */
export function normalizeMeetupProfileUrl(input: string): string {
  // Remove any whitespace
  input = input.trim();
  
  // If it's already a full URL, return as is
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return input;
  }
  
  // If it starts with //, add https:
  if (input.startsWith('//')) {
    return `https:${input}`;
  }
  
  // If it starts with /, prepend the domain
  if (input.startsWith('/')) {
    return `https://www.meetup.com${input}`;
  }
  
  // Otherwise, assume it's a partial URL and prepend https://www.meetup.com/
  return `https://www.meetup.com/${input}`;
}

/**
 * Get Meetup OAuth authorization URL
 * This redirects users to Meetup to authorize your app
 */
export function getMeetupOAuthUrl(): string {
  const clientId = import.meta.env.VITE_MEETUP_CLIENT_ID;
  const redirectUri = `${window.location.origin}/signup?meetup_callback=true`;
  
  if (!clientId) {
    throw new Error('Meetup OAuth client ID not configured');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
  });

  return `https://secure.meetup.com/oauth2/authorize?${params.toString()}`;
}

/**
 * Get pending Meetup verifications (for admin use)
 * In production, this should fetch from your backend
 */
export function getPendingMeetupVerifications(): MeetupVerificationRequest[] {
  try {
    const pending = localStorage.getItem('pendingMeetupVerifications');
    return pending ? JSON.parse(pending) : [];
  } catch {
    return [];
  }
}

/**
 * Approve Meetup verification (for admin use)
 * In production, this should update your backend
 */
export function approveMeetupVerification(email: string): void {
  try {
    const pending = getPendingMeetupVerifications();
    const updated = pending.filter(v => v.email !== email);
    localStorage.setItem('pendingMeetupVerifications', JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to approve verification:', error);
  }
}

/**
 * Get the Meetup group URL for AWS User Group Madurai
 */
export function getMeetupGroupUrl(): string {
  return `https://www.meetup.com/${MEETUP_GROUP_URLNAME}/`;
}
