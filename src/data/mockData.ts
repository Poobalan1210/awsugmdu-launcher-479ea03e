// Mock data for the AWS User Group website

export type UserRole = 'admin' | 'speaker' | 'participant';

// Extended roles for community management
export type CommunityRole = 'member' | 'volunteer' | 'organiser' | 'champ' | 'cloud_club_captain' | 'speaker' | 'admin';

export interface UserRoleAssignment {
  id: string;
  userId: string;
  role: CommunityRole;
  assignedAt: string;
  assignedBy: string;
}

// Activity tracking for points
export interface PointActivity {
  id: string;
  userId: string;
  points: number;
  reason: string;
  type: 'adhoc' | 'submission' | 'badge' | 'event';
  awardedBy?: string;
  awardedAt: string;
}

// Role metadata for display
export const communityRoles: { value: CommunityRole; label: string; description: string; color: string; icon: string }[] = [
  { value: 'member', label: 'Member', description: 'Community member with basic access', color: 'bg-gray-500', icon: '👤' },
  { value: 'volunteer', label: 'Volunteer', description: 'Helps with event organization and community activities', color: 'bg-blue-500', icon: '🙋' },
  { value: 'organiser', label: 'Organiser', description: 'Organizes and manages community events', color: 'bg-purple-500', icon: '📋' },
  { value: 'champ', label: 'Champ', description: 'Community champion and active contributor', color: 'bg-amber-500', icon: '🏆' },
  { value: 'cloud_club_captain', label: 'Cloud Club Captain', description: 'Leads college cloud clubs and student initiatives', color: 'bg-emerald-500', icon: '☁️' },
  { value: 'speaker', label: 'Speaker', description: 'Delivers sessions and talks at events', color: 'bg-rose-500', icon: '🎤' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access to the platform', color: 'bg-red-600', icon: '👑' },
];

// Mock user role assignments - all users get 'member' role by default
export const mockUserRoles: UserRoleAssignment[] = [
  // Default member roles for all users
  { id: 'ur-m1', userId: 'admin1', role: 'member', assignedAt: '2023-01-01', assignedBy: 'system' },
  { id: 'ur-m2', userId: '1', role: 'member', assignedAt: '2024-01-15', assignedBy: 'system' },
  { id: 'ur-m3', userId: '2', role: 'member', assignedAt: '2024-02-20', assignedBy: 'system' },
  { id: 'ur-m4', userId: '3', role: 'member', assignedAt: '2024-01-10', assignedBy: 'system' },
  { id: 'ur-m5', userId: '4', role: 'member', assignedAt: '2024-03-05', assignedBy: 'system' },
  { id: 'ur-m6', userId: '5', role: 'member', assignedAt: '2024-04-12', assignedBy: 'system' },
  { id: 'ur-m7', userId: '6', role: 'member', assignedAt: '2024-05-01', assignedBy: 'system' },
  { id: 'ur-m8', userId: '7', role: 'member', assignedAt: '2024-06-18', assignedBy: 'system' },
  { id: 'ur-m9', userId: '8', role: 'member', assignedAt: '2024-02-28', assignedBy: 'system' },
  { id: 'ur-m10', userId: '9', role: 'member', assignedAt: '2024-07-22', assignedBy: 'system' },
  { id: 'ur-m11', userId: '10', role: 'member', assignedAt: '2024-08-10', assignedBy: 'system' },
  // Additional roles
  { id: 'ur1', userId: 'admin1', role: 'admin', assignedAt: '2023-01-01', assignedBy: 'system' },
  { id: 'ur2', userId: 'admin1', role: 'organiser', assignedAt: '2023-01-01', assignedBy: 'system' },
  { id: 'ur3', userId: '1', role: 'speaker', assignedAt: '2024-01-15', assignedBy: 'admin1' },
  { id: 'ur4', userId: '1', role: 'organiser', assignedAt: '2024-02-01', assignedBy: 'admin1' },
  { id: 'ur5', userId: '2', role: 'speaker', assignedAt: '2024-02-20', assignedBy: 'admin1' },
  { id: 'ur6', userId: '3', role: 'volunteer', assignedAt: '2024-03-01', assignedBy: 'admin1' },
  { id: 'ur7', userId: '5', role: 'champ', assignedAt: '2024-04-15', assignedBy: 'admin1' },
  { id: 'ur8', userId: '6', role: 'cloud_club_captain', assignedAt: '2024-05-01', assignedBy: 'admin1' },
];

// Mock point activities
export const mockPointActivities: PointActivity[] = [
  { id: 'pa1', userId: '1', points: 100, reason: 'Sprint submission approved', type: 'submission', awardedAt: '2024-06-15' },
  { id: 'pa2', userId: '1', points: 50, reason: 'Community contribution', type: 'adhoc', awardedBy: 'admin1', awardedAt: '2024-07-01' },
  { id: 'pa3', userId: '2', points: 150, reason: 'Speaker session delivered', type: 'event', awardedAt: '2024-06-20' },
  { id: 'pa4', userId: '3', points: 25, reason: 'Helped with event setup', type: 'adhoc', awardedBy: 'admin1', awardedAt: '2024-07-10' },
];

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  points: number;
  rank: number;
  badges: Badge[];
  joinedDate: string;
  bio?: string;
  role: UserRole;
  designation?: string;
  company?: string;
  linkedIn?: string;
  github?: string;
  twitter?: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedDate: string;
  category: 'sprint' | 'certification' | 'contribution' | 'special';
}

export interface Sprint {
  id: string;
  title: string;
  theme: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'upcoming' | 'active' | 'completed';
  participants: number;
  sessions: Session[];
  submissions: Submission[];
  githubRepo?: string;
  registeredUsers: string[];
}

export interface SessionPerson {
  userId?: string;
  name: string;
  photo?: string;
  designation?: string;
  company?: string;
  email?: string;
  linkedIn?: string;
}

export interface Session {
  id: string;
  title: string;
  speaker: string;
  speakerId?: string;
  speakerPhoto?: string;
  speakerDesignation?: string;
  speakerCompany?: string;
  speakerBio?: string;
  speakerLinkedIn?: string;
  hosts?: SessionPerson[];
  speakers?: SessionPerson[];
  volunteers?: SessionPerson[];
  date: string;
  time: string;
  duration?: string;
  description: string;
  richDescription?: string; // HTML/Markdown content for rich text display
  agenda?: string[];
  meetingLink?: string;
  meetupUrl?: string; // External meetup.com registration link
  recordingUrl?: string;
  youtubeUrl?: string; // YouTube video link for past sessions
  slidesUrl?: string;
  posterImage?: string;
}

