import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import {
  Trophy, Users, Calendar, Clock, ChevronLeft, ChevronDown, Rocket, Send,
  BookOpen, ExternalLink, Copy, Crown, Mail, UserPlus, LogOut, Loader2,
  CheckCircle, XCircle, Lightbulb, Gift, ScrollText, Link2, Info, Search, User,
} from 'lucide-react';

import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

import {
  Hackathon, HackathonStatus, HackathonSubmission, HackathonTeam, Meetup,
} from '@/data/mockData';
import { getMeetupsByHackathon } from '@/lib/meetups';
import {
  getHackathons, getHackathon, getHackathonTeams, getHackathonSubmissions,
  registerForHackathon, createTeam, updateTeam, deleteTeam, joinTeamByCode,
  leaveTeam, removeTeamMember, inviteToTeam, revokeInvite, respondToInvite,
  requestToJoinTeam, respondToJoinRequest, submitHackathonWork,
  findUserTeam, isTeamLead, isSubmissionOpen, isRegistrationOpen,
  TEAM_JOIN_POLICY_SUMMARY,
} from '@/lib/hackathons';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { useAuth } from '@/contexts/AuthContext';
import {
  DynamicSubmissionFields, validateSubmissionFields,
} from '@/components/shared/DynamicSubmissionFields';

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const statusStyles: Record<HackathonStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  upcoming: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  registration: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  judging: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-muted text-muted-foreground border-border',
};

const statusLabels: Record<HackathonStatus, string> = {
  draft: 'Draft',
  upcoming: 'Upcoming',
  registration: 'Registration open',
  active: 'In progress',
  judging: 'Judging',
  completed: 'Completed',
};

