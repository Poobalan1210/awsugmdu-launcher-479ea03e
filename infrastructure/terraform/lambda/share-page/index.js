/**
 * Share Page Lambda
 * 
 * Serves dynamic HTML with Open Graph meta tags for LinkedIn/social sharing.
 * LinkedIn's crawler hits this URL, reads the OG tags, and renders a rich card.
 * Real users get redirected to the SPA.
 */

const SITE_URL = process.env.SITE_URL || 'https://awsugmdu.in';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSharePage({ title, description, image, url }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeHtml(image || DEFAULT_OG_IMAGE);
  const safeUrl = escapeHtml(url);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDesc}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:site_name" content="AWS User Group Madurai" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />

  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
</head>
<body>
  <p>Redirecting to <a href="${safeUrl}">${safeTitle}</a>...</p>
</body>
</html>`;
}

// Share type handlers
const SHARE_HANDLERS = {
  badge: (params) => ({
    title: `${params.user || 'A member'} earned "${params.name || 'a badge'}" - AWS UG Madurai`,
    description: params.desc || `Check out this achievement from AWS User Group Madurai!`,
    image: params.image || DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/profile${params.userId ? `/${params.userId}` : ''}`,
  }),

  leaderboard: (params) => ({
    title: `${params.user || 'A member'} is ranked #${params.rank || '?'} - AWS UG Madurai`,
    description: `Ranked #${params.rank || '?'} with ${params.points || 0} points on the AWS UG Madurai leaderboard!`,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/leaderboard`,
  }),

  meetup: (params) => ({
    title: `${params.name || 'Meetup'} - AWS UG Madurai`,
    description: params.desc || 'Join us at this AWS User Group Madurai meetup!',
    image: params.image || DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/meetups${params.id ? `/${params.id}` : ''}`,
  }),

  college: (params) => ({
    title: `${params.name || 'College'} - Rank #${params.rank || '?'} in College Champs`,
    description: `${params.name || 'A college'} is ranked #${params.rank || '?'} with ${params.points || 0} points in AWS UG College Champs!`,
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/college-champs`,
  }),

  certification: (params) => ({
    title: `${params.user || 'A member'} earned ${params.name || 'a certification'} - AWS UG Madurai`,
    description: params.desc || 'AWS certification achievement from AWS User Group Madurai!',
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/certifications`,
  }),

  sprint: (params) => ({
    title: `${params.user || 'A member'} completed "${params.name || 'a sprint'}" - AWS UG Madurai`,
    description: params.desc || 'Skill sprint completed at AWS User Group Madurai!',
    image: DEFAULT_OG_IMAGE,
    url: `${SITE_URL}/skill-sprint${params.id ? `/${params.id}` : ''}`,
  }),
};

function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
  };
}

exports.handler = async (event) => {
  console.log('Share page event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: getCorsHeaders(), body: '' };
  }

  const params = event.queryStringParameters || {};
  const shareType = params.type || 'default';
  const handler = SHARE_HANDLERS[shareType];

  let pageData;
  if (handler) {
    pageData = handler(params);
  } else {
    pageData = {
      title: 'AWS User Group Madurai',
      description: 'Join the AWS User Group Madurai community - meetups, certifications, skill sprints and more',
      image: DEFAULT_OG_IMAGE,
      url: SITE_URL,
    };
  }

  const html = buildSharePage(pageData);

  return {
    statusCode: 200,
    headers: {
      ...getCorsHeaders(),
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
    body: html,
  };
};
