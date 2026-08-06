'use strict';
/**
 * AWSUGMDU hexagonal badge renderer — production template.
 *
 * Regular pointy-top hexagon, violet rim, deep navy field, sparse plus/cloud
 * decoration. Two layouts share the frame:
 *
 *   type layout   issuer lockup + role, auto-fitted to the hexagon width
 *   crest layout  full-field illustration + tracked caption
 *
 * Type is set in an embedded, subsetted webfont and measured with the font's
 * real advance widths, so a badge renders identically regardless of what the
 * viewer has installed. See prepare-fonts.py.
 */

const FONTS = require('./fonts.generated.json');

// ─── palette ────────────────────────────────────────────────────────────────
const PALETTE = {
  field: '#1B2333',       // deep navy hexagon fill
  fieldDeep: '#141B29',   // inner vignette
  rim: '#A375F0',         // violet rim
  rimBright: '#C6A6FF',   // rim highlight for the gradient
  accent: '#A375F0',      // role text + decoration
  ink: '#FFFFFF',         // wordmark text
  inkMuted: 'rgba(255,255,255,0.55)',
};

const FONT_FAMILY = FONTS.family;
// Fallbacks only matter if the embedded face is stripped; ordered nearest-first.
const FONT_STACK = `'${FONT_FAMILY}','Inter','Helvetica Neue',Helvetica,Arial,sans-serif`;

/**
 * Issuer lockup. Explicit line break rather than auto-wrap: "AWS User Group /
 * Madurai" is the correct reading, and letting the wrapper choose produced
 * "AWS User / Group Madurai".
 *
 * Deliberately text and not the AWS smile logo. The AWS Trademark Guidelines
 * permit fair-use references in plain text making true factual statements
 * (§13) but restrict logo reproduction and imitation of AWS trade dress
 * (§9, §10). "AWS User Group Madurai" is the group's own sanctioned name, so
 * setting it as type is both the safer and the simpler option.
 */
const WORDMARK_TEXT = 'AWS User Group\nMadurai';

// ─── geometry ───────────────────────────────────────────────────────────────
// Regular pointy-top hexagon. w/h = sqrt(3)/2 ≈ 0.8660 — same ratio as the
// reference art (531x615).
const H = 615;
const W = Math.round((Math.sqrt(3) / 2) * H); // 533

const round = (n) => Math.round(n * 100) / 100;

function hexPoints(cx, cy, h) {
  const r = h / 2;                     // centre -> vertex (top/bottom)
  const half = (Math.sqrt(3) / 2) * r; // centre -> flat side (left/right)
  return [
    [cx, cy - r],
    [cx + half, cy - r / 2],
    [cx + half, cy + r / 2],
    [cx, cy + r],
    [cx - half, cy + r / 2],
    [cx - half, cy - r / 2],
  ];
}

const ptsToAttr = (pts) => pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');

// Field hexagon, and its half-width at a vertical offset from centre. This is
// what lets type fill the badge: usable width is a function of height, not a
// single conservative constant.
const FIELD_R = (H - 34) / 2;
const FIELD_HALF = (Math.sqrt(3) / 2) * FIELD_R;
function fieldHalfAt(dy) {
  const d = Math.abs(dy);
  if (d >= FIELD_R) return 0;
  if (d <= FIELD_R / 2) return FIELD_HALF;
  return FIELD_HALF * 2 * (FIELD_R - d) / FIELD_R;
}

// ─── text metrics from the embedded font ────────────────────────────────────
const capRatio = (weight) => {
  const m = FONTS.metrics[String(weight)];
  return m.capHeight / m.unitsPerEm;
};

// Tamil block. Recipient names come straight from registration, so a Madurai
// member may well be "லோகேஷ்" — those codepoints resolve to the Tamil face and
// have to be measured against ITS metrics, not Inter's.
const isTamil = (cp) => (cp >= 0x0b80 && cp <= 0x0bff) || cp === 0x200c || cp === 0x200d;

