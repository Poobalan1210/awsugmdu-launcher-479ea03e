/**
 * Vercel Serverless Function — OG Proxy for badge sharing
 *
 * Route:  GET /og/badge/:badgeId/:userSlug
 * URL:    https://www.awsugmdu.in/og/badge/b1/poobalan-p-6544
 *
 * Returns server-rendered HTML with OG meta tags so LinkedIn/Twitter/WhatsApp
 * show a rich preview card. Human visitors are redirected to the React page.
 *
 * Also serves the badge image at:
 *   GET /og/badge/:badgeId/image.png  → inline PNG (for og:image)
 */

import { createCanvas } from '@napi-rs/canvas';

const BASE_URL = 'https://www.awsugmdu.in';

// Badge definitions — keep in sync with src/data/mockData.ts
const BADGE_DEFINITIONS = {
  b1: { name: 'Sprint Champion',  description: 'Completed 5 skill sprints',        color: '#FF9900' },
  b2: { name: 'First Submission', description: 'Made your first sprint submission', color: '#FF9900' },
  b3: { name: 'AWS Certified',    description: 'Earned an AWS certification',       color: '#FF9900' },
  b4: { name: 'Community Helper', description: 'Helped 10 community members',       color: '#FF9900' },
  b5: { name: 'Blog Writer',      description: 'Published 3 technical blogs',       color: '#FF9900' },
  b6: { name: 'Early Adopter',    description: 'Joined in the first month',         color: '#FF9900' },
  b7: { name: 'Speaker Star',     description: 'Delivered 3 sessions',              color: '#FF9900' },
  b8: { name: 'Security Expert',  description: 'Completed Security Sprint',         color: '#FF9900' },
};

const BADGE_ICONS = {
  b1: '🏆', b2: '🚀', b3: '📜', b4: '🤝',
  b5: '✍️', b6: '⭐', b7: '🎤', b8: '🔒',
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Generate a 400×400 PNG badge image using canvas.
 * Returns a Buffer.
 */
function generateBadgePng(badgeId, badgeName, recipientName) {
  const size = 400;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, size, size);

  // Outer amber ring
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 185, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9900';
  ctx.lineWidth = 12;
  ctx.stroke();

  // Inner ring (dashed effect — draw segments)
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 168, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9900';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Emoji icon
  ctx.font = '100px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BADGE_ICONS[badgeId] || '🏅', size / 2, size / 2 - 40);

  // Badge name
  ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // Word-wrap badge name
  const words = badgeName.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > 260) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineHeight = 34;
  const startY = size / 2 + 60;
  lines.forEach((l, i) => {
    ctx.fillText(l, size / 2, startY + i * lineHeight);
  });

  // Recipient name (smaller, amber)
  if (recipientName) {
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#FF9900';
    ctx.fillText(recipientName, size / 2, startY + lines.length * lineHeight + 16);
  }

  // Issuer label
  ctx.font = '14px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#FF9900';
  ctx.letterSpacing = '2px';
  ctx.fillText('AWS UG MADURAI', size / 2, size - 28);

  return canvas.toBuffer('image/png');
}

export default async function handler(req, res) {
  const { badgeId, userSlug } = req.query;

  // ── Serve badge PNG image ──────────────────────────────────────────────────
  if (userSlug === 'image.png') {
    const def = BADGE_DEFINITIONS[badgeId];
    if (!def) { res.status(404).send('Not found'); return; }
    try {
      const png = generateBadgePng(badgeId, def.name, null);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200).send(png);
    } catch (e) {
      // @napi-rs/canvas not available — fall back to a redirect to a placeholder
      res.redirect(302, `${BASE_URL}/og-image.png`);
    }
    return;
  }

  // ── Serve OG HTML page ─────────────────────────────────────────────────────
  const def = BADGE_DEFINITIONS[badgeId];
  if (!def) { res.status(404).send('Badge not found'); return; }

  // Derive recipient name from slug: "poobalan-p-6544" → "Poobalan P"
  let recipientName = null;
  if (userSlug) {
    const parts = userSlug.split('-');
    if (parts.length >= 2) {
      recipientName = parts.slice(0, -1)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }

  const title = recipientName
    ? `${recipientName} earned ${def.name} | AWS UG Madurai`
    : `${def.name} | AWS UG Madurai`;

  const description = recipientName
    ? `${recipientName} was awarded the "${def.name}" badge by AWS User Group Madurai. ${def.description}`
    : `"${def.name}" — ${def.description} | Issued by AWS User Group Madurai`;

  // og:image — served from this same function at /og/badge/{id}/image.png
  const ogImage     = `${BASE_URL}/og/badge/${badgeId}/image.png`;
  const canonicalUrl = `${BASE_URL}/og/badge/${badgeId}/${userSlug}`;
  const redirectUrl  = `${BASE_URL}/badges/${badgeId}/${userSlug}`;

  const t  = esc(title);
  const d  = esc(description);
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
  <meta property="og:image:type"   content="image/png" />
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
