/**
 * OG Proxy handler — called by the badges Lambda for /og/badge/* requests.
 *
 * Social crawlers (LinkedIn, Twitter, WhatsApp, Telegram, iMessage, Slack)
 * cannot execute JavaScript, so they see the empty React SPA shell.
 * This endpoint returns a minimal HTML page with correct OG meta tags
 * baked into the server response, then redirects human visitors to the
 * real React badge page via a <meta http-equiv="refresh"> tag.
 *
 * URL pattern:  GET /og/badge/{badgeId}/{userSlug}
 *
 * LinkedIn crawler user-agent: "LinkedInBot"
 * Twitter crawler:             "Twitterbot"
 * WhatsApp:                    "WhatsApp"
 * Telegram:                    "TelegramBot"
 * Slack:                       "Slackbot"
 * Facebook:                    "facebookexternalhit"
 */

'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const db = DynamoDBDocumentClient.from(client);

const ASSERTIONS_TABLE = process.env.ASSERTIONS_TABLE || 'awsug-ob2-assertions';
const BASE_URL         = process.env.BASE_URL         || 'https://www.awsugmdu.in';

// Mirror of the badge definitions in index.js
const BADGE_DEFINITIONS = {
  b1: { name: 'Sprint Champion',  description: 'Completed 5 skill sprints',         icon: '🏆' },
  b2: { name: 'First Submission', description: 'Made your first sprint submission',  icon: '🚀' },
  b3: { name: 'AWS Certified',    description: 'Earned an AWS certification',        icon: '📜' },
  b4: { name: 'Community Helper', description: 'Helped 10 community members',        icon: '🤝' },
  b5: { name: 'Blog Writer',      description: 'Published 3 technical blogs',        icon: '✍️' },
  b6: { name: 'Early Adopter',    description: 'Joined in the first month',          icon: '⭐' },
  b7: { name: 'Speaker Star',     description: 'Delivered 3 sessions',               icon: '🎤' },
  b8: { name: 'Security Expert',  description: 'Completed Security Sprint',          icon: '🔒' },
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the OG proxy HTML page.
 *
 * @param {object} opts
 * @param {string} opts.title        - og:title
 * @param {string} opts.description  - og:description
 * @param {string} opts.imageUrl     - og:image (must be a public https URL)
 * @param {string} opts.canonicalUrl - og:url + canonical link
 * @param {string} opts.redirectUrl  - where to send human visitors
 * @param {string} opts.siteName
 */
function buildOgHtml({ title, description, imageUrl, canonicalUrl, redirectUrl, siteName }) {
  const t  = esc(title);
  const d  = esc(description);
  const img = esc(imageUrl);
  const url = esc(canonicalUrl);
  const redir = esc(redirectUrl);
  const site = esc(siteName);

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>

  <!-- Canonical -->
  <link rel="canonical" href="${url}" />

  <!-- Open Graph (LinkedIn, Facebook, Slack, Telegram, iMessage) -->
  <meta property="og:type"        content="profile" />
  <meta property="og:site_name"   content="${site}" />
  <meta property="og:title"       content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url"         content="${url}" />
  <meta property="og:image"       content="${img}" />
  <meta property="og:image:width"  content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:image:alt"   content="${t}" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img}" />

  <!-- Redirect human visitors to the real React page immediately -->
  <meta http-equiv="refresh" content="0; url=${redir}" />
  <script>window.location.replace("${redir}");</script>
</head>
<body>
  <p>Redirecting to <a href="${redir}">${t}</a>…</p>
</body>
</html>`;
}

/**
 * Handle GET /og/badge/{badgeId}/{userSlug}
 */
async function handleOgBadge(badgeId, userSlug) {
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Badge not found',
    };
  }

  // Try to get the recipient name and imageUrl from the assertions table
  let recipientName = null;
  let imageUrl = `${BASE_URL}/ob2/badge-images/${badgeId}.svg`;

  try {
    // Query by userId index — userSlug is stored in the assertion record
    const scan = await db.send(new QueryCommand({
      TableName: ASSERTIONS_TABLE,
      IndexName: 'userId-index',
      FilterExpression: 'userSlug = :slug',
      KeyConditionExpression: 'userId = :uid',
      // We don't have userId here, so scan for the slug instead
      ExpressionAttributeValues: { ':slug': userSlug },
      // Fall back to a scan with filter if the above fails
    })).catch(() => null);

    // Simpler: scan with filter on userSlug (small table, acceptable)
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const result = await db.send(new ScanCommand({
      TableName: ASSERTIONS_TABLE,
      FilterExpression: 'badgeId = :bid AND userSlug = :slug',
      ExpressionAttributeValues: { ':bid': badgeId, ':slug': userSlug },
      Limit: 1,
    }));

    if (result.Items && result.Items.length > 0) {
      const record = result.Items[0];
      recipientName = record.recipientName;
      if (record.imageUrl) imageUrl = record.imageUrl;
    }
  } catch (e) {
    console.warn('OG proxy: could not fetch assertion record:', e.message);
  }

  const badgeName    = def.name;
  const earnerLabel  = recipientName ? `${recipientName} earned ` : '';
  const title        = `${earnerLabel}${badgeName} | AWS UG Madurai`;
  const description  = recipientName
    ? `${recipientName} was awarded the "${badgeName}" badge by AWS User Group Madurai. ${def.description}`
    : `"${badgeName}" — ${def.description} | Issued by AWS User Group Madurai`;

  const canonicalUrl = `${BASE_URL}/og/badge/${badgeId}/${userSlug}`;
  const redirectUrl  = `${BASE_URL}/badges/${badgeId}/${userSlug}`;

  const html = buildOgHtml({
    title,
    description,
    imageUrl,
    canonicalUrl,
    redirectUrl,
    siteName: 'AWS User Group Madurai',
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache for 1 hour — long enough for crawlers, short enough to pick up updates
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    },
    body: html,
  };
}

module.exports = { handleOgBadge };
