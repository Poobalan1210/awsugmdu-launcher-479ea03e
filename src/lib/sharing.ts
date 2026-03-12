import { Badge } from '@/data/mockData';

const BASE_URL = window.location.origin;

export interface AchievementShareData {
  title: string;
  text: string;
  url: string;
  hashtags?: string[];
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
    url: `${BASE_URL}/leaderboard`,
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
    url: `${BASE_URL}/profile`,
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
    url: `${BASE_URL}/skill-sprint/${sprintId}`,
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
    url: `${BASE_URL}/college-champs`,
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
    url: `${BASE_URL}/college-champs`,
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
    url: `${BASE_URL}/certifications`,
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
    url: `${BASE_URL}/meetups/${meetupId}`,
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

// Generate share data for varied profile activities
export function generateProfileActivityShare(
  userName: string,
  activityType: string,
  activityTitle: string,
  activityLink?: string,
  points?: number
): AchievementShareData | null {
  const url = activityLink ? `${BASE_URL}${activityLink}` : `${BASE_URL}/profile`;
  const hashtags = ['AWSUG', 'AWS', 'Community'];
  
  if (activityType === 'sprint_attended') {
    return {
      title: `${userName} attended ${activityTitle}`,
      text: `I participated in the "${activityTitle}" skill sprint with AWS User Group! 🚀`,
      url,
      hashtags: [...hashtags, 'SkillSprint', 'Learning']
    };
  }
  
  if (activityType === 'sprint_spoke') {
    return {
      title: `${userName} spoke at ${activityTitle}`,
      text: `I had the honor of speaking at "${activityTitle}"! 🎙️`,
      url,
      hashtags: [...hashtags, 'Speaker', 'SkillSprint']
    };
  }
  
  if (activityType === 'meetup_spoke') {
    return {
      title: `${userName} spoke at ${activityTitle}`,
      text: `I spoke at "${activityTitle}"! 🎙️`,
      url,
      hashtags: [...hashtags, 'Speaker', 'Meetup']
    };
  }
  
  if (activityType === 'blog_submitted') {
    return {
      title: `${userName} published a blog for ${activityTitle}`,
      text: `I just published a new blog for the "${activityTitle}" skill sprint! 📝`,
      url,
      hashtags: [...hashtags, 'Blog', 'SkillSprint']
    };
  }
  
  if (activityType === 'submission_approved') {
    return {
      title: `${userName}'s submission for ${activityTitle} was approved`,
      text: `My submission for the "${activityTitle}" skill sprint was approved! I earned ${points || 0} points! 🏆`,
      url,
      hashtags: [...hashtags, 'Achievement', 'SkillSprint']
    };
  }
  
  if (activityType === 'points_awarded') {
    return {
      title: `${userName} earned points`,
      text: `I was awarded ${points || 0} points by the AWS User Group! ⚡`,
      url,
      hashtags: [...hashtags, 'Achievement']
    };
  }
  
  // Return null for unhandled types or ones handled differently (e.g., meetup_attended)
  return null;
}

// Generate share data for varied college activities
export function generateCollegeActivityShare(
  collegeName: string,
  activityType: 'task' | 'event' | 'adhoc',
  activityTitle: string,
  points: number,
  isEventUpcoming?: boolean
): AchievementShareData {
  const url = `${BASE_URL}/college-champs`;
  const hashtags = ['AWSUG', 'CollegeChamps', 'AWS', 'Students'];
  
  if (activityType === 'task') {
    return generateCollegeTaskShare(collegeName, activityTitle, points);
  }
  
  if (activityType === 'event') {
    const verb = isEventUpcoming ? 'is hosting' : 'hosted';
    return {
      title: `${collegeName} ${verb} ${activityTitle}`,
      text: `${collegeName} ${verb} "${activityTitle}" for the AWS User Group! 📅`,
      url,
      hashtags: [...hashtags, 'Event']
    };
  }
  
  // Adhoc
  return {
    title: `${collegeName} earned points`,
    text: `${collegeName} was awarded ${points} points! ⚡🏆`,
    url,
    hashtags: [...hashtags, 'Achievement']
  };
}
