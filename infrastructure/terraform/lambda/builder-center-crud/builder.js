/**
 * Reading AWS Builder Center: public profile pages and the public article feed.
 *
 * Neither is a documented API. Profile pages are server-rendered with the
 * profile's data in a JSON script tag, and the feed is what builder.aws.com's
 * own front page reads. If Builder Center changes either, verification or the
 * sync fails loudly (logged, and shown on the admin tab) rather than guessing.
 */

const FEED_URL = 'https://api.builder.aws.com/cs/v2/feed/articles';
const PROFILE_URL = (alias) => `https://builder.aws.com/community/@${encodeURIComponent(alias)}`;
const USER_AGENT = 'awsugmdu.in Builder Center sync (+https://www.awsugmdu.in)';
const REQUEST_TIMEOUT_MS = 20000;

const ALIAS_PATTERN = /^[a-z0-9._-]{1,60}$/;
const CONTENT_ID_PATTERN = /^[A-Za-z0-9]{10,40}$/;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** A Builder Center alias from "alias", "@alias" or a profile URL, lowercased; null if none. */
function normalizeAlias(input) {
  let s = String(input || '').trim();
  const fromUrl = /builder\.aws\.com\/community\/@([^/?#\s]+)/i.exec(s);
  if (fromUrl) s = fromUrl[1];
  s = s.replace(/^@/, '').replace(/\/+$/, '').toLowerCase();
  try {
    s = decodeURIComponent(s);
  } catch {
    return null;
  }
  return ALIAS_PATTERN.test(s) ? s : null;
}

/** GET with a timeout, retrying throttling and server errors. */
async function fetchWithRetry(url, { retries = 3, accept = 'application/json' } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
        signal: controller.signal,
      });
      if (r.status === 429 || r.status >= 500) {
        lastError = new Error(`Builder Center answered ${r.status}`);
      } else {
        return r;
      }
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error('Builder Center did not answer in time') : err;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(1000 * 2 ** attempt);
  }
  throw lastError;
}

/**
 * A public profile: { found: false } or { found: true, alias, name, bio,
 * headline, github, linkedIn }. Throws when the page cannot be read.
 */
async function fetchProfile(alias) {
  const r = await fetchWithRetry(PROFILE_URL(alias), { accept: 'text/html' });
  if (r.status === 404) return { found: false };
  if (!r.ok) throw new Error(`Builder Center profile page answered ${r.status}`);
  const html = await r.text();
  const m = /<script id="__bingo-ssr-query-state__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Builder Center profile page has no profile data');
  let state;
  try {
    state = JSON.parse(m[1]);
  } catch {
    throw new Error('Builder Center profile data could not be read');
  }
  const queries = state?.profile?.queries || [];
  const q = queries.find((x) => Array.isArray(x.queryKey) && x.queryKey[0] === 'user-profile');
  const data = q?.state?.data;
  if (!data || data.notFound) return { found: false };
  const info = data.profile?.basicInfo || {};
  const socials = data.profile?.socials || {};
  return {
    found: true,
    alias: String(info.alias || alias).toLowerCase(),
    name: String(info.name || ''),
    bio: String(info.bio || ''),
    headline: String(info.headline || ''),
    github: socials.github || null,
    linkedIn: socials.linkedIn || null,
  };
}

/**
 * One article from its public page, in the feed's shape (so
 * feedArticleToIndexItem reads it), or null when there is no such article.
 * Throws when the page cannot be read.
 */
