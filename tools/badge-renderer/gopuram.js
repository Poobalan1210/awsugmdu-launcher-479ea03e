'use strict';
/**
 * Madurai gopuram crest — parametric line-art illustration.
 *
 * Drawn in a local 1000x1000 box so the maths stays readable; the caller scales
 * and positions it with a transform. Nothing here is hardcoded path data, so
 * tier count, taper, pillar count and stroke weight are all tunable.
 *
 * Anatomy, bottom to top:
 *   mandapam  colonnaded base platform
 *   talas     stacked tapering tiers, each with cornice + relief dashes
 *   spine     central vertical band with accent blocks, one per tier
 *   medallion concentric emblem near the crown
 *   kalasams  finial row along the top edge
 */

const round = (n) => Math.round(n * 100) / 100;
const lerp = (a, b, t) => a + (b - a) * t;

// deterministic jitter so relief dashes differ per tier but never per render
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

/**
 * Proportions traced off the reference art. The whole structure is WIDER than
 * it is tall (~1.4:1) — a gopuram reads as squat and massive, and making it
 * slender is the single easiest way to get it wrong.
 *
 *   y 228  tip of the centre kalasam
 *   y 300  crown cap (flares wider than the tier below it)
 *   y 600  tower meets the platform
 *   y 730  stylobate
 *   x 150..850  widest point (the mandapam)
 */
const DEFAULTS = {
  cx: 500,
  towerTop: 300,     // y of the crown cornice
  towerBottom: 600,  // y where the tower meets the platform
  halfTop: 100,      // half-width at towerTop
  halfBottom: 280,   // half-width at towerBottom
  tiers: 6,
  crownFlare: 30,    // how far the crown cap oversails halfTop
  crownH: 26,        // depth of the crown cap
  kudus: 11,         // small niche ticks along the crown
  backdrop: null,    // fill colour for the silhouette; null = transparent
  platformTop: 600,
  baseBottom: 730,
  pillars: 8,
  reliefRows: 3,     // sculpture-row dashes per tier
  spineTop: 17,      // half-width of the central band at towerTop
  spineBottom: 30,   // ...and at towerBottom
  ink: '#FFFFFF',
  accent: '#A375F0',
  sw: 3.4,           // primary stroke width (local units)
  swThin: 2.3,
};

/** Half-width of the central spine at a given y. Needed before the spine is
 *  drawn, because the relief dashes have to start outside it. */
const spineHalfAtRaw = (o, y) => lerp(o.spineTop, o.spineBottom,
  (y - o.towerTop) / (o.towerBottom - o.towerTop));