export interface Submission {
  id: string;
  sprintId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  blogUrl?: string;
  repoUrl?: string;
  description?: string;
  submittedAt: string;
  points: number;
  status: 'pending' | 'approved' | 'rejected';
  feedback?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface AgendaItem {
  time: string;
  title: string;
  description?: string;
  speakerId?: string;
}

export interface Meetup {
  id: string;
  title: string;
  description: string;
  richDescription?: string; // HTML content for rich text display
  date: string;
  time: string;
  type: 'virtual' | 'in-person' | 'hybrid';
  location?: string;
  meetingLink?: string;
  meetupUrl?: string; // External meetup.com registration link
  status: 'upcoming' | 'ongoing' | 'completed';
  attendees: number;
  maxAttendees?: number;
  registeredUsers: string[];
  speakers: MeetupSpeaker[];
  image?: string;
}

export interface MeetupSpeaker {
  id: string;
  uniqueLink?: string;
  userId?: string;
  name: string;
  photo: string;
  designation: string;
  company?: string;
  topic: string;
  bio?: string;
  linkedIn?: string;
  sessionDetails?: string;
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  type: 'virtual' | 'in-person' | 'hybrid';
  category: 'sprint' | 'workshop' | 'meetup' | 'certification' | 'champs';
  attendees: number;
  image?: string;
  linkedEventId?: string;
}

export interface ForumPost {
  id: string;
  sprintId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  title: string;
  content: string;
  createdAt: string;
  replies: ForumReply[];
  likes: number;
}

export interface ForumReply {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  likes: number;
}

export interface CertificationGroup {
  id: string;
  name: string;
  level: 'Foundational' | 'Associate' | 'Professional' | 'Specialty';
  description: string;
  members: string[];
  owners: string[];
  color: string;
  scheduledSessions: GroupSession[];
  messages: GroupMessage[];
}

export interface GroupSession {
  id: string;
  groupId: string;
  title: string;
  description: string;
  date: string;
  time: string;
  hostId: string;
  hostName: string;
  meetingLink?: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  replies: GroupReply[];
  likes: number;
  isPinned?: boolean;
}

export interface GroupReply {
  id: string;
  messageId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
  likes: number;
}

export interface SpeakerInvite {
  id: string;
  eventType: 'sprint' | 'meetup';
  eventId: string;
  uniqueLink: string;
  email?: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: string;
  expiresAt: string;
}

// Mock Users with roles - 5 users with rich profiles
export const mockUsers: User[] = [
  {
    id: 'admin1',
    name: 'Admin User',
    email: 'admin@awsug.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
    points: 5000,
    rank: 0,
    badges: [],
    joinedDate: '2023-01-01',
    bio: 'AWS User Group Administrator. Passionate about building developer communities and fostering cloud adoption.',
    role: 'admin',
    designation: 'Community Lead',
    company: 'AWS User Group',
    linkedIn: 'https://linkedin.com/in/admin',
    github: 'https://github.com/admin',
    twitter: 'https://twitter.com/admin'
  },
  {
    id: '1',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
    points: 2450,
    rank: 1,
    badges: [],
    joinedDate: '2024-01-15',
    bio: 'Cloud enthusiast and AWS Community Builder. I love building serverless applications and sharing knowledge through technical blogs and talks.',
    role: 'speaker',
    designation: 'Solutions Architect',
    company: 'Tech Corp',
    linkedIn: 'https://linkedin.com/in/priya-sharma',
    github: 'https://github.com/priya-sharma',
    twitter: 'https://twitter.com/priyasharma'
  },
  {
    id: '2',
    name: 'Rahul Verma',
    email: 'rahul@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
    points: 2100,
    rank: 2,
    badges: [],
    joinedDate: '2024-02-20',
    bio: 'DevOps Engineer with expertise in AWS, Kubernetes, and CI/CD pipelines. Serverless advocate and open source contributor.',
    role: 'speaker',
    designation: 'DevOps Lead',
    company: 'Cloud Solutions Inc',
    linkedIn: 'https://linkedin.com/in/rahul-verma',
    github: 'https://github.com/rahul-verma'
  },
  {
    id: '3',
    name: 'Ananya Patel',
    email: 'ananya@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
    points: 1890,
    rank: 3,
    badges: [],
    joinedDate: '2024-01-10',
    bio: 'Solutions Architect exploring the frontiers of Generative AI on AWS. 3x AWS Certified. Regular speaker at tech meetups.',
    role: 'participant',
    designation: 'Cloud Engineer',
    company: 'DataFlow Systems',
    linkedIn: 'https://linkedin.com/in/ananya-patel',
    github: 'https://github.com/ananya-patel'
  },
  {
    id: '4',
    name: 'Vikram Singh',
    email: 'vikram@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram',
    points: 1650,
    rank: 4,
    badges: [],
    joinedDate: '2024-03-05',
    bio: 'Security specialist focusing on AWS IAM, KMS, and compliance. Helping organizations build secure cloud architectures.',
    role: 'participant',
    designation: 'Security Consultant',
    company: 'SecureCloud Ltd',
    linkedIn: 'https://linkedin.com/in/vikram-singh'
  },
  {
    id: '5',
    name: 'Sneha Reddy',
    email: 'sneha@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sneha',
    points: 1420,
    rank: 5,
    badges: [],
    joinedDate: '2024-02-28',
    bio: 'Full-stack developer transitioning to cloud. Active learner and blogger sharing my AWS journey.',
    role: 'participant',
    designation: 'Software Engineer',
    company: 'StartupXYZ',
    linkedIn: 'https://linkedin.com/in/sneha-reddy',
    github: 'https://github.com/sneha-reddy',
    twitter: 'https://twitter.com/snehareddy'
  },
  {
    id: '6',
    name: 'Arjun Nair',
    email: 'arjun@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arjun',
    points: 1200,
    rank: 6,
    badges: [],
    joinedDate: '2024-04-12',
    role: 'participant',
    bio: 'Backend developer learning AWS. Interested in microservices and container orchestration.',
    designation: 'Backend Developer',
    company: 'TechStartup'
  },
  {
    id: '7',
    name: 'Kavitha Menon',
    email: 'kavitha@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kavitha',
    points: 980,
    rank: 7,
    badges: [],
    joinedDate: '2024-03-22',
    role: 'participant',
    bio: 'Data Engineer working with AWS data services. Love exploring new ways to process big data.',
    designation: 'Data Engineer',
    company: 'Analytics Co'
  },
  {
    id: '8',
    name: 'Deepak Kumar',
    email: 'deepak@example.com',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Deepak',
    points: 850,
    rank: 8,
    badges: [],
    joinedDate: '2024-05-01',
    role: 'participant',
    bio: 'Cloud enthusiast and student. Preparing for AWS Solutions Architect certification.',
    designation: 'Student',
    company: 'University of Technology'
  }
];

// Mock Badges
export const mockBadges: Badge[] = [
  {
    id: 'b1',
    name: 'Sprint Champion',
    description: 'Completed 5 skill sprints',
    icon: '🏆',
    earnedDate: '2024-06-15',
    category: 'sprint'
  },
  {
    id: 'b2',
    name: 'First Submission',
    description: 'Made your first sprint submission',
    icon: '🚀',
    earnedDate: '2024-03-20',
    category: 'sprint'
  },
  {
    id: 'b3',
    name: 'AWS Certified',
    description: 'Earned an AWS certification',
    icon: '📜',
    earnedDate: '2024-04-10',
    category: 'certification'
  },
  {
    id: 'b4',
    name: 'Community Helper',
    description: 'Helped 10 community members',
    icon: '🤝',
    earnedDate: '2024-05-25',
    category: 'contribution'
  },
  {
    id: 'b5',
    name: 'Blog Writer',
    description: 'Published 3 technical blogs',
    icon: '✍️',
    earnedDate: '2024-06-01',
    category: 'contribution'
  },
  {
    id: 'b6',
    name: 'Early Adopter',
    description: 'Joined in the first month',
    icon: '⭐',
    earnedDate: '2024-01-15',
    category: 'special'
  },
  {
    id: 'b7',
    name: 'Speaker Star',
    description: 'Delivered 3 sessions',
    icon: '🎤',
    earnedDate: '2024-07-01',
    category: 'contribution'
  },
  {
    id: 'b8',
    name: 'Security Expert',
    description: 'Completed Security Sprint',
    icon: '🔒',
    earnedDate: '2024-12-31',
    category: 'sprint'
  }
];

// Assign badges to users with more variety
mockUsers[0].badges = [mockBadges[5], mockBadges[6]]; // Admin
mockUsers[1].badges = [mockBadges[0], mockBadges[2], mockBadges[4], mockBadges[5], mockBadges[6]]; // Priya
mockUsers[2].badges = [mockBadges[1], mockBadges[3], mockBadges[7]]; // Rahul
mockUsers[3].badges = [mockBadges[0], mockBadges[1], mockBadges[2], mockBadges[4]]; // Ananya
mockUsers[4].badges = [mockBadges[1], mockBadges[7]]; // Vikram
mockUsers[5].badges = [mockBadges[1], mockBadges[4]]; // Sneha

// Mock Sprints
export const mockSprints: Sprint[] = [
  {
    id: 's1',
    title: 'Serverless January',
    theme: 'Serverless',
    description: 'Build scalable applications using AWS Lambda, API Gateway, and DynamoDB. Learn event-driven architecture patterns and best practices for serverless development.',
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    status: 'active',
    participants: 45,
    githubRepo: 'https://github.com/aws-ug/serverless-sprint-2025',
    registeredUsers: ['3', '4', '5', '6', '7', '8'],
    sessions: [
      {
        id: 'ses1',
        title: 'Introduction to Serverless Architecture',
        speaker: 'Priya Sharma',
        speakerId: '1',
        speakerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        speakerDesignation: 'Solutions Architect',
        speakerCompany: 'Tech Corp',
        speakerBio: 'AWS Community Builder with 5+ years of experience building serverless applications at scale.',
        speakerLinkedIn: 'https://linkedin.com/in/priya-sharma',
        hosts: [
          {
            userId: 'admin1',
            name: 'Admin User',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
            designation: 'Community Lead',
            company: 'AWS User Group'
          }
        ],
        speakers: [
          {
            userId: '1',
            name: 'Priya Sharma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
            designation: 'Solutions Architect',
            company: 'Tech Corp',
            linkedIn: 'https://linkedin.com/in/priya-sharma'
          }
        ],
        volunteers: [
          {
            userId: '2',
            name: 'Rahul Verma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
            designation: 'DevOps Lead',
            company: 'Cloud Solutions Inc'
          }
        ],
        date: '2025-01-05',
        time: '18:00 IST',
        duration: '90 minutes',
        description: 'Learn the fundamentals of serverless computing and AWS Lambda.',
        richDescription: `## What You'll Learn

In this hands-on session, we'll cover the **fundamentals of serverless computing** and dive deep into AWS Lambda.

### Topics Covered

- **What is Serverless Computing?** - Understanding the paradigm shift
- **AWS Lambda Fundamentals** - Functions, triggers, and execution model
- **Event-driven Architecture** - Building reactive applications
- **Cold Starts & Optimization** - Performance best practices

### Prerequisites

1. Basic understanding of cloud concepts
2. AWS Free Tier account (recommended)
3. Familiarity with any programming language

### Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda)
- GitHub repo with code samples
- Session recording available after the event

> **Pro Tip:** Bring your laptop for the hands-on portion!`,
        meetupUrl: 'https://www.meetup.com/aws-user-group/events/serverless-intro',
        meetingLink: 'https://meet.example.com/ses1',
        posterImage: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=300&fit=crop'
      },
      {
        id: 'ses2',
        title: 'Building APIs with API Gateway',
        speaker: 'Rahul Verma',
        speakerId: '2',
        speakerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
        speakerDesignation: 'DevOps Lead',
        speakerCompany: 'Cloud Solutions Inc',
        speakerBio: 'DevOps engineer specializing in AWS serverless and container orchestration.',
        speakerLinkedIn: 'https://linkedin.com/in/rahul-verma',
        hosts: [
          {
            userId: '1',
            name: 'Priya Sharma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
            designation: 'Solutions Architect',
            company: 'Tech Corp'
          }
        ],
        speakers: [
          {
            userId: '2',
            name: 'Rahul Verma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
            designation: 'DevOps Lead',
            company: 'Cloud Solutions Inc',
            linkedIn: 'https://linkedin.com/in/rahul-verma'
          }
        ],
        volunteers: [
          {
            userId: '3',
            name: 'Ananya Patel',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
            designation: 'Cloud Engineer',
            company: 'DataFlow Systems'
          }
        ],
        date: '2025-01-15',
        time: '18:00 IST',
        duration: '90 minutes',
        description: 'Deep dive into REST and WebSocket APIs using Amazon API Gateway.',
        richDescription: `## API Gateway Deep Dive

Learn how to build **production-ready APIs** using Amazon API Gateway. This session covers everything from basics to advanced patterns.

### What We'll Cover

1. **REST APIs** - Creating RESTful endpoints
2. **WebSocket APIs** - Real-time communication
3. **Lambda Integration** - Seamless backend connections
4. **Security** - API keys, throttling, and IAM

### Code Examples

\`\`\`javascript
// Sample Lambda handler
export const handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from Lambda!" })
  };
};
\`\`\`

### Best Practices

- Use **stages** for dev/staging/prod environments
- Implement proper **error handling**
- Configure **caching** for improved performance
- Set up **CloudWatch** monitoring

*Bring your questions for the Q&A session!*`,
        meetupUrl: 'https://www.meetup.com/aws-user-group/events/api-gateway-session',
        meetingLink: 'https://meet.example.com/ses2',
        posterImage: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&h=300&fit=crop'
      }
    ],
    submissions: [
      {
        id: 'sub1',
        sprintId: 's1',
        userId: '3',
        userName: 'Ananya Patel',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
        blogUrl: 'https://dev.to/ananya/serverless-journey',
        repoUrl: 'https://github.com/ananya/serverless-app',
        description: 'Built a complete serverless REST API with Lambda and DynamoDB for a task management application.',
        submittedAt: '2025-01-20',
        points: 100,
        status: 'approved',
        feedback: 'Great work! Well-structured code and excellent documentation.',
        reviewedBy: 'admin1',
        reviewedAt: '2025-01-21'
      },
      {
        id: 'sub4',
        sprintId: 's1',
        userId: '5',
        userName: 'Sneha Reddy',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sneha',
        blogUrl: 'https://medium.com/@sneha/my-serverless-app',
        description: 'Created a serverless image processing pipeline using S3 triggers and Lambda.',
        submittedAt: '2025-01-22',
        points: 0,
        status: 'pending'
      },
      {
        id: 'sub5',
        sprintId: 's1',
        userId: '6',
        userName: 'Arjun Nair',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arjun',
        repoUrl: 'https://github.com/arjun/lambda-functions',
        description: 'Lambda functions collection for various use cases including file processing and notifications.',
        submittedAt: '2025-01-23',
        points: 0,
        status: 'pending'
      }
    ]
  },
  {
    id: 's2',
    title: 'GenAI February',
    theme: 'Generative AI',
    description: 'Explore Amazon Bedrock, build AI-powered applications, and learn prompt engineering best practices. Get hands-on experience with foundation models.',
    startDate: '2025-02-01',
    endDate: '2025-02-28',
    status: 'upcoming',
    participants: 32,
    registeredUsers: ['3', '4'],
    sessions: [
      {
        id: 'ses3',
        title: 'Getting Started with Amazon Bedrock',
        speaker: 'Ananya Patel',
        speakerId: '3',
        speakerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
        speakerDesignation: 'Cloud Engineer',
        speakerCompany: 'DataFlow Systems',
        speakerBio: 'Solutions Architect with a passion for AI/ML and cloud technologies.',
        hosts: [
          {
            userId: 'admin1',
            name: 'Admin User',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
            designation: 'Community Lead',
            company: 'AWS User Group'
          }
        ],
        speakers: [
          {
            userId: '3',
            name: 'Ananya Patel',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
            designation: 'Cloud Engineer',
            company: 'DataFlow Systems'
          }
        ],
        volunteers: [],
        date: '2025-02-08',
        time: '18:00 IST',
        duration: '90 minutes',
        description: 'Introduction to foundation models and Amazon Bedrock.',
        richDescription: `# Amazon Bedrock Fundamentals

Discover how to build **AI-powered applications** using Amazon Bedrock's foundation models.

## Session Highlights

- 🤖 **Foundation Models** - Claude, Titan, Llama, and more
- 🔧 **Bedrock API** - Integrating AI into your apps
- ✨ **Prompt Engineering** - Getting better results
- 🛡️ **Guardrails** - Responsible AI practices

## Prerequisites

- AWS account with Bedrock access enabled
- Basic Python or JavaScript knowledge
- Curiosity about AI/ML!

## What You'll Build

A simple chatbot using Amazon Bedrock that can:
1. Answer questions about AWS services
2. Generate code snippets
3. Summarize documents

*Limited seats available - register now!*`,
        meetupUrl: 'https://www.meetup.com/aws-user-group/events/bedrock-intro',
        posterImage: 'https://images.unsplash.com/photo-1676299081847-824916de030a?w=600&h=300&fit=crop'
      }
    ],
    submissions: []
  },
  {
    id: 's3',
    title: 'Security December',
    theme: 'Security',
    description: 'Master AWS security services including IAM, KMS, and Security Hub. Build secure cloud architectures and learn compliance best practices.',
    startDate: '2024-12-01',
    endDate: '2024-12-31',
    status: 'completed',
    participants: 38,
    githubRepo: 'https://github.com/aws-ug/security-sprint-2024',
    registeredUsers: ['1', '2', '3', '4', '5'],
    sessions: [
      {
        id: 'ses4',
        title: 'AWS IAM Deep Dive',
        speaker: 'Vikram Singh',
        speakerId: '4',
        speakerPhoto: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram',
        speakerDesignation: 'Security Consultant',
        speakerCompany: 'SecureCloud Ltd',
        speakerBio: 'Security specialist with expertise in AWS IAM, KMS, and compliance frameworks.',
        hosts: [
          {
            userId: 'admin1',
            name: 'Admin User',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Admin',
            designation: 'Community Lead',
            company: 'AWS User Group'
          }
        ],
        speakers: [
          {
            userId: '4',
            name: 'Vikram Singh',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram',
            designation: 'Security Consultant',
            company: 'SecureCloud Ltd'
          }
        ],
        volunteers: [
          {
            userId: '1',
            name: 'Priya Sharma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
            designation: 'Solutions Architect',
            company: 'Tech Corp'
          },
          {
            userId: '2',
            name: 'Rahul Verma',
            photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
            designation: 'DevOps Lead',
            company: 'Cloud Solutions Inc'
          }
        ],
        date: '2024-12-10',
        time: '18:00 IST',
        duration: '120 minutes',
        description: 'Understanding IAM policies, roles, and best practices for secure AWS architectures.',
        richDescription: `## AWS IAM Security Deep Dive

Master **Identity and Access Management** - the foundation of AWS security.

### Topics Covered

| Topic | Duration |
|-------|----------|
| IAM Fundamentals | 20 min |
| Policy Deep Dive | 30 min |
| Roles & Cross-Account | 25 min |
| Hands-on Lab | 30 min |
| Q&A | 15 min |

### Key Takeaways

- ✅ Write **least-privilege** policies
- ✅ Implement **role-based access control**
- ✅ Set up **cross-account access** securely
- ✅ Audit with **IAM Access Analyzer**

### Sample Policy

\`\`\`json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
\`\`\`

*Recording available below for those who missed the live session!*`,
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        recordingUrl: 'https://youtube.com/watch?v=security-session',
        posterImage: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=600&h=300&fit=crop'
      }
    ],
    submissions: [
      {
        id: 'sub2',
        sprintId: 's3',
        userId: '1',
        userName: 'Priya Sharma',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        blogUrl: 'https://medium.com/@priya/aws-security-best-practices',
        description: 'Comprehensive guide to AWS security best practices covering IAM, encryption, and network security.',
        submittedAt: '2024-12-28',
        points: 150,
        status: 'approved',
        feedback: 'Excellent detailed guide! Very comprehensive.',
        reviewedBy: 'admin1',
        reviewedAt: '2024-12-29'
      },
      {
        id: 'sub3',
        sprintId: 's3',
        userId: '2',
        userName: 'Rahul Verma',
        userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
        repoUrl: 'https://github.com/rahul/secure-app',
        description: 'Secure application template with proper IAM configuration, encryption at rest, and network isolation.',
        submittedAt: '2024-12-25',
        points: 100,
        status: 'approved',
        feedback: 'Great template! Well-documented.',
        reviewedBy: 'admin1',
        reviewedAt: '2024-12-26'
      }
    ]
  }
];

// Mock Meetups
export const mockMeetups: Meetup[] = [
  {
    id: 'm1',
    title: 'AWS re:Invent Recap 2024',
    description: 'Catch up on all the exciting announcements from AWS re:Invent 2024. Join us for a comprehensive overview of new services, features, and best practices shared at the event.',
    richDescription: `<h2>About This Event</h2>
<p>Get the inside scoop on everything announced at <strong>AWS re:Invent 2024</strong>. Our expert speakers will break down the most impactful announcements and share practical insights on how to leverage these new services in your projects.</p>

<h3>What You'll Learn</h3>
<ul>
  <li>Overview of 50+ new service announcements</li>
  <li>Deep dive into AI/ML updates including Amazon Bedrock enhancements</li>
  <li>New compute and serverless innovations</li>
  <li>Networking session with AWS Community Builders</li>
</ul>

<h3>Event Agenda</h3>
<p><strong>18:00</strong> - Welcome & Introduction<br/>
<strong>18:15</strong> - New Compute Services Overview<br/>
<strong>18:45</strong> - Serverless Updates and Lambda SnapStart<br/>
<strong>19:15</strong> - Break & Networking<br/>
<strong>19:30</strong> - Q&A Panel<br/>
<strong>20:00</strong> - Closing & Next Steps</p>

<p><em>Don't miss this opportunity to learn from certified AWS professionals!</em></p>`,
    date: '2025-12-15',
    time: '18:00 IST',
    type: 'hybrid',
    location: 'Tech Hub, Bangalore',
    meetingLink: 'https://meet.example.com/reinvent-recap',
    meetupUrl: 'https://www.meetup.com/aws-user-group/events/reinvent-recap-2024',
    status: 'completed',
    attendees: 120,
    maxAttendees: 150,
    registeredUsers: ['1', '2', '3', '4', '5', '6'],
    speakers: [
      {
        id: 'ms1',
        userId: '1',
        name: 'Priya Sharma',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        designation: 'Solutions Architect',
        company: 'Tech Corp',
        topic: 'New Compute Services Overview',
        bio: 'AWS Community Builder with 5+ years of cloud experience',
        linkedIn: 'https://linkedin.com/in/priya-sharma',
        sessionDetails: 'Covering EC2 updates, Lambda enhancements, and new container services announced at re:Invent.'
      },
      {
        id: 'ms2',
        userId: '2',
        name: 'Rahul Verma',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
        designation: 'DevOps Lead',
        company: 'Cloud Solutions Inc',
        topic: 'Serverless Updates and Lambda SnapStart',
        bio: 'DevOps engineer specializing in AWS serverless',
        linkedIn: 'https://linkedin.com/in/rahul-verma',
        sessionDetails: 'Deep dive into Lambda SnapStart, new runtime support, and serverless best practices.'
      }
    ],
    image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=400&fit=crop'
  },
  {
    id: 'm2',
    title: 'Hands-on Workshop: Container Services',
    description: 'Deep dive into ECS and EKS with hands-on labs. Learn container orchestration on AWS from industry experts. Bring your laptop!',
    richDescription: `<h2>Container Services Workshop</h2>
<p>This is a <strong>hands-on workshop</strong> where you will deploy real containerized applications on AWS. By the end of this session, you will have practical experience with both ECS and EKS.</p>

<h3>Prerequisites</h3>
<ul>
  <li>Basic understanding of Docker and containers</li>
  <li>AWS account with console access</li>
  <li>Laptop with AWS CLI installed</li>
  <li>Familiarity with command line operations</li>
</ul>

<h3>What's Included</h3>
<ul>
  <li>Hands-on lab with real AWS environments</li>
  <li>Deploy your first ECS Fargate service</li>
  <li>Set up an EKS cluster from scratch</li>
  <li>Best practices for container security</li>
  <li>Take-home reference materials and code samples</li>
</ul>

<h3>Schedule</h3>
<p><strong>10:00</strong> - Welcome & Setup<br/>
<strong>10:30</strong> - ECS vs EKS: When to use what<br/>
<strong>11:15</strong> - Hands-on Lab 1: ECS Fargate<br/>
<strong>12:15</strong> - Lunch Break (provided)<br/>
<strong>13:00</strong> - Hands-on Lab 2: EKS Setup<br/>
<strong>14:30</strong> - Advanced Topics & Q&A<br/>
<strong>15:00</strong> - Wrap Up & Certificates</p>`,
    date: '2026-02-25',
    time: '10:00 IST',
    type: 'in-person',
    location: 'AWS Office, Hyderabad',
    meetupUrl: 'https://www.meetup.com/aws-user-group/events/container-workshop-2025',
    status: 'upcoming',
    attendees: 35,
    maxAttendees: 50,
    registeredUsers: ['3', '4', '5'],
    speakers: [
      {
        id: 'ms3',
        name: 'Karthik Iyer',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Karthik',
        designation: 'Container Specialist',
        company: 'AWS',
        topic: 'ECS vs EKS: When to use what',
        bio: 'AWS Container Hero helping teams adopt containerization',
        sessionDetails: 'Comprehensive comparison of ECS and EKS with real-world use cases and hands-on exercises.'
      }
    ],
    image: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=400&fit=crop'
  },
  {
    id: 'm3',
    title: 'AWS Community Day - Cloud Native',
    description: 'A full-day event dedicated to cloud native technologies. Multiple tracks covering containers, serverless, and microservices. Networking opportunities included!',
    richDescription: `<h2>AWS Community Day 2025</h2>
<p>Our <strong>flagship annual event</strong> bringing together cloud enthusiasts, developers, and architects. Experience a full day of learning, networking, and hands-on sessions with some of the best minds in the AWS ecosystem.</p>

<h3>Event Highlights</h3>
<ul>
  <li>Multiple tracks: Containers, Serverless, and Data</li>
  <li>Keynote by AWS Hero</li>
  <li>Interactive panel discussions</li>
  <li>Hands-on workshops in breakout rooms</li>
  <li>Swag, prizes, and networking lunch</li>
  <li>Certificate of participation for all attendees</li>
</ul>

<h3>Full Day Schedule</h3>
<p><strong>09:00</strong> - Registration & Breakfast<br/>
<strong>09:30</strong> - Opening Keynote: State of Cloud Native on AWS<br/>
<strong>10:30</strong> - Microservices Architecture Patterns<br/>
<strong>11:30</strong> - Breakout Sessions (Choose your track)<br/>
<strong>12:30</strong> - Networking Lunch<br/>
<strong>13:30</strong> - Hands-on Workshop<br/>
<strong>15:30</strong> - Panel Discussion: Future of Cloud Native<br/>
<strong>16:30</strong> - Closing & Lucky Draw</p>

<p><em>Join us for an unforgettable day of cloud learning!</em></p>`,
    date: '2026-02-15',
    time: '09:00 IST',
    type: 'hybrid',
    location: 'Convention Center, Chennai',
    meetingLink: 'https://meet.example.com/community-day',
    meetupUrl: 'https://www.meetup.com/aws-user-group/events/community-day-2025',
    status: 'upcoming',
    attendees: 85,
    maxAttendees: 200,
    registeredUsers: ['1', '2', '3'],
    speakers: [
      {
        id: 'ms4',
        userId: '1',
        name: 'Priya Sharma',
        photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
        designation: 'Solutions Architect',
        company: 'Tech Corp',
        topic: 'Microservices Architecture Patterns',
        bio: 'AWS Community Builder with expertise in distributed systems',
        linkedIn: 'https://linkedin.com/in/priya-sharma'
      }
    ],
    image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&h=400&fit=crop'
  },
  {
    id: 'm4',
    title: 'AWS Certification Study Group Kickoff',
    description: 'Weekly study group for Solutions Architect Associate certification. Join fellow learners and prepare together with structured study materials.',
    richDescription: `<h2>Certification Study Group</h2>
<p>Join our <strong>weekly study group</strong> for the AWS Solutions Architect Associate certification. Prepare together with structured study materials and peer support.</p>

<h3>What to Expect</h3>
<ul>
  <li>Weekly virtual sessions covering exam domains</li>
  <li>Shared study resources and practice questions</li>
  <li>Peer support and accountability partners</li>
  <li>Tips from recently certified members</li>
</ul>

<p>Whether you're just starting your certification journey or looking for study partners, this group is for you!</p>`,
    date: '2026-01-20',
    time: '19:00 IST',
    type: 'virtual',
    meetingLink: 'https://meet.example.com/study-group',
    meetupUrl: 'https://www.meetup.com/aws-user-group/events/study-group-kickoff',
    status: 'upcoming',
    attendees: 28,
    maxAttendees: 40,
    registeredUsers: ['4', '5', '6', '7'],
    speakers: [],
    image: 'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&h=400&fit=crop'
  }
];

// Mock Speaker Invites
export const mockSpeakerInvites: SpeakerInvite[] = [
  {
    id: 'inv1',
    eventType: 'sprint',
    eventId: 's2',
    uniqueLink: 'speaker-invite-abc123',
    email: 'speaker@example.com',
    status: 'pending',
    createdAt: '2025-01-15',
    expiresAt: '2025-02-01'
  }
];

// Note: mockEvents is generated after mockColleges is defined (see end of file)

// Mock Forum Posts
export const mockForumPosts: ForumPost[] = [
  {
    id: 'f1',
    sprintId: 's1',
    userId: '3',
    userName: 'Ananya Patel',
    userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya',
    title: 'Stuck with Lambda cold starts - any tips?',
    content: 'I am experiencing significant cold start times with my Lambda function. Has anyone found effective ways to reduce this? I have tried provisioned concurrency but it is expensive for my use case.',
    createdAt: '2025-01-08',
    replies: [
      { id: 'r1', postId: 'f1', userId: '2', userName: 'Rahul Verma', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul', content: 'Try using SnapStart if you are using Java! It reduces cold starts significantly.', createdAt: '2025-01-08', likes: 5 },
      { id: 'r2', postId: 'f1', userId: '1', userName: 'Priya Sharma', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya', content: 'Keep your package size small - only include what you need. Also consider using layers for shared dependencies.', createdAt: '2025-01-09', likes: 3 }
    ],
    likes: 8
  },
  {
    id: 'f2',
    sprintId: 's1',
    userId: '2',
    userName: 'Rahul Verma',
    userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul',
    title: 'Best practices for DynamoDB single-table design',
    content: 'Sharing my learnings from implementing single-table design in my sprint project. Key takeaway: access patterns first, then model your data!',
    createdAt: '2025-01-10',
    replies: [
      { id: 'r3', postId: 'f2', userId: '3', userName: 'Ananya Patel', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya', content: 'Great tips! I found the access pattern analysis really helpful.', createdAt: '2025-01-10', likes: 2 }
    ],
    likes: 15
  },
  {
    id: 'f3',
    sprintId: 's1',
    userId: '1',
    userName: 'Priya Sharma',
    userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya',
    title: 'Sprint Challenge Hints - Week 2',
    content: 'Here are some hints for this week\'s challenge. Remember to use Step Functions for orchestration! Also check out the new EventBridge Scheduler for time-based workflows.',
    createdAt: '2025-01-12',
    replies: [],
    likes: 42
  }
];

// Mock Certification Groups
export const mockCertificationGroups: CertificationGroup[] = [
  {
    id: 'cg1',
    name: 'Cloud Practitioner',
    level: 'Foundational',
    description: 'Start your AWS journey here! Perfect for beginners looking to understand cloud concepts.',
    members: ['3', '4', '5', '6', '7', '8'],
    owners: ['1', 'admin1'],
    color: 'bg-green-500/10 text-green-600 border-green-500/30',
    scheduledSessions: [
      { id: 'gs1', groupId: 'cg1', title: 'Weekly Study Session', description: 'Going through Domain 1: Cloud Concepts', date: '2025-01-18', time: '19:00 IST', hostId: '1', hostName: 'Priya Sharma', meetingLink: 'https://meet.example.com/cp-study' }
    ],
    messages: [
      { id: 'gm1', groupId: 'cg1', userId: '1', userName: 'Priya Sharma', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya', content: 'Welcome everyone! Let us use this channel to discuss Cloud Practitioner exam prep. Share resources, ask questions, and support each other!', createdAt: '2025-01-01', replies: [
        { id: 'gr1', messageId: 'gm1', userId: '5', userName: 'Sneha Reddy', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sneha', content: 'Thanks for setting this up! Super helpful.', createdAt: '2025-01-01', likes: 3 }
      ], likes: 12, isPinned: true },
      { id: 'gm2', groupId: 'cg1', userId: '6', userName: 'Arjun Nair', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arjun', content: 'Anyone have good resources for understanding the shared responsibility model?', createdAt: '2025-01-05', replies: [
        { id: 'gr2', messageId: 'gm2', userId: '1', userName: 'Priya Sharma', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Priya', content: 'Check out the AWS Well-Architected Framework whitepaper. It explains this really well!', createdAt: '2025-01-05', likes: 5 },
        { id: 'gr3', messageId: 'gm2', userId: '3', userName: 'Ananya Patel', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ananya', content: 'Also Stephane Maarek has a great video on this topic.', createdAt: '2025-01-05', likes: 4 }
      ], likes: 6 }
    ]
  },
  {
    id: 'cg2',
    name: 'Solutions Architect Associate',
    level: 'Associate',
    description: 'Design distributed systems on AWS. Most popular certification for architects and developers.',
    members: ['1', '2', '3', '4', '5'],
    owners: ['2', 'admin1'],
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    scheduledSessions: [
      { id: 'gs2', groupId: 'cg2', title: 'Practice Exam Review', description: 'Reviewing answers from practice test #3', date: '2025-01-20', time: '18:00 IST', hostId: '2', hostName: 'Rahul Verma' }
    ],
    messages: [
      { id: 'gm3', groupId: 'cg2', userId: '2', userName: 'Rahul Verma', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rahul', content: 'This week we are focusing on VPC and networking concepts. Make sure to understand VPC peering vs Transit Gateway!', createdAt: '2025-01-10', replies: [], likes: 8, isPinned: true }
    ]
  },
  {
    id: 'cg3',
    name: 'Developer Associate',
    level: 'Associate',
    description: 'Focus on developing and maintaining AWS applications. Great for developers.',
    members: ['2', '3', '5', '6'],
    owners: ['1'],
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    scheduledSessions: [],
    messages: [
      { id: 'gm4', groupId: 'cg3', userId: '5', userName: 'Sneha Reddy', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sneha', content: 'Just passed my DVA-C02! Happy to share my study notes.', createdAt: '2025-01-08', replies: [
        { id: 'gr4', messageId: 'gm4', userId: '6', userName: 'Arjun Nair', userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Arjun', content: 'Congrats! Would love to see your notes!', createdAt: '2025-01-08', likes: 2 }
      ], likes: 15 }
    ]
  },
  {
    id: 'cg4',
    name: 'SysOps Administrator',
    level: 'Associate',
    description: 'Operations and deployment on AWS. Perfect for sysadmins transitioning to cloud.',
    members: ['2', '4', '7'],
    owners: ['admin1'],
    color: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    scheduledSessions: [],
    messages: []
  },
  {
    id: 'cg5',
    name: 'Solutions Architect Professional',
    level: 'Professional',
    description: 'Advanced architectural concepts. Recommended after SAA certification.',
    members: ['1', '2'],
    owners: ['1'],
    color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
    scheduledSessions: [
      { id: 'gs3', groupId: 'cg5', title: 'Case Study Deep Dive', description: 'Analyzing complex architecture scenarios', date: '2025-01-25', time: '20:00 IST', hostId: '1', hostName: 'Priya Sharma' }
    ],
    messages: []
  },
  {
    id: 'cg6',
    name: 'DevOps Engineer Professional',
    level: 'Professional',
    description: 'CI/CD and automation on AWS. Combines development and operations expertise.',
    members: ['2'],
    owners: ['2'],
    color: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
    scheduledSessions: [],
    messages: []
  }
];

// ==================== COLLEGE CHAMPS DATA ====================

export interface CollegeTask {
  id: string;
  title: string;
  description: string;
  points: number;
  category: 'onboarding' | 'learning' | 'community' | 'event' | 'special';
  isPredefined: boolean;
  order?: number;
}

export interface CollegeTaskCompletion {
  taskId: string;
  completedAt: string;
  verifiedBy?: string;
  proof?: string;
  bonusPoints?: number;
}

export interface CollegeEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  type: 'workshop' | 'hackathon' | 'meetup' | 'webinar';
  attendees: number;
  pointsAwarded: number;
  status: 'upcoming' | 'completed';
}

export interface College {
  id: string;
  name: string;
  shortName: string;
  logo?: string;
  location: string;
  champsLead: string;
  champsLeadId?: string;
  totalPoints: number;
  rank: number;
  joinedDate: string;
  completedTasks: CollegeTaskCompletion[];
  hostedEvents: CollegeEvent[];
  members: string[];
  color: string;
}

export const predefinedTasks: CollegeTask[] = [
  { id: 'task1', title: 'Register as College Champ', description: 'Complete registration and verify your college email', points: 50, category: 'onboarding', isPredefined: true, order: 1 },
  { id: 'task2', title: 'Form Core Team', description: 'Recruit at least 3 team members for your college chapter', points: 100, category: 'onboarding', isPredefined: true, order: 2 },
  { id: 'task3', title: 'Complete AWS Basics Module', description: 'All core team members complete AWS Cloud Practitioner essentials', points: 150, category: 'learning', isPredefined: true, order: 3 },
  { id: 'task4', title: 'Social Media Setup', description: 'Create official college chapter social media handles', points: 75, category: 'community', isPredefined: true, order: 4 },
  { id: 'task5', title: 'Host Intro Session', description: 'Conduct an introductory session about AWS for your college', points: 200, category: 'event', isPredefined: true, order: 5 },
  { id: 'task6', title: 'Get 25 Members', description: 'Grow your chapter to 25+ active members', points: 150, category: 'community', isPredefined: true, order: 6 },
  { id: 'task7', title: 'First Workshop', description: 'Host a hands-on workshop on any AWS service', points: 250, category: 'event', isPredefined: true, order: 7 },
  { id: 'task8', title: 'Certification Drive', description: 'Help at least 5 members get AWS certified', points: 300, category: 'learning', isPredefined: true, order: 8 },
  { id: 'task9', title: 'Cross-College Collaboration', description: 'Collaborate with another college chapter for an event', points: 200, category: 'special', isPredefined: true, order: 9 },
  { id: 'task10', title: 'Industry Connect', description: 'Invite an industry professional for a guest session', points: 250, category: 'special', isPredefined: true, order: 10 },
];

export const mockColleges: College[] = [
  {
    id: 'college1',
    name: 'Indian Institute of Technology Delhi',
    shortName: 'IIT Delhi',
    location: 'New Delhi',
    champsLead: 'Rohit Verma',
    champsLeadId: '5',
    totalPoints: 1425,
    rank: 1,
    joinedDate: '2024-08-15',
    color: 'from-blue-500 to-cyan-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-08-16' },
      { taskId: 'task2', completedAt: '2024-08-20' },
      { taskId: 'task3', completedAt: '2024-09-05' },
      { taskId: 'task4', completedAt: '2024-09-10' },
      { taskId: 'task5', completedAt: '2024-09-25', bonusPoints: 50 },
      { taskId: 'task6', completedAt: '2024-10-10' },
      { taskId: 'task7', completedAt: '2024-10-28', bonusPoints: 100 },
      { taskId: 'task8', completedAt: '2024-11-15' },
    ],
    hostedEvents: [
      { id: 'e1', title: 'AWS Fundamentals Bootcamp', description: 'Introduction to core AWS services', date: '2024-09-25', type: 'workshop', attendees: 120, pointsAwarded: 200, status: 'completed' },
      { id: 'e2', title: 'Serverless Architecture Deep Dive', description: 'Building with Lambda and API Gateway', date: '2024-10-28', type: 'workshop', attendees: 85, pointsAwarded: 250, status: 'completed' },
      { id: 'e3', title: 'Cloud Hackathon 2025', description: 'Build innovative solutions on AWS', date: '2025-02-15', type: 'hackathon', attendees: 0, pointsAwarded: 0, status: 'upcoming' },
    ],
    members: ['5', '6', '7', '8'],
  },
  {
    id: 'college2',
    name: 'Birla Institute of Technology and Science',
    shortName: 'BITS Pilani',
    location: 'Pilani, Rajasthan',
    champsLead: 'Sneha Gupta',
    champsLeadId: '7',
    totalPoints: 1275,
    rank: 2,
    joinedDate: '2024-08-20',
    color: 'from-purple-500 to-pink-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-08-21' },
      { taskId: 'task2', completedAt: '2024-08-28' },
      { taskId: 'task3', completedAt: '2024-09-15' },
      { taskId: 'task4', completedAt: '2024-09-18' },
      { taskId: 'task5', completedAt: '2024-10-05' },
      { taskId: 'task6', completedAt: '2024-10-20' },
      { taskId: 'task7', completedAt: '2024-11-08' },
    ],
    hostedEvents: [
      { id: 'e4', title: 'Cloud Computing 101', description: 'Getting started with AWS', date: '2024-10-05', type: 'workshop', attendees: 95, pointsAwarded: 200, status: 'completed' },
      { id: 'e5', title: 'DevOps on AWS', description: 'CI/CD pipelines with CodePipeline', date: '2024-11-08', type: 'workshop', attendees: 70, pointsAwarded: 250, status: 'completed' },
    ],
    members: ['7', '9', '10'],
  },
  {
    id: 'college3',
    name: 'Vellore Institute of Technology',
    shortName: 'VIT Vellore',
    location: 'Vellore, Tamil Nadu',
    champsLead: 'Karthik Raja',
    totalPoints: 1150,
    rank: 3,
    joinedDate: '2024-08-25',
    color: 'from-amber-500 to-orange-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-08-26' },
      { taskId: 'task2', completedAt: '2024-09-02' },
      { taskId: 'task3', completedAt: '2024-09-20' },
      { taskId: 'task4', completedAt: '2024-09-25' },
      { taskId: 'task5', completedAt: '2024-10-12' },
      { taskId: 'task6', completedAt: '2024-11-01' },
      { taskId: 'task7', completedAt: '2024-11-20' },
    ],
    hostedEvents: [
      { id: 'e6', title: 'AWS for Startups', description: 'Building scalable applications', date: '2024-10-12', type: 'webinar', attendees: 150, pointsAwarded: 200, status: 'completed' },
    ],
    members: ['11', '12', '13', '14'],
  },
  {
    id: 'college4',
    name: 'National Institute of Technology Karnataka',
    shortName: 'NITK Surathkal',
    location: 'Mangalore, Karnataka',
    champsLead: 'Arun Kumar',
    totalPoints: 925,
    rank: 4,
    joinedDate: '2024-09-01',
    color: 'from-green-500 to-emerald-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-09-02' },
      { taskId: 'task2', completedAt: '2024-09-10' },
      { taskId: 'task3', completedAt: '2024-09-28' },
      { taskId: 'task4', completedAt: '2024-10-05' },
      { taskId: 'task5', completedAt: '2024-10-22' },
      { taskId: 'task6', completedAt: '2024-11-10' },
    ],
    hostedEvents: [
      { id: 'e7', title: 'Intro to AWS', description: 'First college event', date: '2024-10-22', type: 'meetup', attendees: 80, pointsAwarded: 200, status: 'completed' },
    ],
    members: ['15', '16'],
  },
  {
    id: 'college5',
    name: 'Delhi Technological University',
    shortName: 'DTU',
    location: 'New Delhi',
    champsLead: 'Priyanka Singh',
    totalPoints: 825,
    rank: 5,
    joinedDate: '2024-09-05',
    color: 'from-red-500 to-rose-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-09-06' },
      { taskId: 'task2', completedAt: '2024-09-15' },
      { taskId: 'task3', completedAt: '2024-10-01' },
      { taskId: 'task4', completedAt: '2024-10-08' },
      { taskId: 'task5', completedAt: '2024-10-30' },
    ],
    hostedEvents: [
      { id: 'e8', title: 'Cloud Careers Workshop', description: 'Career paths in cloud computing', date: '2024-10-30', type: 'workshop', attendees: 110, pointsAwarded: 200, status: 'completed' },
    ],
    members: ['17', '18', '19'],
  },
  {
    id: 'college6',
    name: 'Indian Institute of Technology Bombay',
    shortName: 'IIT Bombay',
    location: 'Mumbai, Maharashtra',
    champsLead: 'Vikram Mehta',
    totalPoints: 675,
    rank: 6,
    joinedDate: '2024-09-10',
    color: 'from-indigo-500 to-violet-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-09-11' },
      { taskId: 'task2', completedAt: '2024-09-22' },
      { taskId: 'task3', completedAt: '2024-10-10' },
      { taskId: 'task4', completedAt: '2024-10-18' },
      { taskId: 'task5', completedAt: '2024-11-05' },
    ],
    hostedEvents: [],
    members: ['20', '21'],
  },
  {
    id: 'college7',
    name: 'Manipal Institute of Technology',
    shortName: 'MIT Manipal',
    location: 'Manipal, Karnataka',
    champsLead: 'Divya Nair',
    totalPoints: 525,
    rank: 7,
    joinedDate: '2024-09-15',
    color: 'from-teal-500 to-cyan-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-09-16' },
      { taskId: 'task2', completedAt: '2024-09-28' },
      { taskId: 'task3', completedAt: '2024-10-15' },
      { taskId: 'task4', completedAt: '2024-10-25' },
    ],
    hostedEvents: [],
    members: ['22', '23', '24'],
  },
  {
    id: 'college8',
    name: 'SRM Institute of Science and Technology',
    shortName: 'SRMIST',
    location: 'Chennai, Tamil Nadu',
    champsLead: 'Rajesh Kumar',
    totalPoints: 375,
    rank: 8,
    joinedDate: '2024-09-20',
    color: 'from-pink-500 to-fuchsia-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-09-21' },
      { taskId: 'task2', completedAt: '2024-10-05' },
      { taskId: 'task3', completedAt: '2024-10-25' },
    ],
    hostedEvents: [],
    members: ['25'],
  },
  {
    id: 'college9',
    name: 'PSG College of Technology',
    shortName: 'PSG Tech',
    location: 'Coimbatore, Tamil Nadu',
    champsLead: 'Meera Sundaram',
    totalPoints: 225,
    rank: 9,
    joinedDate: '2024-10-01',
    color: 'from-sky-500 to-blue-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-10-02' },
      { taskId: 'task2', completedAt: '2024-10-18' },
    ],
    hostedEvents: [],
    members: ['26', '27'],
  },
  {
    id: 'college10',
    name: 'Amity University',
    shortName: 'Amity',
    location: 'Noida, Uttar Pradesh',
    champsLead: 'Amit Sharma',
    totalPoints: 100,
    rank: 10,
    joinedDate: '2024-10-15',
    color: 'from-slate-500 to-gray-500',
    completedTasks: [
      { taskId: 'task1', completedAt: '2024-10-16' },
    ],
    hostedEvents: [],
    members: ['28'],
  },
];