const fmt = (value?: string) => {
  if (!value) return '—';
  try { return format(parseISO(value), 'MMM d, yyyy'); } catch { return value; }
};

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: {
  icon: typeof Trophy; title: string; body: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-12 text-center space-y-3">
        <Icon className="h-12 w-12 mx-auto text-muted-foreground" />
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function HackathonListView() {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getHackathons()
      .then(list => setHackathons(list.filter(h => h.status !== 'draft')))
      .catch(err => {
        console.error('Failed to load hackathons:', err);
        toast.error('Could not load hackathons');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Trophy className="h-7 w-7 text-primary" />
            Hackathons
          </h1>
          <p className="text-muted-foreground">
            Form a team, get a mentor, and ship something on AWS.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Loading hackathons…
          </div>
        ) : hackathons.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No hackathons announced yet"
            body="Keep an eye on this space — the next one will show up here."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {hackathons.map(hackathon => (
              <Link key={hackathon.id} to={`/hackathons/${hackathon.id}`} className="block group">
                <Card className="glass-card h-full transition-all group-hover:border-primary/40 group-hover:shadow-lg">
                  {hackathon.bannerImage && (
                    <div className="h-36 w-full overflow-hidden rounded-t-lg">
                      <img
                        src={hackathon.bannerImage}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">{hackathon.title}</CardTitle>
                      <Badge variant="outline" className={`shrink-0 text-[10px] ${statusStyles[hackathon.status]}`}>
                        {statusLabels[hackathon.status]}
                      </Badge>
                    </div>
                    {hackathon.theme && (
                      <CardDescription className="text-primary/80">{hackathon.theme}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{hackathon.description}</p>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{fmt(hackathon.startDate)} – {fmt(hackathon.endDate)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" />{hackathon.participants || 0} registered
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </motion.div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Team dialogs
// ---------------------------------------------------------------------------

function CreateTeamDialog({ hackathon, onCreated }: { hackathon: Hackathon; onCreated: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', projectName: '', track: '' });

  const tracks = hackathon.tracks || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error('Sign in to create a team'); return; }
    if (!form.name.trim()) { toast.error('Give your team a name'); return; }

    setSaving(true);
    try {
      await createTeam(hackathon.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        projectName: form.projectName.trim() || undefined,
        track: form.track || undefined,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userAvatar: user.avatar,
      });
      toast.success('Team created — you are the lead');
      setOpen(false);
      setForm({ name: '', description: '', projectName: '', track: '' });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><UserPlus className="h-4 w-4" />Create a team</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a team</DialogTitle>
          <DialogDescription>
            You'll be the team lead, so you can invite people by email, approve join
            requests, and submit the final project.
            {hackathon.teamConfig?.allowIndividuals
              && " You don't have to create a team at all — solo entries are allowed."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team name *</Label>
            <Input
              id="team-name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Cloud Llamas"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-project">Project name</Label>
            <Input
              id="team-project"
              value={form.projectName}
              onChange={e => setForm({ ...form, projectName: e.target.value })}
              placeholder="Can be decided later"
            />
          </div>
          {tracks.length > 0 && (
            <div className="space-y-2">
              <Label>Track</Label>
              <Select value={form.track} onValueChange={v => setForm({ ...form, track: v })}>
                <SelectTrigger><SelectValue placeholder="Pick a track (optional)" /></SelectTrigger>
                <SelectContent>
                  {tracks.map(track => <SelectItem key={track} value={track}>{track}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="team-desc">What are you building?</Label>
            <Textarea
              id="team-desc"
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Helps others decide whether to ask to join"
            />
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : 'Create team'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function JoinByCodeDialog({ hackathon, onJoined }: { hackathon: Hackathon; onJoined: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error('Sign in to join a team'); return; }

    setSaving(true);
    try {
      const result = await joinTeamByCode(hackathon.id, {
        joinCode: code.trim().toUpperCase(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userAvatar: user.avatar,
      });

      // Under the 'request' policy a valid code files a request rather than
      // granting entry, and both outcomes return 200 — so report what the API
      // actually did instead of assuming a join.
      toast.success(result.message || (result.joined
        ? `Joined ${result.team.name}`
        : 'Request sent to the team lead'));

      setOpen(false);
      setCode('');
      onJoined();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not join that team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Search className="h-4 w-4" />Join with a code</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a team</DialogTitle>
          <DialogDescription>Enter the 6-character code the team lead shared with you.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="text-center text-lg font-mono tracking-widest"
            aria-label="Team join code"
          />
          <Button type="submit" className="w-full" disabled={saving || code.length < 6}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Joining…</> : 'Join team'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InvitePanel({ hackathon, team, onChanged }: {
  hackathon: Hackathon; team: HackathonTeam; onChanged: () => void;
}) {
  const { user } = useAuth();
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const pending = (team.invites || []).filter(i => i.status === 'pending');

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const list = emails.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('Add at least one email address'); return; }

    setSending(true);
    try {
      const result = await inviteToTeam(hackathon.id, team.id, {
        emails: list,
        invitedBy: user.id,
        invitedByName: user.name,
        message: message.trim() || undefined,
      });

      if (result.invited.length > 0) {
        toast.success(`Invite sent to ${result.invited.join(', ')}`);
      }
      (result.skipped || []).forEach(s => toast.error(`${s.email}: ${s.reason}`));

      setEmails('');
      setMessage('');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!user) return;
    try {
      await revokeInvite(hackathon.id, team.id, inviteId, user.id);
      toast.success('Invite revoked');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke invite');
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSend} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="invite-emails">Invite by email</Label>
          <Input
            id="invite-emails"
            value={emails}
            onChange={e => setEmails(e.target.value)}
            placeholder="alex@example.com, sam@example.com"
          />
          <p className="text-xs text-muted-foreground">
            Separate multiple addresses with commas. They'll get an email with a link to accept.
          </p>
        </div>
        <Textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={2}
          placeholder="Add a short note to the invite (optional)"
        />
        <Button type="submit" size="sm" disabled={sending} className="gap-2">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Send invites
        </Button>
      </form>

      {pending.length > 0 && (
        <div className="space-y-2 pt-3 border-t">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Waiting on a reply
          </Label>
          {pending.map(invite => (
            <div key={invite.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2">
              <span className="text-sm truncate">{invite.email}</span>
              <Button variant="ghost" size="sm" onClick={() => handleRevoke(invite.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function JoinRequestsPanel({ hackathon, team, onChanged }: {
  hackathon: Hackathon; team: HackathonTeam; onChanged: () => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const pending = (team.joinRequests || []).filter(r => r.status === 'pending');
  if (pending.length === 0) return null;

  const respond = async (requestId: string, action: 'approve' | 'reject') => {
    if (!user) return;
    setBusy(requestId);
    try {
      await respondToJoinRequest(hackathon.id, team.id, requestId, {
        action,
        actingUserId: user.id,
        actingUserName: user.name,
      });
      toast.success(action === 'approve' ? 'Added to the team' : 'Request rejected');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to respond');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Requests to join ({pending.length})
      </Label>
      {pending.map(request => (
        <div key={request.id} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7">
              <AvatarImage src={request.userAvatar} />
              <AvatarFallback className="text-[10px]">{request.userName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{request.userName}</p>
              {request.userEmail && (
                <p className="text-xs text-muted-foreground truncate">{request.userEmail}</p>
              )}
            </div>
          </div>
          {request.message && (
            <p className="text-sm text-muted-foreground bg-muted/40 rounded-md p-2">{request.message}</p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={busy === request.id}
              onClick={() => respond(request.id, 'approve')}
            >
              <CheckCircle className="h-3.5 w-3.5" />Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={busy === request.id}
              onClick={() => respond(request.id, 'reject')}
            >
              <XCircle className="h-3.5 w-3.5" />Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MyTeamPanel({ hackathon, team, onChanged }: {
  hackathon: Hackathon; team: HackathonTeam; onChanged: () => void;
}) {
  const { user } = useAuth();
  const lead = isTeamLead(team, user?.id);
  const [savingProject, setSavingProject] = useState(false);
  const [projectName, setProjectName] = useState(team.projectName || '');

  const handleCopyCode = () => {
    navigator.clipboard.writeText(team.joinCode)
      .then(() => toast.success('Join code copied'))
      .catch(() => toast.error('Could not copy the code'));
  };

  const handleLeave = async () => {
    if (!user) return;
    const isOnlyMember = team.members.length === 1;
    const confirmText = lead && isOnlyMember
      ? `Leave and disband "${team.name}"?`
      : lead
        ? `Leave "${team.name}"? The next member becomes lead.`
        : `Leave "${team.name}"?`;
    if (!confirm(confirmText)) return;

    try {
      const result = await leaveTeam(hackathon.id, team.id, user.id);
      toast.success(result.message || 'You left the team');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to leave the team');
    }
  };

  const handleRemove = async (memberUserId: string, name: string) => {
    if (!user) return;
    if (!confirm(`Remove ${name} from the team?`)) return;
    try {
      await removeTeamMember(hackathon.id, team.id, memberUserId, user.id);
      toast.success(`${name} removed`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleSaveProject = async () => {
    setSavingProject(true);
    try {
      await updateTeam(hackathon.id, team.id, { projectName: projectName.trim() || undefined });
      toast.success('Project name saved');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingProject(false);
    }
  };

  const handleDisband = async () => {
    if (!confirm(`Disband "${team.name}"? This removes the team and its submission.`)) return;
    try {
      await deleteTeam(hackathon.id, team.id);
      toast.success('Team disbanded');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to disband the team');
    }
  };

  const maxSize = hackathon.teamConfig?.maxSize ?? team.members.length;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {team.name}
              {lead && <Badge variant="outline" className="gap-1 text-[10px]"><Crown className="h-3 w-3" />Lead</Badge>}
            </CardTitle>
            <CardDescription>
              {team.members.length} of {maxSize} members
              {team.track ? ` · ${team.track}` : ''}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2 font-mono" onClick={handleCopyCode}>
            <Copy className="h-3.5 w-3.5" />{team.joinCode}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {team.description && (
          <p className="text-sm text-muted-foreground">{team.description}</p>
        )}

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Members</Label>
          <div className="space-y-2">
            {team.members.map(member => (
              <div key={member.userId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback className="text-[10px]">{member.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{member.name}</span>
                  {member.role === 'lead' && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Lead</Badge>
                  )}
                </div>
                {lead && member.userId !== user?.id && (
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(member.userId, member.name)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {(team.mentors || []).length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Mentors</Label>
            <div className="space-y-2">
              {team.mentors.map(mentor => (
                <div key={mentor.userId || mentor.name} className="flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={mentor.photo} />
                    <AvatarFallback className="text-[10px]">{mentor.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{mentor.name}</p>
                    {(mentor.designation || mentor.company) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[mentor.designation, mentor.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lead && (
          <>
            <div className="space-y-2 pt-3 border-t">
              <Label htmlFor="my-project">Project name</Label>
              <div className="flex gap-2">
                <Input
                  id="my-project"
                  value={projectName}
                  onChange={e => setProjectName(e.target.value)}
                  placeholder="What are you building?"
                />
                <Button variant="outline" onClick={handleSaveProject} disabled={savingProject}>
                  {savingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <div className="pt-3 border-t">
              <JoinRequestsPanel hackathon={hackathon} team={team} onChanged={onChanged} />
            </div>

            <div className="pt-3 border-t">
              <InvitePanel hackathon={hackathon} team={team} onChanged={onChanged} />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-3 border-t">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleLeave}>
            <LogOut className="h-3.5 w-3.5" />Leave team
          </Button>
          {lead && (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleDisband}>
              Disband team
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BrowseTeams({ hackathon, teams, myTeam, onChanged }: {
  hackathon: Hackathon;
  teams: HackathonTeam[];
  myTeam?: HackathonTeam;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [requesting, setRequesting] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const policy = hackathon.teamConfig?.joinPolicy ?? 'request';
  const maxSize = hackathon.teamConfig?.maxSize ?? 4;

  const handleRequest = async (team: HackathonTeam) => {
    if (!user) { toast.error('Sign in first'); return; }
    setRequesting(team.id);
    try {
      const result = await requestToJoinTeam(hackathon.id, team.id, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userAvatar: user.avatar,
        message: note.trim() || undefined,
      });
      // Reported by the API rather than inferred from the local policy copy.
      toast.success(result.message || (result.joined
        ? `Joined ${team.name}`
        : 'Request sent to the team lead'));
      setNote('');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setRequesting(null);
    }
  };

  const others = teams.filter(t => t.id !== myTeam?.id);

  if (others.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
        No other teams yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {others.map(team => {
        const full = team.members.length >= maxSize;
        const alreadyRequested = (team.joinRequests || [])
          .some(r => r.userId === user?.id && r.status === 'pending');

        return (
          <Card key={team.id} className="glass-card">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{team.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {team.members.length}/{maxSize}
                    </Badge>
                    {team.track && <Badge variant="secondary" className="text-[10px]">{team.track}</Badge>}
                    {full && <Badge variant="outline" className="text-[10px] text-muted-foreground">Full</Badge>}
                  </div>
                  {team.projectName && (
                    <p className="text-sm text-muted-foreground">Project: {team.projectName}</p>
                  )}
                  {team.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{team.description}</p>
                  )}
                </div>

                {!myTeam && !full && policy !== 'invite_only' && (
                  <Button
                    size="sm"
                    variant={alreadyRequested ? 'outline' : 'default'}
                    disabled={requesting === team.id || alreadyRequested}
                    onClick={() => handleRequest(team)}
                  >
                    {requesting === team.id ? <Loader2 className="h-4 w-4 animate-spin" />
                      : alreadyRequested ? 'Requested'
                        : policy === 'open' ? 'Join' : 'Ask to join'}
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {team.members.map(member => (
                  <Avatar key={member.userId} className="h-6 w-6" title={member.name}>
                    <AvatarImage src={member.avatar} />
                    <AvatarFallback className="text-[9px]">{member.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!myTeam && policy === 'request' && (
        <div className="space-y-2 pt-2">
          <Label htmlFor="join-note" className="text-xs text-muted-foreground">
            Optional note sent with your next join request
          </Label>
          <Textarea
            id="join-note"
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Tell the lead what you'd bring to the team"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function ResourcesTab({ hackathon, isRegistered }: { hackathon: Hackathon; isRegistered: boolean }) {
  const visible = (hackathon.resources || []).filter(r => !r.registeredOnly || isRegistered);
  const hiddenCount = (hackathon.resources || []).length - visible.length;

  const grouped = useMemo(() => {
    const map = new Map<string, typeof visible>();
    visible.forEach(resource => {
      const key = resource.category?.trim() || 'General';
      map.set(key, [...(map.get(key) || []), resource]);
    });
    return [...map.entries()];
  }, [visible]);

  if (visible.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title={hiddenCount > 0 ? 'Resources are for registered participants' : 'No resources yet'}
        body={hiddenCount > 0
          ? 'Register for this hackathon to unlock the starter guides and datasets.'
          : 'Starter guides, datasets and workshop recordings will show up here.'}
      />
    );
  }

  return (
    <div className="space-y-6">
      {hiddenCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            {hiddenCount} more resource{hiddenCount === 1 ? '' : 's'} unlock when you register.
          </span>
        </div>
      )}

      {grouped.map(([category, items]) => (
        <div key={category} className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {category}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map(resource => (
              <a
                key={resource.id}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border p-4 transition-all hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{resource.title}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">{resource.type}</Badge>
                    </div>
                    {resource.description && (
                      <p className="text-xs text-muted-foreground">{resource.description}</p>
                    )}
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

function SubmitTab({ hackathon, myTeam, mySubmission, onSubmitted }: {
  hackathon: Hackathon;
  myTeam?: HackathonTeam;
  mySubmission?: HackathonSubmission;
  onSubmitted: () => void;
}) {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, unknown>>(mySubmission?.customFields || {});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [submitting, setSubmitting] = useState(false);

  const fields = hackathon.submissionFormConfig || [];
  const config = hackathon.teamConfig;
  const lead = isTeamLead(myTeam, user?.id);
  const open = isSubmissionOpen(hackathon);

  const kind: 'team' | 'individual' = myTeam ? 'team' : 'individual';

  if (fields.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="Submissions aren't open yet"
        body="The organisers haven't published the submission form for this hackathon."
      />
    );
  }

  if (!open) {
    return (
      <EmptyState
        icon={Clock}
        title="Submissions are closed"
        body={`The deadline was ${fmt(hackathon.submissionDeadline || hackathon.endDate)}.`}
      />
    );
  }

  if (!myTeam && !config?.allowIndividuals) {
    return (
      <EmptyState
        icon={Users}
        title="You need a team to submit"
        body="This hackathon only accepts team entries. Create a team or join one first."
      />
    );
  }

  if (myTeam && !lead) {
    return (
      <EmptyState
        icon={Crown}
        title="Only the team lead submits"
        body={`Ask your team lead to submit on behalf of ${myTeam.name}.`}
      />
    );
  }

  // Checked up front: the API rejects undersized teams, and finding that out
  // after filling in the form and uploading files is a waste of effort.
  const minSize = config?.minSize ?? 1;
  if (myTeam && myTeam.members.length < minSize) {
    return (
      <EmptyState
        icon={Users}
        title={`Your team needs at least ${minSize} member${minSize === 1 ? '' : 's'}`}
        body={`${myTeam.name} currently has ${myTeam.members.length}. Invite more people from the Teams tab before submitting.`}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error('Sign in to submit'); return; }

    const error = validateSubmissionFields(fields, values, files);
    if (error) { toast.error(error); return; }

    setSubmitting(true);
    try {
      // Upload any attached files first, then send their URLs with the payload.
      const pending = Object.values(files).flat();
      let uploaded: string[] = [];
      if (pending.length > 0) {
        uploaded = await Promise.all(pending.map(file => uploadFileToS3(file, 'meetup-posters')));
      }

      await submitHackathonWork(hackathon.id, {
        kind,
        teamId: myTeam?.id,
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        projectName: myTeam?.projectName,
        track: myTeam?.track,
        customFields: values,
        supportingDocuments: [...(mySubmission?.supportingDocuments || []), ...uploaded],
      });

      toast.success(mySubmission ? 'Submission updated' : 'Submitted — awaiting review');
      setFiles({});
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          {mySubmission ? 'Update your submission' : 'Submit your project'}
        </CardTitle>
        <CardDescription>
          {kind === 'team'
            ? `Submitting for ${myTeam?.name}. Closes ${fmt(hackathon.submissionDeadline || hackathon.endDate)}.`
            : `Submitting as an individual. Closes ${fmt(hackathon.submissionDeadline || hackathon.endDate)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {mySubmission && (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
            <span className="text-muted-foreground">Current status:</span>
            <Badge
              className={`capitalize ${
                mySubmission.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                  : mySubmission.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
              }`}
            >
              {mySubmission.status}
            </Badge>
            {mySubmission.feedback && (
              <span className="text-muted-foreground">· {mySubmission.feedback}</span>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <DynamicSubmissionFields
            fields={fields}
            values={values}
            onChange={setValues}
            files={files}
            onFilesChange={(fieldId, next) => setFiles(prev => ({ ...prev, [fieldId]: next }))}
            disabled={submitting}
            idPrefix={`hk-${hackathon.id}`}
          />

          <Button type="submit" className="w-full gap-2" disabled={submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
              : <><Send className="h-4 w-4" />{mySubmission ? 'Update submission' : 'Submit for review'}</>}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function HackathonDetailView({ hackathonId }: { hackathonId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [teams, setTeams] = useState<HackathonTeam[]>([]);
  const [submissions, setSubmissions] = useState<HackathonSubmission[]>([]);
  const [linkedEvents, setLinkedEvents] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [respondingInvite, setRespondingInvite] = useState(false);

  const inviteToken = searchParams.get('invite');
  const inviteTeamId = searchParams.get('team');

  const load = useCallback(async () => {
    try {
      const [fetchedHackathon, fetchedTeams, fetchedSubmissions, fetchedEvents] = await Promise.all([
        getHackathon(hackathonId),
        getHackathonTeams(hackathonId).catch(() => [] as HackathonTeam[]),
        getHackathonSubmissions(hackathonId).catch(() => [] as HackathonSubmission[]),
        getMeetupsByHackathon(hackathonId).catch(() => [] as Meetup[]),
      ]);
      setHackathon(fetchedHackathon);
      setTeams(fetchedTeams);
      setSubmissions(fetchedSubmissions);
      setLinkedEvents(fetchedEvents);
    } catch (err) {
      console.error('Failed to load hackathon:', err);
      toast.error('Could not load that hackathon');
    } finally {
      setLoading(false);
    }
  }, [hackathonId]);

  useEffect(() => { load(); }, [load]);

  const myTeam = findUserTeam(teams, user?.id);
  const isRegistered = !!user && (hackathon?.registeredUsers || []).includes(user.id);

  const mySubmission = useMemo(() => {
    if (!user) return undefined;
    return submissions.find(s => (myTeam ? s.teamId === myTeam.id : s.kind === 'individual' && s.userId === user.id));
  }, [submissions, myTeam, user]);

  const inviteTeam = inviteTeamId ? teams.find(t => t.id === inviteTeamId) : undefined;

  const clearInviteParams = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('invite');
    next.delete('team');
    setSearchParams(next, { replace: true });
  };

  const handleInvite = async (action: 'accept' | 'decline') => {
    if (!inviteToken || !inviteTeamId) return;

    // Invites deliberately go to people who may not have an account yet, so this
    // has to say something rather than silently no-op. The invite link survives
    // the round trip, so signing in returns them here with the params intact.
    if (!user) {
      toast.error('Sign in or create an account with the invited email address to accept');
      navigate(`/login?redirect=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
      return;
    }

    setRespondingInvite(true);
    try {
      const result = await respondToInvite(hackathonId, inviteTeamId, {
        token: inviteToken,
        action,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        userAvatar: user.avatar,
      });
      toast.success(result.message);
      clearInviteParams();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not respond to the invite');
    } finally {
      setRespondingInvite(false);
    }
  };

  const handleRegister = async () => {
    if (!user) { toast.error('Sign in to register'); return; }
    setRegistering(true);
    try {
      const result = await registerForHackathon(hackathonId, {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
      });
      toast.success(result.alreadyRegistered ? 'You are already registered' : 'You are in');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setRegistering(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />Loading hackathon…
        </div>
      </PageShell>
    );
  }

  if (!hackathon) {
    return (
      <PageShell>
        <EmptyState icon={Trophy} title="Hackathon not found" body="It may have been removed or is not published yet." />
        <div className="mt-4">
          <Button variant="outline" onClick={() => navigate('/hackathons')} className="gap-2">
            <ChevronLeft className="h-4 w-4" />All hackathons
          </Button>
        </div>
      </PageShell>
    );
  }

  const teamsOpen = isRegistrationOpen(hackathon);
  const individualMentor = user ? hackathon.individualMentors?.[user.id] : undefined;

  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/hackathons')} className="gap-2 -ml-2">
          <ChevronLeft className="h-4 w-4" />All hackathons
        </Button>

        {/* Pending email invite */}
        {inviteToken && inviteTeamId && (
          <Card className="glass-card border-primary/40">
            <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  You have a team invite{inviteTeam ? ` to join ${inviteTeam.name}` : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  Accepting adds you to the team and registers you for this hackathon.
                </p>
              </div>
              <div className="flex gap-2">
                <Button disabled={respondingInvite} onClick={() => handleInvite('accept')} className="gap-2">
                  {respondingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Accept
                </Button>
                <Button variant="outline" disabled={respondingInvite} onClick={() => handleInvite('decline')}>
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <Card className="glass-card overflow-hidden">
          {hackathon.bannerImage && (
            <div className="h-44 w-full overflow-hidden">
              <img
                src={hackathon.bannerImage}
                alt=""
                className="h-full w-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold">{hackathon.title}</h1>
                  <Badge variant="outline" className={`text-[10px] ${statusStyles[hackathon.status]}`}>
                    {statusLabels[hackathon.status]}
                  </Badge>
                </div>
                {hackathon.theme && <p className="text-primary/80">{hackathon.theme}</p>}
                <p className="text-muted-foreground max-w-3xl">{hackathon.description}</p>
              </div>

              {!isRegistered ? (
                <Button onClick={handleRegister} disabled={registering} className="gap-2 shrink-0">
                  {registering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Register
                </Button>
              ) : (
                <Badge className="gap-1.5 shrink-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                  <CheckCircle className="h-3.5 w-3.5" />Registered
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground pt-2 border-t">
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />{fmt(hackathon.startDate)} – {fmt(hackathon.endDate)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4" />{hackathon.participants || 0} registered
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trophy className="h-4 w-4" />{teams.length} team{teams.length === 1 ? '' : 's'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                Submissions close {fmt(hackathon.submissionDeadline || hackathon.endDate)}
              </span>
              {hackathon.sprintId && (
                <Link
                  to={`/skill-sprint/${hackathon.sprintId}`}
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <Link2 className="h-4 w-4" />Part of a sprint
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="overview" className="gap-1.5">
              <Info className="h-3.5 w-3.5" />Overview
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5">
              <Users className="h-3.5 w-3.5" />Teams
            </TabsTrigger>
            <TabsTrigger value="resources" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />Resources
            </TabsTrigger>
            <TabsTrigger value="submit" className="gap-1.5">
              <Send className="h-3.5 w-3.5" />Submit
            </TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="space-y-4">
            {linkedEvents.length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />Sessions & events
                  </CardTitle>
                  <CardDescription>
                    Kickoffs, check-ins and demo days that are part of this hackathon.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {linkedEvents.map(event => (
                    <Link
                      key={event.id}
                      to={`/meetups?id=${event.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{event.title}</span>
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {event.type.replace(/-/g, ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {fmt(event.date)}{event.location ? ` · ${event.location}` : ''}
                        </p>
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}

            {(hackathon.tracks || []).length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-primary" />Tracks
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {hackathon.tracks.map(track => (
                    <Badge key={track} variant="secondary">{track}</Badge>
                  ))}
                </CardContent>
              </Card>
            )}

            {hackathon.prizes && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gift className="h-4 w-4 text-primary" />Prizes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{hackathon.prizes}</p>
                </CardContent>
              </Card>
            )}

            {hackathon.rules && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-primary" />Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{hackathon.rules}</p>
                </CardContent>
              </Card>
            )}

            <Card className="glass-card">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />How teams work
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>Team size: {hackathon.teamConfig?.minSize} to {hackathon.teamConfig?.maxSize} people.</p>
                <p>{TEAM_JOIN_POLICY_SUMMARY[hackathon.teamConfig?.joinPolicy ?? 'request']}</p>
                <p>
                  {hackathon.teamConfig?.allowIndividuals
                    ? 'Solo entries are allowed — you can submit without forming a team.'
                    : 'Every entry must come from a team.'}
                </p>
              </CardContent>
            </Card>

            {(hackathon.mentors || []).length > 0 && (
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-primary" />Mentors
                  </CardTitle>
                  <CardDescription>Available to guide teams and solo builders.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {hackathon.mentors.map(mentor => (
                    <div key={mentor.userId || mentor.name} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={mentor.photo} />
                        <AvatarFallback>{mentor.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{mentor.name}</p>
                        {(mentor.designation || mentor.company) && (
                          <p className="text-xs text-muted-foreground truncate">
                            {[mentor.designation, mentor.company].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {individualMentor && (
              <Card className="glass-card border-primary/30">
                <CardHeader>
                  <CardTitle className="text-base">Your mentor</CardTitle>
                  <CardDescription>Assigned to you for this hackathon.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={individualMentor.photo} />
                    <AvatarFallback>{individualMentor.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{individualMentor.name}</p>
                    {individualMentor.email && (
                      <a href={`mailto:${individualMentor.email}`} className="text-sm text-primary hover:underline">
                        {individualMentor.email}
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Teams */}
          <TabsContent value="teams" className="space-y-6">
            {!isRegistered ? (
              <Card className="glass-card">
                <CardContent className="p-10 text-center space-y-4">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div className="space-y-1">
                    <h3 className="font-semibold">Register to form a team</h3>
                    <p className="text-sm text-muted-foreground">
                      You need to be registered before creating or joining a team.
                    </p>
                  </div>
                  <Button onClick={handleRegister} disabled={registering} className="gap-2">
                    <Rocket className="h-4 w-4" />Register now
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {myTeam ? (
                  <MyTeamPanel hackathon={hackathon} team={myTeam} onChanged={load} />
                ) : teamsOpen ? (
                  <Card className="glass-card">
                    <CardContent className="p-6 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <h3 className="font-semibold">You're not on a team yet</h3>
                          <p className="text-sm text-muted-foreground">
                            {TEAM_JOIN_POLICY_SUMMARY[hackathon.teamConfig?.joinPolicy ?? 'request']}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <CreateTeamDialog hackathon={hackathon} onCreated={load} />
                          {hackathon.teamConfig?.joinPolicy !== 'invite_only' && (
                            <JoinByCodeDialog hackathon={hackathon} onJoined={load} />
                          )}
                        </div>
                      </div>

                      {/* Solo participation is otherwise invisible — spell it out. */}
                      {hackathon.teamConfig?.allowIndividuals && (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
                          <div className="flex items-start gap-2">
                            <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-sm text-muted-foreground">
                              Prefer to work alone? You don't need a team — head to the
                              Submit tab and enter as an individual.
                            </p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="glass-card">
                    <CardContent className="p-6 text-center text-sm text-muted-foreground">
                      Team formation closed on {fmt(hackathon.registrationDeadline || hackathon.startDate)}.
                    </CardContent>
                  </Card>
                )}

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    All teams ({teams.length})
                  </h3>
                  <BrowseTeams hackathon={hackathon} teams={teams} myTeam={myTeam} onChanged={load} />
                </div>
              </>
            )}
          </TabsContent>

          {/* Resources */}
          <TabsContent value="resources">
            <ResourcesTab hackathon={hackathon} isRegistered={isRegistered} />
          </TabsContent>

          {/* Submit */}
          <TabsContent value="submit">
            {!isRegistered ? (
              <Card className="glass-card">
                <CardContent className="p-10 text-center space-y-4">
                  <Send className="h-12 w-12 mx-auto text-muted-foreground" />
                  <div className="space-y-1">
                    <h3 className="font-semibold">Register to submit</h3>
                    <p className="text-sm text-muted-foreground">
                      Only registered participants can submit a project.
                    </p>
                  </div>
                  <Button onClick={handleRegister} disabled={registering} className="gap-2">
                    <Rocket className="h-4 w-4" />Register now
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <SubmitTab
                hackathon={hackathon}
                myTeam={myTeam}
                mySubmission={mySubmission}
                onSubmitted={load}
              />
            )}
          </TabsContent>
        </Tabs>
      </motion.div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Route entry
// ---------------------------------------------------------------------------

export default function Hackathons() {
  const { hackathonId } = useParams();
  return hackathonId
    ? <HackathonDetailView hackathonId={hackathonId} />
    : <HackathonListView />;
}
