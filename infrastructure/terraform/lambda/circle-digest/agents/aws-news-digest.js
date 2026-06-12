// Agent: AWS News Digest
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
  id: 'aws-news-digest',

  // The AgentCore runtime this agent calls.
  agentRuntimeArn:
    'arn:aws:bedrock-agentcore:us-east-1:333105300941:runtime/awsnewsdigest-F6VbLM4VC5',
  qualifier: 'DEFAULT',

  // Build the request payload sent to the agent runtime.
  buildPayload: () => ({ format: 'json', hours: 24, max_items: 8 }),

  // Turn the agent's response into an ARRAY of small posts: a lead/summary post
  // (isLead) followed by one compact post per news item. Return [] to skip
  // posting (e.g. nothing newsworthy this run).
  format: (body) => formatNewsDigest(body),
};

function formatNewsDigest(body) {
  const digest = body && body.digest;
  const items = (digest && digest.items) || [];
  if (!items.length) return []; // "all quiet" — skip posting

  // Dedupe on link (same announcement can come from both feeds).
  const seen = new Set();
  const unique = items.filter((it) => {
    const key = it.link || it.headline;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const posts = [];

  // Lead post: title + one-line overview. NOT pinned — it's the first card
  // inside the collapsible digest group, so it stays with its items.
  const leadLines = [`## 📰 ${digest.title || 'AWS News'}`];
  if (digest.headline) leadLines.push(`\n${digest.headline}`);
  leadLines.push(`\n_${unique.length} update${unique.length === 1 ? '' : 's'} below._`);
  posts.push({ content: leadLines.join('\n'), pinned: false, isLead: true });

  // One compact post per item.
  for (const it of unique) {
    const lines = [`**${it.headline}**`];
    if (it.category) lines.push(`\`${it.category}\``);
    if (it.summary) lines.push(`\n${it.summary}`);
    if (it.link) lines.push(`\n[Read more →](${it.link})`);
    posts.push({ content: lines.join('\n'), pinned: false });
  }

  return posts;
}
