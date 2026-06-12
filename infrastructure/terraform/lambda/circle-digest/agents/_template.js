// Agent template — COPY THIS FILE to onboard a new agent.
// -----------------------------------------------------------------------------
// Files prefixed with "_" are IGNORED by the auto-loader, so this template never
// registers itself. To add a real agent:
//
//   1. Copy this file to  agents/<your-agent-id>.js  (e.g. agents/aws-jobs.js)
//   2. Fill in id, agentRuntimeArn, buildPayload, format.
//   3. Add a matching entry to  src/lib/agentCatalog.ts   (drives the Admin UI).
//   4. Add the id to AGENT_TYPES in  circles-crud/index.js  (server-side whitelist).
//   5. Grant the dispatcher Lambda permission to invoke the new AgentCore ARN
//      (see circle-digest.tf IAM policy).
//   6. Redeploy:  ./deploy.sh
//
// That's the whole framework. The dispatcher, scheduling, posting, dedupe, and
// the collapsible digest UI all work automatically for any registered agent.

module.exports = {
  // Stable id. MUST match the catalog entry (frontend) and the crud whitelist.
  id: 'example-agent',

  // The AgentCore runtime ARN this agent invokes (kept server-side only).
  agentRuntimeArn: 'arn:aws:bedrock-agentcore:us-east-1:ACCOUNT:runtime/REPLACE_ME',
  qualifier: 'DEFAULT',

  // Build the JSON request payload sent to the agent runtime.
  buildPayload: () => ({ format: 'json' }),

  // Convert the agent's response into an array of posts:
  //   [{ content, pinned?, isLead? }, ...]
  // - isLead: true  -> the summary/lead card (shown first in the digest)
  // - pinned: usually false (digests group themselves; pinning is optional)
  // Return [] to post nothing this run.
  format: (body) => {
    const items = (body && body.items) || [];
    if (!items.length) return [];

    const posts = [];
    posts.push({
      content: `## ${body.title || 'Update'}\n\n_${items.length} item(s) below._`,
      isLead: true,
    });
    for (const it of items) {
      posts.push({ content: `**${it.title}**\n\n${it.summary || ''}` });
    }
    return posts;
  },
};
