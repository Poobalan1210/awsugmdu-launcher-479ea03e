// Agent registry — auto-loads every agent module in this folder.
// -----------------------------------------------------------------------------
// Onboarding a new agent is just: drop a `<id>.js` module here (copy _template.js).
// No edits needed in this file or the dispatcher. Files starting with "_" (e.g.
// _template.js) and this index are skipped.

const fs = require('fs');
const path = require('path');

const AGENTS = {};

for (const file of fs.readdirSync(__dirname)) {
  if (file === 'index.js' || file.startsWith('_') || !file.endsWith('.js')) continue;

  const mod = require(path.join(__dirname, file));
  if (!mod || !mod.id) {
    console.warn(`[agents] ${file} has no "id" export — skipped`);
    continue;
  }
  if (typeof mod.buildPayload !== 'function' || typeof mod.format !== 'function') {
    console.warn(`[agents] ${mod.id} missing buildPayload/format — skipped`);
    continue;
  }
  AGENTS[mod.id] = mod;
}

console.log(`[agents] registered: ${Object.keys(AGENTS).join(', ') || '(none)'}`);

module.exports = { AGENTS };
