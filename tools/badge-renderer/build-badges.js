'use strict';
/**
 * End-to-end badge pipeline.
 *
 *   badge definition
 *     -> BadgeClass JSON      (OB2, hosted)
 *     -> Assertion JSON       (OB2, hosted, salted sha256 recipient)
 *     -> branded hex SVG      (badge-template.js)
 *     -> baked SVG            (openbadges:assertion + CDATA)
 *     -> 600x600 PNG          (Chrome headless rasterise, transparent)
 *     -> baked PNG            (iTXt keyword=openbadges, uncompressed)
 *     -> verify               (round-trip extraction on both)
 *
 * Run:  node build-badges.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const {
  renderBadgeSvg, bakeSvg, PALETTE, W, H, WORDMARK_TEXT,
} = require('./badge-template');
const { renderGopuram } = require('./gopuram');

// Crest badges use a slightly lifted field so the white line art reads without
// blowing out the contrast against the rim.
const CREST_PALETTE = { field: '#2C313F', fieldDeep: '#242936' };

// ─── crest placement, derived rather than eyeballed ─────────────────────────
// The gopuram is drawn in a 1000-unit local box. Its inked content spans:
//   y  88 (tip of the centre kalasam: towerTop 150 - height 62)
//   y 960 (mandapam stylobate)
//   x 164..836 (mandapam half-width = halfBottom 252 + 58 + 26 = 336)
// Target: land that content between y=100 and y=480 in badge coords. Below ~480
// the hexagon has tapered in far enough that the wide mandapam would be clipped.
const CREST_LOCAL = {
  top: 208,     // crown cap 280 - centre kalasam 72
  bottom: 730,  // stylobate
  cx: 500,
  halfWidth: 350, // mandapam: halfBottom 280 + 48 + 22
};
// Fit to WIDTH (the mandapam is the binding constraint), then verify the
// corners clear the hexagon rather than assuming they do.
const CREST_TARGET_WIDTH_FRAC = 0.77;  // of the inner hexagon's full width
// Lifted above centre to clear the two-line issuer caption below it.
const CREST_CENTRE_Y = H / 2 - 30;

const HEX_R = (H - 34) / 2;                    // centre -> vertex
const HEX_HALF = (Math.sqrt(3) / 2) * HEX_R;   // centre -> flat side
const hexHalfAt = (dy) => Math.abs(dy) <= HEX_R / 2
  ? HEX_HALF
  : HEX_HALF * 2 * (HEX_R - Math.abs(dy)) / HEX_R;

const CREST_SCALE = (HEX_HALF * 2 * CREST_TARGET_WIDTH_FRAC)
                  / (CREST_LOCAL.halfWidth * 2);
const CREST_H = (CREST_LOCAL.bottom - CREST_LOCAL.top) * CREST_SCALE;
const CREST_TOP = CREST_CENTRE_Y - CREST_H / 2;
const CREST_TX = W / 2 - CREST_LOCAL.cx * CREST_SCALE;
const CREST_TY = CREST_TOP - CREST_LOCAL.top * CREST_SCALE;
const CREST_TRANSFORM =
  `translate(${CREST_TX.toFixed(2)} ${CREST_TY.toFixed(2)}) scale(${CREST_SCALE.toFixed(4)})`;

// Assert the widest part (mandapam, at the bottom) actually fits inside the hex.
{
  const dy = CREST_TOP + CREST_H - H / 2;
  const available = hexHalfAt(dy);
  const needed = CREST_LOCAL.halfWidth * CREST_SCALE;
  if (needed > available) {
    throw new Error(`crest overflows the hexagon at its base: needs `
      + `${needed.toFixed(1)}, hex allows ${available.toFixed(1)} at dy=${dy.toFixed(1)}`);
  }
}

const OUT = path.join(__dirname, 'out');
const BASE = 'https://www.awsugmdu.in';
const OB2 = 'https://w3id.org/openbadges/v2';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Point this at the licensed AWS wordmark to render it into the slot, e.g.
//   const WORDMARK = `${BASE}/aws-wordmark-white.svg`;
// Left null here on purpose: the AWS logo is a trademark and is not redrawn.
const WORDMARK = process.env.WORDMARK_HREF || null;

// ─── the badge set ──────────────────────────────────────────────────────────
// b1..b8 mirror BADGE_DEFINITIONS in badges-crud/index.js.
// r1..r3 are the community role badges from the hex reference art.
// A sample earner. In production every field here already exists on the
// assertion record in awsug-ob2-assertions (recipientName, userSlug, issuedOn),
// so the assertion IS the render input — no schema change needed.
const EARNER_BASE = {
  userId: '9f3c1a7e-4b21-4d0a-9c88-2e5f7a10bd44',
  email: 'logesh@example.com',
};
const EARNER = { ...EARNER_BASE, name: 'Logesh S', slug: 'logesh-s-4f2a' };

const BADGES = [
  // c1 uses the crest layout: Madurai gopuram line art, no type.
  { id: 'c1', role: 'Community Member', name: 'AWS User Group Madurai',
    description: 'Member of the AWS User Group Madurai community.',
    criteria: 'Join the AWS User Group Madurai community',
    tags: ['Community', 'AWS', 'Cloud Computing'],
    crest: 'gopuram', palette: CREST_PALETTE },
  { id: 'r1', role: 'Speaker',          name: 'AWS User Group Speaker',   description: 'Delivered a session at an AWS User Group Madurai event.',       criteria: 'Deliver at least one session at an AWSUGMDU event', tags: ['Public Speaking', 'Community', 'AWS'] },
  { id: 'r2', role: 'Supporter',        name: 'AWS User Group Supporter',  description: 'Sustained support of AWS User Group Madurai programmes.',       criteria: 'Provide sustained support to AWSUGMDU programmes',   tags: ['Community', 'AWS'] },
  { id: 'r3', role: 'Volunteer',        name: 'AWS User Group Volunteer',  description: 'Volunteered to run AWS User Group Madurai events.',             criteria: 'Volunteer at an AWSUGMDU event',                     tags: ['Community', 'Event Operations', 'AWS'] },
  { id: 'b1', role: 'Sprint Champion',  name: 'Sprint Champion',           description: 'Completed 5 skill sprints.',                                    criteria: 'Complete 5 skill sprints',                           tags: ['Cloud Computing', 'AWS', 'Continuous Learning'] },
  { id: 'b3', role: 'AWS Certified',    name: 'AWS Certified',             description: 'Holds a verified AWS certification.',                           criteria: 'Earn at least 1 AWS certification',                  tags: ['AWS Certification', 'Cloud Computing'] },
  { id: 'b7', role: 'Speaker Star',     name: 'Speaker Star',              description: 'Delivered 3 sessions to the community.',                        criteria: 'Deliver 3 speaker sessions',                         tags: ['Public Speaking', 'Technical Communication'] },
  // b8 demonstrates the optional rim caption + a longer role that wraps.
  { id: 'b8', role: 'Security Expert',  name: 'Security Expert',           description: 'Completed the Security Sprint.',                                criteria: 'Complete the Security Sprint',                       tags: ['Cloud Security', 'IAM', 'AWS'], footer: 'AWSUGMDU' },

  // ── recipient-name stress cases ────────────────────────────────────────────
  // Real registrations, not tidy samples. n1 is a long South Indian name that
  // has to wrap; n2 is Tamil script, which Inter cannot render at all and which
  // exercises the Noto Sans Tamil unicode-range fallback.
  { id: 'n1', role: 'Volunteer', name: 'AWS User Group Volunteer',
    description: 'Volunteered at an AWS User Group Madurai event.',
    criteria: 'Volunteer at an AWSUGMDU event', tags: ['Community', 'AWS'],
    earner: { ...EARNER_BASE, name: 'Lakshmi Venkataraman Subramanian',
              slug: 'lakshmi-venkataraman-subramanian-7b3e' } },
  { id: 'n2', role: 'Speaker', name: 'AWS User Group Speaker',
    description: 'Delivered a session at an AWS User Group Madurai event.',
    criteria: 'Deliver at least one session at an AWSUGMDU event',
    tags: ['Public Speaking', 'Community', 'AWS'],
    earner: { ...EARNER_BASE, name: '\u0BB2\u0BCB\u0B95\u0BC7\u0BB7\u0BCD',
              slug: 'logesh-tamil-9c21' } },
];



// ─── OB2 documents (same shape as badges-crud/index.js) ─────────────────────
const makeSalt = (userId) => `awsugmdu-${userId.slice(0, 8)}`;
const hashEmail = (email, salt) =>
  'sha256$' + crypto.createHash('sha256').update(email.toLowerCase().trim() + salt).digest('hex');

function buildIssuer() {
  return {
    '@context': OB2,
    id: `${BASE}/ob2/issuer.json`,
    type: 'Profile',
    name: 'AWS User Group Madurai',
    url: BASE,
    email: 'badges@awsugmdu.in',
    description: 'AWS User Group Madurai is a community of cloud enthusiasts, developers, and '
               + 'architects who learn and grow together through events, sprints, and certifications.',
    image: `${BASE}/logo.png`,
  };
}

function buildBadgeClass(b) {
  const id = `${BASE}/ob2/badges/${b.id}.json`;
  return {
    '@context': OB2,
    id,
    type: 'BadgeClass',
    name: b.name,
    description: b.description,
    image: `${BASE}/ob2/badge-images/${b.id}.svg`,
    criteria: { id: `${id}/criteria`, narrative: b.criteria },
    issuer: `${BASE}/ob2/issuer.json`,
    // AWS's own Credly BadgeClasses ship alignment: [] — populating it is what
    // makes these machine-readable skill claims rather than just pictures.
    alignment: b.tags.map((t) => ({
      type: 'AlignmentObject',
      targetName: t,
      targetUrl: `${BASE}/skills/${t.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      targetFramework: 'AWSUGMDU Skill Graph',
    })),
    tags: ['AWS', 'Cloud', 'Community', 'AWSUGMDU', ...b.tags],
  };
}

function buildAssertion(b, earner) {
  const assertionId = `${b.id}-${earner.userId}`;
  const salt = makeSalt(earner.userId);
  return {
    '@context': OB2,
    id: `${BASE}/ob2/assertions/${assertionId}.json`,
    type: 'Assertion',
    recipient: {
      type: 'email',
      hashed: true,
      salt,
      identity: hashEmail(earner.email, salt),
    },
    badge: `${BASE}/ob2/badges/${b.id}.json`,
    verification: { type: 'HostedBadge' },
    issuedOn: '2026-08-06T00:00:00.000Z',
    evidence: [{
      type: 'Evidence',
      id: `${BASE}/u/${earner.slug}`,
      name: `${earner.name}'s AWS UG Madurai Profile`,
      description: `View ${earner.name}'s full profile and achievements.`,
    }],
    narrative: `${earner.name} earned the "${b.name}" badge from AWS User Group Madurai `
             + `for: ${b.criteria}`,
  };
}

// ─── PNG baking: iTXt chunk, keyword "openbadges", NO compression ────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function bakePng(png, assertion) {
  if (!png.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  const text = Buffer.from(JSON.stringify(assertion, null, 2), 'utf8');
  // keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
  const itxt = Buffer.concat([
    Buffer.from('openbadges', 'latin1'), Buffer.from([0]),
    Buffer.from([0]),   // compressionFlag  — MUST be 0 per spec
    Buffer.from([0]),   // compressionMethod
    Buffer.from([0]),   // languageTag = ""
    Buffer.from([0]),   // translatedKeyword = ""
    text,
  ]);
  const chunk = pngChunk('iTXt', itxt);

  const parts = [PNG_SIG];
  let off = 8, inserted = false;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const raw = png.subarray(off, off + 12 + len);
    const payload = png.subarray(off + 8, off + 8 + len);
    // Spec: at most one openbadges chunk. Drop any pre-existing one.
    if ((type === 'iTXt' || type === 'tEXt')
        && payload.subarray(0, 11).equals(Buffer.from('openbadges\0', 'latin1'))) {
      off += 12 + len;
      continue;
    }
    if (type === 'IEND' && !inserted) { parts.push(chunk); inserted = true; }
    parts.push(raw);
    off += 12 + len;
  }
  return Buffer.concat(parts);
}

function extractPng(png) {
  let off = 8;
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.toString('latin1', off + 4, off + 8);
    const payload = png.subarray(off + 8, off + 8 + len);
    if (type === 'iTXt' && payload.subarray(0, 11).equals(Buffer.from('openbadges\0', 'latin1'))) {
      return JSON.parse(payload.subarray(15).toString('utf8'));
    }
    off += 12 + len;
  }
  return null;
}
function extractSvg(svg) {
  const m = svg.match(/<openbadges:assertion[^>]*verify="([^"]+)"[^>]*>([\s\S]*?)<\/openbadges:assertion>/);
  if (!m) return null;
  const cdata = m[2].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return { verify: m[1], assertion: cdata ? JSON.parse(cdata[1]) : null };
}

// ─── rasterise via Chrome headless (transparent background) ─────────────────
function svgToPng(svgPath, pngPath, size) {
  const html = svgPath.replace(/\.svg$/, '.wrap.html');
  const svg = fs.readFileSync(svgPath, 'utf8').replace(/<\?xml[^>]*\?>\s*/, '');
  fs.writeFileSync(html,
    `<!doctype html><meta charset="utf-8">`
    + `<style>html,body{margin:0;padding:0;background:transparent;`
    + `width:${size}px;height:${size}px;overflow:hidden}`
    + `svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${pngPath}`,
    `file://${html}`,
  ], { stdio: 'pipe' });
  fs.unlinkSync(html);
  return fs.readFileSync(pngPath);
}

