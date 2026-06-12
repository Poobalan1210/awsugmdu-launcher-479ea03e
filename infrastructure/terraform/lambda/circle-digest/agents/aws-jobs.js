// Agent: Amazon & AWS Jobs
// -----------------------------------------------------------------------------
// One self-contained agent definition. The dispatcher auto-loads every file in
// this folder (see agents/index.js), so onboarding a new agent = drop a new
// module here that exports the same shape. See _template.js for a starting point.
//
// Security note: the AgentCore ARN lives here (server-side) and is NEVER stored
// in DynamoDB or exposed to the UI. The UI/DB only carry the agent `id`.

module.exports = {
  // Stable id. MUST match the catalog entry in src/lib/agentCatalog.ts and the
  // whitelist in circles-crud/index.js.
  id: 'aws-jobs',

  // The AgentCore runtime this agent calls.
  agentRuntimeArn:
    'arn:aws:bedrock-agentcore:us-east-1:333105300941:runtime/awsjobs-GW1BCZ2qfj',
  qualifier: 'DEFAULT',

  // Build the request payload sent to the agent runtime. Jobs uses `days`
  // (not `hours`) and optionally supports `search_term` / `location`.
  buildPayload: () => ({ format: 'json', days: 7, max_items: 8 }),

  // Turn the agent's response into an ARRAY of small posts: a lead/summary post
  // (isLead) followed by one compact post per job opening. Return [] to skip
  // posting (e.g. nothing within the lookback window this run).
  format: (body) => formatJobsDigest(body),
};

function formatJobsDigest(body) {
  const digest = body && body.digest;
  const items = (digest && digest.items) || [];
  if (!items.length) return []; // "all quiet" — skip posting

  // Dedupe on link (the amazon + aws searches can surface the same role).
  const seen = new Set();
  const unique = items.filter((it) => {
    const key = it.link || it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!unique.length) return [];

  const posts = [];

  // Lead post: title + one-line overview. NOT pinned — it's the first card
  // inside the collapsible digest group, so it stays with its items.
  const leadLines = [`## 💼 ${digest.title || 'Amazon & AWS Jobs'}`];
  if (digest.headline) leadLines.push(`\n${digest.headline}`);
  leadLines.push(
    `\n_${unique.length} opening${unique.length === 1 ? '' : 's'} below._`
  );
  posts.push({ content: leadLines.join('\n'), pinned: false, isLead: true });

  // One compact post per opening.
  for (const it of unique) {
    const lines = [`**${it.title}**`];

    const tags = [];
    if (it.category) tags.push(`\`${it.category}\``);
    if (it.team) tags.push(`\`${it.team}\``);
    if (tags.length) lines.push(tags.join(' '));

    if (it.location) lines.push(`📍 ${it.location}`);
    if (it.summary) lines.push(`\n${it.summary}`);

    // posted may be null — guard it.
    if (it.posted) {
      const d = new Date(it.posted);
      if (!Number.isNaN(d.getTime())) {
        lines.push(`\n_Posted ${d.toISOString().slice(0, 10)}_`);
      }
    }

    if (it.link) lines.push(`\n[Apply →](${it.link})`);
    posts.push({ content: lines.join('\n'), pinned: false });
  }

  return posts;
}