/** Nearest available weight in a metrics table (Tamil ships 500/700 only). */
function pickMetrics(table, weight) {
  if (table[String(weight)]) return table[String(weight)];
  const have = Object.keys(table).map(Number).sort((a, b) => a - b);
  const best = have.reduce((p, c) =>
    Math.abs(c - weight) < Math.abs(p - weight) ? c : p, have[0]);
  return table[String(best)];
}

/**
 * Exact advance width. No average-advance fudge factor, and script-aware so a
 * mixed Latin/Tamil string measures correctly per character.
 */
function measure(text, size, weight, tracking = 0) {
  const latin = pickMetrics(FONTS.metrics, weight);
  const tamil = FONTS.tamil ? pickMetrics(FONTS.tamil.metrics, weight) : null;

  let w = 0;
  let count = 0;
  for (const ch of text) {
    const m = (tamil && isTamil(ch.codePointAt(0))) ? tamil : latin;
    const adv = m.advances[ch] ?? (m.advances['n'] || m.unitsPerEm * 0.5);
    w += (adv / m.unitsPerEm) * size;
    count += 1;
  }
  // Tracking applies between glyphs, not after the last one.
  return w + Math.max(0, count - 1) * tracking;
}

function wrapToWidth(text, size, weight, tracking, maxWidth) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, size, weight, tracking) <= maxWidth || !line) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/**
 * Lay out one text block so its widest line fills `targetWidth`.
 *
 * `text` may contain explicit \n breaks; each segment is then wrapped if it is
 * still too wide at the minimum size. The block is scaled so the widest line
 * lands on target, clamped to [minSize, maxSize] — so short roles like
 * "Speaker" grow to fill the badge and long ones like "Security Expert" wrap
 * and shrink instead of overflowing.
 */
function fitBlock(text, { weight, tracking = 0, maxSize, minSize, targetWidth, lineHeight }) {
  if (!(targetWidth > 0)) {
    // Guards against passing an absolute y where fieldHalfAt() wants an offset
    // from centre, which silently yields a negative target and puts every word
    // on its own line.
    throw new Error(`fitBlock: targetWidth must be positive, got ${targetWidth}`);
  }

  // Glyph advance per 1px of font size. Tracking is a fixed pixel cost and does
  // NOT scale with size, so it is solved for separately — folding it into a
  // single "width at size 100" figure drops it from the fit entirely.
  const unit = (s) => measure(s, 1, weight, 0);
  const sizeFor = (s) =>
    (targetWidth - Math.max(0, s.length - 1) * tracking) / unit(s);

  let lines = text.split('\n').map((s) => s.trim()).filter(Boolean);

  // Re-wrap only segments that still cannot fit at the smallest allowed size.
  const rewrapped = [];
  for (const seg of lines) {
    if (sizeFor(seg) < minSize) {
      rewrapped.push(...wrapToWidth(seg, minSize, weight, tracking, targetWidth));
    } else {
      rewrapped.push(seg);
    }
  }
  lines = rewrapped;

  const size = Math.max(minSize,
    Math.min(maxSize, Math.min(...lines.map(sizeFor))));
  const cap = capRatio(weight) * size;
  const height = (lines.length - 1) * size * lineHeight + cap;
  // Ink below the baseline. `height` measures cap-top to last baseline, so
  // anything placed under this block must clear the descenders too — otherwise
  // a rule sitting `gap` below a word like "Supporter" cuts through its p's.
  const m = pickMetrics(FONTS.metrics, weight);
  const descent = (Math.abs(m.descender) / m.unitsPerEm) * size;
  return { lines, size, cap, height, descent, tracking, weight };
}

/** Render a fitted block. `top` is the cap-top of the first line. */
function drawBlock(block, cx, top, colour, lineHeight, extra = '') {
  const { lines, size, cap, tracking } = block;
  return lines.map((l, i) =>
    `<text x="${cx}" y="${round(top + cap + i * size * lineHeight)}" `
    + `text-anchor="middle" font-family="${FONT_STACK}" font-size="${round(size)}" `
    + `font-weight="${block.weight}" `
    + (tracking ? `letter-spacing="${tracking}" ` : '')
    // Tracking adds trailing space after the last glyph, which shifts a centred
    // line visually left by half a track. Nudge it back.
    + (tracking ? `dx="${round(tracking / 2)}" ` : '')
    + `fill="${colour}"${extra}>${escText(l)}</text>`).join('\n  ');
}