async function fetchArticle(contentId) {
  if (!CONTENT_ID_PATTERN.test(String(contentId || ''))) return null;
  const r = await fetchWithRetry(`https://builder.aws.com/content/${contentId}`, { accept: 'text/html' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Builder Center article page answered ${r.status}`);
  const html = await r.text();
  const m = /<script id="__bingo-ssr-query-state__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('Builder Center article page has no article data');
  let state;
  try {
    state = JSON.parse(m[1]);
  } catch {
    throw new Error('Builder Center article data could not be read');
  }
  const queries = state?.article?.queries || [];
  const q = queries.find((x) => Array.isArray(x.queryKey) && String(x.queryKey[0]).startsWith('article'));
  const data = q?.state?.data;
  if (!data || !data.articleId) return null;
  return { ...data, status: String(data.status || '').toLowerCase() };
}

/** One page of the public feed: { articles, cursor }. */
async function fetchFeedPage(cursor) {
  const url = `${FEED_URL}?pageSize=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const r = await fetchWithRetry(url);
  if (!r.ok) throw new Error(`Builder Center feed answered ${r.status}`);
  const body = await r.json();
  return { articles: Array.isArray(body?.articles) ? body.articles : [], cursor: body?.cursor || null };
}

// Builder Center does not mark projects, so this guesses from the title, like
// the collector did. Write-ups of something built count as projects; how-tos,
// journeys and opinion pieces as blogs. Members can switch it before claiming.
const BLOG_TITLE = /\b(how i|how we|how to|why |what i learned|lessons|journey|recap|my experience|guide|tips|roadmap|introduction|getting started|wrapped|story|reflections?|explained|understanding|vs\.?)\b/i;
const PROJECT_TITLE = /\b(building|built|build|deploy(ing|ed)?|creat(ing|ed)|introducing|meet|launch(ing|ed)?|challenge|hackathon|agent|app|tool|generator|assistant|bot|platform|system|dashboard|pipeline|engine|analy[sz]er|tracker|mcp)\b/i;

function guessContentType(title) {
  const t = String(title || '');
  if (BLOG_TITLE.test(t)) return 'blog';
  return PROJECT_TITLE.test(t) ? 'project' : 'blog';
}

/** Whether the visible text names the user group. The collector also read the article body. */
function mentionsUGMadurai(...texts) {
  return /madurai|awsugmdu|ugmdu/i.test(texts.join(' '));
}

function clean(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A feed article as an index item, or null if it is not a live article. */
function feedArticleToIndexItem(a) {
  if (!a || a.status !== 'live') return null;
  const m = /^\/content\/([A-Za-z0-9]{10,40})/.exec(String(a.articleId || a.uri || ''));
  const alias = normalizeAlias(a.author?.alias);
  if (!m || !CONTENT_ID_PATTERN.test(m[1]) || !alias) return null;
  const title = clean(a.title, 300).replace(/^#+\s+/, '');
  if (!title) return null;
  const uri = /^\/content\/[A-Za-z0-9]+(\/[^\s?#]*)?$/.test(String(a.uri || '')) ? a.uri : `/content/${m[1]}`;
  const created = Number(a.createdAt);
  const tags = Array.isArray(a.tags)
    ? [...new Set(a.tags.map((t) => clean(t, 60).toLowerCase()).filter(Boolean))].slice(0, 10)
    : [];
  const description = clean(a.description, 1000);
  const image = String(a.heroImageUrl || '').trim();
  return {
    alias,
    contentId: m[1],
    url: `https://builder.aws.com${uri}`,
    title,
    description,
    imageUrl: /^https:\/\/\S+$/.test(image) && image.length <= 600 ? image : undefined,
    tags,
    publishedAt: Number.isFinite(created) && created > 0 ? new Date(created).toISOString().slice(0, 10) : null,
    likes: Math.max(0, Math.floor(Number(a.likesCount) || 0)),
    comments: Math.max(0, Math.floor(Number(a.commentsCount) || 0)),
    authorName: clean(a.author?.preferredName, 120) || undefined,
    contentType: guessContentType(title),
    mentionsUGMadurai: mentionsUGMadurai(title, description, tags.join(' ')),
  };
}

module.exports = {
  normalizeAlias,
  fetchProfile,
  fetchArticle,
  fetchFeedPage,
  feedArticleToIndexItem,
  guessContentType,
  PROFILE_URL,
};
