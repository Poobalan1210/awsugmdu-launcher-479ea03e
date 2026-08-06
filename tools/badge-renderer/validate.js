'use strict';
/**
 * Independent verification of every built artifact.
 *
 * build-badges.js already round-trips each assertion through its own extractor,
 * but that only proves self-consistency: a baker and a matching extractor can
 * agree on a format that is wrong. This script re-checks the same files with
 * Mozilla's `openbadges-bakery` — a reference implementation neither written nor
 * influenced by this codebase.
 *
 * Unbaked files are included as NEGATIVE CONTROLS. If those also "extracted",
 * the extractor would be finding phantoms and every positive result would be
 * meaningless.
 *
 * Run:  node validate.js        (exit 0 = all as expected)
 */

const fs = require('fs');
const path = require('path');
const bakery = require('openbadges-bakery');

const OUT = path.join(__dirname, 'out');
const REF = path.join(__dirname, 'reference');

const rel = (p) => path.relative(__dirname, p);

/** @returns {Promise<{ok: boolean, assertion: object|null, raw: string|null}>} */
function extract(file) {
  return new Promise((resolve) => {
    bakery.extract(fs.readFileSync(file), (err, data) => {
      if (err) return resolve({ ok: false, assertion: null, raw: null });
      let assertion = null;
      try { assertion = JSON.parse(data); } catch { /* URL or signature */ }
      return resolve({ ok: true, assertion, raw: String(data) });
    });
  });
}

function collect(dir, suffix) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(suffix)).sort()
    .map((f) => path.join(dir, f));
}

(async () => {
  /** @type {{file: string, expect: 'baked'|'empty', note: string}[]} */
  const cases = [
    ...collect(path.join(OUT, 'svg'), '-baked.svg')
      .map((f) => ({ file: f, expect: 'baked', note: '' })),
    ...collect(path.join(OUT, 'png'), '-baked.png')
      .map((f) => ({ file: f, expect: 'baked', note: '' })),
    ...collect(path.join(OUT, 'svg'), '-unbaked.svg')
      .map((f) => ({ file: f, expect: 'empty', note: 'negative control' })),
    ...collect(path.join(OUT, 'png'), '-unbaked.png')
      .map((f) => ({ file: f, expect: 'empty', note: 'negative control' })),
    {
      file: path.join(REF, 'mozilla-baked-fixture.svg'),
      expect: 'baked',
      note: 'upstream fixture — stub assertion, so fields are undefined',
    },
    {
      file: path.join(REF, 'credly-aws-badgeclass-NOT-baked.png'),
      expect: 'empty',
      note: "AWS's real Credly image; a BadgeClass image is never baked",
    },
  ].filter((c) => fs.existsSync(c.file));

  let pass = 0;
  const failures = [];

  console.log('\nverifying with mozilla/openbadges-bakery\n');

  for (const c of cases) {
    const r = await extract(c.file);
    const got = r.ok ? 'baked' : 'empty';
    const okay = got === c.expect;

    let detail;
    if (!r.ok) {
      detail = 'NO BADGE DATA';
    } else if (r.assertion && r.assertion.badge) {
      detail = `${r.assertion.type}  ${String(r.assertion.badge).split('/').pop()}`;
    } else if (r.assertion) {
      detail = `${r.assertion.type || 'JSON'} (no badge field)`;
    } else {
      detail = `raw: ${r.raw.trim().slice(0, 40)}`;
    }

    console.log(`  ${okay ? 'OK      ' : 'FAIL    '} ${rel(c.file).padEnd(30)} ${detail}`
      + (c.note ? `\n           ${c.note}` : ''));

    if (okay) pass += 1;
    else failures.push({ file: rel(c.file), expected: c.expect, got });
  }

  console.log(`\n  ${pass}/${cases.length} as expected`);
  if (failures.length) {
    console.log('\n  failures:');
    for (const f of failures) {
      console.log(`    ${f.file}  expected ${f.expected}, got ${f.got}`);
    }
    process.exitCode = 1;
  }
  console.log('');
})();
