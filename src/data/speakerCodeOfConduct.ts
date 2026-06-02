// Single source of truth for the AWS User Group Madurai Speaker Code of Conduct.
// Rendered on the public /speaker-code-of-conduct page and inside the speaker
// invitation acceptance flow so a speaker always agrees to the exact same text.

export interface CodeOfConductSection {
  heading: string;
  intro?: string;
  items?: { label?: string; points: string[] }[];
}

export const SPEAKER_COC_VERSION = '2026-06-01';

export const speakerCodeOfConductIntro = [
  'AWS User Group Madurai (AWSUGMDU) organises meetups to foster learning and knowledge-sharing about AWS cloud technologies. These events bring together professionals, developers, and enthusiasts to engage in insightful discussions and technical sessions.',
  'To maintain the integrity of these events and ensure that the content aligns with the group\u2019s goals, all speakers\u2014whether representing an organisation, a third party, or themselves\u2014must adhere to the following code of conduct. Any deviations must be explicitly agreed upon in writing with AWSUGMDU.',
];

export const speakerCodeOfConductAbout = {
  heading: 'About AWS User Group Madurai',
  paragraphs: [
    'AWSUGMDU is a community-driven group dedicated to promoting the learning and sharing of AWS cloud-related knowledge. The group organises various events, meetups, and workshops that focus on AWS services, best practices, and new technologies. This platform helps individuals and organisations in Madurai connect, learn, and collaborate on cloud solutions. As an open forum, it provides valuable networking opportunities and encourages participation from all skill levels\u2014whether beginner or expert.',
    'The group\u2019s primary goal is to foster a vibrant ecosystem of AWS professionals and enthusiasts in Madurai by organising insightful sessions and technical discussions. AWSUGMDU meetups are free of charge, open to all, and serve as an important educational resource for the community.',
  ],
};

export const speakerCodeOfConductSections: CodeOfConductSection[] = [
  {
    heading: 'Core Principles',
    items: [
      {
        label: 'Focus on AWS',
        points: [
          'Talks must primarily revolve around AWS services, best practices, innovations, or technical implementations.',
          'While speakers may discuss how their product or service enhances AWS usage, the session must not become a promotional platform.',
          'Examples and demonstrations should prioritise AWS-centric workflows or integrations.',
        ],
      },
      {
        label: 'Value-Driven Content',
        points: [
          'The session should aim to educate, inspire, and provide actionable insights to attendees.',
          'Speakers are encouraged to showcase solutions, share experiences, or highlight use cases that add genuine value to the AWS community.',
        ],
      },
    ],
  },
  {
    heading: 'Restrictions',
    items: [
      {
        label: 'No Direct Marketing',
        points: [
          'Presentations must not include overt sales pitches, product advertisements, or recruitment drives.',
          'Company branding must be limited to introductory slides and brief mentions, ensuring the focus remains on technical content.',
        ],
      },
      {
        label: 'Prohibited Practices',
        points: [
          'Avoid dedicating significant portions of the talk to the promotion of third-party products, services, or company.',
          'Do not solicit business, leads, or partnerships during the presentation.',
        ],
      },
      {
        label: 'No Unapproved Material',
        points: ['All presentation materials must be reviewed and approved by AWSUGMDU in advance.'],
      },
    ],
  },
  {
    heading: 'Presentation Guidelines',
    items: [
      {
        label: 'Content Format',
        points: [
          'Use the official AWSUGMDU presentation template unless prior permission is obtained to use an alternate format.',
          'Slides should be visually clear, free of excessive branding, and aligned with the session\u2019s technical objectives.',
        ],
      },
      {
        label: 'Technical Accuracy',
        points: [
          'Ensure that all technical information is accurate, up-to-date, and sourced appropriately.',
          'Ensure no misinformation is spread about AWS services or competitors.',
        ],
      },
      {
        label: 'Inclusivity and Respect',
        points: [
          'Content should be accessible to a diverse audience, covering various skill levels from beginners to experts.',
          'Ensure all examples and language are inclusive and respectful.',
        ],
      },
    ],
  },
  {
    heading: 'Session Expectations',
    items: [
      {
        label: 'Duration',
        points: [
          'Talks should adhere to the allocated time slot, typically 45-50 minutes, including time for Q&A.',
          'Speakers must coordinate with AWSUGMDU organisers to finalise the agenda.',
        ],
      },
      {
        label: 'Engagement',
        points: [
          'Encourage audience interaction through Q&A, live demos, or hands-on activities.',
          'Avoid making the session overly technical or inaccessible to general audiences.',
        ],
      },
      {
        label: 'Diversity in Speakers',
        points: [
          'Co-presenting with other experts or including case studies from varied industries is encouraged to bring fresh perspectives.',
        ],
      },
    ],
  },
  {
    heading: 'General Guidelines',
    items: [
      {
        label: 'Approval Process',
        points: [
          'Speakers must submit their topics, outlines, and slides to AWSUGMDU at least 72 hours prior to the event for review and approval.',
          'Any proposed changes to the approved material must be communicated in advance.',
        ],
      },
      {
        label: 'Written Consent for Exceptions',
        points: [
          'Any deviation from this code of conduct must be agreed upon in writing with AWSUGMDU.',
          'This ensures clarity and maintains the event\u2019s focus on community learning.',
        ],
      },
      {
        label: 'Adherence to Community Guidelines',
        points: [
          'Speakers must respect AWSUGMDU\u2019s community standards, including the attendee code of conduct.',
          'Avoid disparaging comments, discriminatory language, or offensive material.',
        ],
      },
    ],
  },
];

export const speakerCodeOfConductConclusion =
  'By adhering to this policy, speakers contribute to the core mission of AWS User Group Madurai\u2014building a vibrant and knowledgeable AWS community. AWSUGMDU is committed to organising high-quality meetups, and we appreciate speakers who align with these values. For any clarifications, please reach out to us directly. We look forward to your valuable contributions to the AWS community.';
