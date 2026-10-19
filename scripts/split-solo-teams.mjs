#!/usr/bin/env node
// ============================================================================
// Split multi-member teams for a solo hackathon, and email everyone affected
//
// For a hackathon whose maximum team size is 1, every team with more than one
// member is split:
//   - the lead keeps the existing team: same id, name, join code, project,
//     mentors, submission and API key;
//   - every other member becomes the lead of a new team of one, named
//     "<old team name>_<their name>" (with _2, _3 ... only if that name is taken).
//
// Everyone on a split team is emailed once their team has been split: the lead
// hears what they keep, each member hears about their new team and what to do
// next. Sent through SES with the same sender and template as the app's emails
// (infrastructure/terraform/lambda/hackathons-crud/shared/email.js).
//
// It also closes pending invites (marked expired) and pending join requests
// (marked rejected) on every team in the hackathon. No team can take another
// member any more, so accepting one would only fail with "team is already full".
// Nobody is emailed about those.
//
// Dry run by default: prints the plan and an email preview, and changes nothing.
// Add --apply to write and send. Each team is written in one DynamoDB
// transaction that only succeeds if the team hasn't changed since it was read,
// and its emails go out only after that. A re-run is always safe: teams already
// split have one member, so they are neither split nor emailed again.
//
// Usage:
//   node scripts/split-solo-teams.mjs                                    list hackathons
//   node scripts/split-solo-teams.mjs --hackathon <id>                   dry run + email preview
//   node scripts/split-solo-teams.mjs --hackathon <id> --test-email <to> send the sample emails to <to> only
//   node scripts/split-solo-teams.mjs --hackathon <id> --apply           split and email
//
// Options:
//   --no-email         with --apply, split without sending any emails
//   --region <region>  defaults to AWS_REGION, then us-east-1 (Terraform default)
//   --prefix <prefix>  table name prefix, defaults to "awsug" (Terraform project_name)
// Credentials come from the usual AWS chain, e.g. AWS_PROFILE=<profile>. Table
// names can be overridden with the env vars the hackathons Lambda uses
// (HACKATHONS_TABLE_NAME, HACKATHON_TEAMS_TABLE_NAME, USERS_TABLE_NAME, ...),
// and the sender and site with SES_FROM_EMAIL and APP_URL.
// ============================================================================

import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';

// DynamoDB transactions take at most 100 actions: the kept team plus new teams.
const MAX_TRANSACTION_ITEMS = 100;

const EMAIL_MODULE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../infrastructure/terraform/lambda/hackathons-crud/shared/email.js',
);

// ----------------------------------------------------------------------------
// Helpers mirrored from the hackathons Lambda, so new teams look the same as
// ones created through the app.
// ----------------------------------------------------------------------------