// ─── run ────────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['svg', 'png', 'json']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

fs.writeFileSync(path.join(OUT, 'json', 'issuer.json'), JSON.stringify(buildIssuer(), null, 2));

const SIZE = 600; // matches Credly's badge raster size
const rows = [];

for (const b of BADGES) {
  const earner = b.earner || EARNER;
  const badgeClass = buildBadgeClass(b);
  const assertion = buildAssertion(b, earner);
  const assertionUrl = assertion.id;

  fs.writeFileSync(path.join(OUT, 'json', `badgeclass-${b.id}.json`), JSON.stringify(badgeClass, null, 2));
  fs.writeFileSync(path.join(OUT, 'json', `assertion-${b.id}.json`), JSON.stringify(assertion, null, 2));

  // 1. brand art
  const crest = b.crest === 'gopuram'
    ? renderGopuram({
        ink: PALETTE.ink,
        accent: PALETTE.accent,
        // Occlude the clouds drawn behind the crest.
        backdrop: (b.palette || PALETTE).field,
      })
    : null;

  const plain = renderBadgeSvg({
    id: b.id,
    role: b.role,
    description: b.description,
    label: b.name,
    palette: b.palette,
    // Text lockup by default. WORDMARK_HREF swaps in a licensed logo asset.
    wordmarkText: WORDMARK_TEXT,
    wordmarkHref: WORDMARK,
    crest,
    crestTransform: crest ? CREST_TRANSFORM : '',
    // Crest badges carry the issuer name as a tracked caption instead, since
    // the illustration occupies the space the type lockup would use.
    caption: crest ? WORDMARK_TEXT : '',
    // Personalised assertion image. The generic BadgeClass image is rendered
    // separately with this omitted — see the two-image note below.
    recipientName: crest ? '' : (b.earner || EARNER).name,
    // Optional rim caption on type badges; the safe zone grows to match.
    footer: b.footer || '',
  });
  const plainPath = path.join(OUT, 'svg', `${b.id}-unbaked.svg`);
  fs.writeFileSync(plainPath, plain);

  // 2. bake the SVG
  const baked = bakeSvg(plain, assertionUrl, assertion);
  const bakedPath = path.join(OUT, 'svg', `${b.id}-baked.svg`);
  fs.writeFileSync(bakedPath, baked);

  // 3. rasterise (from the UNBAKED svg — the assertion goes into the PNG as iTXt,
  //    embedding it twice would be redundant and risks a stale copy)
  const rawPngPath = path.join(OUT, 'png', `${b.id}-unbaked.png`);
  const rawPng = svgToPng(plainPath, rawPngPath, SIZE);

  // 4. bake the PNG
  const bakedPng = bakePng(rawPng, assertion);
  const bakedPngPath = path.join(OUT, 'png', `${b.id}-baked.png`);
  fs.writeFileSync(bakedPngPath, bakedPng);

  // 5. verify round-trip
  const s = extractSvg(baked);
  const p = extractPng(bakedPng);
  const svgOk = s && s.verify === assertionUrl && JSON.stringify(s.assertion) === JSON.stringify(assertion);
  const pngOk = p && JSON.stringify(p) === JSON.stringify(assertion);

  rows.push({
    id: b.id, name: b.name,
    svgBaked: `${(baked.length / 1024).toFixed(1)}K`,
    pngUnbaked: `${(rawPng.length / 1024).toFixed(1)}K`,
    pngBaked: `${(bakedPng.length / 1024).toFixed(1)}K`,
    svg: svgOk ? 'PASS' : 'FAIL',
    png: pngOk ? 'PASS' : 'FAIL',
  });
}