// ─── deterministic scatter (mulberry32) ─────────────────────────────────────
function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── decoration ─────────────────────────────────────────────────────────────
function plusMark(x, y, size, stroke, width, opacity) {
  const h = size / 2;
  return `<path d="M${round(x - h)} ${round(y)}H${round(x + h)}M${round(x)} ${round(y - h)}V${round(y + h)}" `
       + `stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

/** Outline cloud with two speed dashes, mirrored via scaleX(-1). */
function cloudMark(x, y, scale, stroke, opacity, flip) {
  const t = `translate(${round(x)} ${round(y)}) scale(${flip ? -scale : scale} ${scale})`;
  return `<g transform="${t}" opacity="${opacity}" fill="none" stroke="${stroke}" `
       + `stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">`
       + `<path d="M4 20h34a11 11 0 0 0 .6-22A16 16 0 0 0 9 9.5A10.5 10.5 0 0 0 4 20Z"/>`
       + `<path d="M-16 9h12M-11 20h9"/>`
       + `</g>`;
}

const inZone = (x, y, pad, z) =>
  x > z.x0 - pad && x < z.x1 + pad && y > z.y0 - pad && y < z.y1 + pad;

/**
 * Pull a mark horizontally until it fits inside the field at every y it spans.
 *
 * Hand-placed absolute coordinates do not survive the hexagon: near the top and
 * bottom vertices the field narrows fast, so a mark that looks fine at the
 * centre gets sliced by the clip path. Deriving the limit from the geometry
 * fixes it for any size or position.
 */
function clampMark(x, y, size, cx, cy) {
  const h = size / 2;
  const limit = Math.min(
    fieldHalfAt(y - cy - h),
    fieldHalfAt(y - cy + h),
  ) - h - 6;
  if (limit <= 0) return null;             // no room at this height at all
  const off = x - cx;
  return cx + Math.sign(off) * Math.min(Math.abs(off), limit);
}

/**
 * Place a cloud so it sits ON the field edge — mostly visible, slightly
 * cropped. That partial crop is what gives the reference art its depth.
 *
 * cloudMark draws dashes at local x -16..-2 and the body at 4..40, so an
 * unflipped cloud leads with dashes on the left and a flipped one mirrors that.
 * `overhang` is how far the body pokes past the edge.
 *
 * The edge is taken at the NARROWEST y the cloud spans, not at its origin.
 * Above centre that is the top; below centre it is the bottom. Measuring only
 * at the origin let clouds below centre get sliced diagonally, leaving a hook.
 */
function cloudAtEdge(dy, side, scale, stroke, opacity, cx, cy, overhang = 10) {
  const extent = 22 * scale;                // body occupies local y 0..22
  const edge = Math.min(fieldHalfAt(dy), fieldHalfAt(dy + extent));
  const flip = side < 0;                    // left-hand clouds are mirrored
  const bodyReach = 40 * scale;             // local +40 (or -40 when flipped)
  const x = cx + side * (edge + overhang - bodyReach);
  return cloudMark(x, cy + dy, scale, stroke, opacity, flip);
}

/**
 * Type-layout decoration. Marks are corner-anchored and any that land inside
 * the measured type zone are dropped — a missing mark is invisible, a
 * colliding one is not.
 */
