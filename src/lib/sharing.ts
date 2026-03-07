import { Badge } from '@/data/mockData';

const BASE_URL = window.location.origin;
const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

export interface AchievementShareData {
  title: string;
  text: string;
  url: string;
  hashtags?: string[];
}

// Build a share URL that serves dynamic OG meta tags for social crawlers
function buildShareUrl(params: Record<string, string>): string {
  const searchParams = new URLSearchParams(params);
  return `${API_ENDPOINT}/share?${searchParams.toString()}`;
}

// Generate share data for leaderboard rank
export function generateLeaderboardShare(
  userName: string,
  rank: number,
  points: number
): AchievementShareData {
  const rankSuffix = getRankSuffix(rank);

  return {
    title: `${userName} - Rank #${rank} on AWS UG Leaderboard`,
    text: `I'm ranked ${rank}${rankSuffix} on the AWS User Group leaderboard with ${points} points! 🏆`,
    url: buildShareUrl({ type: 'leaderboard', user: userName, rank: String(rank), points: String(points) }),
    hashtags: ['AWSUG', 'CloudComputing', 'AWS', 'Community'],
  };
}

// Generate share data for new badge earned
export function generateBadgeShare(
  userName: string,
  badge: Badge
): AchievementShareData {
  return {
    title: `${userName} earned ${badge.name}`,
    text: `I just earned the "${badge.name}" badge! ${badge.icon}\n${badge.description}`,
    url: buildShareUrl({ type: 'badge', user: userName, name: badge.name, desc: badge.description }),
    hashtags: ['AWSUG', 'Achievement', 'AWS', 'CloudComputing'],
  };
}

// Generate share data for sprint submission
export function generateSprintSubmissionShare(
  userName: string,
  sprintTitle: string,
  sprintId: string
): AchievementShareData {
  return {
    title: `${userName} completed ${sprintTitle}`,
    text: `I just completed the "${sprintTitle}" skill sprint challenge! 🚀`,
    url: buildShareUrl({ type: 'sprint', user: userName, name: sprintTitle, id: sprintId }),
    hashtags: ['AWSUG', 'SkillSprint', 'AWS', 'Learning'],
  };
}

// Generate share data for college rank
export function generateCollegeRankShare(
  collegeName: string,
  rank: number,
  points: number
): AchievementShareData {
  const rankSuffix = getRankSuffix(rank);

  return {
    title: `${collegeName} - Rank #${rank} in College Champs`,
    text: `${collegeName} is ranked ${rank}${rankSuffix} in the AWS UG College Champs program with ${points} points! 🎓🏆`,
    url: buildShareUrl({ type: 'college', name: collegeName, rank: String(rank), points: String(points) }),
    hashtags: ['AWSUG', 'CollegeChamps', 'AWS', 'Students'],
  };
}

// Generate share data for college task completion
export function generateCollegeTaskShare(
  collegeName: string,
  taskTitle: string,
  points: number
): AchievementShareData {
  return {
    title: `${collegeName} completed ${taskTitle}`,
    text: `${collegeName} just completed "${taskTitle}" and earned ${points} points! 🎯`,
    url: buildShareUrl({ type: 'college', name: collegeName, points: String(points) }),
    hashtags: ['AWSUG', 'CollegeChamps', 'AWS'],
  };
}

// Generate share data for certification earned
export function generateCertificationShare(
  userName: string,
  certificationName: string
): AchievementShareData {
  return {
    title: `${userName} earned ${certificationName}`,
    text: `I just earned my ${certificationName} certification! 📜`,
    url: buildShareUrl({ type: 'certification', user: userName, name: certificationName }),
    hashtags: ['AWS', 'Certification', 'CloudComputing', 'AWSUG'],
  };
}

// Generate share data for meetup attendance
export function generateMeetupAttendanceShare(
  userName: string,
  meetupTitle: string,
  meetupId: string
): AchievementShareData {
  return {
    title: `${userName} attended ${meetupTitle}`,
    text: `I attended "${meetupTitle}" with AWS User Group! Great learning experience! 🎉`,
    url: buildShareUrl({ type: 'meetup', name: meetupTitle, id: meetupId }),
    hashtags: ['AWSUG', 'Meetup', 'AWS', 'Networking'],
  };
}

// Helper function to get rank suffix (1st, 2nd, 3rd, etc.)
function getRankSuffix(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;

  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