function renderGopuram(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const { cx, ink, accent, sw, swThin } = o;
  const rand = rng(0x9e3779b9);

  const halfAt = (y) => lerp(o.halfTop, o.halfBottom,
    (y - o.towerTop) / (o.towerBottom - o.towerTop));

  const parts = [];
  const tierH = (o.towerBottom - o.towerTop) / o.tiers;
  const platHalf = o.halfBottom + 48;
  const capTopHalfPre = o.halfTop + o.crownFlare;
  const capTopPre = o.towerTop - o.crownH;

  // ── opaque backdrop ──────────────────────────────────────────────────────
  // Without this, anything drawn behind the crest (clouds) shows through the
  // open line art and turns the tower into mush. Filling the silhouette with
  // the field colour makes the tower occlude them, which is what the reference
  // art does.
  if (o.backdrop) {
    parts.push(
      `<path d="M${round(cx - capTopHalfPre)} ${round(capTopPre)}`
      + `H${round(cx + capTopHalfPre)}`
      + `L${round(cx + o.halfTop + 4)} ${round(o.towerTop)}`
      + `L${round(cx + o.halfBottom)} ${round(o.towerBottom)}`
      + `L${round(cx + platHalf)} ${round(o.platformTop)}`
      + `V${round(o.baseBottom)}`
      + `H${round(cx - platHalf)}`
      + `V${round(o.platformTop)}`
      + `L${round(cx - o.halfBottom)} ${round(o.towerBottom)}`
      + `L${round(cx - o.halfTop - 4)} ${round(o.towerTop)}`
      + `Z" fill="${o.backdrop}" stroke="none"/>`);
  }

  // ── tower silhouette ─────────────────────────────────────────────────────
  parts.push(
    `<path d="M${round(cx - o.halfTop)} ${o.towerTop}`
    + `L${round(cx - o.halfBottom)} ${o.towerBottom}`
    + `M${round(cx + o.halfTop)} ${o.towerTop}`
    + `L${round(cx + o.halfBottom)} ${o.towerBottom}" `
    + `stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`);

  // ── tiers: cornice band + relief dashes ──────────────────────────────────
  for (let i = 0; i <= o.tiers; i++) {
    const y = o.towerTop + i * tierH;
    const hw = halfAt(y);
    // double-line cornice
    parts.push(
      `<path d="M${round(cx - hw)} ${round(y)}H${round(cx + hw)}" `
      + `stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`);
    if (i < o.tiers) {
      const hw2 = halfAt(y + 9);
      parts.push(
        `<path d="M${round(cx - hw2)} ${round(y + 9)}H${round(cx + hw2)}" `
        + `stroke="${ink}" stroke-width="${swThin}" opacity="0.75" stroke-linecap="round"/>`);
    }

    // relief dashes: short horizontals suggesting sculpture rows
    if (i < o.tiers) {
      for (let rIdx = 1; rIdx <= o.reliefRows; rIdx++) {
        const ry = y + (tierH * rIdx) / (o.reliefRows + 1) + 7;
        const rhw = halfAt(ry);
        const spine = spineHalfAtRaw(o, ry) + 8;
        const runway = rhw - spine - 14;   // usable width per side
        if (runway < 24) continue;
        // Two long dashes per side, not three short ones. Three reads as grey
        // texture at badge scale instead of distinct sculpture rows.
        const perSide = 2;
        for (const side of [-1, 1]) {
          for (let d = 0; d < perSide; d++) {
            const slot = runway / perSide;
            const x0 = cx + side * (spine + d * slot + 4 + rand() * slot * 0.16);
            const len = slot * (0.55 + rand() * 0.32);
            const x1 = x0 + side * len;
            if (Math.abs(x1 - cx) > rhw - 10) continue;
            const purple = rand() > 0.88;
            parts.push(
              `<path d="M${round(x0)} ${round(ry)}H${round(x1)}" `
              + `stroke="${purple ? accent : ink}" stroke-width="${swThin}" `
              + `opacity="${purple ? 1 : round(0.5 + rand() * 0.45)}" stroke-linecap="round"/>`);
          }
        }
      }
    }
  }

  // ── central spine + accent blocks ────────────────────────────────────────
  parts.push(
    `<path d="M${round(cx - o.spineTop)} ${o.towerTop}`
    + `L${round(cx - o.spineBottom)} ${o.towerBottom}`
    + `M${round(cx + o.spineTop)} ${o.towerTop}`
    + `L${round(cx + o.spineBottom)} ${o.towerBottom}" `
    + `stroke="${ink}" stroke-width="${swThin}" stroke-linecap="round"/>`);

  for (let i = 0; i < o.tiers; i++) {
    const yMid = o.towerTop + (i + 0.5) * tierH;
    const s = lerp(15, 34, i / (o.tiers - 1)); // blocks grow downward
    parts.push(
      `<rect x="${round(cx - s / 2)}" y="${round(yMid - s / 2)}" `
      + `width="${round(s)}" height="${round(s)}" rx="${round(s * 0.12)}" fill="${accent}"/>`);
  }

  // ── crown cap: a cornice that oversails the top tier ────────────────────
  // This flare is what stops the tower looking like a plain pyramid. The cap
  // widens going UP, opposite to the tower taper.
  const capBotHalf = o.halfTop + 4;
  const capTopHalf = o.halfTop + o.crownFlare;
  const capTop = o.towerTop - o.crownH;
  parts.push(
    `<path d="M${round(cx - capBotHalf)} ${round(o.towerTop)}`
    + `L${round(cx - capTopHalf)} ${round(capTop)}`
    + `H${round(cx + capTopHalf)}`
    + `L${round(cx + capBotHalf)} ${round(o.towerTop)}" `
    + `stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`,
    // lower lip of the cap
    `<path d="M${round(cx - capTopHalf)} ${round(capTop + 7)}`
    + `H${round(cx + capTopHalf)}" `
    + `stroke="${ink}" stroke-width="${swThin}" opacity="0.8" stroke-linecap="round"/>`);

  // kudu ticks — the little niche marks punched along the cap
  for (let i = 0; i < o.kudus; i++) {
    const t = i / (o.kudus - 1);
    const x = lerp(cx - capTopHalf + 9, cx + capTopHalf - 9, t);
    parts.push(
      `<path d="M${round(x)} ${round(capTop + 9)}V${round(o.towerTop - 3)}" `
      + `stroke="${ink}" stroke-width="${swThin}" opacity="0.7" stroke-linecap="round"/>`);
  }

  // ── kalasam (finial) row on top of the cap ──────────────────────────────
  // Fewer and chunkier. A dense row of thin stems reads as a comb at badge
  // scale rather than as finials.
  const kCount = 9;
  for (let i = 0; i < kCount; i++) {
    const t = i / (kCount - 1);
    const x = lerp(cx - capTopHalf + 10, cx + capTopHalf - 10, t);
    const centre = Math.abs(t - 0.5) < 0.01;
    const h = centre ? 84 : 46 - Math.abs(t - 0.5) * 24;
    parts.push(kalasam(x, capTop, h, ink, accent, centre, swThin));
  }

  // ── medallion boss, drawn LAST ──────────────────────────────────────────
  // An opaque disc first, so the tier cornices behind it are masked. Without
  // that mask the horizontal rules run straight through the emblem.
  const medY = o.towerTop + tierH * 0.58;
  const medR = 23;
  if (o.backdrop) {
    parts.push(
      `<circle cx="${cx}" cy="${round(medY)}" r="${medR + 3}" `
      + `fill="${o.backdrop}" stroke="none"/>`);
  }
  parts.push(
    `<g fill="none" stroke="${ink}" stroke-width="${swThin}">`
    + `<circle cx="${cx}" cy="${round(medY)}" r="${medR}"/>`
    + `<circle cx="${cx}" cy="${round(medY)}" r="${round(medR * 0.63)}"/>`
    + `</g>`
    + `<circle cx="${cx}" cy="${round(medY)}" r="7" fill="${accent}"/>`);

  // ── mandapam: platform + colonnade ──────────────────────────────────────
  // capstone (two beams)
  parts.push(
    `<path d="M${round(cx - platHalf)} ${round(o.platformTop)}H${round(cx + platHalf)}" `
    + `stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`,
    `<path d="M${round(cx - platHalf + 10)} ${round(o.platformTop + 13)}`
    + `H${round(cx + platHalf - 10)}" `
    + `stroke="${ink}" stroke-width="${swThin}" opacity="0.8" stroke-linecap="round"/>`);

  const colTop = o.platformTop + 26;
  const colBottom = o.baseBottom - 22;
  const colHalf = platHalf - 34;
  for (let i = 0; i < o.pillars; i++) {
    const t = i / (o.pillars - 1);
    const x = lerp(-colHalf, colHalf, t) + cx;
    parts.push(pillar(x, colTop, colBottom, ink, swThin));
  }
  // stylobate
  parts.push(
    `<path d="M${round(cx - colHalf - 26)} ${round(colBottom)}`
    + `H${round(cx + colHalf + 26)}" `
    + `stroke="${ink}" stroke-width="${sw}" stroke-linecap="round"/>`,
    `<path d="M${round(cx - colHalf - 14)} ${round(o.baseBottom)}`
    + `H${round(cx + colHalf + 14)}" `
    + `stroke="${ink}" stroke-width="${swThin}" opacity="0.8" stroke-linecap="round"/>`);

  return `<g fill="none" stroke-linejoin="round">\n    ${parts.join('\n    ')}\n  </g>`;
}

