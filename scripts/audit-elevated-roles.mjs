#!/usr/bin/env node
/**
 * Read-only audit: who holds organiser-level access, and who has the most points.
 *
 * Until the API verified sign-in tokens, PUT /users/{id} accepted `role`,
 * `points` and `badges` from anyone. Run this once after deploying the fix and
 * check every name below is someone you expect. Nothing is written.
 *
 *   node scripts/audit-elevated-roles.mjs [--region us-east-1] [--prefix awsug]
 *
 * Uses your normal AWS credentials. USERS_TABLE_NAME overrides <prefix>-users.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ELEVATED = ['admin', 'organiser', 'volunteer', 'judge'];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const region = arg('region', process.env.AWS_REGION || 'us-east-1');
const table = process.env.USERS_TABLE_NAME || `${arg('prefix', 'awsug')}-users`;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }));

const users = [];
let ExclusiveStartKey;
do {
  const page = await ddb.send(new ScanCommand({
    TableName: table,
    ProjectionExpression: 'userId, #n, #r, #rs, points, createdAt, updatedAt',
    ExpressionAttributeNames: { '#n': 'name', '#r': 'role', '#rs': 'roles' },
    ExclusiveStartKey,
  }));
  users.push(...(page.Items || []));
  ExclusiveStartKey = page.LastEvaluatedKey;
} while (ExclusiveStartKey);

const roleNames = (u) => [
  u.role,
  ...(Array.isArray(u.roles) ? u.roles.map((r) => (typeof r === 'string' ? r : r?.role)) : []),
].filter(Boolean).map((r) => String(r).toLowerCase());

console.log(`${users.length} members in ${table}\n`);

console.log('Members with an elevated role (check each one is expected):');
for (const u of users.filter((u) => roleNames(u).some((r) => ELEVATED.includes(r)))) {
  console.log(`  ${String(u.name || '?').padEnd(30)} ${roleNames(u).join(', ').padEnd(24)} ${u.userId}  updated ${String(u.updatedAt || '').slice(0, 10)}`);
}

console.log('\nHighest points (check for anything implausible):');
for (const u of [...users].sort((a, b) => (b.points || 0) - (a.points || 0)).slice(0, 15)) {
  console.log(`  ${String(u.name || '?').padEnd(30)} ${String(u.points || 0).padStart(7)}  ${u.userId}`);
}