// ─── contact sheet ──────────────────────────────────────────────────────────
// Open out/index.html to eyeball the whole set at once.
fs.writeFileSync(path.join(OUT, 'index.html'),
`<!doctype html><meta charset="utf-8"><title>AWSUGMDU badge set</title>
<style>
  :root{--field:${PALETTE.field};--rim:${PALETTE.rim};--ink:${PALETTE.ink}}
  body{margin:0;padding:40px;background:#0d1117;color:#e6edf3;
       font:14px/1.6 ui-sans-serif,system-ui,-apple-system,sans-serif}
  h1{font-size:20px;font-weight:600;margin:0 0 6px}
  p.sub{color:#8b949e;margin:0 0 28px}
  .swatches{display:flex;gap:16px;margin:0 0 32px;flex-wrap:wrap}
  .sw{display:flex;align-items:center;gap:8px;font:12px ui-monospace,monospace;color:#8b949e}
  .sw i{width:22px;height:22px;border-radius:5px;border:1px solid #30363d;display:block}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:26px}
  .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:18px;text-align:center}
  .card img{width:100%;height:auto;display:block;margin-bottom:12px}
  .card b{display:block;font-size:13px;margin-bottom:4px}
  .card code{font:11px ui-monospace,monospace;color:#8b949e;display:block;margin-bottom:10px}
  .ok{color:#3fb950;font:11px ui-monospace,monospace}
  .links{margin-top:10px;font:11px ui-monospace,monospace}
  .links a{color:#58a6ff;text-decoration:none;margin:0 5px}
  .note{margin-top:34px;padding:14px 16px;background:#161b22;border:1px solid #30363d;
        border-radius:10px;color:#8b949e;font-size:13px}
</style>
<h1>AWS User Group Madurai — badge set</h1>
<p class="sub">${rows.length} badges &middot; ${SIZE}&times;${SIZE} transparent PNG &middot;
Open Badges v2.0 assertion baked into both SVG and PNG</p>
<div class="swatches">
  ${Object.entries(PALETTE).map(([k, v]) =>
    `<span class="sw"><i style="background:${v}"></i>${k} ${v}</span>`).join('')}
</div>
<div class="grid">
${rows.map((r) => `  <div class="card">
    <img src="png/${r.id}-baked.png" alt="${r.name} badge">
    <b>${r.name}</b><code>${r.id}</code>
    <span class="ok">baked &check; svg ${r.svg} &middot; png ${r.png}</span>
    <div class="links">
      <a href="svg/${r.id}-baked.svg">svg</a>
      <a href="png/${r.id}-baked.png">png</a>
      <a href="json/assertion-${r.id}.json">assertion</a>
      <a href="json/badgeclass-${r.id}.json">class</a>
    </div>
  </div>`).join('\n')}
</div>
<div class="note">
  The dashed <strong>WORDMARK</strong> slot is intentional. The AWS logo is a trademark and is not
  redrawn here &mdash; run <code>WORDMARK_HREF=&lt;url-to-licensed-asset&gt; node build-badges.js</code>
  to drop the real mark into the slot.
</div>`);

