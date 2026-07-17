import {
  Trophy,
  Zap,
  Users,
  CalendarCheck,
  Mic,
  Globe,
  type LucideIcon,
} from 'lucide-react';

/**
 * Central source of truth for AWS User Group Madurai achievements.
 * Consumed by both the /achievements page and the home page highlights,
 * so the two never drift out of sync.
 */

/**
 * Headline community numbers. Kept as shared constants so the home hero and
 * the achievements milestones always show the same values.
 */
export const MEETUP_MEMBER_COUNT = '3,000+';
export const MEETUPS_HOSTED_COUNT = '75+';
export const BEST_UG_NOMINATIONS = '4×';

export interface Award {
  id: string;
  title: string;
  /** Short supporting line, e.g. "Q1 Winner" or the recipient's name. */
  detail: string;
  /** Years the award was won — rendered as pills when present. */
  years?: string[];
  /** Person recognised, for individual honours. */
  person?: string;
  icon: LucideIcon;
  /** Tailwind gradient used for the card wash. */
  accent: string;
  iconColor: string;
  /** Marquee awards span wider on the grid. */
  featured?: boolean;
  /** Optional proof photo — an imported asset (`@/assets/...`) or a URL. */
  image?: string;
  /** Optional LinkedIn post celebrating the achievement. */
  linkedInUrl?: string;
}

export const awards: Award[] = [
  {
    id: 'best-user-group',
    title: 'Best AWS User Group of the Year',
    detail: 'Nominated four years running by AWS',
    years: ['2022', '2023', '2024', '2025'],
    icon: Trophy,
    accent: 'from-amber-500/20 via-orange-500/10 to-yellow-500/20',
    iconColor: 'text-amber-500',
    featured: true,
  },
  {
    id: 'most-active-q1',
    title: 'Most Active AWS User Group — APAC',
    detail: 'Q1 2026 Winner',
    icon: Zap,
    accent: 'from-primary/20 to-orange-500/20',
    iconColor: 'text-primary',
  },
];

export interface Milestone {
  id: string;
  value: string;
  label: string;
  icon: LucideIcon;
}

export const milestones: Milestone[] = [
  { id: 'members', value: MEETUP_MEMBER_COUNT, label: 'Meetup Members', icon: Users },
  { id: 'events', value: MEETUPS_HOSTED_COUNT, label: 'Meetups Hosted', icon: CalendarCheck },
  { id: 'best-ug', value: BEST_UG_NOMINATIONS, label: 'Best UG Nominations', icon: Trophy },
  { id: 'active', value: 'APAC', label: 'Most Active UG · Q1 2026', icon: Zap },
];

export interface SpeakerHighlight {
  name: string;
  /** One-line summary shown under the name. */
  role: string;
  /** Talks, sessions and stages. */
  talks: string[];
  /** Upcoming or future engagements, rendered with an "upcoming" accent. */
  upcoming?: string[];
  /** A standout moment worth calling out on its own. */
  spotlight?: string;
  featured?: boolean;
  /** Optional photo — an imported asset (`@/assets/...`) or a URL. */
  image?: string;
  /** Optional LinkedIn post for this highlight. */
  linkedInUrl?: string;
}

export const speakerHighlights: SpeakerHighlight[] = [
  {
    name: 'Vivek Raja P S',
    role: 'Keynotes & technical sessions across India’s AWS community',
    talks: [
      'AWS Community Day — Bengaluru, Pune & Mumbai',
      'AWS Student Community Day — South TN',
      'GenAI Loft, Bengaluru',
      'Developer Lounge session — AWS Summit Bengaluru 2025',
      'Featured on an AWS Podcast',
    ],
    upcoming: ['Speaking at AWS re:Invent, Las Vegas 2025'],
    spotlight:
      'His project WeWake AgentStudio, showcased at AWS DevSphere Bengaluru 2025, received appreciation from Dr. Swami Sivasubramanian (VP, Agentic AI, AWS).',
    featured: true,
  },
  {
    name: 'Poobalan P',
    role: 'Speaker on student & GenAI stages',
    talks: [
      'AWS Student Community Day — South TN',
      'AWS Student Community Day — Tirupathi',
      'GenAI Loft, Bengaluru',
    ],
  },
  {
    name: 'Logesh S',
    role: 'Community speaker',
    talks: ['AWS Student Community Day — South TN'],
  },
];

/** Icon used for the "Community on Stage" section heading. */
export const stageIcon: LucideIcon = Mic;
export const globalIcon: LucideIcon = Globe;
