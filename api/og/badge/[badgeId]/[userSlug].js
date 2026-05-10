/**
 * Vercel Serverless Function — OG Proxy for badge sharing
 *
 * Route: GET /og/badge/:badgeId/:userSlug[?img=<encodedS3Url>]
 * e.g.:  https://www.awsugmdu.in/og/badge/b-123/poobalan-p-6544?img=https%3A%2F%2F...
 *
 * Returns server-rendered HTML with correct OG meta tags so LinkedIn,
 * Twitter, WhatsApp, Slack, and Telegram show a rich preview card.
 * Human visitors are immediately redirected to the React badge page.
 *
 * og:image priority:
 *   1. ?img= query param  → the S3 URL of the uploaded badge image (set by frontend)
 *   2. fallback PNG       → generated with canvas (amber ring + gold star)
 */

import { createCanvas } from '@napi-rs/canvas';
import https from 'https';

const BASE_URL = 'https://www.awsugmdu.in';
const API_BASE = process.env.VITE_API_ENDPOINT
  || 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev';

// Fallback badge definitions — used when the badge ID is not in the API
const BADGE_DEFINITIONS = {
  b1: { name: 'Sprint Champion',  description: 'Completed 5 skill sprints'        },
  b2: { name: 'First Submission', description: 'Made your first sprint submission' },
  b3: { name: 'AWS Certified',    description: 'Earned an AWS certification'       },
  b4: { name: 'Community Helper', description: 'Helped 10 community members'       },
  b5: { name: 'Blog Writer',      description: 'Published 3 technical blogs'       },
  b6: { name: 'Early Adopter',    description: 'Joined in the first month'         },
  b7: { name: 'Speaker Star',     description: 'Delivered 3 sessions'              },
  b8: { name: 'Security Expert',  description: 'Completed Security Sprint'         },
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Fetch JSON from a URL with a 3 s timeout. Returns null on any error. */
function fetchJson(url) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 3000);
    https.get(url, { headers: { Accept: 'application/json' } }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        clearTimeout(timer);
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

/**
 * Generate a 400×400 fallback PNG badge image.
 * Used only when no uploaded image URL is available.
 * Draws a geometric gold star inside the amber ring — no emoji, no external fonts.
 */
function generateFallbackPng(badgeName) {
  const size = 400;
  const cx = size / 2;
  const cy = size / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createRadialGradient(cx, cy, 60, cx, cy, 220);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Outer amber glow ring
  ctx.beginPath();
  ctx.arc(cx, cy, 178, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9900';
  ctx.lineWidth = 14;
  ctx.shadowColor = '#FF9900';
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Inner dashed ring
  ctx.beginPath();
  ctx.arc(cx, cy, 158, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,153,0,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6-pointed gold star
  const starR1 = 52, starR2 = 26, pts = 6;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const angle = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? starR1 : starR2;
    const x = cx + r * Math.cos(angle);
    const y = (cy - 28) + r * Math.sin(angle);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(cx - starR1, cy - 28 - starR1, cx + starR1, cy - 28 + starR1);
  sg.addColorStop(0, '#FFD700');
  sg.addColorStop(1, '#FF9900');
  ctx.fillStyle = sg;
  ctx.shadowColor = '#FF9900';
  ctx.shadowBlur = 12;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Badge name (word-wrapped)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 30px sans-serif';

  const words = badgeName.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > 270) {
      if (line) lines.push(line);
      line = word;
    } else { line = test; }
  }
  if (line) lines.push(line);

  const lineH = 36;
  const nameStartY = cy + 46;
  lines.forEach((l, i) => ctx.fillText(l, cx, nameStartY + i * lineH));

  // Issuer label
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = 'rgba(255,153,0,0.75)';
  ctx.fillText('AWS USER GROUP MADURAI', cx, size - 20);

  return canvas.toBuffer('image/png');
}

export default async function handler(req, res) {
  // The route can be:
  //   /og/badge/:badgeId/:userSlug           (legacy)
  //   /og/badge/:badgeId/:userSlug/:version  (new — version in path for LinkedIn cache-busting)
  // Vercel passes path params via req.query for [badgeId] and [userSlug].
  // The :version segment is captured by the rewrite but not as a named param,
  // so we read it from the raw URL path if needed.
  const { badgeId, userSlug, img, name, desc } = req.query;

  // ── Resolve badge name & description ──────────────────────────────────────
  // Prefer params passed from the frontend (always accurate, no API call needed).
  // Fall back to hardcoded list, then API for anything else.
  let badgeName        = name || BADGE_DEFINITIONS[badgeId]?.name        || 'Badge';
  let badgeDescription = desc || BADGE_DEFINITIONS[badgeId]?.description || '';

  // Only call the API if we still don't have a name (dynamic badge, no params)
  if (!name && !BADGE_DEFINITIONS[badgeId]) {
    try {
      const badgeClass = await fetchJson(`${API_BASE}/ob2/badges/${badgeId}.json`);
      if (badgeClass?.name)        badgeName        = badgeClass.name;
      if (badgeClass?.description) badgeDescription = badgeClass.description;
    } catch { /* API unreachable — use fallback */ }
  }

  // ── Resolve recipient name from slug ──────────────────────────────────────
  // Slug format: "firstname-lastname-xxxx" — strip the 4-char hash suffix
  let recipientName = null;
  if (userSlug) {
    const parts = userSlug.split('-');
    if (parts.length >= 2) {
      recipientName = parts.slice(0, -1)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }

  // ── Resolve og:image ──────────────────────────────────────────────────────
  // ?img= is the S3 URL of the uploaded badge image, encoded by the frontend.
  // When present, use it directly — LinkedIn fetches it from S3.
  // When absent, serve a generated fallback PNG from this function.
  const uploadedImageUrl = img || null;

  // The fallback PNG URL — served by this same function without ?img=
  const fallbackPngUrl = `${BASE_URL}/og/badge/${badgeId}/image.png`;

  // og:image is the uploaded S3 URL when available, otherwise the fallback PNG
  const ogImage = uploadedImageUrl || fallbackPngUrl;

  // ── Handle /og/badge/:badgeId/image.png ───────────────────────────────────
  // This sub-path serves the fallback PNG for badges without an uploaded image.
  // It is only reached when og:image points to fallbackPngUrl (no ?img= param).
  if (userSlug === 'image.png') {
    try {
      const png = generateFallbackPng(badgeName);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.status(200).send(png);
    } catch (e) {
      console.error('Fallback PNG generation failed:', e);
      res.redirect(302, `${BASE_URL}/og-image.png`);
    }
    return;
  }

  // ── Build OG HTML page ────────────────────────────────────────────────────
  const title = recipientName
    ? `${recipientName} earned ${badgeName} | AWS UG Madurai`
    : `${badgeName} | AWS UG Madurai`;

  const description = recipientName
    ? `${recipientName} was awarded the "${badgeName}" badge by AWS User Group Madurai. ${badgeDescription}`
    : `"${badgeName}" — ${badgeDescription} | Issued by AWS User Group Madurai`;

  const canonicalUrl = `${BASE_URL}/og/badge/${badgeId}/${userSlug}`;
  const redirectUrl  = `${BASE_URL}/badges/${badgeId}/${userSlug}`;

  // Detect image type from URL extension
  const imageExt = (uploadedImageUrl || '').split('?')[0].split('.').pop()?.toLowerCase();
  const imageType = imageExt === 'jpg' || imageExt === 'jpeg' ? 'image/jpeg'
    : imageExt === 'svg' ? 'image/svg+xml'
    : imageExt === 'webp' ? 'image/webp'
    : 'image/png';

  const t   = esc(title);
  const d   = esc(description);
  const img_ = esc(ogImage);
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
  <meta property="og:image"        content="${img_}" />
  <meta property="og:image:width"  content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:image:type"   content="${imageType}" />
  <meta property="og:image:alt"    content="${t}" />

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img_}" />

  <!-- Redirect humans to the React badge page immediately -->
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
}
