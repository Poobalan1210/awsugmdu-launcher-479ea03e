/**
 * Vercel Serverless Function — share preview for a badge
 *
 * GET /og/badge/:badgeId/:userSlug[?u=<userId>]
 *   HTML with Open Graph tags for LinkedIn, WhatsApp, Slack, X and Facebook.
 *   People are redirected straight on to the React badge page.
 *
 * GET /og/badge/:badgeId/image.png
 *   The 1200×627 preview card (LinkedIn's link-preview size): the badge
 *   hexagon from the API beside its name and description. Also used as the
 *   badge picture in award emails.
 *
 * Everything shown comes from the API, never from the query string, so a
 * crafted link cannot put arbitrary text or images on an awsugmdu.in preview.
 * The member's name is only shown when ?u=<userId> holds a live award of this
 * badge whose evidence link matches the slug in the URL.
 */

import fs from 'fs';
import https from 'https';
import os from 'os';
import path from 'path';
import { Resvg } from '@resvg/resvg-js';
import { FONT_TTF_BASE64 } from '../../_lib/badge-fonts.js';

const BASE_URL = 'https://www.awsugmdu.in';
const API_BASE = (process.env.VITE_API_ENDPOINT
  || 'https://2q4zt5zl9e.execute-api.us-east-1.amazonaws.com/dev').replace(/\/$/, '');

const CARD_W = 1200;
const CARD_H = 627;
// Inside the subset TTFs each weight is its own family ("Inter Light" 300,
// "Inter Medium" 500, "Inter" 700), and resvg matches on those names, so
// each <text> names the family for its weight. Tamil falls back to Noto.
const FONT = {
  300: `'Inter Light','Noto Sans Tamil',sans-serif`,
  500: `'Inter Medium','Noto Sans Tamil',sans-serif`,
  700: `'Inter','Noto Sans Tamil SemiBold',sans-serif`,
};
/**
 * resvg 2.6 ignores in-memory font buffers and needs files, so the bundled
 * TTFs are written to the temp directory once per warm instance. Without them
 * Vercel's Linux has no fonts at all and the card would render without text.
 */
let fontFiles = null;
function badgeFontFiles() {
  if (fontFiles) return fontFiles;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'badge-fonts-'));
  fontFiles = Object.entries(FONT_TTF_BASE64).map(([name, b64]) => {
    const file = path.join(dir, `${name}.ttf`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    return file;
  });
  return fontFiles;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** GET a URL from our API with a 4 s timeout. Resolves { status, body } or null. */
function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 4000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function getJson(url) {
  const r = await get(url);
  if (!r || r.status !== 200) return null;
  try { return JSON.parse(r.body); } catch { return null; }
}

const safeId = (s) => /^[\w-]{1,80}$/.test(String(s || ''));

/** Greedy word wrap using an average glyph width (Inter is ~0.53em per char). */
function wrap(text, fontSize, maxWidth, maxLines) {
  const perLine = Math.max(8, Math.floor(maxWidth / (fontSize * 0.53)));
  const lines = [];
  let line = '';
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > perLine && line) { lines.push(line); line = word; } else { line = next; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S*$/, '')}…`;
  }
  return lines;
}

/** The badge hexagon SVG, placed as a nested <svg> so it scales cleanly. */
function placeHexagon(badgeSvg, x, y, height) {
  const inner = badgeSvg
    .replace(/<\?xml[^>]*\?>/, '')
    // Browsers pick the weight from the embedded @font-face rules; resvg needs
    // the per-weight family named on each <text> (see FONT).
    .replace(/<text\b[^>]*>/g, (tag) => {
      const w = Number(tag.match(/font-weight="(\d+)"/)?.[1] || 500);
      return tag.replace(/font-family="[^"]*"/, `font-family="${FONT[w >= 700 ? 700 : w >= 500 ? 500 : 300]}"`);
    })
    .replace(/<svg\b([^>]*)>/, (m, attrs) => {
      const vb = attrs.match(/viewBox="([^"]+)"/)?.[1] || '0 0 533 615';
      const [, , w, h] = vb.split(/\s+/).map(Number);
      const width = Math.round((height * w) / h);
      return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${vb}">`;
    });
  return inner;
}