/** Same shape as the Lambda's genId('team'). */
function newTeamId() {
  return `team-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/** Same 6-character alphabet as the Lambda's genJoinCode (no 0/O, 1/I). */
function newJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
}

/** Strip undefined values so DynamoDB doesn't reject the item. */
function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Team names are unique per hackathon, case-insensitively (as in createTeam). */
function claimUniqueName(base, takenNames) {
  let name = base;
  for (let n = 2; takenNames.has(name.toLowerCase()); n += 1) name = `${base}_${n}`;
  takenNames.add(name.toLowerCase());
  return name;
}

/** Join codes only have to be unique within the hackathon (see fetchTeamByJoinCode). */
function claimUniqueJoinCode(takenCodes, makeCode) {
  let code = makeCode();
  while (takenCodes.has(code)) code = makeCode();
  takenCodes.add(code);
  return code;
}

/** Close everything that can no longer be accepted, keeping it as history. */
function closePending(team, now) {
  return {
    ...team,
    invites: (team.invites || []).map(invite => (
      invite.status === 'pending' ? { ...invite, status: 'expired' } : invite
    )),
    joinRequests: (team.joinRequests || []).map(request => (
      request.status === 'pending' ? { ...request, status: 'rejected', respondedAt: now } : request
    )),
  };
}

const countPending = list => (list || []).filter(entry => entry.status === 'pending').length;

// ----------------------------------------------------------------------------
// Planning (no I/O)
// ----------------------------------------------------------------------------

/**
 * Work out every change without touching anything.
 *
 * Returns:
 *   splits   - teams with 2+ members: the kept team as it will be saved, plus
 *              the new solo teams
 *   cleanups - single-member teams that only need pending invites/requests closed
 *   skipped  - teams left alone because the data needs a human look
 */
export function buildPlan(teams, { now = new Date().toISOString(), makeId = newTeamId, makeJoinCode = newJoinCode } = {}) {
  const takenNames = new Set(teams.map(t => String(t.name || '').trim().toLowerCase()));
  const takenCodes = new Set(teams.map(t => t.joinCode).filter(Boolean));

  // A user should only ever be on one team per hackathon. If the data says
  // otherwise, splitting could leave them on two, so those teams are skipped.
  const teamsByUser = new Map();
  for (const team of teams) {
    for (const member of team.members || []) {
      if (!member?.userId) continue;
      const teamIds = teamsByUser.get(member.userId) || new Set();
      teamIds.add(team.id);
      teamsByUser.set(member.userId, teamIds);
    }
  }

  const splits = [];
  const cleanups = [];
  const skipped = [];

  for (const team of teams) {
    const members = team.members || [];
    const pendingInvites = countPending(team.invites);
    const pendingRequests = countPending(team.joinRequests);

    if (members.length <= 1) {
      if (pendingInvites + pendingRequests > 0) {
        cleanups.push({
          team,
          kept: { ...closePending(team, now), updatedAt: now },
          pendingInvites,
          pendingRequests,
        });
      }
      continue;
    }

    const lead = members.find(m => m?.userId && m.userId === team.leadUserId);
    if (!lead) {
      skipped.push({ team, reason: "its lead isn't on the member list" });
      continue;
    }
    if (members.some(m => !m?.userId)) {
      skipped.push({ team, reason: 'a member has no user id' });
      continue;
    }

    // De-duplicated by user id, in case the same person was added twice.
    const others = [...new Map(
      members.filter(m => m.userId !== lead.userId).map(m => [m.userId, m]),
    ).values()];

    const onOtherTeams = others.filter(m => (teamsByUser.get(m.userId)?.size || 0) > 1);
    if (onOtherTeams.length > 0) {
      const who = onOtherTeams.map(m => m.name || m.userId).join(', ');
      skipped.push({ team, reason: `${who} also appear(s) on another team` });
      continue;
    }

    if (others.length + 1 > MAX_TRANSACTION_ITEMS) {
      skipped.push({ team, reason: `too many members (${members.length}) for one transaction` });
      continue;
    }

    const baseName = String(team.name || 'Team').trim();
    const created = others.map(member => compact({
      id: makeId(),
      hackathonId: team.hackathonId,
      name: claimUniqueName(`${baseName}_${String(member.name || 'Member').trim()}`, takenNames),
      joinCode: claimUniqueJoinCode(takenCodes, makeJoinCode),
      leadUserId: member.userId,
      members: [compact({ ...member, role: 'lead', joinedAt: now })],
      invites: [],
      joinRequests: [],
      mentors: [],
      // The track is the problem statement they signed up for, so it carries
      // over. Project name, description and mentors stay with the lead's team.
      track: team.track || undefined,
      lookingForMembers: false,
      lookingForSkills: [],
      // Where the team came from, for auditing or undoing the split by hand.
      splitFromTeamId: team.id,
      createdAt: now,
      updatedAt: now,
    }));

    splits.push({
      team,
      lead,
      kept: {
        ...closePending(team, now),
        members: [{ ...lead, role: 'lead' }],
        updatedAt: now,
      },
      created,
      pendingInvites,
      pendingRequests,
    });
  }

  return { splits, cleanups, skipped };
}

// ----------------------------------------------------------------------------
// Emails (no I/O)
// ----------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "a", "a and b", "a, b and c" */
function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** YYYY-MM-DD as "Oct 31, 2026", the format the hackathon page uses. */
function formatDate(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const para = html => `<p style="margin:0 0 16px;">${html}</p>`;
const list = items => `<ul style="margin:0 0 16px; padding-left:20px;">${
  items.map(item => `<li style="margin:0 0 6px;">${item}</li>`).join('')
}</ul>`;
const strong = text => `<strong>${escapeHtml(text)}</strong>`;

/** Plain-text version for the email's text part and the dry-run preview. */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, href, text) => (text === href ? href : `${text} (${href})`))
    .replace(/<\/(p|li|ul)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Text part of a built email: the body plus the button's link. */
export function emailText(email) {
  return `${htmlToText(email.bodyHtml)}\n\n${email.cta.label}: ${email.cta.url}`;
}

/**
 * The emails for one split team: one for the lead, then one per member who now
 * has their own team. Each is { userId, name, role, subject, heading, bodyHtml, cta }.
 */
export function buildSplitEmails(split, { hackathon, appUrl, hasSubmission = false, hasApiKey = false }) {
  const { team, lead, created } = split;
  const title = hackathon.title || 'The hackathon';
  const size = (team.members || []).length;
  const deadline = formatDate(hackathon.submissionDeadline || hackathon.endDate);
  const kit = hackathon.kit?.enabled ? (hackathon.kit.apiKeys ? 'kit and API key' : 'kit') : null;

  const subject = `${title} is now a solo hackathon`;
  const heading = 'This hackathon is now solo';
  const cta = { label: 'Open the hackathon', url: `${appUrl}/hackathons/${encodeURIComponent(hackathon.id)}` };

  const intro = para(`${escapeHtml(title)} is now a solo hackathon, so every team is one person. `
    + `${strong(team.name)} had ${size} members, so we've split it.`);
  const chat = hackathon.chatUrl
    ? para(`Questions? Ask in the hackathon chat: <a href="${escapeHtml(hackathon.chatUrl)}">${escapeHtml(hackathon.chatUrl)}</a>`)
    : '';

  const keeps = [
    team.projectName ? 'project' : null,
    (team.mentors || []).length > 0 ? 'mentors' : null,
    hasSubmission ? 'submission' : null,
    hasApiKey ? 'API key' : null,
  ].filter(Boolean);

  const leadEmail = {
    userId: lead.userId,
    name: lead.name,
    role: 'lead',
    subject,
    heading,
    cta,
    bodyHtml: [
      para(`Hi ${escapeHtml(String(lead.name || '').trim() || 'there')},`),
      intro,
      para(`You keep ${strong(team.name)}${keeps.length > 0 ? `, along with its ${joinList(keeps)}` : ''}. `
        + 'Your teammates now each have a team of their own:'),
      list(created.map(t => `${escapeHtml(String(t.members[0].name || '').trim())}: ${strong(t.name)}`)),
      para("Nothing else changes for you. You can rename your team from the Teams tab if you'd like."),
      chat,
    ].join(''),
  };

  const memberEmails = created.map(newTeam => {
    const member = newTeam.members[0];
    const steps = [
      "Rename your team from the Teams tab if you'd like a different name.",
      kit
        ? `Get your own ${kit} from your team's section on the Teams tab.${hasApiKey
          ? ` The API key you were sharing stays with ${strong(team.name)}, so please switch to your own.`
          : ''}`
        : null,
      `Submit your own project${deadline ? ` by ${escapeHtml(deadline)}` : ''}.`,
    ].filter(Boolean);

    return {
      userId: member.userId,
      name: member.name,
      role: 'member',
      subject,
      heading,
      cta,
      bodyHtml: [
        para(`Hi ${escapeHtml(String(member.name || '').trim() || 'there')},`),
        intro,
        para(`You now have your own team, ${strong(newTeam.name)}. `
          + `${escapeHtml(String(lead.name || '').trim())} keeps ${strong(team.name)}${hasSubmission ? ' and its submission' : ''}.`),
        para('What to do next:'),
        list(steps),
        chat,
      ].join(''),
    };
  });

  return [leadEmail, ...memberEmails];
}