/**
 * Finial. Outer ones are stem + pot. The centre one is the tall spire and gets
 * a second stacked pot plus an accent tip, so it reads as the apex rather than
 * just a longer stick.
 */
function kalasam(x, baseY, h, ink, accent, centre, sw) {
  const potR = centre ? 15 : 11;
  const potY = baseY - h * 0.34;
  const tipY = baseY - h;
  const g = [
    // stem down to the base
    `<path d="M${round(x)} ${round(baseY)}V${round(potY + potR * 0.7)}"/>`,
    // main pot
    `<ellipse cx="${round(x)}" cy="${round(potY)}" rx="${round(potR)}" ry="${round(potR * 0.8)}"/>`,
    // neck up to the tip
    `<path d="M${round(x)} ${round(potY - potR * 0.8)}V${round(tipY + (centre ? 14 : 0))}"/>`,
  ];
  if (centre) {
    const upperY = baseY - h * 0.72;
    g.push(
      `<ellipse cx="${round(x)}" cy="${round(upperY)}" rx="9" ry="7"/>`,
      `<path d="M${round(x - 11)} ${round(potY - potR * 0.8 - 3)}H${round(x + 11)}"/>`,
      `<path d="M${round(x)} ${round(tipY + 14)}V${round(tipY + 4)}"/>`);
  }
  return `<g stroke="${ink}" stroke-width="${sw}" stroke-linecap="round">${g.join('')}</g>`
    + (centre
        ? `<circle cx="${round(x)}" cy="${round(tipY)}" r="5" fill="${accent}"/>`
        : '');
}

/** Colonnade pillar: shaft with capital and base. */
function pillar(x, top, bottom, ink, sw) {
  const w = 13;
  return `<g stroke="${ink}" stroke-width="${sw}" stroke-linecap="round">`
    + `<path d="M${round(x - w / 2)} ${round(top)}V${round(bottom)}`
    + `M${round(x + w / 2)} ${round(top)}V${round(bottom)}"/>`
    + `<path d="M${round(x - w)} ${round(top)}H${round(x + w)}`
    + `M${round(x - w)} ${round(bottom)}H${round(x + w)}"/>`
    + `</g>`;
}

module.exports = { renderGopuram };
