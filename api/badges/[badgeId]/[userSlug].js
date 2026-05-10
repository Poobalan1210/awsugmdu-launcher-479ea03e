/**
 * Vercel Serverless Function — Badge public page with OG meta tags
 *
 * Route: GET /badges/:badgeId/:userSlug[?img=...&name=...&desc=...]
 *
 * This is the CANONICAL badge URL that gets shared everywhere.
 * - Social crawlers (LinkedIn, Twitter, etc.) get server-rendered HTML
 *   with correct OG meta tags and the badge image
 * - Human visitors get the React SPA (via meta refresh + JS redirect)
 *
 * This replaces the /og/badge/ proxy approach. Now the shareable URL
 * IS the badge page URL — no separate proxy needed.
 */

import { createCanvas } from '@napi-rs/canvas';
import https from 'https';

const BASE_URL = 'https://www.awsugmdu.in';
const API_BASE = process.env.VITE_API_ENDPOINT
  || 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev';

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

function generateFallbackPng(badgeName) {
  const size = 400;
  const cx = size / 2, cy = size / 2;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createRadialGradient(cx, cy, 60, cx, cy, 220);
  bg.addColorStop(0, '#1e293b'); bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);

  ctx.beginPath(); ctx.arc(cx, cy, 178, 0, Math.PI * 2);
  ctx.strokeStyle = '#FF9900'; ctx.lineWidth = 14;
  ctx.shadowColor = '#FF9900'; ctx.shadowBlur = 18; ctx.stroke(); ctx.shadowBlur = 0;

  ctx.beginPath(); ctx.arc(cx, cy, 158, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,153,0,0.35)'; ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);

  const r1 = 52, r2 = 26, pts = 6;
  ctx.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i * Math.PI) / pts - Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    const x = cx + r * Math.cos(a), y = (cy - 28) + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  const sg = ctx.createLinearGradient(cx - r1, cy - 28 - r1, cx + r1, cy - 28 + r1);
  sg.addColorStop(0, '#FFD700'); sg.addColorStop(1, '#FF9900');
  ctx.fillStyle = sg; ctx.shadowColor = '#FF9900'; ctx.shadowBlur = 12;
  ctx.fill(); ctx.shadowBlur = 0;

  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 30px sans-serif';
  const words = badgeName.split(' ');
  const lines = []; let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > 270) { if (line) lines.push(line); line = w; }
    else line = t;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, cx, cy + 46 + i * 36));

  ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = 'rgba(255,153,0,0.75)';
  ctx.fillText('AWS USER GROUP MADURAI', cx, size - 20);
  return canvas.toBuffer('image/png');
}

// Detect if the request is from a social crawler
function isCrawler(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return ua.includes('linkedinbot') || ua.includes('twitterbot') ||
    ua.includes('facebookexternalhit') || ua.includes('whatsapp') ||
    ua.includes('telegrambot') || ua.includes('slackbot') ||
    ua.includes('discordbot') || ua.includes('bot') ||
    ua.includes('crawler') || ua.includes('spider');
}

export default async function handler(req, res) {
  const { badgeId, userSlug, img, name, desc } = req.query;
  const userAgent = req.headers['user-agent'] || '';

  // ── Serve fallback PNG at /badges/:badgeId/image.png ─────────────────────
  if (userSlug === 'image.png') {
    const badgeName = name || BADGE_DEFINITIONS[badgeId]?.name || 'Badge';
    try {
      const png = generateFallbackPng(badgeName);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(png);
    } catch {
      return res.redirect(302, `${BASE_URL}/og-image.png`);
    }
  }

  // ── Resolve badge name & description ─────────────────────────────────────
  let badgeName        = name || BADGE_DEFINITIONS[badgeId]?.name        || 'Badge';
  let badgeDescription = desc || BADGE_DEFINITIONS[badgeId]?.description || '';

  if (!name && !BADGE_DEFINITIONS[badgeId]) {
    try {
      const bc = await fetchJson(`${API_BASE}/badges/${badgeId}`);
      if (bc?.badge?.name)        badgeName        = bc.badge.name;
      if (bc?.badge?.description) badgeDescription = bc.badge.description;
    } catch { /* use fallback */ }
  }

  // ── Resolve recipient name from slug ──────────────────────────────────────
  let recipientName = null;
  if (userSlug) {
    const parts = userSlug.split('-');
    if (parts.length >= 2) {
      recipientName = parts.slice(0, -1)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ');
    }
  }

  // ── For human visitors: redirect to the React SPA ───────────────────────
  // This branch only runs if the has[] condition in vercel.json doesn't match,
  // which shouldn't happen in production. Safety fallback.
  if (!isCrawler(userAgent)) {
    res.setHeader('Cache-Control', 'no-store');
    // Serve index.html content directly to avoid redirect loop
    return res.redirect(302, `${BASE_URL}/index.html`);
  }

  // ── For crawlers: serve OG HTML with badge image ──────────────────────────
  const title = recipientName
    ? `${recipientName} earned ${badgeName} | AWS UG Madurai`
    : `${badgeName} | AWS UG Madurai`;
  const description = recipientName
    ? `${recipientName} was awarded the "${badgeName}" badge by AWS User Group Madurai. ${badgeDescription}`
    : `"${badgeName}" — ${badgeDescription} | Issued by AWS User Group Madurai`;

  // og:image: use uploaded S3 URL directly, or fallback PNG
  const ogImage = img || `${BASE_URL}/badges/${badgeId}/image.png?name=${encodeURIComponent(badgeName)}`;
  const canonicalUrl = `${BASE_URL}/badges/${badgeId}/${userSlug}`;
  const redirectUrl  = canonicalUrl;

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
  <meta property="og:type"         content="profile" />
  <meta property="og:site_name"    content="AWS User Group Madurai" />
  <meta property="og:title"        content="${t}" />
  <meta property="og:description"  content="${d}" />
  <meta property="og:url"          content="${cu}" />
  <meta property="og:image"        content="${img_}" />
  <meta property="og:image:width"  content="400" />
  <meta property="og:image:height" content="400" />
  <meta property="og:image:alt"    content="${t}" />
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img_}" />
  <meta http-equiv="refresh" content="0; url=${ru}" />
  <script>window.location.replace("${ru}");</script>
</head>
<body><p>Redirecting to <a href="${ru}">${t}</a>…</p></body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(html);
}
