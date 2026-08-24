import { callApi } from './api';
import {
  Hackathon,
  HackathonPerson,
  HackathonResource,
  HackathonStatus,
  HackathonSubmission,
  HackathonTeam,
  HackathonTeamConfig,
  SubmissionField,
} from '@/data/mockData';

// ---------------------------------------------------------------------------
// Request / response payloads
// ---------------------------------------------------------------------------

export interface CreateHackathonData {
  title: string;
  theme?: string;
  description: string;
  richDescription?: string;
  tracks?: string[];
  rules?: string;
  prizes?: string;
  startDate: string;
  endDate: string;
  registrationDeadline?: string;
  submissionDeadline?: string;
  bannerImage?: string;
  sprintId?: string;
  teamConfig?: Partial<HackathonTeamConfig>;
  submissionFormConfig?: SubmissionField[];
}

export interface UpdateHackathonData extends Partial<CreateHackathonData> {
  status?: HackathonStatus;
  mentors?: HackathonPerson[];
}

export interface CreateTeamData {
  name: string;
  description?: string;
  projectName?: string;
  track?: string;
  lookingForMembers?: boolean;
  /** The creating user becomes the team lead. */
  userId: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
}

export interface UpdateTeamData {
  name?: string;
  description?: string;
  projectName?: string;
  track?: string;
  lookingForMembers?: boolean;
}

export interface SubmitHackathonWorkData {
  kind: 'team' | 'individual';
  teamId?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  projectName?: string;
  track?: string;
  customFields?: Record<string, unknown>;
  supportingDocuments?: string[];
}

export interface ReviewHackathonSubmissionData {
  status: 'approved' | 'rejected';
  points?: number;
  feedback?: string;
  reviewedBy: string;
  reviewerName?: string;
}

/** The default team config applied when an admin doesn't override it. */
export const DEFAULT_TEAM_CONFIG: HackathonTeamConfig = {
  minSize: 1,
  maxSize: 4,
  joinPolicy: 'request',
  allowIndividuals: true,
  allowMentorRequests: true,
};

/**
 * Note: team leads can ALWAYS send email invites, whatever the policy. The
 * policy only controls what people who haven't been invited are allowed to do.
 */
export const TEAM_JOIN_POLICY_LABELS: Record<HackathonTeamConfig['joinPolicy'], string> = {
  invite_only: 'Invites only — nobody can ask to join uninvited',
  request: 'Invites + requests — anyone can ask, the lead approves or rejects',
  open: 'Invites + open join — anyone can join instantly while there is room',
};

/** Short form used in member-facing copy. */
export const TEAM_JOIN_POLICY_SUMMARY: Record<HackathonTeamConfig['joinPolicy'], string> = {
  invite_only: 'Teams are invite-only. A team lead has to email you an invite.',
  request: 'Team leads can invite you by email, and you can also ask any team to let you in.',
  open: 'Team leads can invite you by email, and you can join any team that still has room.',
};

// ---------------------------------------------------------------------------
// Hackathons
// ---------------------------------------------------------------------------

interface HackathonsResponse { hackathons: Hackathon[] }
interface HackathonResponse { hackathon: Hackathon }
interface TeamsResponse { teams: HackathonTeam[] }
interface TeamResponse { team: HackathonTeam }
interface SubmissionsResponse { submissions: HackathonSubmission[] }
interface SubmissionResponse { submission: HackathonSubmission }

export async function getHackathons(params?: {
  status?: HackathonStatus;
  sprintId?: string;
}): Promise<Hackathon[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.sprintId) query.set('sprintId', params.sprintId);
  const qs = query.toString();

  const response = await callApi<HackathonsResponse>(`/hackathons${qs ? `?${qs}` : ''}`);
  return response.hackathons || [];
}

