import { useState } from 'react';
import * as React from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, Calendar, Users, CheckCircle, XCircle, Clock,
  Rocket, ExternalLink, MessageSquare, Award, Link2,
  Copy, Mail, Edit, Trash2, Eye, FileText, User, Video,
  Upload, X, UserPlus, Check, ChevronDown, GraduationCap,
  Trophy, ListTodo, ClipboardCheck, Target, Shield, UserCog
} from 'lucide-react';
import { mockSprints, mockMeetups, currentUser, Submission, generateSpeakerInviteLink, Sprint, Session, SessionPerson, mockUsers, User as UserType, predefinedTasks, mockColleges, CollegeTask, College, getTaskById, getUserById, communityRoles, mockUserRoles, CommunityRole, UserRoleAssignment, PointActivity, mockPointActivities, Meetup } from '@/data/mockData';
import { createMeetup, updateMeetup, publishMeetup, getMeetups, CreateMeetupData, UpdateMeetupData } from '@/lib/meetups';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

// Get all submissions across sprints
const allSubmissions = mockSprints.flatMap(s => 
  s.submissions.map(sub => ({ ...sub, sprintTitle: s.title, sprintId: s.id }))
);

function SubmissionReview({ submission, onAction }: { 
  submission: Submission & { sprintTitle: string }; 
  onAction: (action: 'approve' | 'reject', points?: number, feedback?: string) => void 
}) {
  const [points, setPoints] = useState(100);
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  return (
    <Card className="glass-card">
      <CardContent className="p-4">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarImage src={submission.userAvatar} />
              <AvatarFallback>{submission.userName.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="font-semibold">{submission.userName}</span>
                <Badge variant="outline" className="text-xs">{submission.sprintTitle}</Badge>
                <Badge variant={
                  submission.status === 'approved' ? 'default' : 
                  submission.status === 'rejected' ? 'destructive' : 'secondary'
                } className="capitalize">
                  {submission.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">{submission.description}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                {submission.blogUrl && (
                  <a href={submission.blogUrl} target="_blank" rel="noopener noreferrer" 
                     className="text-primary hover:underline flex items-center gap-1 bg-primary/10 px-2 py-1 rounded">
                    <FileText className="h-3 w-3" />
                    Blog
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {submission.repoUrl && (
                  <a href={submission.repoUrl} target="_blank" rel="noopener noreferrer"
                     className="text-primary hover:underline flex items-center gap-1 bg-primary/10 px-2 py-1 rounded">
                    <ExternalLink className="h-3 w-3" />
                    Repository
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Submitted {format(parseISO(submission.submittedAt), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          
          {submission.status === 'pending' ? (
            <div className="flex flex-col gap-3 lg:w-64">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Points:</Label>
                <Input 
                  type="number" 
                  value={points} 
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="w-20 h-8"
                  min={0}
                  max={500}
                />
              </div>
              {showFeedback && (
                <Textarea 
                  placeholder="Add feedback (optional)..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => onAction('approve', points, feedback)} className="flex-1 gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onAction('reject', 0, feedback)} className="flex-1 gap-1">
                  <XCircle className="h-4 w-4" />
                  Reject
                </Button>
              </div>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setShowFeedback(!showFeedback)}
                className="text-xs"
              >
                {showFeedback ? 'Hide' : 'Add'} Feedback
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-2">
              <Badge variant="outline" className="text-lg px-4 py-2">
                <Award className="h-4 w-4 mr-2" />
                {submission.points} pts
              </Badge>
              {submission.feedback && (
                <p className="text-xs text-muted-foreground max-w-xs text-right">
                  "{submission.feedback}"
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SpeakerInviteDialog({ eventType, eventId, eventTitle }: {
  eventType: 'sprint' | 'meetup';
  eventId: string;
  eventTitle: string;
}) {
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const generateInvite = () => {
    const link = generateSpeakerInviteLink(eventType, eventId);
    const fullLink = `${window.location.origin}/speaker-invite/${link}`;
    setInviteLink(fullLink);
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success('Link copied to clipboard!');
  };

  const sendEmail = () => {
    if (!email) {
      toast.error('Please enter an email address');
      return;
    }
    toast.success(`Invitation sent to ${email}`);
    setEmail('');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Link2 className="h-4 w-4" />
          Invite Speaker
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Speaker</DialogTitle>
          <DialogDescription>
            Generate a unique link for speakers to submit their session details for {eventTitle}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {!inviteLink ? (
            <Button onClick={generateInvite} className="w-full">
              <Link2 className="h-4 w-4 mr-2" />
              Generate Speaker Invite Link
            </Button>
          ) : (
            <>
              <div className="space-y-2">
                <Label>Speaker Invite Link</Label>
                <div className="flex gap-2">
                  <Input value={inviteLink} readOnly className="text-xs" />
                  <Button size="icon" variant="outline" onClick={copyLink}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="border-t pt-4">
                <Label>Or send via email</Label>
                <div className="flex gap-2 mt-2">
                  <Input 
                    type="email" 
                    placeholder="speaker@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button onClick={sendEmail}>
                    <Mail className="h-4 w-4 mr-2" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateSprintDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    theme: '',
    description: '',
    startDate: '',
    endDate: '',
    githubRepo: '',
    posterImage: '',
    difficulty: 'intermediate' as 'beginner' | 'intermediate' | 'advanced',
    maxParticipants: '',
    prerequisites: '',
    learningOutcomes: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const newSprint: Sprint = {
      id: `s-${Date.now()}`,
      title: formData.title,
      theme: formData.theme,
      description: formData.description,
      startDate: formData.startDate,
      endDate: formData.endDate,
      status: 'upcoming',
      participants: 0,
      sessions: [],
      submissions: [],
      githubRepo: formData.githubRepo || undefined,
      registeredUsers: []
    };

    console.log('Creating sprint:', newSprint);
    toast.success('Sprint created successfully!');
    setOpen(false);
    
    // Reset form
    setFormData({
      title: '',
      theme: '',
      description: '',
      startDate: '',
      endDate: '',
      githubRepo: '',
      posterImage: '',
      difficulty: 'intermediate',
      maxParticipants: '',
      prerequisites: '',
      learningOutcomes: ''
    });
  };

  const themes = [
    'Serverless',
    'Containers & Kubernetes',
    'Machine Learning',
    'Generative AI',
    'Data Engineering',
    'DevOps & CI/CD',
    'Security & Compliance',
    'Networking',
    'Storage & Databases',
    'Cost Optimization'
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Create Sprint</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Skill Sprint</DialogTitle>
          <DialogDescription>
            Set up a new skill sprint for the community. Add details, poster, and learning objectives.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sprint Title *</Label>
                <Input 
                  placeholder="e.g., Serverless January"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Theme *</Label>
                <Select value={formData.theme} onValueChange={(value) => setFormData({ ...formData, theme: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a theme" />
                  </SelectTrigger>
                  <SelectContent>
                    {themes.map(theme => (
                      <SelectItem key={theme} value={theme}>{theme}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input 
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input 
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Difficulty Level</Label>
                <Select value={formData.difficulty} onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') => setFormData({ ...formData, difficulty: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">🟢 Beginner</SelectItem>
                    <SelectItem value="intermediate">🟡 Intermediate</SelectItem>
                    <SelectItem value="advanced">🔴 Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea 
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the sprint objectives and what participants will learn..."
                required
              />
            </div>
          </div>

          {/* Poster & Resources */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Poster & Resources</h3>
            <div className="space-y-2">
              <Label>Sprint Poster Image</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.posterImage}
                  onChange={(e) => setFormData({ ...formData, posterImage: e.target.value })}
                  placeholder="https://example.com/poster.jpg"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => toast.info('File upload will be available with backend')}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              {formData.posterImage && (
                <div className="mt-2">
                  <img
                    src={formData.posterImage}
                    alt="Sprint poster preview"
                    className="w-full h-40 object-cover rounded-lg border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GitHub Repo URL</Label>
                <Input 
                  placeholder="https://github.com/..."
                  value={formData.githubRepo}
                  onChange={(e) => setFormData({ ...formData, githubRepo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Max Participants</Label>
                <Input 
                  type="number"
                  placeholder="Leave empty for unlimited"
                  value={formData.maxParticipants}
                  onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
                  min="10"
                />
              </div>
            </div>
          </div>

          {/* Learning Details */}
          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Learning Details</h3>
            <div className="space-y-2">
              <Label>Prerequisites</Label>
              <Textarea 
                rows={2}
                value={formData.prerequisites}
                onChange={(e) => setFormData({ ...formData, prerequisites: e.target.value })}
                placeholder="List any prerequisites (e.g., AWS account, basic cloud knowledge)..."
              />
            </div>
            <div className="space-y-2">
              <Label>Learning Outcomes</Label>
              <Textarea 
                rows={3}
                value={formData.learningOutcomes}
                onChange={(e) => setFormData({ ...formData, learningOutcomes: e.target.value })}
                placeholder="What will participants be able to do after completing this sprint?&#10;- Build serverless APIs&#10;- Deploy Lambda functions&#10;- Configure API Gateway"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Create Sprint
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to convert User to SessionPerson
const userToSessionPerson = (user: UserType): SessionPerson => ({
  userId: user.id,
  name: user.name,
  photo: user.avatar,
  email: user.email,
  designation: user.designation,
  company: user.company,
  linkedIn: user.linkedIn
});

// User Select Component for single selection
function UserSelect({
  selectedUser,
  onSelect,
  placeholder,
  excludeUserIds = []
}: {
  selectedUser?: SessionPerson;
  onSelect: (user: SessionPerson | undefined) => void;
  placeholder: string;
  excludeUserIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const availableUsers = mockUsers.filter(user => 
    !excludeUserIds.includes(user.id) && user.id !== selectedUser?.userId
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          {selectedUser ? (
            <div className="flex items-center gap-2">
              <Avatar className="h-5 w-5">
                <AvatarImage src={selectedUser.photo} />
                <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span>{selectedUser.name}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {availableUsers.map((user) => {
                const isSelected = selectedUser?.userId === user.id;
                return (
                  <CommandItem
                    key={user.id}
                    value={user.name}
                    onSelect={() => {
                      onSelect(isSelected ? undefined : userToSessionPerson(user));
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{user.name}</div>
                        {user.designation && (
                          <div className="text-xs text-muted-foreground">{user.designation}</div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// User Multi-Select Component
function UserMultiSelect({
  selectedUsers,
  onSelect,
  placeholder,
  excludeUserIds = []
}: {
  selectedUsers: SessionPerson[];
  onSelect: (users: SessionPerson[]) => void;
  placeholder: string;
  excludeUserIds?: string[];
}) {
  const [open, setOpen] = useState(false);
  const selectedUserIds = selectedUsers.map(u => u.userId).filter(Boolean) as string[];
  const availableUsers = mockUsers.filter(user => 
    !excludeUserIds.includes(user.id) && !selectedUserIds.includes(user.id)
  );

  const toggleUser = (user: UserType) => {
    const userPerson = userToSessionPerson(user);
    const isSelected = selectedUsers.some(u => u.userId === user.id);
    
    if (isSelected) {
      onSelect(selectedUsers.filter(u => u.userId !== user.id));
    } else {
      onSelect([...selectedUsers, userPerson]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <span className="text-muted-foreground">
            {selectedUsers.length > 0 
              ? `${selectedUsers.length} selected` 
              : placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search users..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {availableUsers.map((user) => {
                const isSelected = selectedUsers.some(u => u.userId === user.id);
                return (
                  <CommandItem
                    key={user.id}
                    value={user.name}
                    onSelect={() => toggleUser(user)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium">{user.name}</div>
                        {user.designation && (
                          <div className="text-xs text-muted-foreground">{user.designation}</div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SessionPeopleManager({ 
  sessionData, 
  onUpdate 
}: { 
  sessionData: {
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  };
  onUpdate: (data: {
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  }) => void;
}) {
  const removeHost = (userId: string) => {
    const updated = (sessionData.hosts || []).filter(h => h.userId !== userId);
    onUpdate({ ...sessionData, hosts: updated });
  };

  const removeSpeaker = (userId: string) => {
    const updated = (sessionData.speakers || []).filter(s => s.userId !== userId);
    onUpdate({ ...sessionData, speakers: updated });
  };

  const removeVolunteer = (userId: string) => {
    const updated = (sessionData.volunteers || []).filter(v => v.userId !== userId);
    onUpdate({ ...sessionData, volunteers: updated });
  };

  const excludeUserIds = [
    ...(sessionData.hosts || []).map(h => h.userId),
    ...(sessionData.speakers || []).map(s => s.userId),
    ...(sessionData.volunteers || []).map(v => v.userId)
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      {/* Hosts */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Hosts ({sessionData.hosts?.length || 0})
        </Label>
        <div className="space-y-2">
          {sessionData.hosts?.map((host) => (
            <div key={host.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={host.photo} />
                <AvatarFallback>{host.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{host.name}</span>
                  <Badge variant="outline" className="text-xs">Host</Badge>
                </div>
                {host.designation && (
                  <p className="text-xs text-muted-foreground">{host.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeHost(host.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            selectedUsers={sessionData.hosts || []}
            onSelect={(users) => onUpdate({ ...sessionData, hosts: users })}
            placeholder="Select hosts..."
            excludeUserIds={[
              ...(sessionData.speakers || []).map(s => s.userId),
              ...(sessionData.volunteers || []).map(v => v.userId)
            ].filter(Boolean) as string[]}
          />
        </div>
      </div>

      {/* Speakers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Speakers ({sessionData.speakers?.length || 0}) *
        </Label>
        <div className="space-y-2">
          {sessionData.speakers?.map((speaker) => (
            <div key={speaker.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={speaker.photo} />
                <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{speaker.name}</span>
                  <Badge variant="default" className="text-xs">Speaker</Badge>
                </div>
                {speaker.designation && (
                  <p className="text-xs text-muted-foreground">{speaker.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSpeaker(speaker.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            selectedUsers={sessionData.speakers || []}
            onSelect={(users) => onUpdate({ ...sessionData, speakers: users })}
            placeholder="Select speakers..."
            excludeUserIds={[
              ...(sessionData.hosts || []).map(h => h.userId),
              ...(sessionData.volunteers || []).map(v => v.userId)
            ].filter(Boolean) as string[]}
          />
        </div>
      </div>

      {/* Volunteers */}
      <div>
        <Label className="text-sm font-semibold mb-2 block">
          Volunteers ({sessionData.volunteers?.length || 0})
        </Label>
        <div className="space-y-2">
          {sessionData.volunteers?.map((volunteer) => (
            <div key={volunteer.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Avatar className="h-10 w-10">
                <AvatarImage src={volunteer.photo} />
                <AvatarFallback>{volunteer.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{volunteer.name}</span>
                  <Badge variant="secondary" className="text-xs">Volunteer</Badge>
                </div>
                {volunteer.designation && (
                  <p className="text-xs text-muted-foreground">{volunteer.designation}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeVolunteer(volunteer.userId!)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <UserMultiSelect
            selectedUsers={sessionData.volunteers || []}
            onSelect={(users) => onUpdate({ ...sessionData, volunteers: users })}
            placeholder="Select volunteers..."
            excludeUserIds={[
              ...(sessionData.hosts || []).map(h => h.userId),
              ...(sessionData.speakers || []).map(s => s.userId)
            ].filter(Boolean) as string[]}
          />
        </div>
      </div>
    </div>
  );
}

function AddSessionDialog({ sprint }: { sprint: Sprint }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    date: '',
    time: '',
    duration: '90',
    description: '',
    meetingLink: '',
    posterImage: ''
  });
  const [peopleData, setPeopleData] = useState<{
    hosts?: SessionPerson[];
    speakers?: SessionPerson[];
    volunteers?: SessionPerson[];
  }>({
    hosts: [],
    speakers: [],
    volunteers: []
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!peopleData.speakers || peopleData.speakers.length === 0) {
      toast.error('Please add at least one speaker for this session');
      return;
    }

    // Use the first speaker for backward compatibility with existing Session interface
    const primarySpeaker = peopleData.speakers[0];

    // Create session object
    const newSession: Session = {
      id: `ses-${Date.now()}`,
      title: formData.title,
      speaker: primarySpeaker.name,
      speakerId: primarySpeaker.userId,
      speakerPhoto: primarySpeaker.photo,
      speakerDesignation: primarySpeaker.designation,
      speakerCompany: primarySpeaker.company,
      speakerLinkedIn: primarySpeaker.linkedIn,
      hosts: peopleData.hosts,
      speakers: peopleData.speakers,
      volunteers: peopleData.volunteers,
      date: formData.date,
      time: formData.time,
      duration: `${formData.duration} minutes`,
      description: formData.description,
      meetingLink: formData.meetingLink || undefined,
      posterImage: formData.posterImage || undefined
    };

    // In a real app, this would be an API call
    console.log('Adding session to sprint:', sprint.id, newSession);
    toast.success('Session added successfully!');
    
    // Reset form
    setFormData({
      title: '',
      date: '',
      time: '',
      duration: '90',
      description: '',
      meetingLink: '',
      posterImage: ''
    });
    setPeopleData({ hosts: [], speakers: [], volunteers: [] });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Video className="h-4 w-4" />
          Add Session
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Session to {sprint.title}</DialogTitle>
          <DialogDescription>
            Create a new session for this sprint. Add session details, poster, and assign people to roles.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Session Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Session Details</h3>
            <div className="space-y-2">
              <Label>Session Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Introduction to Serverless Architecture"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Time *</Label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                  placeholder="90"
                  min="15"
                  max="300"
                />
              </div>
              <div className="space-y-2">
                <Label>Meeting Link</Label>
                <Input
                  value={formData.meetingLink}
                  onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
                  placeholder="https://meet.example.com/..."
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Session Description *</Label>
              <Textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe what participants will learn in this session..."
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Poster Image URL</Label>
              <div className="flex gap-2">
                <Input
                  value={formData.posterImage}
                  onChange={(e) => setFormData({ ...formData, posterImage: e.target.value })}
                  placeholder="https://example.com/poster.jpg"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    // In a real app, this would open a file upload dialog
                    toast.info('File upload feature will be implemented with backend');
                  }}
                >
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
              {formData.posterImage && (
                <div className="mt-2">
                  <img
                    src={formData.posterImage}
                    alt="Poster preview"
                    className="w-full h-32 object-cover rounded-lg border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* People Management */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold text-lg">Session People</h3>
            <SessionPeopleManager
              sessionData={peopleData}
              onUpdate={setPeopleData}
            />
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              Create Session
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateMeetupDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    richDescription: '',
    date: '',
    time: '',
    type: 'virtual' as 'virtual' | 'in-person' | 'hybrid',
    location: '',
    meetingLink: '',
    meetupUrl: '',
    image: '',
    maxAttendees: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const meetupData: CreateMeetupData = {
        title: formData.title,
        description: formData.description,
        richDescription: formData.richDescription || undefined,
        date: formData.date,
        time: formData.time,
        type: formData.type,
        location: formData.location || undefined,
        meetingLink: formData.meetingLink || undefined,
        meetupUrl: formData.meetupUrl || undefined,
        image: formData.image || undefined,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined
      };
      
      await createMeetup(meetupData);
      toast.success('Meetup created successfully!');
      setOpen(false);
      onSuccess?.();
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        richDescription: '',
        date: '',
        time: '',
        type: 'virtual',
        location: '',
        meetingLink: '',
        meetupUrl: '',
        image: '',
        maxAttendees: ''
      });
    } catch (error) {
      console.error('Error creating meetup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to create meetup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2"><Plus className="h-4 w-4" />Create Meetup</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Meetup</DialogTitle>
          <DialogDescription>
            Schedule a new meetup for the community. The event will be created as a draft.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input 
              placeholder="e.g., AWS Community Day"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input 
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <Input 
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Event Type *</Label>
              <Select 
                value={formData.type}
                onValueChange={(value: 'virtual' | 'in-person' | 'hybrid') => 
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual">Virtual</SelectItem>
                  <SelectItem value="in-person">In-Person</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Attendees</Label>
              <Input 
                type="number"
                placeholder="e.g., 100"
                value={formData.maxAttendees}
                onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value })}
                min="1"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Event Poster Image</Label>
            <div className="flex gap-2">
              <Input
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://example.com/poster.jpg or upload file"
                className="flex-1"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // Validate file size (max 5MB)
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error('File size must be less than 5MB');
                    return;
                  }
                  
                  setUploadingImage(true);
                  try {
                    const imageUrl = await uploadFileToS3(file, 'meetup-posters');
                    setFormData({ ...formData, image: imageUrl });
                    toast.success('Image uploaded successfully!');
                  } catch (error) {
                    console.error('Upload error:', error);
                    toast.error(error instanceof Error ? error.message : 'Failed to upload image');
                  } finally {
                    setUploadingImage(false);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Clock className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
            </div>
            {formData.image && (
              <div className="mt-2">
                <img
                  src={formData.image}
                  alt="Poster preview"
                  className="w-full h-40 object-cover rounded-lg border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload an image file or paste an image URL. Supported formats: JPEG, PNG, GIF, WebP (max 5MB)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Meetup URL *</Label>
            <Input 
              placeholder="https://www.meetup.com/..."
              value={formData.meetupUrl}
              onChange={(e) => setFormData({ ...formData, meetupUrl: e.target.value })}
              required
            />
          </div>
          
          {(formData.type === 'in-person' || formData.type === 'hybrid') && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input 
                placeholder="e.g., Tech Hub, Bangalore"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          )}
          
          {(formData.type === 'virtual' || formData.type === 'hybrid') && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input 
                placeholder="https://meet.example.com/..."
                value={formData.meetingLink}
                onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Short Description *</Label>
            <Textarea 
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the meetup..."
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Rich Description (Markdown/HTML)</Label>
            <Textarea 
              rows={8}
              value={formData.richDescription}
              onChange={(e) => setFormData({ ...formData, richDescription: e.target.value })}
              placeholder="Detailed description with markdown or HTML formatting..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports Markdown and HTML. This will be displayed on the meetup detail page.
            </p>
          </div>
          
          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Creating...' : 'Create Meetup'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ================== MEETUPS MANAGEMENT ==================

function EditMeetupDialog({ meetup, onSuccess }: { meetup: Meetup; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    title: meetup.title,
    description: meetup.description,
    richDescription: meetup.richDescription || '',
    date: meetup.date,
    time: meetup.time,
    type: meetup.type,
    location: meetup.location || '',
    meetingLink: meetup.meetingLink || '',
    meetupUrl: meetup.meetupUrl || '',
    image: meetup.image || '',
    maxAttendees: meetup.maxAttendees?.toString() || ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const updateData: UpdateMeetupData = {
        title: formData.title,
        description: formData.description,
        richDescription: formData.richDescription || undefined,
        date: formData.date,
        time: formData.time,
        type: formData.type,
        location: formData.location || undefined,
        meetingLink: formData.meetingLink || undefined,
        meetupUrl: formData.meetupUrl || undefined,
        image: formData.image || undefined,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined
      };
      
      await updateMeetup(meetup.id, updateData);
      toast.success('Meetup updated successfully!');
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error updating meetup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update meetup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Edit className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Meetup</DialogTitle>
          <DialogDescription>
            Update meetup details and description.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Input 
              placeholder="e.g., AWS Community Day"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input 
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Time *</Label>
              <Input 
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Event Type *</Label>
              <Select 
                value={formData.type}
                onValueChange={(value: 'virtual' | 'in-person' | 'hybrid') => 
                  setFormData({ ...formData, type: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="virtual">Virtual</SelectItem>
                  <SelectItem value="in-person">In-Person</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Max Attendees</Label>
              <Input 
                type="number"
                placeholder="e.g., 100"
                value={formData.maxAttendees}
                onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value })}
                min="1"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Event Poster Image</Label>
            <div className="flex gap-2">
              <Input
                value={formData.image}
                onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                placeholder="https://example.com/poster.jpg or upload file"
                className="flex-1"
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  // Validate file size (max 5MB)
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error('File size must be less than 5MB');
                    return;
                  }
                  
                  setUploadingImage(true);
                  try {
                    const imageUrl = await uploadFileToS3(file, 'meetup-posters');
                    setFormData({ ...formData, image: imageUrl });
                    toast.success('Image uploaded successfully!');
                  } catch (error) {
                    console.error('Upload error:', error);
                    toast.error(error instanceof Error ? error.message : 'Failed to upload image');
                  } finally {
                    setUploadingImage(false);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
              >
                {uploadingImage ? (
                  <Clock className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
            </div>
            {formData.image && (
              <div className="mt-2">
                <img
                  src={formData.image}
                  alt="Poster preview"
                  className="w-full h-40 object-cover rounded-lg border"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload an image file or paste an image URL. Supported formats: JPEG, PNG, GIF, WebP (max 5MB)
            </p>
          </div>
          
          <div className="space-y-2">
            <Label>Meetup URL *</Label>
            <Input 
              placeholder="https://www.meetup.com/..."
              value={formData.meetupUrl}
              onChange={(e) => setFormData({ ...formData, meetupUrl: e.target.value })}
              required
            />
          </div>
          
          {(formData.type === 'in-person' || formData.type === 'hybrid') && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input 
                placeholder="e.g., Tech Hub, Bangalore"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          )}
          
          {(formData.type === 'virtual' || formData.type === 'hybrid') && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input 
                placeholder="https://meet.example.com/..."
                value={formData.meetingLink}
                onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              />
            </div>
          )}
          
          <div className="space-y-2">
            <Label>Short Description *</Label>
            <Textarea 
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the meetup..."
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label>Rich Description (Markdown/HTML)</Label>
            <Textarea 
              rows={8}
              value={formData.richDescription}
              onChange={(e) => setFormData({ ...formData, richDescription: e.target.value })}
              placeholder="Detailed description with markdown or HTML formatting..."
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Supports Markdown and HTML. This will be displayed on the meetup detail page.
            </p>
          </div>
          
          <div className="flex gap-2 pt-4 border-t">
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? 'Updating...' : 'Update Meetup'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MeetupsManagementTab() {
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'upcoming' | 'completed'>('all');

  const loadMeetups = async () => {
    try {
      setLoading(true);
      const allMeetups = await getMeetups();
      setMeetups(allMeetups);
    } catch (error) {
      console.error('Error loading meetups:', error);
      toast.error('Failed to load meetups');
      // Fallback to mock data
      setMeetups(mockMeetups);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadMeetups();
  }, []);

  const handlePublish = async (meetup: Meetup, publish: boolean) => {
    try {
      await publishMeetup(meetup.id, publish);
      toast.success(publish ? 'Meetup published successfully!' : 'Meetup unpublished');
      loadMeetups();
    } catch (error) {
      console.error('Error publishing meetup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish meetup');
    }
  };

  const filteredMeetups = filterStatus === 'all' 
    ? meetups 
    : meetups.filter(m => m.status === filterStatus);

  const draftMeetups = meetups.filter(m => m.status === 'draft');
  const upcomingMeetups = meetups.filter(m => m.status === 'upcoming');
  const completedMeetups = meetups.filter(m => m.status === 'completed');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Manage Meetups</h2>
        <CreateMeetupDialog onSuccess={loadMeetups} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{draftMeetups.length}</div>
            <p className="text-sm text-muted-foreground">Draft</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{upcomingMeetups.length}</div>
            <p className="text-sm text-muted-foreground">Upcoming</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{completedMeetups.length}</div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{meetups.length}</div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <Button
          variant={filterStatus === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('all')}
        >
          All
        </Button>
        <Button
          variant={filterStatus === 'draft' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('draft')}
        >
          Draft ({draftMeetups.length})
        </Button>
        <Button
          variant={filterStatus === 'upcoming' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('upcoming')}
        >
          Upcoming ({upcomingMeetups.length})
        </Button>
        <Button
          variant={filterStatus === 'completed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilterStatus('completed')}
        >
          Completed ({completedMeetups.length})
        </Button>
      </div>

      {/* Meetups List */}
      {loading ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">Loading meetups...</p>
          </CardContent>
        </Card>
      ) : filteredMeetups.length === 0 ? (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Meetups Found</h3>
            <p className="text-muted-foreground">
              {filterStatus === 'all' 
                ? 'Create your first meetup to get started!' 
                : `No ${filterStatus} meetups found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredMeetups.map(meetup => (
            <Card key={meetup.id} className="glass-card">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{meetup.title}</h3>
                      <Badge 
                        variant={
                          meetup.status === 'upcoming' ? 'default' : 
                          meetup.status === 'draft' ? 'secondary' : 
                          'outline'
                        } 
                        className="capitalize"
                      >
                        {meetup.status}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {meetup.type}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {format(parseISO(meetup.date), 'MMM d, yyyy')} at {meetup.time}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-4 w-4" />
                        {meetup.attendees}/{meetup.maxAttendees || '∞'} attendees
                      </span>
                      {meetup.speakers.length > 0 && (
                        <span className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          {meetup.speakers.length} speakers
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {meetup.status === 'draft' && (
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="gap-1"
                        onClick={() => handlePublish(meetup, true)}
                      >
                        <Rocket className="h-4 w-4" />
                        Publish
                      </Button>
                    )}
                    {meetup.status === 'upcoming' && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="gap-1"
                        onClick={() => handlePublish(meetup, false)}
                      >
                        <XCircle className="h-4 w-4" />
                        Unpublish
                      </Button>
                    )}
                    <SpeakerInviteDialog 
                      eventType="meetup" 
                      eventId={meetup.id} 
                      eventTitle={meetup.title}
                    />
                    <EditMeetupDialog meetup={meetup} onSuccess={loadMeetups} />
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="gap-1"
                      onClick={() => window.open(`/meetups?id=${meetup.id}`, '_blank')}
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ================== COLLEGE CHAMPS MANAGEMENT ==================

// Create/Edit Task Dialog
function CreateTaskDialog({ task, onClose }: { task?: CollegeTask; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    points: task?.points || 100,
    category: task?.category || 'learning' as CollegeTask['category'],
    order: task?.order || predefinedTasks.length + 1
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(task ? 'Task updated successfully!' : 'Task created successfully!');
    setOpen(false);
    onClose?.();
  };

  const categoryOptions: { value: CollegeTask['category']; label: string; color: string }[] = [
    { value: 'onboarding', label: 'Onboarding', color: 'bg-blue-500' },
    { value: 'learning', label: 'Learning', color: 'bg-green-500' },
    { value: 'community', label: 'Community', color: 'bg-purple-500' },
    { value: 'event', label: 'Event', color: 'bg-amber-500' },
    { value: 'special', label: 'Special', color: 'bg-pink-500' }
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {task ? (
          <Button variant="ghost" size="sm" className="gap-1">
            <Edit className="h-4 w-4" />
          </Button>
        ) : (
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Create Task
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update the task details.' : 'Create a new predefined task for colleges to complete.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Task Title</Label>
            <Input
              placeholder="e.g., Host First Workshop"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe what needs to be done to complete this task..."
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points</Label>
              <Input
                type="number"
                value={formData.points}
                onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                min={10}
                max={1000}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Order</Label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                min={1}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value: CollegeTask['category']) =>
                setFormData({ ...formData, category: value })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map(cat => (
                  <SelectItem key={cat.value} value={cat.value}>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                      {cat.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full">
            {task ? 'Update Task' : 'Create Task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Verify Task Completion Dialog
function VerifyTaskDialog({ college, taskId }: { college: College; taskId: string }) {
  const [open, setOpen] = useState(false);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [feedback, setFeedback] = useState('');
  const task = getTaskById(taskId);
  const completion = college.completedTasks.find(t => t.taskId === taskId);

  if (!task) return null;

  const handleVerify = () => {
    toast.success(`Task verified for ${college.name}! ${task.points + bonusPoints} points awarded.`);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardCheck className="h-4 w-4" />
          Verify
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify Task Completion</DialogTitle>
          <DialogDescription>
            Verify "{task.title}" completion for {college.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{task.title}</span>
              <Badge>{task.points} pts</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{task.description}</p>
          </div>
          
          {completion?.proof && (
            <div className="space-y-2">
              <Label>Submitted Proof</Label>
              <a 
                href={completion.proof} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline flex items-center gap-1 text-sm"
              >
                <ExternalLink className="h-3 w-3" />
                View Proof
              </a>
            </div>
          )}

          <div className="space-y-2">
            <Label>Bonus Points (Optional)</Label>
            <Input
              type="number"
              value={bonusPoints}
              onChange={(e) => setBonusPoints(Number(e.target.value))}
              min={0}
              max={500}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              Total: {task.points + bonusPoints} points
            </p>
          </div>

          <div className="space-y-2">
            <Label>Feedback (Optional)</Label>
            <Textarea
              rows={2}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add feedback for the college..."
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleVerify} className="flex-1 gap-1">
              <CheckCircle className="h-4 w-4" />
              Verify & Award Points
            </Button>
            <Button variant="destructive" className="gap-1">
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Award Adhoc Points Dialog
function AwardPointsDialog({ college }: { college: College }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    reason: '',
    points: 50,
    category: 'special' as CollegeTask['category']
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success(`${formData.points} points awarded to ${college.name}!`);
    setOpen(false);
    setFormData({ reason: '', points: 50, category: 'special' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Award className="h-4 w-4" />
          Award Points
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Award Adhoc Points</DialogTitle>
          <DialogDescription>
            Award additional points to {college.name} for special achievements
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Input
              placeholder="e.g., Outstanding participation in community event"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Points</Label>
              <Input
                type="number"
                value={formData.points}
                onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                min={10}
                max={500}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value: CollegeTask['category']) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="special">Special</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="community">Community</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button type="submit" className="w-full gap-1">
            <Award className="h-4 w-4" />
            Award {formData.points} Points
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// College Management Card
function CollegeManagementCard({ college }: { college: College }) {
  const [expanded, setExpanded] = useState(false);
  const completedTaskIds = college.completedTasks.map(t => t.taskId);
  const pendingTasks = predefinedTasks.filter(t => !completedTaskIds.includes(t.id));
  const completedTasks = predefinedTasks.filter(t => completedTaskIds.includes(t.id));
  const progressPercent = (completedTasks.length / predefinedTasks.length) * 100;
  
  const lead = college.champsLeadId ? getUserById(college.champsLeadId) : null;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'onboarding': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'learning': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'community': return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
      case 'event': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'special': return 'bg-pink-500/10 text-pink-600 border-pink-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center gap-4 mb-4">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg"
              style={{ backgroundColor: college.color }}
            >
              #{college.rank}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold">{college.name}</h3>
                <Badge variant="outline" className="text-xs">{college.shortName}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  {college.totalPoints} pts
                </span>
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {completedTasks.length}/{predefinedTasks.length} tasks
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {college.members.length} members
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <AwardPointsDialog college={college} />
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Task Progress</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>

          {/* Lead Info */}
          {lead && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 mb-4">
              <Avatar className="h-8 w-8">
                <AvatarImage src={lead.avatar} />
                <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{lead.name}</p>
                <p className="text-xs text-muted-foreground">Champs Lead</p>
              </div>
            </div>
          )}

          {/* Expanded Content */}
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t pt-4 mt-4 space-y-4"
            >
              {/* Pending Tasks */}
              {pendingTasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <ListTodo className="h-4 w-4 text-amber-500" />
                    Pending Tasks ({pendingTasks.length})
                  </h4>
                  <div className="space-y-2">
                    {pendingTasks.slice(0, 3).map(task => (
                      <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-sm font-medium">
                            {task.order}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{task.title}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`text-xs ${getCategoryColor(task.category)}`}>
                                {task.category}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{task.points} pts</span>
                            </div>
                          </div>
                        </div>
                        <VerifyTaskDialog college={college} taskId={task.id} />
                      </div>
                    ))}
                    {pendingTasks.length > 3 && (
                      <p className="text-xs text-muted-foreground text-center py-2">
                        +{pendingTasks.length - 3} more pending tasks
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Completed Tasks ({completedTasks.length})
                  </h4>
                  <div className="space-y-2">
                    {completedTasks.map(task => {
                      const completion = college.completedTasks.find(t => t.taskId === task.id);
                      return (
                        <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{task.title}</p>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`text-xs ${getCategoryColor(task.category)}`}>
                                  {task.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {task.points + (completion?.bonusPoints || 0)} pts
                                  {completion?.bonusPoints && completion.bonusPoints > 0 && (
                                    <span className="text-green-500"> (+{completion.bonusPoints} bonus)</span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                          {completion?.verifiedBy && (
                            <Badge variant="secondary" className="text-xs">
                              Verified
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hosted Events */}
              {college.hostedEvents.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Hosted Events ({college.hostedEvents.length})
                  </h4>
                  <div className="space-y-2">
                    {college.hostedEvents.map(event => (
                      <div key={event.id} className="flex items-center justify-between p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseISO(event.date), 'MMM d, yyyy')} • {event.attendees} attendees
                          </p>
                        </div>
                        <Badge variant="outline">{event.pointsAwarded} pts</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// College Champs Tab Content
function CollegeChampsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const sortedColleges = [...mockColleges].sort((a, b) => a.rank - b.rank);
  const filteredColleges = sortedColleges.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.shortName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalColleges = mockColleges.length;
  const totalPoints = mockColleges.reduce((sum, c) => sum + c.totalPoints, 0);
  const totalCompletedTasks = mockColleges.reduce((sum, c) => sum + c.completedTasks.length, 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{totalColleges}</div>
            <p className="text-sm text-muted-foreground">Total Colleges</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{predefinedTasks.length}</div>
            <p className="text-sm text-muted-foreground">Predefined Tasks</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-500">{totalCompletedTasks}</div>
            <p className="text-sm text-muted-foreground">Tasks Completed</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-500">{totalPoints.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">Total Points Awarded</p>
          </CardContent>
        </Card>
      </div>

      {/* Task Management */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListTodo className="h-5 w-5 text-primary" />
                Predefined Tasks
              </CardTitle>
              <CardDescription>Manage tasks that colleges need to complete</CardDescription>
            </div>
            <CreateTaskDialog />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {predefinedTasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(task => (
              <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                    {task.order}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{task.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs capitalize">{task.category}</Badge>
                      <span className="text-xs text-muted-foreground">{task.points} pts</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <CreateTaskDialog task={task} />
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* College Management */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                College Management
              </CardTitle>
              <CardDescription>Track progress and verify task completions</CardDescription>
            </div>
            <Input
              placeholder="Search colleges..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredColleges.map(college => (
            <CollegeManagementCard key={college.id} college={college} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Members Tab Component with integrated role management and points awarding
function MembersTab() {
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>(mockUserRoles);
  const [pointActivities, setPointActivities] = useState<PointActivity[]>(mockPointActivities);
  const [userPoints, setUserPoints] = useState<Record<string, number>>(
    () => mockUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.points }), {})
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [awardForm, setAwardForm] = useState({ points: '', reason: '' });

  const filteredUsers = mockUsers.filter(user => 
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getUserRoles = (userId: string): CommunityRole[] => {
    return userRoles.filter(ur => ur.userId === userId).map(ur => ur.role);
  };

  const getUserActivities = (userId: string): PointActivity[] => {
    return pointActivities.filter(pa => pa.userId === userId).sort((a, b) => 
      new Date(b.awardedAt).getTime() - new Date(a.awardedAt).getTime()
    );
  };

  const handleToggleRole = (userId: string, role: CommunityRole) => {
    // Don't allow removing the member role
    if (role === 'member') {
      toast.error("Member role cannot be removed");
      return;
    }
    
    const existingRoleAssignment = userRoles.find(ur => ur.userId === userId && ur.role === role);
    
    if (existingRoleAssignment) {
      // Remove role
      setUserRoles(prev => prev.filter(ur => !(ur.userId === userId && ur.role === role)));
      toast.success(`Removed ${role} role`);
    } else {
      // Add role
      const newAssignment: UserRoleAssignment = {
        id: `ur-${Date.now()}`,
        userId,
        role,
        assignedAt: new Date().toISOString().split('T')[0],
        assignedBy: currentUser.id
      };
      setUserRoles(prev => [...prev, newAssignment]);
      toast.success(`Assigned ${role} role`);
    }
  };

  const handleAwardPoints = () => {
    if (!selectedUser || !awardForm.points || !awardForm.reason) {
      toast.error("Please fill in all fields");
      return;
    }

    const pointsNum = parseInt(awardForm.points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    // Create new activity
    const newActivity: PointActivity = {
      id: `pa-${Date.now()}`,
      userId: selectedUser.id,
      points: pointsNum,
      reason: awardForm.reason,
      type: 'adhoc',
      awardedBy: currentUser.id,
      awardedAt: new Date().toISOString().split('T')[0]
    };

    setPointActivities(prev => [...prev, newActivity]);
    setUserPoints(prev => ({
      ...prev,
      [selectedUser.id]: (prev[selectedUser.id] || 0) + pointsNum
    }));

    toast.success(`Awarded ${pointsNum} points to ${selectedUser.name}`);
    setAwardForm({ points: '', reason: '' });
    setIsAwardDialogOpen(false);
  };

  const getRoleInfo = (role: CommunityRole) => {
    return communityRoles.find(r => r.value === role);
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Community Members
              </CardTitle>
              <CardDescription>View members and manage their roles</CardDescription>
            </div>
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Users Table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(user => {
                  const roles = getUserRoles(user.id);
                  const currentPoints = userPoints[user.id] || user.points;
                  return (
                    <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.designation}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p className="text-muted-foreground">{user.email}</p>
                          {user.company && (
                            <p className="text-xs text-muted-foreground">{user.company}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Trophy className="h-4 w-4 text-amber-500" />
                          <span className="font-medium">{currentPoints}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog open={isDialogOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                          setIsDialogOpen(open);
                          if (!open) setSelectedUser(null);
                        }}>
                          <DialogTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsDialogOpen(true);
                              }}
                              className="gap-1"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Member Profile</DialogTitle>
                              <DialogDescription>
                                View member details and manage their roles
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4 space-y-6">
                              {/* Member Info */}
                              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                                <Avatar className="h-16 w-16">
                                  <AvatarImage src={user.avatar} />
                                  <AvatarFallback className="text-xl">{user.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                  <p className="text-lg font-semibold">{user.name}</p>
                                  <p className="text-sm text-muted-foreground">{user.email}</p>
                                  {user.designation && (
                                    <p className="text-sm text-muted-foreground">{user.designation} {user.company && `at ${user.company}`}</p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center gap-1 justify-end">
                                    <Trophy className="h-5 w-5 text-amber-500" />
                                    <span className="text-xl font-bold">{userPoints[user.id] || user.points}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground">points</p>
                                </div>
                              </div>

                              {/* Current Roles */}
                              <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <Shield className="h-4 w-4 text-primary" />
                                  Assigned Roles
                                </h4>
                                <div className="flex flex-wrap gap-2 mb-3">
                                  {roles.filter(r => r !== 'member').length > 0 ? (
                                    roles.filter(r => r !== 'member').map(role => {
                                      const roleInfo = getRoleInfo(role);
                                      return (
                                        <Badge key={role} variant="secondary" className="gap-1">
                                          <span>{roleInfo?.icon}</span>
                                          {roleInfo?.label}
                                        </Badge>
                                      );
                                    })
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No special roles assigned</p>
                                  )}
                                </div>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="gap-2 w-full justify-between">
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <UserCog className="h-4 w-4" />
                                        <span>Manage Roles</span>
                                      </div>
                                      <ChevronDown className="h-4 w-4 opacity-50" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-56 p-1" align="start">
                                    {communityRoles.filter(r => r.value !== 'member').map(role => {
                                      const hasRole = roles.includes(role.value);
                                      return (
                                        <Button
                                          key={role.value}
                                          variant="ghost"
                                          size="sm"
                                          className={`w-full justify-start gap-2 ${hasRole ? 'bg-primary/10' : ''}`}
                                          onClick={() => handleToggleRole(user.id, role.value)}
                                        >
                                          {hasRole && <Check className="h-4 w-4" />}
                                          <span>{role.icon}</span>
                                          <span>{role.label}</span>
                                        </Button>
                                      );
                                    })}
                                  </PopoverContent>
                                </Popover>
                              </div>

                              {/* Additional Actions */}
                              <div className="flex gap-2 pt-2 border-t">
                                <Button variant="outline" size="sm" className="gap-1 flex-1">
                                  <Mail className="h-4 w-4" />
                                  Send Email
                                </Button>
                                <Dialog open={isAwardDialogOpen} onOpenChange={setIsAwardDialogOpen}>
                                  <DialogTrigger asChild>
                                    <Button size="sm" className="gap-1 flex-1">
                                      <Award className="h-4 w-4" />
                                      Award Points
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Award Points to {user.name}</DialogTitle>
                                      <DialogDescription>
                                        Add ad-hoc points with a reason. This will be recorded in their activity.
                                      </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                      <div className="space-y-2">
                                        <Label>Reason / Activity Name *</Label>
                                        <Input
                                          placeholder="e.g., Community contribution, Event help..."
                                          value={awardForm.reason}
                                          onChange={(e) => setAwardForm(prev => ({ ...prev, reason: e.target.value }))}
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Number of Points *</Label>
                                        <Input
                                          type="number"
                                          placeholder="e.g., 50"
                                          min="1"
                                          value={awardForm.points}
                                          onChange={(e) => setAwardForm(prev => ({ ...prev, points: e.target.value }))}
                                        />
                                      </div>
                                      <div className="flex gap-2 pt-2">
                                        <Button variant="outline" onClick={() => setIsAwardDialogOpen(false)} className="flex-1">
                                          Cancel
                                        </Button>
                                        <Button onClick={handleAwardPoints} className="flex-1 gap-1">
                                          <Award className="h-4 w-4" />
                                          Award Points
                                        </Button>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Admin() {
  const [activeTab, setActiveTab] = useState('submissions');
  const isAdmin = currentUser.role === 'admin';
  const isSpeaker = currentUser.role === 'speaker';

  const pendingSubmissions = allSubmissions.filter(s => s.status === 'pending');
  const reviewedSubmissions = allSubmissions.filter(s => s.status !== 'pending');

  const handleSubmissionAction = (submissionId: string, action: 'approve' | 'reject', points?: number, feedback?: string) => {
    toast.success(`Submission ${action}d${points ? ` with ${points} points` : ''}`);
  };

  if (!isAdmin && !isSpeaker) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 container mx-auto px-4 py-8 flex items-center justify-center">
          <Card className="glass-card max-w-md">
            <CardContent className="p-8 text-center">
              <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <h2 className="text-xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-bold">Admin Panel</h1>
              <p className="text-muted-foreground">Manage events, sprints, and submissions</p>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-10 w-10 border-2 border-primary">
                <AvatarImage src={currentUser.avatar} />
                <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{currentUser.name}</p>
                <Badge variant="outline" className="text-xs capitalize">{currentUser.role}</Badge>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-primary">{pendingSubmissions.length}</div>
                <p className="text-sm text-muted-foreground">Pending Reviews</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-green-500">{reviewedSubmissions.filter(s => s.status === 'approved').length}</div>
                <p className="text-sm text-muted-foreground">Approved</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-amber-500">{mockSprints.length}</div>
                <p className="text-sm text-muted-foreground">Total Sprints</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-blue-500">{mockMeetups.length}</div>
                <p className="text-sm text-muted-foreground">Total Meetups</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 flex-wrap">
              <TabsTrigger value="submissions" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Submissions
                {pendingSubmissions.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    {pendingSubmissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              {isAdmin && (
                <>
                  <TabsTrigger value="sprints" className="gap-2">
                    <Rocket className="h-4 w-4" />
                    Sprints
                  </TabsTrigger>
                  <TabsTrigger value="meetups" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    Meetups
                  </TabsTrigger>
                  <TabsTrigger value="members" className="gap-2">
                    <Users className="h-4 w-4" />
                    Members
                  </TabsTrigger>
                  <TabsTrigger value="college-champs" className="gap-2">
                    <GraduationCap className="h-4 w-4" />
                    College Champs
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="submissions" className="space-y-6">
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-amber-500" />
                    Pending Reviews ({pendingSubmissions.length})
                  </CardTitle>
                  <CardDescription>
                    Review and approve/reject submissions from participants
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pendingSubmissions.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                      <p className="text-muted-foreground">All caught up! No pending submissions.</p>
                    </div>
                  ) : (
                    pendingSubmissions.map(sub => (
                      <SubmissionReview 
                        key={sub.id} 
                        submission={sub} 
                        onAction={(action, points, feedback) => handleSubmissionAction(sub.id, action, points, feedback)}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    Reviewed ({reviewedSubmissions.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {reviewedSubmissions.map(sub => (
                    <SubmissionReview 
                      key={sub.id} 
                      submission={sub} 
                      onAction={() => {}}
                    />
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {isAdmin && (
              <>
                <TabsContent value="sprints">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold">Manage Sprints</h2>
                    <CreateSprintDialog />
                  </div>
                  <div className="space-y-4">
                    {mockSprints.map(sprint => (
                      <Card key={sprint.id} className="glass-card">
                        <CardContent className="p-4">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="font-semibold text-lg">{sprint.title}</h3>
                                <Badge variant={sprint.status === 'active' ? 'default' : 'secondary'} className="capitalize">
                                  {sprint.status}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{sprint.theme}</p>
                              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Users className="h-4 w-4" />
                                  {sprint.participants} participants
                                </span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  {format(parseISO(sprint.startDate), 'MMM d')} - {format(parseISO(sprint.endDate), 'MMM d, yyyy')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <MessageSquare className="h-4 w-4" />
                                  {sprint.submissions.length} submissions
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <AddSessionDialog sprint={sprint} />
                              <SpeakerInviteDialog 
                                eventType="sprint" 
                                eventId={sprint.id} 
                                eventTitle={sprint.title}
                              />
                              <Button variant="outline" size="sm" className="gap-1">
                                <Eye className="h-4 w-4" />
                                View
                              </Button>
                              <Button variant="outline" size="sm" className="gap-1">
                                <Edit className="h-4 w-4" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="meetups">
                  <MeetupsManagementTab />
                </TabsContent>


                <TabsContent value="members">
                  <MembersTab />
                </TabsContent>

                <TabsContent value="college-champs">
                  <CollegeChampsTab />
                </TabsContent>
              </>
            )}
          </Tabs>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
}