// ─── report ─────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log('\nEND-TO-END BADGE PIPELINE');
console.log('palette  field=%s  rim=%s  accent=%s  ink=%s',
  PALETTE.field, PALETTE.rim, PALETTE.accent, PALETTE.ink);
console.log('raster   %dx%d transparent PNG via Chrome headless', SIZE, SIZE);
console.log('wordmark %s\n', WORDMARK || 'placeholder (set WORDMARK_HREF to inject the licensed asset)');
console.log('  ' + pad('id', 5) + pad('badge', 26) + pad('svg', 9) + pad('png raw', 10)
  + pad('png baked', 11) + pad('svg rt', 8) + 'png rt');
console.log('  ' + '-'.repeat(76));
for (const r of rows) {
  console.log('  ' + pad(r.id, 5) + pad(r.name, 26) + pad(r.svgBaked, 9)
    + pad(r.pngUnbaked, 10) + pad(r.pngBaked, 11) + pad(r.svg, 8) + r.png);
}
const bad = rows.filter((r) => r.svg !== 'PASS' || r.png !== 'PASS');
console.log('\n  %d badge(s), %d document set(s), %s',
  rows.length, rows.length * 2 + 1,
  bad.length ? `${bad.length} FAILED` : 'all round-trips PASS');
console.log('  output: out/{svg,png,json}\n');
process.exitCode = bad.length ? 1 : 0;