function decorate(id, P, zone) {
  const r = rng(seedFrom(id));
  const cx = W / 2, cy = H / 2;

  // [dy, side, inset-from-edge, size, strokeWidth, colour]
  // The reference mixes white and violet marks at mixed scales; a single-colour
  // set of small marks reads as dust rather than as deliberate decoration.
  const anchors = [
    [-204, -1, 40, 32, 4.0, P.ink],
    [-160, -1, 104, 19, 3.0, P.ink],
    [-150,  1, 118, 21, 3.2, P.accent],
    [ 190,  1, 44, 34, 4.0, P.ink],
    [ 226, -1, 84, 22, 3.2, P.accent],
    [ 168, -1, 40, 20, 3.0, P.accent],
  ];

  const plus = anchors
    .map(([dy, side, inset, s, w, colour]) => {
      const y = cy + dy + (r() - 0.5) * 12;
      const x0 = cx + side * Math.max(0, fieldHalfAt(y - cy) - inset);
      const x = clampMark(x0, y, s, cx, cy);
      if (x === null) return null;
      if (inZone(x, y, s, zone)) return null;
      return plusMark(x, y, s, colour, w, round(0.7 + r() * 0.3));
    })
    .filter(Boolean)
    .join('\n    ');

  // Held clear of the type band. The wordmark fills ~80% of the field width, so
  // at mid-height there is no room for a cloud; both sit above or below it.
  const clouds = [
    cloudAtEdge(-178,  1, 1.0,  P.accent, 0.9,  cx, cy, 2),
    cloudAtEdge( 140, -1, 0.9,  P.ink,    0.6,  cx, cy, 2),
  ].join('\n    ');

  return { plus, clouds };
}

/**
 * Crest-layout decoration. No type stack to dodge, so marks and clouds ring the
 * illustration. Mirrors the gopuram reference: stacked clouds upper-left, one
 * upper-right, plus marks at four compass points.
 */
function decorateCrest(id, P, capZone) {
  const r = rng(seedFrom(id));
  const cx = W / 2, cy = H / 2;

  const anchors = capZone
    ? [
        [cx - 205, cy - 20,  20, 3.0, P.ink],
        [cx - 205, cy + 152, 24, 3.2, P.accent],
        [cx + 168, cy - 118, 30, 3.2, P.accent],
        [cx + 198, cy + 160, 34, 3.6, P.ink],
      ]
    : [
        [cx - 205, cy - 20,  20, 3.0, P.ink],
        [cx - 152, cy + 148, 24, 3.2, P.accent],
        [cx + 168, cy - 118, 30, 3.2, P.accent],
        [cx + 128, cy + 172, 38, 3.6, P.ink],
      ];

  const plus = anchors
    .map(([x, y, s, w, c]) => {
      const jx = x + (r() - 0.5) * 10;
      const jy = y + (r() - 0.5) * 10;
      if (capZone && inZone(jx, jy, s, capZone)) return null;
      return plusMark(jx, jy, s, c, w, round(0.72 + r() * 0.28));
    })
    .filter(Boolean)
    .join('\n    ');

  const rimClouds = [
    cloudMark(cx - 196, cy - 176, 1.15, P.ink,    0.95, false),
    cloudMark(cx - 214, cy - 132, 1.30, P.accent, 0.95, false),
    cloudMark(cx + 196, cy - 208, 1.10, P.accent, 0.95, true),
  ].join('\n    ');

  // Behind the crest. The crest paints an opaque backdrop, so these are
  // occluded and read as sitting behind the tower. Kept at shoulder height —
  // lower and they tangle with the colonnade, which the silhouette misses.
  const backClouds = [
    cloudMark(cx - 128, cy - 52, 0.95, P.ink, 0.85, false),
    cloudMark(cx + 168, cy - 60, 1.0,  P.ink, 0.85, true),
  ].join('\n    ');

  return { plus, rimClouds, backClouds };
}

