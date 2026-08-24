import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Plus, Trash2, Edit, Loader2, Calendar, Users, Trophy, BookOpen, Send,
  ChevronDown, ExternalLink, Mail, CheckCircle, XCircle, Crown, UserPlus,
  Clock, FileText, Link2, Rocket, X,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

import {
  Hackathon, HackathonPerson, HackathonResource, HackathonResourceType,
  HackathonStatus, HackathonSubmission, HackathonTeam, SubmissionField,
  Sprint, User as UserType,
} from '@/data/mockData';
import {
  getHackathons, createHackathon, updateHackathon, deleteHackathon,
  getHackathonTeams, getHackathonSubmissions, reviewHackathonSubmission,
  addHackathonResource, deleteHackathonResource,
  addHackathonMentor, removeHackathonMentor, removeIndividualMentor,
  assignTeamMentor, removeTeamMentor,
  DEFAULT_TEAM_CONFIG, TEAM_JOIN_POLICY_LABELS,
  type CreateHackathonData,
} from '@/lib/hackathons';
import { getSprints } from '@/lib/sprints';
import { getAllUsers } from '@/lib/userProfile';
import { useAuth } from '@/contexts/AuthContext';
import { SubmissionFormBuilder } from '@/components/shared/SubmissionFormBuilder';
import { UserSelect, UserMultiSelect, SessionPerson } from '@/components/admin/shared/AdminShared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: HackathonStatus; label: string }[] = [
  { value: 'draft', label: 'Draft (hidden from members)' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'registration', label: 'Registration open' },
  { value: 'active', label: 'Active — building' },
  { value: 'judging', label: 'Judging' },
  { value: 'completed', label: 'Completed' },
];

const RESOURCE_TYPE_OPTIONS: { value: HackathonResourceType; label: string }[] = [
  { value: 'doc', label: 'Doc' },
  { value: 'video', label: 'Video' },
  { value: 'repo', label: 'Repo' },
  { value: 'slides', label: 'Slides' },
  { value: 'dataset', label: 'Dataset' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'link', label: 'Link' },
];

const statusStyles: Record<HackathonStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  upcoming: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  registration: 'bg-violet-500/10 text-violet-500 border-violet-500/20',
  active: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  judging: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  completed: 'bg-muted text-muted-foreground border-border',
};

/** SessionPerson and HackathonPerson are structurally compatible. */
const toHackathonPerson = (person: SessionPerson): HackathonPerson => ({
  userId: person.userId,
  name: person.name,
  email: person.email,
  photo: person.photo,
  designation: person.designation,
  company: person.company,
  linkedIn: person.linkedIn,
});

const toSessionPerson = (person: HackathonPerson): SessionPerson => ({
  userId: person.userId,
  name: person.name,
  email: person.email,
  photo: person.photo,
  designation: person.designation,
  company: person.company,
  linkedIn: person.linkedIn,
});

const formatDate = (value?: string) => {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
};

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

interface HackathonFormState {
  title: string;
  theme: string;
  description: string;
  tracks: string;
  rules: string;
  prizes: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string;
  submissionDeadline: string;
  bannerImage: string;
  sprintId: string;
  status: HackathonStatus;
  minSize: string;
  maxSize: string;
  joinPolicy: 'invite_only' | 'request' | 'open';
  allowIndividuals: boolean;
  allowMentorRequests: boolean;
}

const emptyForm = (): HackathonFormState => ({
  title: '',
  theme: '',
  description: '',
  tracks: '',
  rules: '',
  prizes: '',
  startDate: '',
  endDate: '',
  registrationDeadline: '',
  submissionDeadline: '',
  bannerImage: '',
  sprintId: '',
  status: 'draft',
  minSize: String(DEFAULT_TEAM_CONFIG.minSize),
  maxSize: String(DEFAULT_TEAM_CONFIG.maxSize),
  joinPolicy: DEFAULT_TEAM_CONFIG.joinPolicy,
  allowIndividuals: DEFAULT_TEAM_CONFIG.allowIndividuals,
  allowMentorRequests: DEFAULT_TEAM_CONFIG.allowMentorRequests,
});

const formFromHackathon = (h: Hackathon): HackathonFormState => ({
  title: h.title,
  theme: h.theme || '',
  description: h.description,
  tracks: (h.tracks || []).join(', '),
  rules: h.rules || '',
  prizes: h.prizes || '',
  startDate: h.startDate || '',
  endDate: h.endDate || '',
  registrationDeadline: h.registrationDeadline || '',
  submissionDeadline: h.submissionDeadline || '',
  bannerImage: h.bannerImage || '',
  sprintId: h.sprintId || '',
  status: h.status,
  minSize: String(h.teamConfig?.minSize ?? DEFAULT_TEAM_CONFIG.minSize),
  maxSize: String(h.teamConfig?.maxSize ?? DEFAULT_TEAM_CONFIG.maxSize),
  joinPolicy: h.teamConfig?.joinPolicy ?? DEFAULT_TEAM_CONFIG.joinPolicy,
  allowIndividuals: h.teamConfig?.allowIndividuals ?? true,
  allowMentorRequests: h.teamConfig?.allowMentorRequests ?? true,
});

