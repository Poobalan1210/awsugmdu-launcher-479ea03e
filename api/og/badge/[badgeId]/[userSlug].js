/**
 * Vercel Serverless Function — OG Proxy for badge sharing
 *
 * Route:  GET /og/badge/:badgeId/:userSlug
 * URL:    https://www.awsugmdu.in/og/badge/b1/poobalan-p-6544
 *
 * Flow:
 *  1. Fetch the badge's uploaded imageUrl from the API (badges Lambda)
 *  2. If imageUrl exists → use it directly as og:image
 *  3. If not → generate a fallback PNG with canvas
 *
 * Human visitors are redirected to the React badge page immediately.
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import https from 'https';

const BASE_URL = 'https://www.awsugmdu.in';
const API_BASE = process.env.VITE_API_ENDPOINT
  || 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev';

// Fallback badge definitions (used when API is unreachable)
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

/** Fetch JSON from a URL with a timeout, returns null on any error */
function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
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
 * Generate a 400×400 PNG using the badge's uploaded image.
 * Draws the image inside the amber ring with the badge name and recipient below.
 */
async function generateBadgePngWithImage(imageUrl, badgeName, recipientName) {
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

  // Badge image — clipped to a circle in the upper portion
  const imgRadius = 72;
  const imgCy = cy - 30;
  try {
    const img = await loadImage(imageUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, imgCy, imgRadius, 0, Math.PI * 2);
    ctx.clip();
    // Draw image centred and cover-fitted
    const scale = Math.max((imgRadius * 2) / img.width, (imgRadius * 2) / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, cx - dw / 2, imgCy - dh / 2, dw, dh);
    ctx.restore();
  } catch {
    // Image load failed — draw a placeholder circle
    ctx.beginPath();
    ctx.arc(cx, imgCy, imgRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
  }

  // Badge name
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px sans-serif';

  const words = badgeName.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > 270) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  const lineH = 34;
  const nameStartY = imgCy + imgRadius + 28;
  lines.forEach((l, i) => ctx.fillText(l, cx, nameStartY + i * lineH));

  // Recipient name
  if (recipientName) {
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#FF9900';
    ctx.fillText(recipientName, cx, nameStartY + lines.length * lineH + 18);
  }

  // Issuer label
  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = 'rgba(255,153,0,0.75)';
  ctx.fillText('AWS USER GROUP MADURAI', cx, size - 20);

  return canvas.toBuffer('image/png');
}

/**
 * Fallback PNG — geometric star, no uploaded image.
 */
function generateFallbackPng(badgeName, recipientName) {
  const size = 400;
  const cx = size / 2;
  const cy = size / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createRadialGradient(cx, cy, 60, cx, cy, 220);
  bg.addColorStop(0, '#1e293b');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, 178, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9900';
  ctx.lineWidth = 14;
  ctx.shadowColor = '#FF9900';
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, 158, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,153,0,0.35)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 6-pointed star
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

  if (recipientName) {
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#FF9900';
    ctx.fillText(recipientName, cx, nameStartY + lines.length * lineH + 18);
  }

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = 'rgba(255,153,0,0.75)';
  ctx.fillText('AWS USER GROUP MADURAI', cx, size - 20);

  return canvas.toBuffer('image/png');
}

export default async function handler(req, res) {
  const { badgeId, userSlug } = req.query;

  // Derive recipient name from slug: "poobalan-p-6544" → "Poobalan P"
  let recipientName = null;
  if (userSlug && userSlug !== 'image.png') {
    const parts = userSlug.split('-');
    if (parts.length >= 2) {
      recipientName = parts.slice(0, -1)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }

  // Fetch badge data from the API to get the uploaded imageUrl
  // GET /ob2/badges/{badgeId}.json returns the BadgeClass with the image field
  let badgeName = BADGE_DEFINITIONS[badgeId]?.name || 'Badge';
  let badgeDescription = BADGE_DEFINITIONS[badgeId]?.description || '';
  let uploadedImageUrl = null;

  const badgeClass = await fetchJson(`${API_BASE}/ob2/badges/${badgeId}.json`);
  if (badgeClass) {
    badgeName = badgeClass.name || badgeName;
    badgeDescription = badgeClass.description || badgeDescription;
    // The image field is the uploaded S3 URL when set, otherwise the generated SVG
    // Only use it as og:image if it's a real uploaded image (not the generated SVG endpoint)
    if (badgeClass.image && !badgeClass.image.includes('/ob2/badge-images/')) {
      uploadedImageUrl = badgeClass.image;
    }
  }

  // ── Serve badge PNG image ──────────────────────────────────────────────────
  if (userSlug === 'image.png') {
    try {
      let png;
      if (uploadedImageUrl) {
        // Use the uploaded badge image inside the amber ring
        png = await generateBadgePngWithImage(uploadedImageUrl, badgeName, null);
      } else {
        png = generateFallbackPng(badgeName, null);
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.status(200).send(png);
    } catch (e) {
      console.error('PNG generation failed:', e);
      res.redirect(302, `${BASE_URL}/og-image.png`);
    }
    return;
  }

  // ── Serve OG HTML page ─────────────────────────────────────────────────────
  const title = recipientName
    ? `${recipientName} earned ${badgeName} | AWS UG Madurai`
    : `${badgeName} | AWS UG Madurai`;

  const description = recipientName
    ? `${recipientName} was awarded the "${badgeName}" badge by AWS User Group Madurai. ${badgeDescription}`
    : `"${badgeName}" — ${badgeDescription} | Issued by AWS User Group Madurai`;

  // og:image — the PNG endpoint on our own domain
  const ogImage      = `${BASE_URL}/og/badge/${badgeId}/image.png`;
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
}