// ----------------------------------------------------------------------------
// I/O
// ----------------------------------------------------------------------------

async function queryAll(docClient, input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scanAll(docClient, input) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new ScanCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items || []));
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * The save only goes through if the team is exactly as it was read, so a member
 * leaving or joining mid-run makes that team fail instead of being overwritten.
 */
function unchangedSince(team) {
  if (team.updatedAt) {
    return {
      ConditionExpression: 'attribute_exists(id) AND #u = :seen',
      ExpressionAttributeNames: { '#u': 'updatedAt' },
      ExpressionAttributeValues: { ':seen': team.updatedAt },
    };
  }
  return {
    ConditionExpression: 'attribute_exists(id) AND attribute_not_exists(#u)',
    ExpressionAttributeNames: { '#u': 'updatedAt' },
  };
}

/** Report-only lookup: whether the team already has a shared API key. */
async function apiKeyStatus(docClient, tables, teamId) {
  try {
    const result = await docClient.send(new GetCommand({ TableName: tables.apiKeys, Key: { teamId } }));
    return result.Item?.status || 'none';
  } catch {
    return 'unknown';
  }
}

/** Address per user: the roster copy first, then the user's profile. */
async function recipientAddresses(docClient, tables, people) {
  const addresses = new Map();
  for (const person of people) {
    const fromRoster = normalizeEmail(person.email);
    if (fromRoster) {
      addresses.set(person.userId, fromRoster);
      continue;
    }
    try {
      const { Item } = await docClient.send(new GetCommand({ TableName: tables.users, Key: { userId: person.userId } }));
      const fromProfile = normalizeEmail(Item?.email);
      if (fromProfile) addresses.set(person.userId, fromProfile);
    } catch {
      // Left out, and reported as having no address.
    }
  }
  return addresses;
}