// Helper to get task by ID
export const getTaskById = (taskId: string): CollegeTask | undefined => {
  return predefinedTasks.find(task => task.id === taskId);
};

// Current logged in user (for demo - can be switched between roles)
export const adminUser: User = mockUsers[0]; // Admin
export const speakerUser: User = mockUsers[1]; // Speaker (Priya)
export const participantUser: User = mockUsers[3]; // Participant (Ananya)

// Default current user - change this to test different roles
export const currentUser: User = adminUser;

// Helper function to get user by ID
export const getUserById = (id: string): User | undefined => {
  return mockUsers.find(user => user.id === id);
};

// Helper to get event link based on category
export const getEventLink = (event: Event): string => {
  switch (event.category) {
    case 'sprint':
      return `/skill-sprint?id=${event.linkedEventId}`;
    case 'meetup':
    case 'workshop':
    case 'certification':
      return `/meetups?id=${event.linkedEventId}`;
    case 'champs':
      return '/college-champs';
    default:
      return '/';
  }
};

// Generate unique speaker invite link
export const generateSpeakerInviteLink = (eventType: 'sprint' | 'meetup', eventId: string): string => {
  const uniqueId = Math.random().toString(36).substring(2, 15);
  return `speaker-invite-${eventType}-${eventId}-${uniqueId}`;
};

