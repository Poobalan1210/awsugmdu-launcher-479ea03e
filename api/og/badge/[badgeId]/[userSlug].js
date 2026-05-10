/**
 * Vercel Serverless Function — OG Proxy for badge sharing
 *
 * Route: GET /og/badge/:badgeId/:userSlug
 * Domain: https://www.awsugmdu.in/og/badge/b1/poobalan-p-6544
 *
 * Social crawlers (LinkedIn, Twitter, WhatsApp, Slack, Telegram) fetch this
 * URL and receive server-rendered HTML with correct OG meta tags.
 * Human visitors are immediately redirected to the React badge page.
 *
 * LinkedIn requires:
 *  - og:title, og:description, og:image, og:url
 *  - og:image must be a public HTTPS URL (not data URI, not localhost)
 *  - The URL must be on a trusted domain (not execute-api.amazonaws.com)
 */

const BASE_URL    = 'https://www.awsugmdu.in';
const API_BASE    = process.env.VITE_API_ENDPOINT || 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev';

// Badge definitions — mirrors src/data/mockData.ts
const BADGE_DEFINITIONS = {
  b1: { name: 'Sprint Champion',  description: 'Completed 5 skill sprints',        icon: '🏆' },
  b2: { name: 'First Submission', description: 'Made your first sprint submission', icon: '🚀' },
  b3: { name: 'AWS Certified',    description: 'Earned an AWS certification',       icon: '📜' },
  b4: { name: 'Community Helper', description: 'Helped 10 community members',       icon: '🤝' },
  b5: { name: 'Blog Writer',      description: 'Published 3 technical blogs',       icon: '✍️' },
  b6: { name: 'Early Adopter',    description: 'Joined in the first month',         icon: '⭐' },
  b7: { name: 'Speaker Star',     description: 'Delivered 3 sessions',              icon: '🎤' },
  b8: { name: 'Security Expert',  description: 'Completed Security Sprint',         icon: '🔒' },
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = async function handler(req, res) {
  const { badgeId, userSlug } = req.query;

  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) {
    res.status(404).send('Badge not found');
    return;
  }

  // Try to fetch the assertion from the API to get the recipient name + imageUrl
  let recipientName = null;
  let imageUrl = `${API_BASE}/ob2/badge-images/${badgeId}.svg`;

  // Derive a display name from the slug
  // slug format: "firstname-lastname-xxxx" — strip the 4-char hash suffix
  if (userSlug) {
    const parts = userSlug.split('-');
    if (parts.length >= 2) {
      const nameParts = parts.slice(0, -1);
      recipientName = nameParts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }

  const badgeName   = def.name;
  const earnerLabel = recipientName ? `${recipientName} earned ` : '';
  const title       = `${earnerLabel}${badgeName} | AWS UG Madurai`;
  const description = recipientName
    ? `${recipientName} was awarded the "${badgeName}" badge by AWS User Group Madurai. ${def.description}`
    : `"${badgeName}" — ${def.description} | Issued by AWS User Group Madurai`;

  // Canonical URL on our domain (what LinkedIn will show)
  const canonicalUrl = `${BASE_URL}/og/badge/${badgeId}/${userSlug}`;
  // Where humans land after the redirect
  const redirectUrl  = `${BASE_URL}/badges/${badgeId}/${userSlug}`;
  // Badge image — must be a public HTTPS URL, not a data URI
  const ogImage = `${API_BASE}/ob2/badge-images/${badgeId}.svg`;

  const t   = esc(title);
  const d   = esc(description);
  const img = esc(ogImage);
  const cu  = esc(canonicalUrl);
  const ru  = esc(redirectUrl);

  const html = `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
  <link rel="canonical" href="${cu}" />

  <!-- Open Graph — LinkedIn, Facebook, Slack, Telegram, iMessage -->
  <meta property="og:type"         content="profile" />
  <meta property="og:site_name"    content="AWS User Group Madurai" />
  <meta property="og:title"        content="${t}" />
  <meta property="og:description"  content="${d}" />
  <meta property="og:url"          content="${cu}" />
  <meta property="og:image"        content="${img}" />
  <meta property="og:image:width"  content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:image:type"   content="image/svg+xml" />
  <meta property="og:image:alt"    content="${t}" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img}" />

  <!-- Redirect humans to the React page immediately -->
  <meta http-equiv="refresh" content="0; url=${ru}" />
  <script>window.location.replace("${ru}");</script>
</head>
<body>
  <p>Redirecting to <a href="${ru}">${t}</a>…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(html);
};
