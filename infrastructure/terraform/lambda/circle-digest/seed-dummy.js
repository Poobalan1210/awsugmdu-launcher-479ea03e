// One-off helper: seed N days of dummy AWS News digests into a circle so we can
// see the collapsible digest archive UI with real volume.
//
//   node seed-dummy.js <circleId> [days]
//
// Each day becomes one digest run (unique digestRunId): a lead/summary post
// followed by several news-item posts. Dates step backwards from "yesterday"
// so the existing live digest stays the newest. Existing messages are kept.
//
// Remove the seeded posts later with:  node seed-dummy.js <circleId> --clean

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE = process.env.CIRCLES_TABLE_NAME || 'awsug-circles';
const BOT_USER_ID = 'agent-aws-news-digest';
const BOT_NAME = 'AWS News Digest';
const SEED_TAG = 'seed'; // digestRunId prefix so we can clean these up later

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// Pool of believable AWS-style headlines to vary each day.
const NEWS_POOL = [
  { headline: 'Amazon S3 adds conditional writes for concurrent applications', category: 'Storage', summary: 'S3 now supports conditional writes so apps can check for an existing object before writing, preventing accidental overwrites.' },
  { headline: 'AWS Lambda announces support for 10 GB ephemeral storage', category: 'Serverless', summary: 'Functions can now configure up to 10 GB of /tmp storage, helping data-heavy and ML inference workloads.' },
  { headline: 'Amazon EC2 introduces new memory-optimized R8g instances', category: 'Compute', summary: 'R8g instances powered by Graviton4 deliver up to 30% better performance for in-memory databases.' },
  { headline: 'AWS Step Functions adds variables and JSONata support', category: 'Serverless', summary: 'You can now store variables across states and transform data with JSONata, reducing the need for extra Lambda glue.' },
  { headline: 'Amazon RDS for PostgreSQL supports the latest minor versions', category: 'Databases', summary: 'New minor versions bring security fixes and performance improvements for managed PostgreSQL fleets.' },
  { headline: 'AWS CloudFormation now provisions resources up to 40% faster', category: 'Management', summary: 'Parallel resource provisioning shortens stack create and update times for large templates.' },
  { headline: 'Amazon CloudFront adds gRPC support for origins', category: 'Networking', summary: 'CloudFront can now proxy gRPC traffic end to end, enabling low-latency streaming APIs at the edge.' },
  { headline: 'AWS IAM Access Analyzer adds unused access findings', category: 'Security', summary: 'Access Analyzer highlights unused roles, permissions, and credentials to help tighten least privilege.' },
  { headline: 'Amazon Bedrock introduces prompt caching for supported models', category: 'AI/ML', summary: 'Prompt caching cuts cost and latency for repeated context across requests to foundation models.' },
  { headline: 'AWS Glue 5.0 brings faster Spark and Python upgrades', category: 'Analytics', summary: 'Glue 5.0 ships with newer Spark and Python runtimes plus improved job startup times.' },
  { headline: 'Amazon DynamoDB reduces on-demand throughput prices', category: 'Databases', summary: 'On-demand read and write request prices drop, making spiky workloads more cost effective.' },
  { headline: 'AWS Fargate supports larger task sizes for ECS', category: 'Containers', summary: 'ECS on Fargate now supports larger vCPU and memory combinations for demanding containerized workloads.' },
  { headline: 'Amazon SQS adds fair queues to reduce noisy-neighbor impact', category: 'Application Integration', summary: 'Fair queues distribute throughput more evenly across message groups during traffic spikes.' },
  { headline: 'AWS Backup adds support for Amazon S3 multi-Region copies', category: 'Storage', summary: 'You can now copy S3 backups across Regions for stronger disaster-recovery posture.' },
  { headline: 'Amazon EKS supports Kubernetes version upgrades with less downtime', category: 'Containers', summary: 'Improved control-plane upgrades reduce disruption during cluster version bumps.' },
  { headline: 'AWS CodeBuild adds support for reserved-capacity fleets', category: 'Developer Tools', summary: 'Reserved fleets keep build machines warm to cut cold-start time for CI pipelines.' },
];

