#!/usr/bin/env node

/**
 * Script to seed the Colleges DynamoDB table with initial data
 * Usage: node seed-colleges.js [table-name]
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.argv[2] || process.env.COLLEGES_TABLE_NAME || 'awsug-colleges';

const mockColleges = [
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
    champsLeadId: null,
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
    champsLeadId: null,
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
    champsLeadId: null,
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
    champsLeadId: null,
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
    champsLeadId: null,
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
    champsLeadId: null,
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
];

async function seedColleges() {
  console.log(`Seeding colleges to table: ${TABLE_NAME}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const college of mockColleges) {
    try {
      // Remove null champsLeadId to avoid GSI issues
      const collegeData = { ...college };
      if (collegeData.champsLeadId === null) {
        delete collegeData.champsLeadId;
      }
      
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          ...collegeData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }));
      console.log(`✓ Seeded college: ${college.name}`);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to seed college ${college.name}:`, error.message);
      errorCount++;
    }
  }
  
  console.log(`\nSeeding complete!`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

seedColleges().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