// Helper function to generate unified events from all sources
// NOTE: This must be defined AFTER mockColleges to avoid circular dependency
export const generateUnifiedEvents = (): Event[] => {
  const events: Event[] = [];
  
  // Add Sprint Sessions
  mockSprints.forEach(sprint => {
    sprint.sessions.forEach(session => {
      events.push({
        id: `sprint-${sprint.id}-${session.id}`,
        title: session.title,
        description: session.description,
        date: session.date,
        time: session.time,
        type: 'virtual',
        category: 'sprint',
        attendees: sprint.participants,
        image: session.posterImage,
        linkedEventId: sprint.id
      });
    });
  });
  
  // Add Meetups
  mockMeetups.forEach(meetup => {
    events.push({
      id: `meetup-${meetup.id}`,
      title: meetup.title,
      description: meetup.description,
      date: meetup.date,
      time: meetup.time,
      type: meetup.type,
      category: meetup.title.toLowerCase().includes('workshop') ? 'workshop' : 
                meetup.title.toLowerCase().includes('certification') ? 'certification' : 'meetup',
      attendees: meetup.attendees,
      image: meetup.image,
      linkedEventId: meetup.id
    });
  });
  
  // Add College Champs Events
  mockColleges.forEach(college => {
    college.hostedEvents.forEach(event => {
      events.push({
        id: `champs-${college.id}-${event.id}`,
        title: `${event.title} - ${college.shortName}`,
        description: event.description,
        date: event.date,
        type: event.type === 'webinar' ? 'virtual' : 
              event.type === 'hackathon' ? 'hybrid' : 'in-person',
        category: 'champs',
        attendees: event.attendees,
        linkedEventId: college.id
      });
    });
  });
  
  // Sort by date (newest first for upcoming, oldest first for past)
  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

// Generate unified events from sprints, meetups, and college champs
export const mockEvents: Event[] = generateUnifiedEvents();