export async function getHackathon(id: string): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${id}`);
  return response.hackathon;
}

/** Hackathons linked to a sprint. Returns [] on failure so callers can render regardless. */
export async function getHackathonsBySprint(sprintId: string): Promise<Hackathon[]> {
  try {
    return await getHackathons({ sprintId });
  } catch (error) {
    console.error('Error fetching hackathons for sprint:', error);
    return [];
  }
}

export async function createHackathon(data: CreateHackathonData): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>('/hackathons', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.hackathon;
}

export async function updateHackathon(id: string, data: UpdateHackathonData): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.hackathon;
}

export async function deleteHackathon(id: string): Promise<{ message: string; id: string }> {
  return callApi(`/hackathons/${id}`, { method: 'DELETE' });
}

export async function registerForHackathon(
  id: string,
  user: { userId: string; userName?: string; userEmail?: string },
): Promise<{ hackathon: Hackathon; alreadyRegistered?: boolean }> {
  return callApi(`/hackathons/${id}/register`, {
    method: 'POST',
    body: JSON.stringify(user),
  });
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export async function addHackathonResource(
  hackathonId: string,
  resource: Omit<HackathonResource, 'id' | 'addedAt'>,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${hackathonId}/resources`, {
    method: 'POST',
    body: JSON.stringify(resource),
  });
  return response.hackathon;
}

export async function updateHackathonResource(
  hackathonId: string,
  resourceId: string,
  updates: Partial<Omit<HackathonResource, 'id' | 'addedAt'>>,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(
    `/hackathons/${hackathonId}/resources/${resourceId}`,
    { method: 'PUT', body: JSON.stringify(updates) },
  );
  return response.hackathon;
}

export async function deleteHackathonResource(
  hackathonId: string,
  resourceId: string,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(
    `/hackathons/${hackathonId}/resources/${resourceId}`,
    { method: 'DELETE' },
  );
  return response.hackathon;
}

// ---------------------------------------------------------------------------
// Mentors
// ---------------------------------------------------------------------------

/** Add a mentor to the hackathon-wide pool. */
export async function addHackathonMentor(
  hackathonId: string,
  mentor: HackathonPerson,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${hackathonId}/mentors`, {
    method: 'POST',
    body: JSON.stringify({ scope: 'pool', mentor }),
  });
  return response.hackathon;
}

export async function removeHackathonMentor(
  hackathonId: string,
  mentorUserId: string,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${hackathonId}/mentors`, {
    method: 'DELETE',
    body: JSON.stringify({ scope: 'pool', mentorUserId }),
  });
  return response.hackathon;
}