export async function listHackathons({ docClient, tables, log = console.log }) {
  const hackathons = await scanAll(docClient, {
    TableName: tables.hackathons,
    ProjectionExpression: '#id, #title, #status, #teamConfig',
    ExpressionAttributeNames: { '#id': 'id', '#title': 'title', '#status': 'status', '#teamConfig': 'teamConfig' },
  });

  if (hackathons.length === 0) {
    log(`No hackathons found in ${tables.hackathons}.`);
    return;
  }

  log('Hackathons (pass the id with --hackathon):\n');
  for (const h of hackathons.sort((a, b) => String(a.title).localeCompare(String(b.title)))) {
    const max = h.teamConfig?.maxSize ?? '?';
    const solo = Number(max) === 1 ? '  [solo]' : '';
    log(`  ${h.id}  ${String(h.status || '').padEnd(12)} max team size ${max}${solo}  ${h.title}`);
  }
}

/**
 * Plan, then either report (dry run), send the sample emails to one address
 * (testEmail), or write and email (apply). `mailer` is null when emails are off.
 */
export async function run({
  docClient, tables, hackathonId, apply = false, mailer = null, testEmail = null,
  appUrl = 'https://www.awsugmdu.in', log = console.log, planOptions,
}) {
  if (apply && testEmail) throw new Error('Use --test-email on its own, without --apply.');
  if (testEmail && !mailer) throw new Error('--test-email needs email sending to be set up.');

  const { Item: hackathon } = await docClient.send(new GetCommand({
    TableName: tables.hackathons,
    Key: { id: hackathonId },
  }));
  if (!hackathon) throw new Error(`No hackathon with id "${hackathonId}" in ${tables.hackathons}.`);

  const maxSize = Number(hackathon.teamConfig?.maxSize);
  if (maxSize !== 1) {
    throw new Error(
      `"${hackathon.title}" has a maximum team size of ${hackathon.teamConfig?.maxSize ?? 'unset'}. `
      + 'Set it to 1 in the admin panel first; this script only splits teams for solo hackathons.',
    );
  }

  const [teams, submissions] = await Promise.all([
    queryAll(docClient, {
      TableName: tables.teams,
      IndexName: 'hackathonId-index',
      KeyConditionExpression: 'hackathonId = :h',
      ExpressionAttributeValues: { ':h': hackathonId },
    }),
    queryAll(docClient, {
      TableName: tables.submissions,
      IndexName: 'hackathonId-index',
      KeyConditionExpression: 'hackathonId = :h',
      ExpressionAttributeValues: { ':h': hackathonId },
    }),
  ]);

  const plan = buildPlan(teams, planOptions);
  const submissionByTeam = new Map(submissions.filter(s => s.teamId).map(s => [s.teamId, s]));
  const keyByTeam = new Map(await Promise.all(
    plan.splits.map(async ({ team }) => [team.id, await apiKeyStatus(docClient, tables, team.id)]),
  ));

  const emailsByTeam = new Map(plan.splits.map(split => [split.team.id, buildSplitEmails(split, {
    hackathon,
    appUrl,
    hasSubmission: submissionByTeam.has(split.team.id),
    hasApiKey: keyByTeam.get(split.team.id) === 'active',
  })]));
  const addresses = await recipientAddresses(docClient, tables, plan.splits.flatMap(
    ({ lead, created }) => [lead, ...created.map(t => t.members[0])],
  ));

  log(`Hackathon: ${hackathon.title} (${hackathon.id})`);
  log(`Teams: ${teams.length} total, ${plan.splits.length} to split, `
    + `${plan.cleanups.length} more with pending invites/requests to close, ${plan.skipped.length} skipped.\n`);

  for (const { team, lead, created, pendingInvites, pendingRequests } of plan.splits) {
    const submission = submissionByTeam.get(team.id);
    const emails = emailsByTeam.get(team.id);
    const noAddress = emails.filter(e => !addresses.has(e.userId)).map(e => e.name);

    log(`Split "${team.name}" (${team.id}): ${(team.members || []).length} members`);
    log(`  keeps the team:  ${lead.name} (lead)`);
    for (const t of created) log(`  new team of one: "${t.name}" for ${t.members[0].name}`);
    log(`  submission: ${submission ? `${submission.status}, stays with ${lead.name}` : 'none'}`);
    log(`  API key: ${keyByTeam.get(team.id)}${keyByTeam.get(team.id) === 'active' ? ', stays with the lead (the others have seen it)' : ''}`);
    if (pendingInvites + pendingRequests > 0) {
      log(`  closes: ${pendingInvites} pending invite(s), ${pendingRequests} pending join request(s)`);
    }
    log(`  emails: ${emails.map(e => (e.role === 'lead' ? `${e.name} (lead)` : e.name)).join(', ')}`);
    if (noAddress.length > 0) log(`  NO EMAIL ADDRESS for ${noAddress.join(', ')}: they won't be emailed`);
    log('');
  }

  for (const { team, pendingInvites, pendingRequests } of plan.cleanups) {
    log(`Close pending on "${team.name}": ${pendingInvites} invite(s), ${pendingRequests} join request(s)`);
  }
  for (const { team, reason } of plan.skipped) {
    log(`SKIPPED "${team.name}" (${team.id}): ${reason}. Fix it by hand in the admin panel.`);
  }
  if (plan.cleanups.length + plan.skipped.length > 0) log('');

  if (plan.splits.length + plan.cleanups.length === 0) {
    log('Nothing to change.');
    return { plan, failed: [], emailIssues: [], sent: 0 };
  }

  // The preview uses the team with the most variations (submission, API key),
  // so the optional lines can be checked.
  const sample = [...plan.splits].sort((a, b) => (
    (Number(submissionByTeam.has(b.team.id)) + Number(keyByTeam.get(b.team.id) === 'active'))
    - (Number(submissionByTeam.has(a.team.id)) + Number(keyByTeam.get(a.team.id) === 'active'))
  ))[0];
  const sampleEmails = sample ? emailsByTeam.get(sample.team.id).slice(0, 2) : [];

  if (!apply && !testEmail) {
    if (sampleEmails.length > 0) {
      log(`Email preview, from "${sample.team.name}". Every email is personalised the same way.\n`);
      for (const email of sampleEmails) {
        log(`---- To ${email.name}${email.role === 'lead' ? ' (lead)' : ''} ----`);
        log(`Subject: ${email.subject}\n`);
        log(`${emailText(email)}\n`);
      }
    }
    log('Dry run: nothing was changed and no emails were sent. Re-run with --apply to make these changes.');
    return { plan, failed: [], emailIssues: [], sent: 0 };
  }

  if (testEmail) {
    if (sampleEmails.length === 0) {
      log('No team needs splitting, so there is no email to test.');
      return { plan, failed: [], emailIssues: [], sent: 0 };
    }
    let sent = 0;
    for (const email of sampleEmails) {
      const result = await mailer.send(email, testEmail, { subjectPrefix: '[Test] ' });
      if (result.ok) sent += 1;
      else log(`FAILED to send the ${email.role} sample: ${result.error}`);
    }
    log(`Sent ${sent} of ${sampleEmails.length} sample emails to ${testEmail}. Nothing else was sent or changed.`);
    return { plan, failed: [], emailIssues: [], sent };
  }

  // Check SES before writing anything, so a bad email setup can't leave teams
  // split with nobody told.
  if (mailer && plan.splits.length > 0) {
    const check = await mailer.check();
    if (!check.ok) {
      throw new Error(`Email check failed: ${check.error}. Nothing was changed. `
        + 'Fix that, or re-run with --no-email to split without emailing.');
    }
  }

  const failed = [];
  const emailIssues = [];
  let sent = 0;

  for (const { team, kept, created } of plan.splits) {
    try {
      await docClient.send(new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: tables.teams, Item: kept, ...unchangedSince(team) } },
          ...created.map(item => ({
            Put: { TableName: tables.teams, Item: item, ConditionExpression: 'attribute_not_exists(id)' },
          })),
        ],
      }));
    } catch (error) {
      failed.push({ team, error });
      log(`FAILED to split "${team.name}": ${error.name === 'TransactionCanceledException'
        ? 'the team changed while the script ran. Nothing was written or emailed for it; re-run to retry.'
        : error.message}`);
      continue;
    }

    if (!mailer) {
      log(`Split "${team.name}" into ${created.length + 1} teams (not emailed).`);
      continue;
    }

    const emails = emailsByTeam.get(team.id);
    let teamSent = 0;
    for (const email of emails) {
      const to = addresses.get(email.userId);
      if (!to) {
        emailIssues.push({ team, email, reason: 'no email address' });
        continue;
      }
      const result = await mailer.send(email, to);
      if (result.ok) {
        teamSent += 1;
      } else {
        emailIssues.push({ team, email, to, reason: result.error || 'send failed' });
      }
    }
    sent += teamSent;
    log(`Split "${team.name}" into ${created.length + 1} teams, emailed ${teamSent} of ${emails.length}.`);
  }

  for (const { team, kept } of plan.cleanups) {
    try {
      await docClient.send(new PutCommand({ TableName: tables.teams, Item: kept, ...unchangedSince(team) }));
      log(`Closed pending invites/requests on "${team.name}".`);
    } catch (error) {
      failed.push({ team, error });
      log(`FAILED to close pending on "${team.name}": ${error.name === 'ConditionalCheckFailedException'
        ? 'the team changed while the script ran; re-run to retry.'
        : error.message}`);
    }
  }

  if (mailer && plan.splits.length > 0) {
    log(`\nEmails: ${sent} sent${emailIssues.length > 0 ? `, ${emailIssues.length} not sent:` : '.'}`);
    for (const { team, email, to, reason } of emailIssues) {
      log(`  ${email.name}${to ? ` <${to}>` : ''} (from "${team.name}"): ${reason}`);
    }
  }

  const problems = failed.length + emailIssues.length;
  log(problems === 0 ? '\nDone.' : `\nDone, with ${failed.length} failed write(s) and ${emailIssues.length} unsent email(s).`);
  return { plan, failed, emailIssues, sent };
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