const NO_SPRINT = '__none__';

function buildPayload(
  form: HackathonFormState,
  fields: SubmissionField[],
  resources?: ResourceDraft[],
): CreateHackathonData & { status: HackathonStatus; resources?: ResourceDraft[] } {
  return {
    ...(resources && resources.length > 0 ? { resources } : {}),
    title: form.title.trim(),
    theme: form.theme.trim() || undefined,
    description: form.description.trim(),
    tracks: form.tracks.split(',').map(t => t.trim()).filter(Boolean),
    rules: form.rules.trim() || undefined,
    prizes: form.prizes.trim() || undefined,
    startDate: form.startDate,
    endDate: form.endDate,
    registrationDeadline: form.registrationDeadline || undefined,
    submissionDeadline: form.submissionDeadline || undefined,
    bannerImage: form.bannerImage.trim() || undefined,
    sprintId: form.sprintId && form.sprintId !== NO_SPRINT ? form.sprintId : undefined,
    status: form.status,
    teamConfig: {
      minSize: Number(form.minSize) || 1,
      maxSize: Number(form.maxSize) || 1,
      joinPolicy: form.joinPolicy,
      allowIndividuals: form.allowIndividuals,
      allowMentorRequests: form.allowMentorRequests,
    },
    submissionFormConfig: fields,
  };
}