const HEADLINES = [
  'AWS enhances resilience, performance, and developer experience',
  'New launches across compute, storage, and AI services',
  'Security and cost improvements land across the platform',
  'Serverless and container updates headline this digest',
  'Data, analytics, and networking get notable upgrades',
];

function pickItems(seed, count) {
  // Deterministic-ish rotation through the pool so each day differs.
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(NEWS_POOL[(seed * 3 + i) % NEWS_POOL.length]);
  }
  return items;
}

function buildMessage({ circleId, content, createdAt, digestRunId, isLead }) {
  return {
    id: `msg-${Date.parse(createdAt)}-${randomUUID().slice(0, 8)}`,
    groupId: circleId,
    userId: BOT_USER_ID,
    userName: BOT_NAME,
    userAvatar: '',
    content,
    createdAt,
    replies: [],
    likes: 0,
    likedBy: [],
    isPinned: false,
    digestRunId,
    isDigestLead: !!isLead,
  };
}

function buildDigestForDay(circleId, dayOffset) {
  // dayOffset 1 = yesterday, 2 = two days ago, ...
  const day = new Date();
  day.setUTCDate(day.getUTCDate() - dayOffset);
  day.setUTCHours(9, 0, 0, 0); // 9am UTC each day

  const dateLabel = day.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
  const digestRunId = `${SEED_TAG}-${day.toISOString().slice(0, 10)}`;

  const itemCount = 4 + (dayOffset % 4); // 4..7 items
  const items = pickItems(dayOffset, itemCount);

  const messages = [];
  let stepMs = 0;
  const ts = () => new Date(day.getTime() + (stepMs++) * 1000).toISOString();

  // Lead / summary post.
  const lead = [
    `## 📰 AWS News - ${dateLabel}`,
    `\n${HEADLINES[dayOffset % HEADLINES.length]}`,
    `\n_${itemCount} update${itemCount === 1 ? '' : 's'} below._`,
  ].join('\n');
  messages.push(buildMessage({ circleId, content: lead, createdAt: ts(), digestRunId, isLead: true }));

  // One post per news item.
  for (const it of items) {
    const content = [
      `**${it.headline}**`,
      `\`${it.category}\``,
      `\n${it.summary}`,
      `\n[Read more →](https://aws.amazon.com/about-aws/whats-new/)`,
    ].join('\n');
    messages.push(buildMessage({ circleId, content, createdAt: ts(), digestRunId }));
  }

  return messages;
}

async function main() {
  const circleId = process.argv[2];
  const arg = process.argv[3];

  if (!circleId) {
    console.error('Usage: node seed-dummy.js <circleId> [days|--clean]');
    process.exit(1);
  }

  const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { id: circleId } }));
  if (!res.Item) {
    console.error(`Circle ${circleId} not found in ${TABLE}`);
    process.exit(1);
  }
  const existing = res.Item.messages || [];

  if (arg === '--clean') {
    const kept = existing.filter(
      (m) => !(typeof m.digestRunId === 'string' && m.digestRunId.startsWith(`${SEED_TAG}-`))
    );
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { id: circleId },
      UpdateExpression: 'SET messages = :m, updatedAt = :u',
      ExpressionAttributeValues: { ':m': kept, ':u': new Date().toISOString() },
    }));
    console.log(`Removed ${existing.length - kept.length} seeded message(s). ${kept.length} remain.`);
    return;
  }

  const days = Math.max(1, parseInt(arg, 10) || 10);
  let added = [];
  for (let d = 1; d <= days; d++) {
    added = added.concat(buildDigestForDay(circleId, d));
  }

  const merged = existing.concat(added);
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { id: circleId },
    UpdateExpression: 'SET messages = :m, updatedAt = :u',
    ExpressionAttributeValues: { ':m': merged, ':u': new Date().toISOString() },
  }));

  console.log(`Added ${added.length} message(s) across ${days} day(s). Total now ${merged.length}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
