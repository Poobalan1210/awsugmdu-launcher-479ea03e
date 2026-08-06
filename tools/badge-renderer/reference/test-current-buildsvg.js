// Reproduces the EXACT metaBlock that buildSvg() in badges-crud/index.js emits,
// then runs Mozilla's reference extractor against it.
const bakery = require('openbadges-bakery');

const assertionUrl =
  'https://www.awsugmdu.in/ob2/assertions/b3-9f3c1a7e-4b21-4d0a-9c88-2e5f7a10bd44.json';

// ── verbatim from badges-crud/index.js buildSvg() ───────────────────────────
const metaBlock = `  <metadata xmlns:openbadges="https://w3id.org/openbadges/v2">
    <openbadges:assertion verify="${assertionUrl}" />
  </metadata>`;

const currentCodeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"
     role="img" aria-label="AWS Certified badge">
  <title>AWS Certified</title>
  <desc>Earned an AWS certification</desc>
${metaBlock}
  <circle cx="100" cy="100" r="96" fill="#FF9900"/>
  <circle cx="100" cy="100" r="88" fill="#1a1a2e"/>
  <text x="100" y="118" text-anchor="middle" font-size="13" fill="#FFFFFF">AWS Certified</text>
</svg>`;
// ───────────────────────────────────────────────────────────────────────────

console.log('Testing the SVG your buildSvg() emits when assertionUrl IS passed:\n');
console.log(metaBlock);
console.log();

bakery.extract(Buffer.from(currentCodeSvg), (err, data) => {
  if (err) {
    console.log(`  reference extractor -> FAILS: ${err.message || err}`);
  } else {
    console.log(`  reference extractor -> OK: ${String(data).trim().slice(0, 120)}`);
  }

  console.log('\nSpec deltas:');
  const svgTag = currentCodeSvg.match(/<svg\b[^>]*>/)[0];
  console.log(`  xmlns:openbadges on <svg> tag?          ${/xmlns:openbadges/.test(svgTag) ? 'yes' : 'NO'}`);
  console.log(`  namespace value is http://openbadges.org? ${
    /xmlns:openbadges="http:\/\/openbadges\.org"/.test(currentCodeSvg) ? 'yes' : 'NO  (uses w3id.org/openbadges/v2)'}`);
  console.log(`  <openbadges:assertion> direct child of <svg>? ${
    /<svg\b[^>]*>\s*<openbadges:assertion/s.test(currentCodeSvg) ? 'yes' : 'NO  (nested in <metadata>)'}`);
  console.log(`  assertion JSON in CDATA body?            ${
    /<!\[CDATA\[/.test(currentCodeSvg) ? 'yes' : 'NO  (self-closing, URL only)'}`);
});