// ─── OB2 SVG baking (spec-conformant) ───────────────────────────────────────
// xmlns:openbadges="http://openbadges.org" on <svg>; <openbadges:assertion>
// as the FIRST child of <svg>; assertion JSON inside CDATA.
// https://www.imsglobal.org/sites/default/files/Badges/OBv2p0Final/baking/index.html
function bakeSvg(svg, assertionUrl, assertion) {
  if (svg.includes('<openbadges:assertion')) {
    throw new Error('already baked — spec permits exactly one assertion tag');
  }
  const m = svg.match(/<svg\b[^>]*>/);
  if (!m) throw new Error('no <svg> root element');
  let tag = m[0];
  if (!tag.includes('xmlns:openbadges')) {
    tag = tag.replace(/\s*>$/, '\n     xmlns:openbadges="http://openbadges.org">');
  }
  const json = JSON.stringify(assertion, null, 2);
  if (json.includes(']]>')) throw new Error('assertion would break out of CDATA');
  const block =
    `\n  <openbadges:assertion verify="${escAttr(assertionUrl)}">\n` +
    `    <![CDATA[\n${json}\n    ]]>\n` +
    `  </openbadges:assertion>`;
  return svg.slice(0, m.index) + tag + block + svg.slice(m.index + m[0].length);
}

const escText = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;');

/**
 * @font-face rules carrying the subsetted woff2 payloads inline.
 *
 * The Tamil faces share the same family name but declare a restricted
 * unicode-range, so the renderer picks them per character. A mixed name like
 * "Logesh லோகேஷ்" resolves correctly inside a single <text> element with no
 * markup changes and no per-script span splitting.
 */
function fontFaceCss() {
  const rule = (weight, b64, range) =>
    `@font-face{font-family:'${FONT_FAMILY}';font-style:normal;`
    + `font-weight:${weight};font-display:block;`
    + (range ? `unicode-range:${range};` : '')
    + `src:url(data:font/woff2;base64,${b64}) format('woff2')}`;

  const latin = Object.entries(FONTS.faces).map(([w, b64]) => rule(w, b64, null));
  const tamil = FONTS.tamil
    ? Object.entries(FONTS.tamil.faces).map(
        ([w, b64]) => rule(w, b64, FONTS.tamil.unicodeRange))
    : [];
  // Tamil first: later rules win ties, and the Latin faces carry no
  // unicode-range so they must not shadow the narrower Tamil declaration.
  return [...tamil, ...latin].join('');
}

// ─── renderer ───────────────────────────────────────────────────────────────
/**
 * @param {object} opts
 * @param {string} opts.id               badge id (seeds decoration)
 * @param {string} [opts.role]           emphasised line, e.g. "Speaker"
 * @param {string} [opts.wordmarkText]   issuer lockup; \n forces a line break
 * @param {string} [opts.description]    <desc> for screen readers
 * @param {string} [opts.footer]         small rim caption
 * @param {object} [opts.palette]        overrides PALETTE per badge
 * @param {string} [opts.crest]          raw SVG <g> to drop into the field
 * @param {string} [opts.crestTransform] transform placing the crest
 * @param {string} [opts.caption]        tracked caption under a crest
 * @param {string} [opts.label]          accessible name for the crest layout
 * @param {boolean} [opts.embedFont]     inline the woff2 faces (default true)
 */