/**
 * Real email sending: the Lambda's own helper and template, so these look like
 * every other email from the site. Loaded only when needed.
 */
function createMailer(region) {
  // The helper's SES client takes its region from the environment.
  process.env.AWS_REGION = region;
  const requireFromLambda = createRequire(EMAIL_MODULE);
  const { sendEmail, renderEmail, FROM_EMAIL, APP_URL } = requireFromLambda(EMAIL_MODULE);
  const {
    SESClient, GetAccountSendingEnabledCommand, GetIdentityVerificationAttributesCommand,
  } = requireFromLambda('@aws-sdk/client-ses');
  const ses = new SESClient({ region });

  return {
    appUrl: APP_URL,
    from: FROM_EMAIL,

    async check() {
      try {
        const domain = FROM_EMAIL.split('@')[1];
        const identities = [FROM_EMAIL, domain].filter(Boolean);
        const verification = await ses.send(new GetIdentityVerificationAttributesCommand({ Identities: identities }));
        const verified = identities.some(id => verification.VerificationAttributes?.[id]?.VerificationStatus === 'Success');
        if (!verified) return { ok: false, error: `${FROM_EMAIL} is not a verified SES sender in ${region}` };

        const sending = await ses.send(new GetAccountSendingEnabledCommand({}));
        if (sending.Enabled === false) return { ok: false, error: `SES sending is paused in ${region}` };
        return { ok: true };
      } catch (error) {
        return { ok: false, error: `could not check SES (${error.message})` };
      }
    },

    send(email, to, { subjectPrefix = '' } = {}) {
      return sendEmail({
        to,
        subject: `${subjectPrefix}${email.subject}`,
        html: renderEmail({ heading: email.heading, bodyHtml: email.bodyHtml, cta: email.cta }),
        text: emailText(email),
      });
    },
  };
}

