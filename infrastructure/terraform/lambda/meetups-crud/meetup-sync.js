// "Sync from Meetup" in the admin console.
//
// Fetches the group's past events from Meetup's public GraphQL endpoint and
// creates the ones not yet on the platform as DRAFT meetups, with the same
// title, description, date, duration and poster that
// scripts/import-meetup-events.mjs would set. Nothing is published and no
// attendance is marked, so no member is emailed or awarded points: an
// organiser reviews each draft (type, sprint/circle/college link, speakers)
// and publishes it as before.
//
// Safe to click repeatedly: an event is skipped when any meetup already links
// to it, and a draft's id is derived from the Meetup event id with a
// create-only write, so two clicks at once cannot create duplicates.

const { ScanCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const GROUP = process.env.MEETUP_GROUP_URLNAME || 'aws-user-group-madurai';
const GQL = 'https://www.meetup.com/gql2';
const POSTERS_BUCKET = process.env.MEETUP_POSTERS_BUCKET || '';
const POSTERS_CDN = process.env.CLOUDFRONT_MEETUP_POSTERS_DOMAIN || '';

// API Gateway gives a request 29 seconds. Each new event costs a Meetup
// request and a poster copy, so a click creates at most this many drafts and
// reports how many are left for the next click.
const MAX_PER_RUN = 8;
const DEFAULT_LOOKBACK_DAYS = 30;

const s3 = new S3Client({});

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'awsugmdu-sync/1.0' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Meetup returned HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Meetup error: ${json.errors[0]?.message || 'unknown'}`);
  return json.data;
}

/** Past events on or after `since` (YYYY-MM-DD), newest first. */
async function listPastEvents(since) {
  const events = [];
  let after = null;
  do {
    const data = await gql(
      `query($u:String!,$after:String){ groupByUrlname(urlname:$u){ events(status: PAST, first: 50, sort: DESC, after: $after){
         pageInfo{ hasNextPage endCursor } edges{ node{ id title dateTime } } } } }`,
      { u: GROUP, after },
    );
    const page = data.groupByUrlname?.events;
    if (!page) break;
    events.push(...page.edges.map((e) => e.node));
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (events.at(-1)?.dateTime.slice(0, 10) < since) after = null;
  } while (after);
  return events.filter((e) => e.dateTime.slice(0, 10) >= since);
}

async function getEventDetail(id) {
  const data = await gql(
    `query($id:ID!){ event(id:$id){ id title description dateTime duration eventType eventUrl
       featuredEventPhoto{ highResUrl } venues{ name city } } }`,
    { id },
  );
  return data.event;
}

/** Meetup event id -> true for every meetup already linked on the platform. */
async function linkedMeetupIds(docClient, table) {
  const ids = new Set();
  const dates = [];
  let ExclusiveStartKey;
  do {
    const page = await docClient.send(new ScanCommand({
      TableName: table,
      ProjectionExpression: 'meetupUrl, #d',
      ExpressionAttributeNames: { '#d': 'date' },
      ExclusiveStartKey,
    }));
    for (const m of page.Items || []) {
      const id = String(m.meetupUrl || '').match(/events\/(\d+)/)?.[1];
      if (id) { ids.add(id); if (m.date) dates.push(m.date); }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  dates.sort();
  return { ids, latestLinkedDate: dates.at(-1) || null };
}

// Same conversions as scripts/import-meetup-events.mjs, so synced drafts match
// the events imported by hand.
function istDateTime(iso) {
  const d = new Date(new Date(iso).getTime() + 330 * 60000);
  return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
}

function humanDuration(iso) {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || '');
  if (!m) return undefined;
  const h = +(m[1] || 0), min = +(m[2] || 0);
  return [h && `${h} hour${h > 1 ? 's' : ''}`, min && `${min} mins`].filter(Boolean).join(' ') || undefined;
}

function toMarkdown(text) {
  return (text || '').split('\n').map((l) => l.trimEnd()).filter(Boolean).join('\n\n');
}

function shortDescription(text) {
  const first = (text || '').split('\n').map((s) => s.trim()).find(Boolean) || '';
  // Count characters, not UTF-16 units: Meetup titles often use styled
  // letters (𝐀𝐧𝐲) that a plain slice would cut in half.
  const chars = Array.from(first);
  return chars.length > 280 ? chars.slice(0, 277).join('') + '…' : first;
}

/** Copy the Meetup poster into our bucket; fall back to Meetup's own URL. */
async function copyPoster(url, meetupId) {
  if (!url) return undefined;
  if (!POSTERS_BUCKET) return url;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.startsWith('image/')) return url;
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpeg';
    const key = `posters/${Date.now()}-meetup-${meetupId}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: POSTERS_BUCKET,
      Key: key,
      Body: Buffer.from(await r.arrayBuffer()),
      ContentType: type,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return POSTERS_CDN
      ? `https://${POSTERS_CDN}/${key}`
      : `https://${POSTERS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error('Poster copy failed, keeping Meetup URL:', error.message);
    return url;
  }
}

function isValidDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

/**
 * POST /meetups/sync-meetup  { since?: "YYYY-MM-DD" }
 * Without `since`, starts from the newest meetup already linked to Meetup,
 * or the last 30 days when none is.
 */
async function syncFromMeetup({ docClient, table, body }) {
  const { ids: linked, latestLinkedDate } = await linkedMeetupIds(docClient, table);
  const fallback = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
  const since = isValidDate(body?.since) ? body.since : (latestLinkedDate || fallback);

  const past = await listPastEvents(since);
  const missing = past.filter((e) => !linked.has(e.id)).reverse(); // oldest first
  const batch = missing.slice(0, MAX_PER_RUN);

  const created = [];
  const failed = [];
  for (const { id: meetupId } of batch) {
    try {
      const ev = await getEventDetail(meetupId);
      const { date, time } = istDateTime(ev.dateTime);
      const physical = ev.eventType === 'PHYSICAL';
      const venue = ev.venues?.[0];
      const now = new Date().toISOString();
      const meetup = {
        id: `meetup-mu-${ev.id}`,
        title: ev.title.trim(),
        description: shortDescription(ev.description),
        richDescription: toMarkdown(ev.description),
        date,
        time,
        ...(humanDuration(ev.duration) ? { duration: humanDuration(ev.duration) } : {}),
        // A sensible default the organiser changes on review when the event
        // belongs to a sprint, circle or college.
        type: physical ? 'in-person' : 'virtual',
        ...(physical && venue ? { location: [venue.name, venue.city].filter(Boolean).join(', ') } : {}),
        meetupUrl: ev.eventUrl,
        status: 'draft',
        attendees: 0,
        registeredUsers: [],
        speakerPoints: 0,
        volunteerPoints: 0,
        hostPoints: 0,
        speakers: [],
        hosts: [],
        volunteers: [],
        syncedFromMeetup: true,
        createdAt: now,
        updatedAt: now,
      };
      const image = await copyPoster(ev.featuredEventPhoto?.highResUrl, ev.id);
      if (image) meetup.image = image;

      await docClient.send(new PutCommand({
        TableName: table,
        Item: meetup,
        ConditionExpression: 'attribute_not_exists(id)',
      }));
      created.push({ id: meetup.id, title: meetup.title, date });
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') continue; // another click made it
      console.error(`Sync failed for Meetup event ${meetupId}:`, error.message);
      failed.push({ meetupId, error: error.message });
    }
  }

  return {
    since,
    checked: past.length,
    alreadyOnPlatform: past.length - missing.length,
    created,
    failed,
    remaining: Math.max(0, missing.length - batch.length),
  };
}

module.exports = { syncFromMeetup, MAX_PER_RUN };