function renderBadgeSvg(opts) {
  const {
    id,
    role = '',
    wordmarkText = WORDMARK_TEXT,
    description = '',
    footer = '',
    palette = {},
    crest = null,
    crestTransform = '',
    caption = '',
    label: labelOverride = '',
    embedFont = true,
    recipientName = '',
  } = opts;

  const P = { ...PALETTE, ...palette };
  const cx = W / 2, cy = H / 2;
  const outer = hexPoints(cx, cy, H - 14);
  const inner = hexPoints(cx, cy, H - 34);
  const uid = escAttr(id);

  const frame = `  <defs>${embedFont ? `
    <style type="text/css">${fontFaceCss()}</style>` : ''}
    <linearGradient id="rim-${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0"   stop-color="${P.rimBright}"/>
      <stop offset="0.5" stop-color="${P.rim}"/>
      <stop offset="1"   stop-color="${P.rim}"/>
    </linearGradient>
    <radialGradient id="field-${uid}" cx="50%" cy="42%" r="72%">
      <stop offset="0" stop-color="${P.field}"/>
      <stop offset="1" stop-color="${P.fieldDeep}"/>
    </radialGradient>
    <clipPath id="clip-${uid}">
      <polygon points="${ptsToAttr(inner)}"/>
    </clipPath>
  </defs>

  <!-- rim -->
  <polygon points="${ptsToAttr(outer)}" fill="url(#rim-${uid})"/>
  <!-- field -->
  <polygon points="${ptsToAttr(inner)}" fill="url(#field-${uid})"/>`;

  const doc = (label, desc, body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
     role="img" aria-labelledby="t-${uid} d-${uid}">
  <title id="t-${uid}">${escText(label)}</title>
  <desc id="d-${uid}">${escText(desc || label)}</desc>
${frame}

${body}
</svg>`;

  // ── crest layout ─────────────────────────────────────────────────────────
  if (crest) {
    const CAP_LH = 1.42, CAP_TRACK = 3.4;
    const capTop = cy + 152;
    // fieldHalfAt takes an offset from centre, not an absolute y.
    const capBlock = caption
      ? fitBlock(caption.toUpperCase(), {
          weight: 700, tracking: CAP_TRACK, maxSize: 23, minSize: 15,
          targetWidth: fieldHalfAt(capTop + 40 - cy) * 2 - 40,
          lineHeight: CAP_LH,
        })
      : null;

    const capZone = capBlock
      ? {
          x0: cx - Math.max(...capBlock.lines.map(
                (l) => measure(l, capBlock.size, 700, CAP_TRACK))) / 2 - 16,
          x1: cx + Math.max(...capBlock.lines.map(
                (l) => measure(l, capBlock.size, 700, CAP_TRACK))) / 2 + 16,
          y0: capTop - 10,
          y1: capTop + capBlock.height + 10,
        }
      : null;

    const { plus, rimClouds, backClouds } = decorateCrest(id, P, capZone);
    const captionEl = capBlock
      ? drawBlock(capBlock, cx, capTop, P.ink, CAP_LH, ' opacity="0.92"')
      : '';

    // Depth stack: rim clouds -> back clouds -> crest -> marks -> caption.
    const body = `  <g clip-path="url(#clip-${uid})">
    <!-- clouds cropped by the rim -->
    ${rimClouds}
    <!-- clouds behind the crest -->
    ${backClouds}
    <!-- crest -->
    <g transform="${escAttr(crestTransform)}">
      ${crest}
    </g>
    <!-- foreground marks -->
    ${plus}
    <!-- caption -->
    ${captionEl}
  </g>`;
    return doc(labelOverride || role || id, description, body);
  }

  // ── type layout ──────────────────────────────────────────────────────────
  //
  //   AWS User Group        light, white, auto-fitted to fill the width
  //      Madurai
  //   ──────────────        accent rule
  //     Supporter           bold, violet, auto-fitted
  //
  // Both blocks are sized so their widest line lands on the same target width,
  // which is what makes the badge read as filled rather than floating.
  const MARK_LH = 1.14, ROLE_LH = 1.12, NAME_LH = 1.2;
  const RULE_GAP = 30, RULE_W_FRAC = 0.42, NAME_GAP = 34;

  // Width ceiling, taken from the hexagon at the type band rather than a flat
  // constant, less a margin so type never crowds the rim.
  const TARGET = fieldHalfAt(96) * 2 - 100;

  // Shrink-to-fit, not grow-to-fill. Matching the reference means a consistent
  // type scale (light 56 / bold 54); letting short roles inflate to the full
  // width made "Speaker" tower over the issuer line.
  const markBlock = fitBlock(wordmarkText, {
    weight: 300, maxSize: 56, minSize: 28, targetWidth: TARGET, lineHeight: MARK_LH,
  });

  const roleBlock = fitBlock(role, {
    weight: 700, maxSize: 54, minSize: 24, targetWidth: TARGET, lineHeight: ROLE_LH,
  });

  // Names run from "Raj" to "Lakshmi Venkataraman Subramanian", so this gets a
  // wide shrink range. Narrower target than the role: the name sits lower, where
  // the hexagon has begun to taper.
  const nameBlock = recipientName
    ? fitBlock(recipientName, {
        weight: 500, maxSize: 34, minSize: 17,
        targetWidth: fieldHalfAt(150) * 2 - 96, lineHeight: NAME_LH,
      })
    : null;

  const totalH = markBlock.height + RULE_GAP * 2 + roleBlock.height
    + (nameBlock ? roleBlock.descent + NAME_GAP + nameBlock.height : 0);
  // Personalised badges carry an extra block, so the stack is nudged up to keep
  // the optical centre steady against the name-free version.
  const top = cy - totalH / 2 + (footer ? -14 : 0) - (nameBlock ? 10 : 0);

  const wordmarkEl = drawBlock(markBlock, cx, top, P.ink, MARK_LH);

  const ruleY = top + markBlock.height + RULE_GAP;
  const ruleHalf = (TARGET * RULE_W_FRAC) / 2;
  const rule = `<path d="M${round(cx - ruleHalf)} ${round(ruleY)}`
    + `H${round(cx + ruleHalf)}" stroke="${P.accent}" stroke-width="2.5" `
    + `stroke-linecap="round" opacity="0.85"/>`;

  const roleTop = top + markBlock.height + RULE_GAP * 2;
  const roleEl = drawBlock(roleBlock, cx, roleTop, P.accent, ROLE_LH);

  // ── recipient name ───────────────────────────────────────────────────────
  // Present only on the personalised assertion image. The generic BadgeClass
  // image must stay name-free: per OB2 it is the template shared by every
  // earner, so stamping a name on it would be semantically wrong.
  let hairlineEl = '';
  let nameEl = '';
  if (nameBlock) {
    // Start below the role's descenders, not below its baseline.
    const afterRole = roleTop + roleBlock.height + roleBlock.descent;
    const hairY = afterRole + NAME_GAP * 0.42;
    const hairHalf = (TARGET * 0.22) / 2;
    hairlineEl = `<path d="M${round(cx - hairHalf)} ${round(hairY)}`
      + `H${round(cx + hairHalf)}" stroke="${P.ink}" stroke-width="1.4" `
      + `stroke-linecap="round" stroke-dasharray="5 6" opacity="0.4"/>`;
    nameEl = drawBlock(nameBlock, cx, afterRole + NAME_GAP,
      P.ink, NAME_LH, ' opacity="0.94"');
  }

  // Kept clear of the lower taper. At cy+236 the field is only ~190 wide and
  // the caption crowded the vertex.
  const footerEl = footer
    ? `<text x="${cx}" y="${round(cy + 210)}" text-anchor="middle" `
      + `font-family="${FONT_STACK}" font-size="19" font-weight="700" `
      + `letter-spacing="3.4" dx="1.7" fill="${P.accent}">`
      + `${escText(footer.toUpperCase())}</text>`
    : '';

  // Measured type zone, so decoration dodges the actual glyph box.
  const widest = Math.max(
    ...markBlock.lines.map((l) => measure(l, markBlock.size, 300)),
    ...roleBlock.lines.map((l) => measure(l, roleBlock.size, 700)),
    ...(nameBlock ? nameBlock.lines.map((l) => measure(l, nameBlock.size, 500)) : []),
  );
  const zone = {
    x0: cx - widest / 2 - 22,
    x1: cx + widest / 2 + 22,
    y0: top - 20,
    y1: top + totalH + (footer ? 60 : 20),
  };
  const { plus, clouds } = decorate(id, P, zone);

  const body = `  <!-- decoration, clipped to the field so nothing bleeds over the rim -->
  <g clip-path="url(#clip-${uid})">
    ${clouds}
    ${plus}
  </g>

  <!-- wordmark -->
  ${wordmarkEl}
  ${rule}

  <!-- role -->
  ${roleEl}

  <!-- recipient -->
  ${hairlineEl}
  ${nameEl}
  ${footerEl}`;

  const flat = wordmarkText.replace(/\n/g, ' ');
  return doc(`${flat} ${role}`.trim(), description, body);
}

module.exports = {
  renderBadgeSvg, bakeSvg, PALETTE, W, H,
  FONT_STACK, FONT_FAMILY, WORDMARK_TEXT, FONTS,
  fieldHalfAt, measure,
};