function parseArgs(argv) {
  const args = { apply: false, email: true };
  const valueFor = (flag, i) => {
    const value = argv[i];
    if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--no-email') args.email = false;
    else if (arg === '--hackathon') { args.hackathon = valueFor(arg, i + 1); i += 1; }
    else if (arg === '--test-email') { args.testEmail = normalizeEmail(valueFor(arg, i + 1)); i += 1; }
    else if (arg === '--region') { args.region = valueFor(arg, i + 1); i += 1; }
    else if (arg === '--prefix') { args.prefix = valueFor(arg, i + 1); i += 1; }
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (args.testEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.testEmail)) {
    throw new Error('--test-email needs a valid email address');
  }
  if (args.testEmail && !args.email) throw new Error('--test-email sends email, so it cannot be used with --no-email');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/split-solo-teams.mjs [--hackathon <id> [--test-email <address> | --apply [--no-email]]] [--region <r>] [--prefix <p>]');
    return;
  }

  const prefix = args.prefix || 'awsug';
  const tables = {
    hackathons: process.env.HACKATHONS_TABLE_NAME || `${prefix}-hackathons`,
    teams: process.env.HACKATHON_TEAMS_TABLE_NAME || `${prefix}-hackathon-teams`,
    submissions: process.env.HACKATHON_SUBMISSIONS_TABLE_NAME || `${prefix}-hackathon-submissions`,
    apiKeys: process.env.HACKATHON_API_KEYS_TABLE_NAME || `${prefix}-hackathon-api-keys`,
    users: process.env.USERS_TABLE_NAME || `${prefix}-users`,
  };
  const region = args.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  if (!args.hackathon) {
    await listHackathons({ docClient, tables });
    return;
  }

  // Loaded for the dry run too: the preview uses the same site link.
  const mailer = createMailer(region);
  const { failed, emailIssues } = await run({
    docClient,
    tables,
    hackathonId: args.hackathon,
    apply: args.apply,
    mailer: args.apply && !args.email ? null : mailer,
    testEmail: args.testEmail || null,
    appUrl: mailer.appUrl,
  });
  if (failed.length + emailIssues.length > 0) process.exitCode = 1;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
