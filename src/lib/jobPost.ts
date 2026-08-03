import { normalizeUrl } from './utils';

export interface JobDraft {
  title: string;
  category: string;
  team: string;
  location: string;
  summary: string;
  posted: string;
  link: string;
}

export const EMPTY_JOB_DRAFT: JobDraft = {
  title: '',
  category: '',
  team: '',
  location: '',
  summary: '',
  posted: '',
  link: '',
};

/**
 * Renders a job into the same markdown shape the aws-jobs agent produces, so a
 * hand-added listing is indistinguishable from a scraped one in the feed.
 *
 * Reference: infrastructure/terraform/lambda/circle-digest/agents/aws-jobs.js
 * (formatJobsDigest). Keep the two in step if either side changes.
 */
export function buildJobMarkdown(job: JobDraft): string {
  const lines = [`**${job.title.trim()}**`];

  const tags: string[] = [];
  if (job.category.trim()) tags.push(`\`${job.category.trim()}\``);
  if (job.team.trim()) tags.push(`\`${job.team.trim()}\``);
  if (tags.length) lines.push(tags.join(' '));

  if (job.location.trim()) lines.push(`📍 ${job.location.trim()}`);
  if (job.summary.trim()) lines.push(`\n${job.summary.trim()}`);

  // The agent stamps an ISO date; a blank field just omits the line.
  if (job.posted) {
    const d = new Date(job.posted);
    if (!Number.isNaN(d.getTime())) lines.push(`\n_Posted ${d.toISOString().slice(0, 10)}_`);
  }

  const link = normalizeUrl(job.link);
  if (link) lines.push(`\n[Apply →](${link})`);

  return lines.join('\n');
}
