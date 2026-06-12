// Agent catalog — the single source the Admin UI uses to offer agents when
// turning a circle into an "agent circle".
//
// Onboarding a new agent (frontend side) = add one entry here. The backend
// behaviour (ARN, request, response formatting) lives in a matching module at
// infrastructure/terraform/lambda/circle-digest/agents/<id>.js, and the id must
// also be whitelisted in circles-crud/index.js. See agents/_template.js for the
// full server-side checklist.
//
// NOTE: ARNs and any secrets are intentionally NOT here. This file ships to the
// browser; it only holds display metadata + safe defaults.

export type AgentFrequency = 'hourly' | 'daily' | 'weekly';
export type AgentMode = 'append' | 'replace';

export interface AgentCatalogEntry {
  /** Stable id. Must match the server agent module id and the crud whitelist. */
  id: string;
  /** Shown in the agent dropdown. */
  label: string;
  /** One-line description shown under the dropdown. */
  description: string;
  /** Prefilled bot display name when this agent is first selected. */
  defaultBotName: string;
  /** Prefilled posting cadence. */
  defaultFrequency: AgentFrequency;
  /** Prefilled posting mode. */
  defaultMode: AgentMode;
}

export const AGENT_CATALOG: AgentCatalogEntry[] = [
  {
    id: 'aws-news-digest',
    label: 'AWS News Digest',
    description: 'Posts a daily digest of the latest AWS announcements and news.',
    defaultBotName: 'AWS News Digest',
    defaultFrequency: 'daily',
    defaultMode: 'append',
  },
  {
    id: 'aws-jobs',
    label: 'Amazon & AWS Jobs',
    description:
      'Latest Amazon and AWS job openings scraped from the official amazon.jobs site, summarized into ready-to-post listings.',
    defaultBotName: 'AWS Jobs Bot',
    // Postings move slower than news; weekly fits the 7-day lookback window.
    defaultFrequency: 'weekly',
    // New roles add to the feed; replace would drop still-open roles.
    defaultMode: 'append',
  },
];

export function getAgentCatalogEntry(id?: string | null): AgentCatalogEntry | undefined {
  if (!id) return undefined;
  return AGENT_CATALOG.find((a) => a.id === id);
}

/** Default agent id (first in the catalog) for new agent configs. */
export const DEFAULT_AGENT_ID = AGENT_CATALOG[0]?.id ?? '';