function HackathonFormFields({ form, setForm, fields, setFields, sprints, resources, setResources }: {
  form: HackathonFormState;
  setForm: (next: HackathonFormState) => void;
  fields: SubmissionField[];
  setFields: (next: SubmissionField[]) => void;
  sprints: Sprint[];
  /** Only supplied by the create dialog — editing manages resources separately. */
  resources?: ResourceDraft[];
  setResources?: (next: ResourceDraft[]) => void;
}) {
  const update = <K extends keyof HackathonFormState>(key: K, value: HackathonFormState[K]) =>
    setForm({ ...form, [key]: value });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hk-title">Title *</Label>
          <Input
            id="hk-title"
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="e.g., Build on AWS Hackathon 2026"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hk-theme">Theme</Label>
          <Input
            id="hk-theme"
            value={form.theme}
            onChange={e => update('theme', e.target.value)}
            placeholder="e.g., Generative AI for social good"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hk-description">Description *</Label>
        <Textarea
          id="hk-description"
          value={form.description}
          onChange={e => update('description', e.target.value)}
          placeholder="What are builders being asked to do?"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hk-start">Start date *</Label>
          <Input id="hk-start" type="date" value={form.startDate} onChange={e => update('startDate', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hk-end">End date *</Label>
          <Input id="hk-end" type="date" value={form.endDate} onChange={e => update('endDate', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hk-reg">Registration closes</Label>
          <Input id="hk-reg" type="date" value={form.registrationDeadline} onChange={e => update('registrationDeadline', e.target.value)} />
          <p className="text-xs text-muted-foreground">Team formation stops here. Defaults to the start date.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hk-sub">Submissions close</Label>
          <Input id="hk-sub" type="date" value={form.submissionDeadline} onChange={e => update('submissionDeadline', e.target.value)} />
          <p className="text-xs text-muted-foreground">Defaults to the end date.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={v => update('status', v as HackathonStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Link to a sprint (optional)</Label>
          <Select value={form.sprintId || NO_SPRINT} onValueChange={v => update('sprintId', v)}>
            <SelectTrigger><SelectValue placeholder="Standalone hackathon" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SPRINT}>Standalone hackathon</SelectItem>
              {sprints.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Linking shows this hackathon on the sprint page.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hk-tracks">Tracks / problem statements</Label>
        <Input
          id="hk-tracks"
          value={form.tracks}
          onChange={e => update('tracks', e.target.value)}
          placeholder="Comma-separated, e.g., Healthcare, Sustainability, Education"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hk-rules">Rules</Label>
          <Textarea id="hk-rules" value={form.rules} onChange={e => update('rules', e.target.value)} rows={3} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hk-prizes">Prizes</Label>
          <Textarea id="hk-prizes" value={form.prizes} onChange={e => update('prizes', e.target.value)} rows={3} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="hk-banner">Banner image URL</Label>
        <Input id="hk-banner" value={form.bannerImage} onChange={e => update('bannerImage', e.target.value)} placeholder="https://..." />
      </div>

      {/* Team rules */}
      <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
        <div className="space-y-1">
          <Label className="text-base">Team rules</Label>
          <p className="text-xs text-muted-foreground">
            Controls how builders form teams and whether solo entries are allowed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="hk-min">Minimum team size</Label>
            <Input id="hk-min" type="number" min={1} value={form.minSize} onChange={e => update('minSize', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hk-max">Maximum team size</Label>
            <Input id="hk-max" type="number" min={1} value={form.maxSize} onChange={e => update('maxSize', e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>How people join a team</Label>
          <Select value={form.joinPolicy} onValueChange={v => update('joinPolicy', v as HackathonFormState['joinPolicy'])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(TEAM_JOIN_POLICY_LABELS) as HackathonFormState['joinPolicy'][]).map(policy => (
                <SelectItem key={policy} value={policy}>{TEAM_JOIN_POLICY_LABELS[policy]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Team leads can always send email invites. This setting only controls what
            people who haven't been invited can do — pick "Invites + requests" to allow both.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hk-individuals"
            className="h-4 w-4 rounded border-gray-300"
            checked={form.allowIndividuals}
            onChange={e => update('allowIndividuals', e.target.checked)}
          />
          <Label htmlFor="hk-individuals" className="text-sm font-normal cursor-pointer">
            Allow solo participants to submit without a team
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="hk-mentor-requests"
            className="h-4 w-4 rounded border-gray-300"
            checked={form.allowMentorRequests}
            onChange={e => update('allowMentorRequests', e.target.checked)}
          />
          <Label htmlFor="hk-mentor-requests" className="text-sm font-normal cursor-pointer">
            Let team leads pick a mentor from the pool themselves
          </Label>
        </div>
      </div>

      {resources && setResources && (
        <ResourceDraftEditor resources={resources} onChange={setResources} />
      )}

      <SubmissionFormBuilder
        fields={fields}
        onChange={setFields}
        title="Submission form"
        description="Build the form teams fill in when they submit. Same builder as the sprint submit form."
        emptyHint="No fields yet. Add at least one so teams have something to submit."
      />
    </div>
  );
}

function validateForm(form: HackathonFormState): string | null {
  if (!form.title.trim()) return 'Title is required';
  if (!form.description.trim()) return 'Description is required';
  if (!form.startDate) return 'Start date is required';
  if (!form.endDate) return 'End date is required';
  if (new Date(form.endDate) < new Date(form.startDate)) return 'End date must be on or after the start date';
  if (Number(form.maxSize) < Number(form.minSize)) return 'Maximum team size must be at least the minimum';
  return null;
}

function CreateHackathonDialog({ sprints, onSaved }: { sprints: Sprint[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<HackathonFormState>(emptyForm());
  const [fields, setFields] = useState<SubmissionField[]>([]);
  const [resources, setResources] = useState<ResourceDraft[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateForm(form);
    if (error) { toast.error(error); return; }

    setSaving(true);
    try {
      await createHackathon(buildPayload(form, fields, resources));
      toast.success('Hackathon created');
      setOpen(false);
      setForm(emptyForm());
      setFields([]);
      setResources([]);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create hackathon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Create Hackathon</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Create hackathon</DialogTitle>
          <DialogDescription>
            Set the dates, team rules and submission form. Save as Draft to keep it hidden from members.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <HackathonFormFields
            form={form}
            setForm={setForm}
            fields={fields}
            setFields={setFields}
            sprints={sprints}
            resources={resources}
            setResources={setResources}
          />
          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : 'Create'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditHackathonDialog({ hackathon, sprints, onSaved }: {
  hackathon: Hackathon;
  sprints: Sprint[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<HackathonFormState>(() => formFromHackathon(hackathon));
  const [fields, setFields] = useState<SubmissionField[]>(hackathon.submissionFormConfig || []);

  // Re-hydrate whenever the dialog is opened so it never shows stale values.
  useEffect(() => {
    if (open) {
      setForm(formFromHackathon(hackathon));
      setFields(hackathon.submissionFormConfig || []);
    }
  }, [open, hackathon]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateForm(form);
    if (error) { toast.error(error); return; }

    setSaving(true);
    try {
      await updateHackathon(hackathon.id, buildPayload(form, fields));
      toast.success('Hackathon updated');
      setOpen(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update hackathon');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2"><Edit className="h-4 w-4" />Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit hackathon</DialogTitle>
          <DialogDescription>{hackathon.title}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <HackathonFormFields form={form} setForm={setForm} fields={fields} setFields={setFields} sprints={sprints} />
          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : 'Save changes'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Mentor pool
// ---------------------------------------------------------------------------

function MentorPoolPanel({ hackathon, allUsers, onChanged }: {
  hackathon: Hackathon;
  allUsers: UserType[];
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const mentors = hackathon.mentors || [];

  // UserMultiSelect hides already-selected users, so its callback can only ever
  // report additions — removal is driven by the explicit buttons below instead.
  const handleSelect = async (next: SessionPerson[]) => {
    const currentIds = mentors.map(m => m.userId).filter(Boolean) as string[];
    const added = next.find(m => m.userId && !currentIds.includes(m.userId));
    if (!added) return;

    setBusy(true);
    try {
      await addHackathonMentor(hackathon.id, toHackathonPerson(added));
      toast.success(`${added.name} added to the mentor pool`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add mentor');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (mentor: HackathonPerson) => {
    const key = mentor.userId || mentor.email;
    if (!key) {
      toast.error('That mentor has no id or email, so it cannot be removed automatically');
      return;
    }
    if (!confirm(`Remove ${mentor.name} from the mentor pool?`)) return;

    setBusy(true);
    try {
      await removeHackathonMentor(hackathon.id, key);
      toast.success(`${mentor.name} removed from the pool`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove mentor');
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveIndividual = async (participantUserId: string, mentorName: string) => {
    if (!confirm(`Unassign ${mentorName} from this participant?`)) return;
    setBusy(true);
    try {
      await removeIndividualMentor(hackathon.id, participantUserId);
      toast.success('Mentor unassigned');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to unassign mentor');
    } finally {
      setBusy(false);
    }
  };

  const individualMentors = Object.entries(hackathon.individualMentors || {});

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Mentor pool</Label>
        <UserMultiSelect
          selectedUsers={mentors.map(toSessionPerson)}
          onSelect={handleSelect}
          placeholder={busy ? 'Updating…' : 'Add mentors from members'}
          allUsers={allUsers}
        />
        <p className="text-xs text-muted-foreground">
          Teams and solo participants can be matched with anyone in this pool.
        </p>
      </div>

      {mentors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {mentors.map(mentor => (
            <Badge
              key={mentor.userId || mentor.email || mentor.name}
              variant="secondary"
              className="gap-1.5 py-1 pl-1 pr-1"
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={mentor.photo} />
                <AvatarFallback className="text-[10px]">{mentor.name.charAt(0)}</AvatarFallback>
              </Avatar>
              {mentor.name}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={() => handleRemove(mentor)}
                aria-label={`Remove ${mentor.name} from the mentor pool`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {individualMentors.length > 0 && (
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Mentors assigned to solo participants
          </Label>
          <div className="space-y-1">
            {individualMentors.map(([participantId, mentor]) => (
              <div key={participantId} className="flex items-center justify-between gap-2 text-sm rounded-md bg-muted/40 px-3 py-2">
                <span className="text-muted-foreground truncate">{participantId}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{mentor.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={busy}
                    onClick={() => handleRemoveIndividual(participantId, mentor.name)}
                    aria-label={`Unassign ${mentor.name}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

/** A resource being drafted before the hackathon exists (no id assigned yet). */
type ResourceDraft = Omit<HackathonResource, 'id' | 'addedAt'>;

const emptyResourceDraft = (): ResourceDraft => ({
  title: '', url: '', description: '', category: '', type: 'link', registeredOnly: false,
});

/**
 * Resource editor used inside the create dialog, where there's no hackathon to
 * POST to yet. Resources are collected locally and sent with the create call.
 */
function ResourceDraftEditor({ resources, onChange }: {
  resources: ResourceDraft[];
  onChange: (next: ResourceDraft[]) => void;
}) {
  const [draft, setDraft] = useState<ResourceDraft>(emptyResourceDraft());

  const add = () => {
    if (!draft.title.trim() || !draft.url.trim()) {
      toast.error('A resource needs a title and a URL');
      return;
    }
    onChange([...resources, {
      ...draft,
      title: draft.title.trim(),
      url: draft.url.trim(),
      description: draft.description?.trim() || undefined,
      category: draft.category?.trim() || undefined,
    }]);
    setDraft(emptyResourceDraft());
  };

  return (
    <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
      <div className="space-y-1">
        <Label className="text-base">Resources</Label>
        <p className="text-xs text-muted-foreground">
          Starter guides, datasets and workshop links. You can add more later.
        </p>
      </div>

      {resources.length > 0 && (
        <div className="space-y-2">
          {resources.map((resource, index) => (
            <div key={`${resource.url}-${index}`} className="flex items-start justify-between gap-3 rounded-md border bg-background/60 p-2">
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{resource.title}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{resource.type}</Badge>
                  {resource.registeredOnly && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                      Registered only
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground break-all">{resource.url}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onChange(resources.filter((_, i) => i !== index))}
                aria-label={`Remove ${resource.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          placeholder="Title"
          aria-label="Resource title"
        />
        <Input
          value={draft.url}
          onChange={e => setDraft({ ...draft, url: e.target.value })}
          placeholder="https://..."
          aria-label="Resource URL"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v as HackathonResourceType })}>
          <SelectTrigger aria-label="Resource type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {RESOURCE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          value={draft.category || ''}
          onChange={e => setDraft({ ...draft, category: e.target.value })}
          placeholder="Group label (optional)"
          aria-label="Resource category"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="draft-res-gated"
            className="h-4 w-4 rounded border-gray-300"
            checked={!!draft.registeredOnly}
            onChange={e => setDraft({ ...draft, registeredOnly: e.target.checked })}
          />
          <Label htmlFor="draft-res-gated" className="text-sm font-normal cursor-pointer">
            Only show to registered participants
          </Label>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-2">
          <Plus className="h-4 w-4" />Add resource
        </Button>
      </div>
    </div>
  );
}

function ResourcesPanel({ hackathon, onChanged }: { hackathon: Hackathon; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    title: '', url: '', description: '', category: '',
    type: 'link' as HackathonResourceType, registeredOnly: false,
  });

  const resources = hackathon.resources || [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim() || !draft.url.trim()) {
      toast.error('A title and URL are required');
      return;
    }
    setSaving(true);
    try {
      await addHackathonResource(hackathon.id, {
        title: draft.title.trim(),
        url: draft.url.trim(),
        description: draft.description.trim() || undefined,
        category: draft.category.trim() || undefined,
        type: draft.type,
        registeredOnly: draft.registeredOnly,
      });
      toast.success('Resource added');
      setDraft({ title: '', url: '', description: '', category: '', type: 'link', registeredOnly: false });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add resource');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (resource: HackathonResource) => {
    if (!confirm(`Remove "${resource.title}" from resources?`)) return;
    try {
      await deleteHackathonResource(hackathon.id, resource.id);
      toast.success('Resource removed');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove resource');
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="space-y-3 rounded-lg border p-4 bg-muted/20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            value={draft.title}
            onChange={e => setDraft({ ...draft, title: e.target.value })}
            placeholder="Title, e.g., Getting started with Bedrock"
            aria-label="Resource title"
          />
          <Input
            value={draft.url}
            onChange={e => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://..."
            aria-label="Resource URL"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v as HackathonResourceType })}>
            <SelectTrigger aria-label="Resource type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RESOURCE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={draft.category}
            onChange={e => setDraft({ ...draft, category: e.target.value })}
            placeholder="Group label (optional)"
            aria-label="Resource category"
          />
        </div>
        <Textarea
          value={draft.description}
          onChange={e => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short description (optional)"
          rows={2}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`res-gated-${hackathon.id}`}
              className="h-4 w-4 rounded border-gray-300"
              checked={draft.registeredOnly}
              onChange={e => setDraft({ ...draft, registeredOnly: e.target.checked })}
            />
            <Label htmlFor={`res-gated-${hackathon.id}`} className="text-sm font-normal cursor-pointer">
              Only show to registered participants
            </Label>
          </div>
          <Button type="submit" size="sm" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add resource
          </Button>
        </div>
      </form>

      {resources.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
          No resources yet.
        </p>
      ) : (
        <div className="space-y-2">
          {resources.map(resource => (
            <div key={resource.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{resource.title}</span>
                  <Badge variant="outline" className="text-[10px] uppercase">{resource.type}</Badge>
                  {resource.category && <Badge variant="secondary" className="text-[10px]">{resource.category}</Badge>}
                  {resource.registeredOnly && (
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                      Registered only
                    </Badge>
                  )}
                </div>
                {resource.description && (
                  <p className="text-xs text-muted-foreground">{resource.description}</p>
                )}
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1 break-all"
                >
                  {resource.url}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(resource)}
                aria-label={`Remove ${resource.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Teams oversight
// ---------------------------------------------------------------------------

function TeamsPanel({ hackathon, teams, allUsers, canManage = true, onChanged }: {
  hackathon: Hackathon;
  teams: HackathonTeam[];
  allUsers: UserType[];
  /** Judges see rosters read-only; only organisers assign mentors. */
  canManage?: boolean;
  onChanged: () => void;
}) {
  const [assigning, setAssigning] = useState<string | null>(null);

  const handleAssignMentor = async (team: HackathonTeam, person: SessionPerson | undefined) => {
    if (!person) return;
    setAssigning(team.id);
    try {
      await assignTeamMentor(hackathon.id, team.id, toHackathonPerson(person));
      toast.success(`${person.name} is now mentoring ${team.name}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to assign mentor');
    } finally {
      setAssigning(null);
    }
  };

  const handleRemoveMentor = async (team: HackathonTeam, mentor: HackathonPerson) => {
    const key = mentor.userId || mentor.email;
    if (!key) {
      toast.error('That mentor has no id or email, so it cannot be removed automatically');
      return;
    }
    if (!confirm(`Remove ${mentor.name} as a mentor for ${team.name}?`)) return;

    setAssigning(team.id);
    try {
      await removeTeamMentor(hackathon.id, team.id, key);
      toast.success(`${mentor.name} removed from ${team.name}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove mentor');
    } finally {
      setAssigning(null);
    }
  };

  if (teams.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
        No teams have formed yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {teams.map(team => {
        const pendingRequests = (team.joinRequests || []).filter(r => r.status === 'pending');
        const pendingInvites = (team.invites || []).filter(i => i.status === 'pending');

        return (
          <Collapsible key={team.id} className="rounded-lg border group/team">
            <CollapsibleTrigger className="w-full p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors text-left">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{team.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {team.members.length}/{hackathon.teamConfig?.maxSize ?? '—'} members
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono">{team.joinCode}</Badge>
                  {pendingRequests.length > 0 && (
                    <Badge className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                      {pendingRequests.length} pending request{pendingRequests.length === 1 ? '' : 's'}
                    </Badge>
                  )}
                </div>
                {team.projectName && (
                  <p className="text-xs text-muted-foreground mt-1">Project: {team.projectName}</p>
                )}
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 transition-transform group-data-[state=open]/team:rotate-180" />
            </CollapsibleTrigger>

            <CollapsibleContent className="border-t p-3 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Members</Label>
                <div className="space-y-1">
                  {team.members.map(member => (
                    <div key={member.userId} className="flex items-center gap-2 text-sm">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback className="text-[10px]">{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span>{member.name}</span>
                      {member.role === 'lead' && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Crown className="h-3 w-3" />Lead
                        </Badge>
                      )}
                      {member.email && (
                        <span className="text-xs text-muted-foreground truncate">{member.email}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {pendingInvites.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Pending invites
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {pendingInvites.map(invite => (
                      <Badge key={invite.id} variant="outline" className="gap-1 text-[10px]">
                        <Mail className="h-3 w-3" />{invite.email}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Mentors</Label>
                {(team.mentors || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {team.mentors.map(mentor => (
                      <Badge
                        key={mentor.userId || mentor.name}
                        variant="secondary"
                        className="gap-1 text-[10px] pr-1"
                      >
                        {mentor.name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleRemoveMentor(team, mentor)}
                          aria-label={`Remove ${mentor.name} from ${team.name}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
                {canManage && (
                  <UserSelect
                    onSelect={person => handleAssignMentor(team, person)}
                    placeholder={assigning === team.id ? 'Assigning…' : 'Assign a mentor'}
                    allUsers={allUsers}
                  />
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Submissions review
// ---------------------------------------------------------------------------

function SubmissionCard({ hackathon, submission, memberCount, onReviewed }: {
  hackathon: Hackathon;
  submission: HackathonSubmission;
  /** Members on the submitting team, used to explain who gets the points. */
  memberCount: number;
  onReviewed: () => void;
}) {
  const { user: authUser } = useAuth();
  const [points, setPoints] = useState(String(submission.points || 100));
  const [feedback, setFeedback] = useState(submission.feedback || '');
  const [busy, setBusy] = useState(false);

  const formConfig = hackathon.submissionFormConfig || [];

  const handleReview = async (status: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      const result = await reviewHackathonSubmission(hackathon.id, submission.id, {
        status,
        // A rejection scores nothing; the API enforces this too.
        points: status === 'rejected' ? 0 : Number(points) || 0,
        feedback: feedback.trim() || undefined,
        // The API resolves the reviewer from the caller's token; this is only
        // used for the display name on the record.
        reviewedBy: authUser?.id || '',
        reviewerName: authUser?.name,
      });

      if (status === 'approved' && result.pointsAwarded > 0) {
        const n = (result.recipients || []).length;
        toast.success(`Approved — ${result.pointsAwarded} points credited to ${n} builder${n === 1 ? '' : 's'}`);
      } else if (status === 'approved') {
        toast.success('Submission approved');
      } else {
        toast.success('Submission rejected');
      }

      onReviewed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to review submission');
    } finally {
      setBusy(false);
    }
  };

  const entries = Object.entries(submission.customFields || {});

  return (
    <Collapsible className="rounded-lg border group/sub">
      <CollapsibleTrigger className="w-full p-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors text-left">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarImage src={submission.userAvatar} />
            <AvatarFallback>{(submission.teamName || submission.userName).charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">
                {submission.teamName || submission.userName}
              </span>
              <Badge variant="outline" className="text-[10px] capitalize">{submission.kind}</Badge>
              {submission.track && <Badge variant="secondary" className="text-[10px]">{submission.track}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {submission.projectName ? `${submission.projectName} · ` : ''}
              {formatDate(submission.submittedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            className={`text-[10px] capitalize ${
              submission.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                : submission.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20'
                  : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
            }`}
          >
            {submission.status}
          </Badge>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]/sub:rotate-180" />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent className="border-t p-4 space-y-4">
        {entries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {entries.map(([key, value]) => {
              // Recover the human label from the admin-built form config; fall
              // back to the raw key if the field was removed since submission.
              const field = formConfig.find(f => f.id === key);
              const label = field?.label || key;
              const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
              const isLong = text.length >= 60;

              return (
                <div key={key} className={`space-y-1 ${isLong ? 'md:col-span-2' : ''}`}>
                  <Label className="text-[11px] text-muted-foreground">{label}</Label>
                  <div className="rounded-md border bg-background/60 p-2">
                    {/^https?:\/\//.test(text) ? (
                      <a href={text} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1 break-all">
                        {text}<ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{text}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(submission.supportingDocuments || []).length > 0 && (
          <div className="space-y-2">
            <Label className="text-[11px] text-muted-foreground">Supporting documents</Label>
            <div className="flex flex-wrap gap-2">
              {submission.supportingDocuments.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:border-primary/40"
                >
                  <FileText className="h-3 w-3" />File {index + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
          <div className="space-y-1">
            <Label htmlFor={`pts-${submission.id}`} className="text-xs">Points</Label>
            <Input
              id={`pts-${submission.id}`}
              type="number"
              min={0}
              value={points}
              onChange={e => setPoints(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor={`fb-${submission.id}`} className="text-xs">Feedback (optional)</Label>
            <Input
              id={`fb-${submission.id}`}
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Shared with the team"
            />
          </div>
        </div>

        {/* Approving credits real profile points, so say so before they click. */}
        <p className="text-xs text-muted-foreground">
          {submission.kind === 'team'
            ? `Approving credits ${Number(points) || 0} points to each of the ${memberCount} member${memberCount === 1 ? '' : 's'} of ${submission.teamName || 'the team'}.`
            : `Approving credits ${Number(points) || 0} points to ${submission.userName}.`}
          {' '}Rejecting scores zero, and changing a decision adjusts the balances to match.
        </p>

        <div className="flex flex-wrap gap-2 items-center">
          <Button size="sm" className="gap-2" disabled={busy} onClick={() => handleReview('approved')}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {submission.status === 'approved' ? 'Update award' : 'Approve & award points'}
          </Button>
          <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={() => handleReview('rejected')}>
            <XCircle className="h-4 w-4" />Reject
          </Button>

          {(submission.awardedPoints || 0) > 0 && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-600">
              {submission.awardedPoints} pts credited to {(submission.awardedTo || []).length} builder
              {(submission.awardedTo || []).length === 1 ? '' : 's'}
            </Badge>
          )}

          {submission.reviewedAt && (
            <span className="text-xs text-muted-foreground">
              Last reviewed {formatDate(submission.reviewedAt)}
              {submission.reviewerName ? ` by ${submission.reviewerName}` : ''}
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SubmissionsPanel({ hackathon, submissions, teams, onReviewed }: {
  hackathon: Hackathon;
  submissions: HackathonSubmission[];
  teams: HackathonTeam[];
  onReviewed: () => void;
}) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filtered = filter === 'all' ? submissions : submissions.filter(s => s.status === filter);
  const counts = {
    all: submissions.length,
    pending: submissions.filter(s => s.status === 'pending').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(key => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            onClick={() => setFilter(key)}
            className="capitalize"
          >
            {key} ({counts[key]})
          </Button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-lg">
          {submissions.length === 0 ? 'No submissions yet.' : `No ${filter} submissions.`}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(submission => (
            <SubmissionCard
              key={submission.id}
              hackathon={hackathon}
              submission={submission}
              memberCount={
                submission.teamId
                  ? (teams.find(t => t.id === submission.teamId)?.members.length ?? 1)
                  : 1
              }
              onReviewed={onReviewed}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-hackathon detail card
// ---------------------------------------------------------------------------

function HackathonCard({ hackathon, sprints, allUsers, canManage, onChanged }: {
  hackathon: Hackathon;
  sprints: Sprint[];
  allUsers: UserType[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [teams, setTeams] = useState<HackathonTeam[]>([]);
  const [submissions, setSubmissions] = useState<HackathonSubmission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);

    // Settled independently so a failure in one panel doesn't blank the other.
    const [teamsResult, submissionsResult] = await Promise.allSettled([
      getHackathonTeams(hackathon.id),
      getHackathonSubmissions(hackathon.id),
    ]);

    if (teamsResult.status === 'fulfilled') setTeams(teamsResult.value);
    if (submissionsResult.status === 'fulfilled') setSubmissions(submissionsResult.value);

    if (teamsResult.status === 'rejected' || submissionsResult.status === 'rejected') {
      console.error(
        'Failed to load hackathon detail:',
        teamsResult.status === 'rejected' ? teamsResult.reason : submissionsResult.status === 'rejected' ? submissionsResult.reason : null,
      );
      toast.error('Could not load teams and submissions');
    }

    setLoaded(true);
    setLoading(false);
  }, [hackathon.id]);

  const handleDelete = async () => {
    if (!confirm(`Delete "${hackathon.title}"? This also removes its teams and submissions and cannot be undone.`)) {
      return;
    }
    try {
      await deleteHackathon(hackathon.id);
      toast.success('Hackathon deleted');
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete hackathon');
    }
  };

  const linkedSprint = sprints.find(s => s.id === hackathon.sprintId);
  const pendingCount = submissions.filter(s => s.status === 'pending').length;

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{hackathon.title}</CardTitle>
              <Badge variant="outline" className={`capitalize text-[10px] ${statusStyles[hackathon.status]}`}>
                {hackathon.status}
              </Badge>
              {linkedSprint && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Link2 className="h-3 w-3" />{linkedSprint.title}
                </Badge>
              )}
            </div>
            <CardDescription className="line-clamp-2">{hackathon.description}</CardDescription>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(hackathon.startDate)} – {formatDate(hackathon.endDate)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />{hackathon.participants || 0} registered
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Submissions close {formatDate(hackathon.submissionDeadline || hackathon.endDate)}
              </span>
            </div>
          </div>

          {canManage && (
            <div className="flex items-center gap-2 shrink-0">
              <EditHackathonDialog hackathon={hackathon} sprints={sprints} onSaved={onChanged} />
              <Button variant="ghost" size="icon" onClick={handleDelete} aria-label={`Delete ${hackathon.title}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <Collapsible onOpenChange={open => { if (open && !loaded) loadDetail(); }}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-2">
              {canManage
                ? 'Manage teams, mentors, resources and submissions'
                : 'Review submissions and award points'}
              {pendingCount > 0 && (
                <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]">
                  {pendingCount} to review
                </Badge>
              )}
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-4">
            {loading && !loaded ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />Loading…
              </div>
            ) : (
              <Tabs defaultValue="submissions" className="space-y-4">
                <TabsList className={`grid w-full ${canManage ? 'grid-cols-4' : 'grid-cols-2'}`}>
                  <TabsTrigger value="submissions" className="gap-1.5">
                    <Send className="h-3.5 w-3.5" />Submissions
                  </TabsTrigger>
                  <TabsTrigger value="teams" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" />Teams
                  </TabsTrigger>
                  {canManage && (
                    <>
                      <TabsTrigger value="mentors" className="gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" />Mentors
                      </TabsTrigger>
                      <TabsTrigger value="resources" className="gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" />Resources
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>

                <TabsContent value="submissions">
                  <SubmissionsPanel
                    hackathon={hackathon}
                    submissions={submissions}
                    teams={teams}
                    onReviewed={() => { loadDetail(); onChanged(); }}
                  />
                </TabsContent>

                <TabsContent value="teams">
                  <TeamsPanel
                    hackathon={hackathon}
                    teams={teams}
                    allUsers={allUsers}
                    canManage={canManage}
                    onChanged={loadDetail}
                  />
                </TabsContent>

                {canManage && (
                  <>
                    <TabsContent value="mentors">
                      <MentorPoolPanel hackathon={hackathon} allUsers={allUsers} onChanged={onChanged} />
                    </TabsContent>

                    <TabsContent value="resources">
                      <ResourcesPanel hackathon={hackathon} onChanged={onChanged} />
                    </TabsContent>
                  </>
                )}
              </Tabs>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tab root
// ---------------------------------------------------------------------------

export function HackathonsTab({ canManage = true }: { canManage?: boolean }) {
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Settled independently on purpose. These three come from different APIs, so
    // a failure in one must not blank the others — with Promise.all, a rejected
    // getHackathons() (e.g. API not deployed yet) short-circuited the whole
    // block and left the sprint dropdown and mentor picker empty.
    const [hackathonsResult, sprintsResult, usersResult] = await Promise.allSettled([
      getHackathons(),
      getSprints(),
      getAllUsers(),
    ]);

    if (hackathonsResult.status === 'fulfilled') {
      setHackathons(hackathonsResult.value);
    } else {
      console.error('Failed to load hackathons:', hackathonsResult.reason);
      toast.error('Could not load hackathons. Is the hackathons API deployed?');
    }

    if (sprintsResult.status === 'fulfilled') {
      setSprints(sprintsResult.value);
    } else {
      console.error('Failed to load sprints:', sprintsResult.reason);
    }

    if (usersResult.status === 'fulfilled') {
      setAllUsers(usersResult.value);
    } else {
      console.error('Failed to load users:', usersResult.reason);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            Hackathons
          </h2>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? 'Create hackathons, manage teams and mentors, publish resources and review submissions.'
              : 'Review submissions and award points. Approving a submission credits the points to the builders.'}
          </p>
        </div>
        {canManage && <CreateHackathonDialog sprints={sprints} onSaved={load} />}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />Loading hackathons…
        </div>
      ) : hackathons.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center space-y-3">
            <Rocket className="h-12 w-12 mx-auto text-muted-foreground" />
            <h3 className="font-semibold">No hackathons yet</h3>
            <p className="text-sm text-muted-foreground">
              Create one to open team registration and start collecting submissions.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {hackathons.map(hackathon => (
            <HackathonCard
              key={hackathon.id}
              hackathon={hackathon}
              sprints={sprints}
              allUsers={allUsers}
              canManage={canManage}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default HackathonsTab;
