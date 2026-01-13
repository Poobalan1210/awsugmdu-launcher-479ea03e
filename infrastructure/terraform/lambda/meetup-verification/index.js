exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }
  
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    const { email, meetupProfileUrl } = body;
    
    if (!email || !meetupProfileUrl) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          isMember: false,
          isPending: false,
          error: 'Missing required fields: email, meetupProfileUrl',
        }),
      };
    }
    
    // TODO: Implement actual Meetup verification logic
    // This could involve:
    // 1. Scraping the Meetup profile URL
    // 2. Using Meetup API (if available)
    // 3. Checking against a list of verified members
    
    // For now, return pending status
    // In production, implement actual verification
    const isMember = await verifyMeetupMembership(meetupProfileUrl);
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        isMember,
        isPending: !isMember,
        meetupName: isMember ? 'AWS User Group Madurai' : null,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        isMember: false,
        isPending: false,
        error: error.message,
      }),
    };
  }
};

async function verifyMeetupMembership(url) {
  // Validate the URL contains the correct group ID
  // Group ID for AWS User Group Madurai: 36938462
  const GROUP_ID = '36938462';
  
  // Check if URL contains the group ID
  if (url && url.includes(`/group/${GROUP_ID}`)) {
    // URL format is correct and contains the right group ID
    // For now, we'll accept it as verified
    // In production, you could:
    // 1. Scrape the Meetup page to verify membership
    // 2. Use Meetup API (requires Pro subscription)
    // 3. Store for manual admin verification
    return true;
  }
  
  // URL doesn't match the expected group
  return false;
}