/** Assign a mentor to a solo participant who isn't on a team. */
export async function assignIndividualMentor(
  hackathonId: string,
  participantUserId: string,
  mentor: HackathonPerson,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${hackathonId}/mentors`, {
    method: 'POST',
    body: JSON.stringify({ scope: 'individual', participantUserId, mentor }),
  });
  return response.hackathon;
}

export async function removeIndividualMentor(
  hackathonId: string,
  participantUserId: string,
): Promise<Hackathon> {
  const response = await callApi<HackathonResponse>(`/hackathons/${hackathonId}/mentors`, {
    method: 'DELETE',
    body: JSON.stringify({ scope: 'individual', participantUserId }),
  });
  return response.hackathon;
}

export async function assignTeamMentor(
  hackathonId: string,
  teamId: string,
  mentor: HackathonPerson,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(
    `/hackathons/${hackathonId}/teams/${teamId}/mentors`,
    { method: 'POST', body: JSON.stringify({ mentor }) },
  );
  return response.team;
}

export async function removeTeamMentor(
  hackathonId: string,
  teamId: string,
  mentorUserId: string,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(
    `/hackathons/${hackathonId}/teams/${teamId}/mentors`,
    { method: 'DELETE', body: JSON.stringify({ mentorUserId }) },
  );
  return response.team;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function getHackathonTeams(hackathonId: string): Promise<HackathonTeam[]> {
  const response = await callApi<TeamsResponse>(`/hackathons/${hackathonId}/teams`);
  return response.teams || [];
}

export async function createTeam(
  hackathonId: string,
  data: CreateTeamData,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(`/hackathons/${hackathonId}/teams`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.team;
}

export async function updateTeam(
  hackathonId: string,
  teamId: string,
  data: UpdateTeamData,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(`/hackathons/${hackathonId}/teams/${teamId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return response.team;
}

export async function deleteTeam(
  hackathonId: string,
  teamId: string,
): Promise<{ message: string; id: string }> {
  return callApi(`/hackathons/${hackathonId}/teams/${teamId}`, { method: 'DELETE' });
}

/**
 * Outcome of a join attempt. Under the `request` policy the API accepts the call
 * but only files a request for the lead to approve, so `joined` distinguishes
 * "you're in" from "we asked on your behalf" — both are HTTP 200.
 */
export interface JoinOutcome {
  team: HackathonTeam;
  joined: boolean;
  status?: 'requested';
  message: string;
}

/** Join with a share code, or file a request if the policy requires approval. */
export async function joinTeamByCode(
  hackathonId: string,
  data: {
    joinCode: string;
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
  },
): Promise<JoinOutcome> {
  return callApi<JoinOutcome>(`/hackathons/${hackathonId}/teams/join`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function leaveTeam(
  hackathonId: string,
  teamId: string,
  userId: string,
): Promise<{ message: string; team?: HackathonTeam }> {
  return callApi(`/hackathons/${hackathonId}/teams/${teamId}/members`, {
    method: 'DELETE',
    body: JSON.stringify({ userId, action: 'leave' }),
  });
}

/** Lead-only: remove another member from the team. */
export async function removeTeamMember(
  hackathonId: string,
  teamId: string,
  userId: string,
  actingUserId: string,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(
    `/hackathons/${hackathonId}/teams/${teamId}/members`,
    { method: 'DELETE', body: JSON.stringify({ userId, actingUserId, action: 'remove' }) },
  );
  return response.team;
}

// ---------------------------------------------------------------------------
// Invites (email, sent via SES)
// ---------------------------------------------------------------------------

export interface InviteResult {
  team: HackathonTeam;
  invited: string[];
  skipped: { email: string; reason: string }[];
}

/** Lead-only: email one or more people an invite to join the team. */
export async function inviteToTeam(
  hackathonId: string,
  teamId: string,
  data: { emails: string[]; invitedBy: string; invitedByName: string; message?: string },
): Promise<InviteResult> {
  return callApi(`/hackathons/${hackathonId}/teams/${teamId}/invites`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function revokeInvite(
  hackathonId: string,
  teamId: string,
  inviteId: string,
  actingUserId: string,
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(
    `/hackathons/${hackathonId}/teams/${teamId}/invites`,
    { method: 'DELETE', body: JSON.stringify({ inviteId, actingUserId }) },
  );
  return response.team;
}

/** Accept or decline an emailed invite. Token comes from the ?invite= link. */
export async function respondToInvite(
  hackathonId: string,
  teamId: string,
  data: {
    token: string;
    action: 'accept' | 'decline';
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
  },
): Promise<{ team: HackathonTeam; message: string }> {
  return callApi(`/hackathons/${hackathonId}/teams/${teamId}/invites/respond`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ---------------------------------------------------------------------------
// Join requests (lead approves or rejects)
// ---------------------------------------------------------------------------

/**
 * Ask to join a team. Under the `open` policy this joins immediately instead,
 * which `joined` on the response reports.
 */
export async function requestToJoinTeam(
  hackathonId: string,
  teamId: string,
  data: {
    userId: string;
    userName: string;
    userEmail?: string;
    userAvatar?: string;
    message?: string;
  },
): Promise<JoinOutcome> {
  return callApi<JoinOutcome>(
    `/hackathons/${hackathonId}/teams/${teamId}/requests`,
    { method: 'POST', body: JSON.stringify(data) },
  );
}

/** Lead-only: approve or reject a pending join request. */
export async function respondToJoinRequest(
  hackathonId: string,
  teamId: string,
  requestId: string,
  data: { action: 'approve' | 'reject'; actingUserId: string; actingUserName?: string },
): Promise<HackathonTeam> {
  const response = await callApi<TeamResponse>(
    `/hackathons/${hackathonId}/teams/${teamId}/requests/${requestId}`,
    { method: 'POST', body: JSON.stringify(data) },
  );
  return response.team;
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

export async function getHackathonSubmissions(
  hackathonId: string,
  params?: { status?: 'pending' | 'approved' | 'rejected'; teamId?: string },
): Promise<HackathonSubmission[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.teamId) query.set('teamId', params.teamId);
  const qs = query.toString();

  const response = await callApi<SubmissionsResponse>(
    `/hackathons/${hackathonId}/submissions${qs ? `?${qs}` : ''}`,
  );
  return response.submissions || [];
}

export async function submitHackathonWork(
  hackathonId: string,
  data: SubmitHackathonWorkData,
): Promise<HackathonSubmission> {
  const response = await callApi<SubmissionResponse>(`/hackathons/${hackathonId}/submissions`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return response.submission;
}

export interface ReviewOutcome {
  submission: HackathonSubmission;
  /** Points actually credited to profiles by this call. */
  pointsAwarded: number;
  /** User ids that were credited. */
  recipients: string[];
}

export async function reviewHackathonSubmission(
  hackathonId: string,
  submissionId: string,
  data: ReviewHackathonSubmissionData,
): Promise<ReviewOutcome> {
  return callApi<ReviewOutcome>(
    `/hackathons/${hackathonId}/submissions/${submissionId}`,
    { method: 'PUT', body: JSON.stringify(data) },
  );
}

export async function deleteHackathonSubmission(
  hackathonId: string,
  submissionId: string,
): Promise<{ message: string; id: string }> {
  return callApi(`/hackathons/${hackathonId}/submissions/${submissionId}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Client-side helpers
// ---------------------------------------------------------------------------

/** The team the given user belongs to in this hackathon, if any. */
export function findUserTeam(teams: HackathonTeam[], userId?: string): HackathonTeam | undefined {
  if (!userId) return undefined;
  return teams.find(team => team.members.some(m => m.userId === userId));
}

export function isTeamLead(team: HackathonTeam | undefined, userId?: string): boolean {
  if (!team || !userId) return false;
  return team.leadUserId === userId;
}

export function isTeamFull(team: HackathonTeam, config: HackathonTeamConfig): boolean {
  return team.members.length >= config.maxSize;
}

/**
 * Deadlines are date-only (YYYY-MM-DD) with no timezone. Building a Date from
 * `${deadline}T23:59:59` parses as local time, which shifts the boundary by the
 * viewer's UTC offset and can disagree with the server. Comparing ISO date
 * strings is exact, timezone-stable, and matches the API's own check.
 */
const todayStr = (): string => new Date().toISOString().slice(0, 10);

const todayIsOnOrBefore = (dateStr: string): boolean => todayStr() <= dateStr;

/** Whether submissions are still open, based on submissionDeadline then endDate. */
export function isSubmissionOpen(hackathon: Hackathon): boolean {
  const deadline = hackathon.submissionDeadline || hackathon.endDate;
  if (!deadline) return hackathon.status === 'active';
  return todayIsOnOrBefore(deadline);
}

/** Whether team formation and registration are still open. */
export function isRegistrationOpen(hackathon: Hackathon): boolean {
  if (hackathon.status === 'completed' || hackathon.status === 'judging') return false;
  const deadline = hackathon.registrationDeadline || hackathon.startDate;
  if (!deadline) return true;
  return todayIsOnOrBefore(deadline);
}
