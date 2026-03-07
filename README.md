# AWS User Group Madurai - Community Platform

A comprehensive community management platform for AWS User Group Madurai, built with React, TypeScript, and AWS services. This platform enables community members to participate in skill sprints, college programs, certification tracking, meetups, and earn rewards through a gamified points system.

## 🚀 Features

### 👤 User Management
- **Authentication & Authorization**: Secure login/signup with AWS Cognito
- **Role-Based Access Control**: Admin, Volunteer, and Champ roles with granular permissions
- **User Profiles**: Customizable profiles with avatar upload, bio, skills, and social links
- **Points & Badges**: Gamified reward system to track member contributions

### 🎓 College Champs Program
- **College Leaderboard**: Real-time ranking of participating colleges based on points
- **Task Management**: Assign and track completion of tasks for college chapters
- **Task Submissions**: College leads can submit proof of task completion for review
- **Event Tracking**: Monitor meetups and workshops hosted by each college
- **Member Management**: View and manage college chapter members

### 📚 Skill Sprint
- **Sprint Tracking**: Organize and participate in focused learning sprints
- **Progress Monitoring**: Track individual and team progress
- **Resource Sharing**: Share learning materials and resources
- **Leaderboard**: Competitive rankings to motivate participation

### 🎯 Certification Circle
- **Certification Tracking**: Log and showcase AWS certifications
- **Verification System**: Admin verification of certification claims
- **Integration Support**: Track certifications from multiple platforms
- **Achievement Display**: Showcase certifications on user profiles

### 📅 Meetups & Events
- **Event Management**: Create and manage community meetups
- **RSVP System**: Track attendee registrations
- **Speaker Management**: Invite and manage event speakers
- **Attendance Tracking**: QR code-based check-in system
- **Event Posters**: Upload and display event promotional materials

### 🏆 Leaderboard & Gamification
- **Global Leaderboard**: Track top contributors across the community
- **Points System**: Earn points for various activities (events, certifications, contributions)
- **Badge Awards**: Unlock achievements and special badges
- **Activity Feed**: Real-time updates on community activities

### 🛍️ Rewards Store
- **Points Redemption**: Exchange earned points for rewards
- **Merchandise**: Community swag and AWS merchandise
- **Digital Rewards**: Access to premium resources and courses

### 🔧 Admin Dashboard
- **User Management**: Manage user roles and permissions
- **Content Moderation**: Review and approve submissions
- **Task Management**: Create and assign tasks to colleges
- **Analytics**: View community engagement metrics
- **Bulk Operations**: Efficient management of multiple records

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **React Router** - Client-side routing
- **TanStack Query** - Server state management
- **Framer Motion** - Animations and transitions
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible component library
- **Radix UI** - Headless UI primitives
- **Lucide React** - Icon library

### Backend & Infrastructure
- **AWS Lambda** - Serverless compute
- **API Gateway** - RESTful API management
- **DynamoDB** - NoSQL database
- **S3** - File storage (avatars, posters, attachments)
- **CloudFront** - CDN for static assets
- **Cognito** - Authentication and user management
- **Terraform** - Infrastructure as Code

### Development Tools
- **ESLint** - Code linting
- **TypeScript ESLint** - TypeScript-specific linting
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixing

## 📋 Prerequisites

- Node.js 18+ or Bun
- AWS Account with appropriate permissions
- Terraform 1.0+
- AWS CLI configured with credentials

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone <repository-url>
cd awsugmdu-launcher
```

### 2. Install Dependencies
```bash
npm install
# or
bun install
```

### 3. Environment Configuration
Create a `.env.local` file in the root directory:
```env
VITE_AWS_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=your-user-pool-id
VITE_COGNITO_CLIENT_ID=your-client-id
VITE_API_ENDPOINT=https://your-api-gateway-url/dev
VITE_S3_BUCKET_NAME=your-s3-bucket-name
```

### 4. Deploy Infrastructure
```bash
cd infrastructure/terraform
terraform init
terraform plan
terraform apply
```

After deployment, Terraform will output the required environment variables. Update your `.env.local` file with these values.

### 5. Run Development Server
```bash
npm run dev
# or
bun run dev
```

The application will be available at `http://localhost:8080`

## 🏗️ Project Structure

```
.
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── auth/         # Authentication components
│   │   ├── college-champs/ # College program components
│   │   ├── common/       # Shared components
│   │   ├── layout/       # Layout components (Header, Footer)
│   │   └── ui/           # shadcn/ui components
│   ├── contexts/         # React contexts (Auth, Theme)
│   ├── data/             # Mock data and type definitions
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utility functions and API clients
│   ├── pages/            # Page components
│   └── main.tsx          # Application entry point
├── infrastructure/
│   └── terraform/        # Infrastructure as Code
│       ├── lambda/       # Lambda function code
│       │   ├── colleges-crud/
│       │   ├── meetups-crud/
│       │   ├── points-crud/
│       │   ├── user-roles-crud/
│       │   └── shared/   # Shared auth & permissions
│       ├── *.tf          # Terraform configuration files
│       └── scripts/      # Deployment and seed scripts
├── public/               # Static assets
└── package.json          # Dependencies and scripts
```

## 🔐 Authentication & Authorization

The platform uses a role-based permission system with three main roles:

### Roles
- **Admin**: Full access to all features and management capabilities
- **Volunteer**: Admin-level permissions for community management
- **Champ**: Limited access - can submit tasks for their college chapter

### Permission System
Permissions are defined in `infrastructure/terraform/lambda/shared/permissions.js` and enforced by the authorization middleware in `infrastructure/terraform/lambda/shared/auth.js`.

## 📦 Building for Production

```bash
npm run build
# or
bun run build
```

The production build will be created in the `dist/` directory.

## 🧪 Development

### Code Style
- Follow TypeScript best practices
- Use functional components with hooks
- Implement proper error handling
- Add loading states for async operations

### API Integration
All API calls are centralized in `src/lib/` directory:
- `api.ts` - Base API client with error handling
- `colleges.ts` - College Champs API
- `meetups.ts` - Meetups API
- `userProfile.ts` - User management API
- `points.ts` - Points system API

### Adding New Features
1. Create components in appropriate directory
2. Add API functions in `src/lib/`
3. Update Lambda functions if backend changes needed
4. Deploy infrastructure changes with Terraform
5. Test thoroughly before merging

## 🔧 Infrastructure Management

### Lambda Functions
Each Lambda function has its own directory under `infrastructure/terraform/lambda/`:
- Independent `package.json` for dependencies
- Shared authentication and permission modules
- Automatic deployment via Terraform

### Database Schema
DynamoDB tables:
- `awsug-users` - User profiles and authentication
- `awsug-colleges` - College chapters, tasks, and submissions
- `awsug-meetups` - Events and meetups
- `awsug-sprints` - Skill sprint data
- `awsug-points` - Points transactions

### Deployment
```bash
cd infrastructure/terraform
./deploy.sh  # Automated deployment script
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is proprietary and confidential.

## 👥 Team

AWS User Group Madurai

## 📧 Contact

For questions or support, reach out to the AWS User Group Madurai team.

---

Built with ❤️ by the AWS User Group Madurai community