function cardSvg(badgeSvg, name, description) {
  const textX = 600;
  const nameSize = name.length > 22 ? 52 : 64;
  const nameLines = wrap(name, nameSize, 540, 2);
  const descLines = wrap(description, 28, 540, 3);
  let y = 200;
  const nameEls = nameLines.map((l) => {
    const el = `<text font-family="${FONT[700]}" x="${textX}" y="${y}" font-size="${nameSize}" font-weight="700" fill="#FFFFFF">${esc(l)}</text>`;
    y += nameSize * 1.15;
    return el;
  }).join('');
  y += 20;
  const descEls = descLines.map((l) => {
    const el = `<text font-family="${FONT[300]}" x="${textX}" y="${y}" font-size="28" font-weight="300" fill="rgba(255,255,255,0.72)">${esc(l)}</text>`;
    y += 40;
    return el;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0B0F18"/><stop offset="1" stop-color="#05070C"/>
    </linearGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
  <rect x="0" y="${CARD_H - 8}" width="${CARD_W}" height="8" fill="#A375F0"/>
  ${placeHexagon(badgeSvg, 70, 52, 515)}
  <text font-family="${FONT[500]}" x="${textX}" y="130" font-size="26" font-weight="500" letter-spacing="3" fill="#C6A6FF">AWS USER GROUP MADURAI</text>
  ${nameEls}
  ${descEls}
  <text font-family="${FONT[500]}" x="${textX}" y="560" font-size="24" font-weight="500" fill="rgba(255,255,255,0.55)">Verified Open Badge · awsugmdu.in</text>
</svg>`;
}

function renderPng(svg) {
  return new Resvg(svg, {
    font: { fontFiles: badgeFontFiles(), defaultFontFamily: 'Inter', loadSystemFonts: false },
    fitTo: { mode: 'width', value: CARD_W },
  }).render().asPng();
}

async function sendImage(res, badgeId) {
  const [badge, hexagon] = await Promise.all([
    getJson(`${API_BASE}/ob2/badges/${badgeId}.json`),
    get(`${API_BASE}/ob2/badge-images/${badgeId}.svg`),
  ]);
  if (!badge || !hexagon || hexagon.status !== 200) {
    res.redirect(302, `${BASE_URL}/og-image.png`);
    return;
  }
  const png = renderPng(cardSvg(hexagon.body, badge.name || 'Badge', badge.description || ''));
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(png);
}

/** The recipient's display name, only when ?u= holds a live award matching the slug. */
async function verifiedRecipient(badgeId, userId, userSlug) {
  if (!safeId(userId)) return null;
  const assertion = await getJson(`${API_BASE}/ob2/assertions/${badgeId}-${userId}.json`);
  const evidence = assertion?.evidence?.[0];
  if (!evidence || evidence.id !== `${BASE_URL}/u/${userSlug}`) return null;
  const name = String(evidence.name || '').replace(/'s AWS UG Madurai Profile$/, '');
  return name || null;
}

export default async function handler(req, res) {
  const { badgeId, userSlug, u } = req.query;

  if (!safeId(badgeId)) {
    res.redirect(302, BASE_URL);
    return;
  }

  if (userSlug === 'image.png') {
    try {
      await sendImage(res, badgeId);
    } catch (e) {
      console.error('Badge preview render failed:', e);
      res.redirect(302, `${BASE_URL}/og-image.png`);
    }
    return;
  }

  const slug = safeId(userSlug) ? userSlug : '';
  const [badge, recipientName] = await Promise.all([
    getJson(`${API_BASE}/ob2/badges/${badgeId}.json`),
    slug ? verifiedRecipient(badgeId, u, slug) : null,
  ]);
  const badgeName = badge?.name || 'Badge';
  const badgeDescription = badge?.description || '';

  const title = recipientName
    ? `${recipientName} earned the ${badgeName} badge | AWS User Group Madurai`
    : `${badgeName} badge | AWS User Group Madurai`;
  const description = recipientName
    ? `${recipientName} was awarded the "${badgeName}" Open Badge by AWS User Group Madurai. ${badgeDescription}`
    : `"${badgeName}": ${badgeDescription} Issued by AWS User Group Madurai.`;

  const query = recipientName ? `?u=${encodeURIComponent(u)}` : '';
  const canonicalUrl = `${BASE_URL}/og/badge/${badgeId}/${slug}${query}`;
  const redirectUrl = slug ? `${BASE_URL}/badges/${badgeId}/${slug}` : BASE_URL;
  const imageUrl = `${BASE_URL}/og/badge/${badgeId}/image.png`;

  const t = esc(title);
  const d = esc(description);
  const img = esc(imageUrl);
  const cu = esc(canonicalUrl);
  const ru = esc(redirectUrl);

  const html = `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${t}</title>
  <link rel="canonical" href="${cu}" />

  <meta property="og:type"         content="website" />
  <meta property="og:site_name"    content="AWS User Group Madurai" />
  <meta property="og:title"        content="${t}" />
  <meta property="og:description"  content="${d}" />
  <meta property="og:url"          content="${cu}" />
  <meta property="og:image"        content="${img}" />
  <meta property="og:image:width"  content="${CARD_W}" />
  <meta property="og:image:height" content="${CARD_H}" />
  <meta property="og:image:type"   content="image/png" />
  <meta property="og:image:alt"    content="${t}" />

  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="twitter:image"       content="${img}" />

  <meta http-equiv="refresh" content="0; url=${ru}" />
</head>
<body>
  <p>Redirecting to <a href="${ru}">${t}</a>…</p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
  res.status(200).send(html);
}
