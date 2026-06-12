// Circle Digest — config-driven AgentCore dispatcher.
//
// ONE Lambda, ONE fixed schedule (hourly). Each run:
//   1. Scan circles for items with agentConfig.enabled === true.
//   2. Keep the ones that are DUE (based on frequency + agentConfig.lastRunAt).
//   3. For each due circle: invoke its agent, format the result, post it into
//      the circle, and stamp agentConfig.lastRunAt / lastRunStatus.
//
// Adding an agent circle is a UI action (Admin -> Circles -> Agent), NOT a
// deploy. Onboarding a new agent TYPE is a drop-in module under ./agents/
// (copy agents/_template.js) — see that file for the full checklist.
//
// Env vars:
//   CIRCLES_TABLE_NAME  - DynamoDB circles table (default awsug-circles)

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} = require('@aws-sdk/client-bedrock-agentcore');
const { randomUUID } = require('crypto');

// Auto-loaded agent registry. Each agent is a self-contained module in ./agents.
const { AGENTS } = require('./agents');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const agentCore = new BedrockAgentCoreClient({});

const CIRCLES_TABLE = process.env.CIRCLES_TABLE_NAME || 'awsug-circles';

const FREQUENCY_MS = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

exports.handler = async () => {
  const circles = await scanAgentCircles();
  const now = Date.now();
  const due = circles.filter((c) => isDue(c.agentConfig, now));

  console.log(`[circle-digest] ${circles.length} agent circle(s), ${due.length} due`);

  const results = [];
  for (const circle of due) {
    try {
      const posted = await runForCircle(circle);
      await stampRun(circle.id, posted ? 'posted' : 'skipped-empty');
      results.push({ circleId: circle.id, status: posted ? 'posted' : 'skipped-empty' });
    } catch (err) {
      console.error(`[circle-digest] circle=${circle.id} failed:`, err);
      await stampRun(circle.id, `error: ${err.name || 'Error'}`).catch(() => {});
      results.push({ circleId: circle.id, status: 'error', error: err.message });
    }
  }

  return { ok: true, processed: results.length, results };
};

async function scanAgentCircles() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: CIRCLES_TABLE,
        FilterExpression: 'agentConfig.enabled = :true',
        ExpressionAttributeValues: { ':true': true },
        ExclusiveStartKey,
      })
    );
    items.push(...(out.Items || []));
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function isDue(cfg, now) {
  if (!cfg || !cfg.enabled) return false;
  if (!AGENTS[cfg.type]) return false;
  if (!cfg.lastRunAt) return true; // never run
  const interval = FREQUENCY_MS[cfg.frequency] || FREQUENCY_MS.daily;
  // Run slightly early (minus a 5-min slack) so an hourly tick doesn't drift.
  return now - new Date(cfg.lastRunAt).getTime() >= interval - 5 * 60 * 1000;
}

async function runForCircle(circle) {
  const cfg = circle.agentConfig;
  const agent = AGENTS[cfg.type];

  const digest = await invokeAgent(agent);
  const posts = agent.format(digest); // array of { content, pinned? }
  if (!posts || !posts.length) return false; // nothing to post

  await postIntoCircle(circle, cfg, posts);
  return true;
}

async function invokeAgent(agent) {
  const out = await agentCore.send(
    new InvokeAgentRuntimeCommand({
      agentRuntimeArn: agent.agentRuntimeArn,
      qualifier: agent.qualifier,
      runtimeSessionId: `circle-digest-${randomUUID()}`,
      contentType: 'application/json',
      accept: 'application/json',
      payload: Buffer.from(JSON.stringify(agent.buildPayload())),
    })
  );
  const raw = await out.response.transformToString();
  return JSON.parse(raw);
}

// ---- posting ---------------------------------------------------------------
// `posts` is an array of { content, pinned } — one lead + one per item.
async function postIntoCircle(circle, cfg, posts) {
  const now = new Date().toISOString();
  const botUserId = `agent-${cfg.type}`;
  const botName = cfg.botName || 'AWS News Digest';
  const mode = cfg.mode || 'append';
  const digestRunId = `digest-${randomUUID().slice(0, 8)}`; // Tag all posts from this run

  let messages = circle.messages || [];

  // In replace mode, clear this bot's previous posts so the circle always shows
  // just the latest run (no pile-up). Other users' messages are untouched.
  if (mode === 'replace') {
    messages = messages.filter((m) => m.userId !== botUserId);
  }

  // Stamp each post a few ms apart so createdAt ordering is stable.
  let i = 0;
  for (const p of posts) {
    const ts = new Date(Date.now() + i).toISOString();
    messages.push(buildMessage({
      circle,
      botUserId,
      botName,
      content: p.content,
      now: ts,
      pinned: !!p.pinned,
      digestRunId, // Tag this post with the digest run
      isLead: !!p.isLead, // Mark the digest's lead/summary post
    }));
    i += 1;
  }

  await ddb.send(
    new UpdateCommand({
      TableName: CIRCLES_TABLE,
      Key: { id: circle.id },
      UpdateExpression: 'SET messages = :messages, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':messages': messages, ':updatedAt': now },
    })
  );
}

function buildMessage({ circle, botUserId, botName, content, now, pinned, digestRunId, isLead }) {
  return {
    id: `msg-${Date.now()}-${randomUUID().slice(0, 8)}`,
    groupId: circle.id,
    userId: botUserId,
    userName: botName,
    userAvatar: '',
    content,
    createdAt: now,
    replies: [],
    likes: 0,
    likedBy: [],
    isPinned: !!pinned,
    digestRunId, // Group posts by digest run
    isDigestLead: !!isLead, // First/summary post of the digest
  };
}

async function stampRun(circleId, status) {
  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: CIRCLES_TABLE,
      Key: { id: circleId },
      UpdateExpression:
        'SET agentConfig.lastRunAt = :t, agentConfig.lastRunStatus = :s, updatedAt = :t',
      ExpressionAttributeValues: { ':t': now, ':s': status },
    })
  );
}
