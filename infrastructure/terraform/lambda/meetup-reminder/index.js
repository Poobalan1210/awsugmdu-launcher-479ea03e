// Weekly reminder for users who signed up but have not completed Meetup
// verification. Triggered on a schedule by EventBridge Scheduler.
//
// Flow:
//   1. Scan awsug-users.
//   2. Keep users that are NOT meetup-verified and have an email.
//   3. Skip organiser/admin emails and anyone who opted out (reminderOptOut).
//   4. Optionally cap repeated reminders (reminderCount).
//   5. Email each one a nudge with a CTA to complete verification.
//
// Env vars:
//   USERS_TABLE_NAME  - DynamoDB users table (default awsug-users)
//   SES_FROM_EMAIL    - sender (default info@awsugmdu.in)
//   APP_URL           - site base URL (default https://www.awsugmdu.in)
//   ADMIN_EMAILS      - comma-separated emails to never remind
//   DRY_RUN           - 'true' = log recipients, do not send
//   TEST_EMAIL        - if set, every email is redirected here (for testing)
//   MAX_REMINDERS     - skip users whose reminderCount >= this (0/unset = no cap)

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { sendEmail, renderEmail, APP_URL } = require('./shared/email');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const USERS_TABLE = process.env.USERS_TABLE_NAME || 'awsug-users';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const TEST_EMAIL = process.env.TEST_EMAIL || '';
const MAX_REMINDERS = parseInt(process.env.MAX_REMINDERS || '0', 10) || 0;
const SEND_DELAY_MS = 120; // ~8/sec, under the SES 14/sec rate

// Mirror of the app's "effectively verified" logic.
function isEffectivelyVerified(u) {
  if (u.meetupVerified === true) return true;
  if (u.meetupVerificationStatus === 'approved') return true;
  const activities = Array.isArray(u.pointActivities) ? u.pointActivities : [];
  if (activities.some(pa =>
    pa.type === 'signup' ||
    (typeof pa.reason === 'string' && pa.reason.toLowerCase().includes('meetup'))
  )) {
    return true;
  }
  const email = (u.email || '').toLowerCase();
  return ADMIN_EMAILS.includes(email);
}

async function scanAllUsers() {
  const users = [];
  let lastKey;
  do {
    const resp = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      ProjectionExpression:
        'userId, email, #nm, meetupVerified, meetupVerificationStatus, pointActivities, reminderOptOut, reminderCount',
      ExpressionAttributeNames: { '#nm': 'name' },
      ExclusiveStartKey: lastKey,
    }));
    (resp.Items || []).forEach(i => users.push(i));
    lastKey = resp.LastEvaluatedKey;
  } while (lastKey);
  return users;
}

function buildReminderEmail(user) {
  const name = user.name ? String(user.name).trim().split(/\s+/)[0] : 'there';
  const bodyHtml = `
    <p style="margin:0 0 16px;">Hi ${escapeInline(name)},</p>
    <p style="margin:0 0 16px;">Thanks for signing up with <strong>AWS User Group Madurai</strong>! We noticed you haven't completed your Meetup verification yet.</p>
    <p style="margin:0 0 16px;">Verifying your Meetup membership unlocks the full community experience - registering for meetups and skill sprints, earning points, and redeeming rewards in our store.</p>
    <p style="margin:0 0 8px;">It only takes a minute. Just head to your profile and add your Meetup profile URL.</p>
  `;
  const html = renderEmail({
    heading: `Complete your verification, ${name} 👋`,
    bodyHtml,
    cta: { label: 'Verify my Meetup membership', url: `${APP_URL}/profile` },
    footerNote: 'You received this because you signed up but haven\'t verified your Meetup membership yet.',
  });
  return {
    subject: 'Complete your AWS User Group Madurai verification',
    html,
  };
}

exports.handler = async (event) => {
  console.log('Meetup reminder run started.', JSON.stringify({
    dryRun: DRY_RUN,
    testEmail: TEST_EMAIL ? 'set' : 'none',
    maxReminders: MAX_REMINDERS,
  }));

  const allUsers = await scanAllUsers();

  const recipients = allUsers.filter(u => {
    if (!u.email) return false;
    if (isEffectivelyVerified(u)) return false;
    if (u.reminderOptOut === true) return false;
    if (MAX_REMINDERS > 0 && (u.reminderCount || 0) >= MAX_REMINDERS) return false;
    return true;
  });

  console.log(`Scanned ${allUsers.length} users; ${recipients.length} reminder-eligible.`);

  if (DRY_RUN) {
    console.log('DRY_RUN enabled - not sending. Recipients:');
    recipients.forEach(r => console.log(`  - ${r.name || '(no name)'} <${r.email}> (reminders so far: ${r.reminderCount || 0})`));
    return summary(recipients.length, 0, 0, true);
  }

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    const user = recipients[i];
    const { subject, html } = buildReminderEmail(user);
    const to = TEST_EMAIL || user.email;

    const result = await sendEmail({ to, subject, html });

    if (result.ok) {
      sent++;
      // Track how many reminders this user has received (skip when redirecting
      // to a test inbox so we don't pollute real records during testing).
      if (!TEST_EMAIL) {
        await bumpReminderCount(user).catch(e =>
          console.error(`Failed to bump reminderCount for ${user.userId}:`, e.message));
      }
    } else {
      failed++;
    }

    if (i < recipients.length - 1) {
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }
  }

  return summary(recipients.length, sent, failed, false);
};

async function bumpReminderCount(user) {
  await docClient.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { userId: user.userId },
    UpdateExpression:
      'SET reminderCount = if_not_exists(reminderCount, :zero) + :one, lastReminderAt = :now',
    ExpressionAttributeValues: {
      ':zero': 0,
      ':one': 1,
      ':now': new Date().toISOString(),
    },
  }));
}

function summary(eligible, sent, failed, dryRun) {
  const result = { eligible, sent, failed, dryRun };
  console.log('Meetup reminder run complete.', JSON.stringify(result));
  return result;
}

function escapeInline(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
