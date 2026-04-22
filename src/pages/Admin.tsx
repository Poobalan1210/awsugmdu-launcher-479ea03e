import { useState, useEffect, useCallback } from 'react';
import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import {
  Plus, Calendar, Users, CheckCircle, XCircle, Clock,
  Rocket, ExternalLink, MessageSquare, Award, Link2,
  Copy, Mail, Edit, Trash2, Eye, FileText, User, Video,
  Upload, X, UserPlus, Check, ChevronDown, ChevronUp, GraduationCap,
  Trophy, ListTodo, ClipboardCheck, Target, Shield, UserCog, Medal, Github, ShoppingBag, Loader2, Cloud,
  Star, Quote, Heart, Zap, CheckSquare, Square, List, Hash, Type, Code2, Sparkles
} from 'lucide-react';
import { mockSprints, mockMeetups, Submission, Sprint, Session, User as UserType, predefinedTasks, mockColleges, getTaskById, communityRoles, mockUserRoles, CommunityRole, UserRoleAssignment, PointActivity, mockPointActivities, Meetup, mockBadges, Badge as BadgeType, BadgeAward, mockBadgeAwards, BadgeCriteriaType, criteriaTypeLabels, BadgeCriteria, mockUsers, SubmissionField } from '@/data/mockData';
import { createMeetup, updateMeetup, publishMeetup, getMeetups, CreateMeetupData, UpdateMeetupData, deleteMeetup, endMeetup } from '@/lib/meetups';
import { getSpotlightSubmissions, reviewSpotlight, deleteSpotlight } from '@/lib/spotlight';
import { SpotlightSubmission, SpotlightType } from '@/data/mockData';
import { getSprints, deleteSprint, deleteSession } from '@/lib/sprints';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { getAllUsers } from '@/lib/userProfile';
import { callApi } from '@/lib/api';
import { listCertificationGroups, CertificationGroup } from '@/lib/certifications';
import { College, CollegeEvent, CollegeTask } from '@/lib/colleges';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import StoreManagement from '@/components/admin/StoreManagement';
import CertificationGroupsManagement from '@/components/admin/CertificationGroupsManagement';
import SprintsTab from '@/components/admin/tabs/SprintsTab';
import AWSEventsTab from '@/components/admin/tabs/AWSEventsTab';
import { SessionPerson, SessionPeopleManager, userToSessionPerson, userToMeetupPerson, UserSelect, UserMultiSelect, MeetupPeopleManager } from '@/components/admin/shared/AdminShared';
import { TaskSubmissionsPanel } from '@/components/college-champs/TaskSubmissionsPanel';
import { CloudClubTaskSubmissionsPanel } from '@/components/cloud-clubs/TaskSubmissionsPanel';

// Mark Attendance Dialog
function MarkAttendanceDialog({ meetup, onSuccess }: { meetup: Meetup; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailsText, setEmailsText] = useState('');
  const [pointsPerAttendee, setPointsPerAttendee] = useState(50);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [results, setResults] = useState<any>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      // Parse CSV - handle both comma and newline separated
      const emails = text
        .split(/[\n,]/)
        .map(line => {
          // Remove quotes and trim
          return line.replace(/['"]/g, '').trim();
        })
        .filter(email => {
          // Basic email validation
          return email.length > 0 && email.includes('@');
        });

      setEmailsText(emails.join('\n'));
      toast.success(`Loaded ${emails.length} email addresses from CSV`);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResults(null);

    try {
      // Parse emails from textarea (one per line or comma-separated)
      const emails = emailsText
        .split(/[\n,]/)
        .map(e => e.trim())
        .filter(e => e.length > 0);

      if (emails.length === 0) {
        toast.error('Please enter at least one email address');
        setLoading(false);
        return;
      }

      const { markMeetupAttendance } = await import('@/lib/meetups');
      const response = await markMeetupAttendance(meetup.id, {
        emails,
        pointsPerAttendee
      });

      setResults(response);

      if (response.summary.successful > 0) {
        toast.success(`Attendance marked for ${response.summary.successful} attendees!`);
        onSuccess?.();
      } else {
        toast.warning('No attendance was marked. Check the results below.');
      }
    } catch (error) {
      console.error('Error marking attendance:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to mark attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setEmailsText('');
    setPointsPerAttendee(50);
    setResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <ClipboardCheck className="h-4 w-4" />
          Mark Attendance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mark Attendance - {meetup.title}</DialogTitle>
          <DialogDescription>
            Upload a CSV file or enter email addresses manually. Points will be awarded to each attendee.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Upload CSV File</Label>
              <div className="flex gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                CSV file with email addresses (one per line or comma-separated)
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or enter manually</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Attendee Email Addresses *</Label>
              <Textarea
                placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                rows={10}
                required
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Enter one email per line or separate with commas
              </p>
            </div>

            <div className="space-y-2">
              <Label>Points per Attendee</Label>
              <Input
                type="number"
                value={pointsPerAttendee}
                onChange={(e) => setPointsPerAttendee(Number(e.target.value))}
                min={1}
                max={500}
                required
              />
              <p className="text-xs text-muted-foreground">
                Each attendee will receive this many points
              </p>
            </div>



            <div className="flex gap-2 pt-4 border-t">
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark Attendance
                  </>
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{results.summary.successful}</div>
                  <p className="text-xs text-muted-foreground">Success</p>
                </CardContent>
              </Card>
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-amber-600">{results.summary.alreadyMarked}</div>
                  <p className="text-xs text-muted-foreground">Already Marked</p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{results.summary.notFound}</div>
                  <p className="text-xs text-muted-foreground">Not Found</p>
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{results.summary.errors}</div>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </CardContent>
              </Card>
            </div>

            {/* Successful */}
            {results.results.success.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-green-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Successfully Marked ({results.results.success.length})
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {results.results.success.map((item: any, index: number) => (
                    <div key={index} className="text-sm p-2 rounded bg-green-500/5 border border-green-500/20">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{item.name}</span>
                        <Badge variant="outline" className="text-green-600">
                          +{item.pointsAwarded} pts
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{item.email}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Already Marked */}
            {results.results.alreadyMarked.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-amber-600 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Already Marked ({results.results.alreadyMarked.length})
                </h4>
                <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                  {results.results.alreadyMarked.map((email: string, index: number) => (
                    <div key={index} className="p-2 rounded bg-amber-500/5 border border-amber-500/20">
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Not Found */}
            {results.results.notFound.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-blue-600 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Users Not Found ({results.results.notFound.length})
                </h4>
                <div className="text-xs text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                  {results.results.notFound.map((email: string, index: number) => (
                    <div key={index} className="p-2 rounded bg-blue-500/5 border border-blue-500/20">
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {results.results.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-sm text-red-600 flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Errors ({results.results.errors.length})
                </h4>
                <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
                  {results.results.errors.map((item: any, index: number) => (
                    <div key={index} className="p-2 rounded bg-red-500/5 border border-red-500/20">
                      <div className="font-medium">{item.email}</div>
                      <div className="text-red-600">{item.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4 border-t">
              <Button onClick={() => { handleClose(); setOpen(false); }} className="flex-1">
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateMeetupDialog({ onSuccess, allUsers = [] }: { onSuccess?: () => void; allUsers?: UserType[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [certificationGroups, setCertificationGroups] = useState<CertificationGroup[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [cloudClubs, setCloudClubs] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    richDescription: '',
    date: '',
    time: '',
    duration: '',
    type: 'virtual' as 'virtual' | 'in-person' | 'skill-sprint' | 'certification-circle' | 'college-champ' | 'cloud-club',
    location: '',
    meetingLink: '',
    meetupUrl: '',
    image: '',
    maxAttendees: '',
    sprintId: '',
    certificationGroupId: '',
    collegeId: '',
    cloudClubId: '',
    sessionPoints: '',
    speakerPoints: '100',
    volunteerPoints: '75',
    hostPoints: '50',
    endDate: ''
  });

  const [peopleData, setPeopleData] = useState<{
    speakers?: any[];
    hosts?: any[];
    volunteers?: any[];
  }>({
    speakers: [],
    hosts: [],
    volunteers: []
  });

  // Load sprints and certification groups when dialog opens
  useEffect(() => {
    if (open) {
      loadSprints();
      loadCertificationGroups();
      loadColleges();
      loadCloudClubs();
    }
  }, [open]);

  const loadSprints = async () => {
    try {
      const allSprints = await getSprints();
      setSprints(allSprints);
    } catch (error) {
      console.error('Error loading sprints:', error);
    }
  };

  const loadCertificationGroups = async () => {
    try {
      const groups = await listCertificationGroups();
      setCertificationGroups(groups);
    } catch (error) {
      console.error('Error loading certification groups:', error);
    }
  };

  const loadColleges = async () => {
    try {
      const { getAllColleges } = await import('@/lib/colleges');
      const allColleges = await getAllColleges();
      setColleges(allColleges);
    } catch (error) {
      console.error('Error loading colleges:', error);
    }
  };

  const loadCloudClubs = async () => {
    try {
      const { getAllCloudClubs } = await import('@/lib/cloudClubs');
      const allClubs = await getAllCloudClubs();
      setCloudClubs(allClubs);
    } catch (error) {
      console.error('Error loading cloud clubs:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate sprint selection if type is skill-sprint
    if (formData.type === 'skill-sprint' && !formData.sprintId) {
      toast.error('Please select a sprint for this session');
      return;
    }

    // Validate certification group selection if type is certification-circle
    if (formData.type === 'certification-circle' && !formData.certificationGroupId) {
      toast.error('Please select a certification group for this session');
      return;
    }

    // Validate college selection if type is college-champ
    if (formData.type === 'college-champ' && !formData.collegeId) {
      toast.error('Please select a college for this session');
      return;
    }

    // Validate cloud club selection if type is cloud-club
    if (formData.type === 'cloud-club' && !formData.cloudClubId) {
      toast.error('Please select a cloud club for this session');
      return;
    }

    setLoading(true);

    try {
      const meetupData: CreateMeetupData = {
        title: formData.title,
        description: formData.description,
        richDescription: formData.richDescription || undefined,
        date: formData.date,
        time: formData.time,
        duration: formData.duration || undefined,
        type: formData.type,
        location: formData.location || undefined,
        meetingLink: formData.meetingLink || undefined,
        meetupUrl: formData.meetupUrl || undefined,
        image: formData.image || undefined,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        speakerPoints: parseInt(formData.speakerPoints) || 0,
        volunteerPoints: parseInt(formData.volunteerPoints) || 0,
        hostPoints: parseInt(formData.hostPoints) || 0,
        speakers: peopleData.speakers,
        hosts: peopleData.hosts,
        volunteers: peopleData.volunteers,
        sprintId: (formData.type === 'skill-sprint' && formData.sprintId) ? formData.sprintId : undefined,
        certificationGroupId: (formData.type === 'certification-circle' && formData.certificationGroupId) ? formData.certificationGroupId : undefined,
        collegeId: (formData.type === 'college-champ' && formData.collegeId) ? formData.collegeId : undefined,
        cloudClubId: (formData.type === 'cloud-club' && formData.cloudClubId) ? formData.cloudClubId : undefined,
        sessionPoints: ((formData.type === 'college-champ' || formData.type === 'cloud-club') && formData.sessionPoints) ? parseInt(formData.sessionPoints) : undefined,
        endDate: formData.endDate || undefined
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
        duration: '',
        type: 'virtual',
        location: '',
        meetingLink: '',
        meetupUrl: '',
        image: '',
        maxAttendees: '',
        sprintId: '',
        certificationGroupId: '',
        collegeId: '',
        cloudClubId: '',
        sessionPoints: '',
        speakerPoints: '100',
        volunteerPoints: '75',
        hostPoints: '50',
        endDate: ''
      });
      setPeopleData({
        speakers: [],
        hosts: [],
        volunteers: []
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

          {/* Event Type */}
          <div className="space-y-2">
            <Label>Event Type *</Label>
            <Select
              value={formData.type}
              onValueChange={(value: 'virtual' | 'in-person' | 'skill-sprint' | 'certification-circle' | 'college-champ' | 'cloud-club') =>
                setFormData({
                  ...formData,
                  type: value,
                  sprintId: value !== 'skill-sprint' ? '' : formData.sprintId,
                  certificationGroupId: value !== 'certification-circle' ? '' : formData.certificationGroupId,
                  collegeId: value !== 'college-champ' ? '' : formData.collegeId,
                  cloudClubId: value !== 'cloud-club' ? '' : formData.cloudClubId
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="virtual">Virtual Meetup</SelectItem>
                <SelectItem value="in-person">In-Person Meetup</SelectItem>
                <SelectItem value="skill-sprint">Skill Sprint Session</SelectItem>
                <SelectItem value="certification-circle">Certification Circle Session</SelectItem>
                <SelectItem value="college-champ">College Champ Session</SelectItem>
                <SelectItem value="cloud-club">Cloud Club Session</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {formData.type === 'skill-sprint' && 'This session will be linked to a sprint'}
              {formData.type === 'certification-circle' && 'This session will be part of the certification circle program'}
              {formData.type === 'college-champ' && 'This session will be part of the college champ program'}
              {formData.type === 'cloud-club' && 'This session will be part of the cloud club program'}
              {formData.type === 'virtual' && 'A virtual community meetup event'}
              {formData.type === 'in-person' && 'An in-person community meetup event'}
            </p>
          </div>

          {/* Sprint Selection - Only show if type is skill-sprint */}
          {formData.type === 'skill-sprint' && (
            <div className="space-y-2">
              <Label>Select Sprint *</Label>
              <Select
                value={formData.sprintId}
                onValueChange={(value) => setFormData({ ...formData, sprintId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a sprint..." />
                </SelectTrigger>
                <SelectContent>
                  {sprints.length === 0 ? (
                    <SelectItem value="none" disabled>No sprints available</SelectItem>
                  ) : (
                    sprints.map((sprint) => (
                      <SelectItem key={sprint.id} value={sprint.id}>
                        {sprint.title} ({format(parseISO(sprint.startDate), 'MMM yyyy')})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {sprints.length === 0 && (
                <p className="text-xs text-amber-600">
                  ⚠️ No sprints found. Please create a sprint first before adding sprint sessions.
                </p>
              )}
            </div>
          )}

          {/* Certification Group Selection - Only show if type is certification-circle */}
          {formData.type === 'certification-circle' && (
            <div className="space-y-2">
              <Label>Select Certification Group *</Label>
              <Select
                value={formData.certificationGroupId}
                onValueChange={(value) => setFormData({ ...formData, certificationGroupId: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a certification group..." />
                </SelectTrigger>
                <SelectContent>
                  {certificationGroups.length === 0 ? (
                    <SelectItem value="none" disabled>No certification groups available</SelectItem>
                  ) : (
                    certificationGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name} ({group.level})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {certificationGroups.length === 0 && (
                <p className="text-xs text-amber-600">
                  ⚠️ No certification groups found. Please create a certification group first.
                </p>
              )}
            </div>
          )}

          {/* College Selection - Only show if type is college-champ */}
          {formData.type === 'college-champ' && (
            <>
              <div className="space-y-2">
                <Label>Select College *</Label>
                <Select
                  value={formData.collegeId}
                  onValueChange={(value) => setFormData({ ...formData, collegeId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a college..." />
                  </SelectTrigger>
                  <SelectContent>
                    {colleges.length === 0 ? (
                      <SelectItem value="none" disabled>No colleges available</SelectItem>
                    ) : (
                      colleges.map((college) => (
                        <SelectItem key={college.id} value={college.id}>
                          {college.name} ({college.shortName})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {colleges.length === 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ No colleges found. Please register a college first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Session Points *</Label>
                <Input
                  type="number"
                  placeholder="e.g., 100"
                  value={formData.sessionPoints}
                  onChange={(e) => setFormData({ ...formData, sessionPoints: e.target.value })}
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Points awarded to the college's total score when this session is completed.
                </p>
              </div>
            </>
          )}

          {/* Cloud Club Selection - Only show if type is cloud-club */}
          {formData.type === 'cloud-club' && (
            <>
              <div className="space-y-2">
                <Label>Select Cloud Club *</Label>
                <Select
                  value={formData.cloudClubId}
                  onValueChange={(value) => setFormData({ ...formData, cloudClubId: value })}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a cloud club..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cloudClubs.length === 0 ? (
                      <SelectItem value="none" disabled>No cloud clubs available</SelectItem>
                    ) : (
                      cloudClubs.map((club) => (
                        <SelectItem key={club.id} value={club.id}>
                          {club.name} ({club.shortName})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {cloudClubs.length === 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ No cloud clubs found. Please register a cloud club first.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Session Points *</Label>
                <Input
                  type="number"
                  placeholder="e.g., 100"
                  value={formData.sessionPoints}
                  onChange={(e) => setFormData({ ...formData, sessionPoints: e.target.value })}
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Points awarded to the cloud club's total score when this session is completed.
                </p>
              </div>
            </>
          )}

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

          <div className="space-y-2">
            <Label>Duration</Label>
            <Input
              placeholder="e.g., 2 hours"
              value={formData.duration}
              onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>End Date (Optional)</Label>
            <Input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              If set, the event will automatically be marked as completed on this date. Leave empty for manual control.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
            <div className="space-y-2">
              <Label>Speaker Points</Label>
              <Input
                type="number"
                value={formData.speakerPoints}
                onChange={(e) => setFormData({ ...formData, speakerPoints: e.target.value })}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Volunteer Pts</Label>
              <Input
                type="number"
                value={formData.volunteerPoints}
                onChange={(e) => setFormData({ ...formData, volunteerPoints: e.target.value })}
                min="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Host Points</Label>
              <Input
                type="number"
                value={formData.hostPoints}
                onChange={(e) => setFormData({ ...formData, hostPoints: e.target.value })}
                min="0"
              />
            </div>
          </div>

          {/* Location - show for in-person events */}
          {formData.type === 'in-person' && (
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                placeholder="e.g., Tech Hub, Bangalore"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          )}

          {/* Meeting Link - show for virtual events */}
          {(formData.type === 'virtual' || formData.type === 'skill-sprint' || formData.type === 'certification-circle' || formData.type === 'college-champ' || formData.type === 'cloud-club') && (
            <div className="space-y-2">
              <Label>Meeting Link</Label>
              <Input
                placeholder="https://meet.example.com/..."
                value={formData.meetingLink}
                onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use meeting link for live events. After the event, replace with YouTube recording link.
              </p>
            </div>
          )}

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

          {/* People Management */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="font-semibold text-lg">Event Team</h3>
            <MeetupPeopleManager
              meetupData={peopleData}
              onUpdate={setPeopleData}
              allUsers={allUsers}
            />
          </div>

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

function EditMeetupDialog({ meetup, onSuccess, allUsers = [] }: { meetup: Meetup; onSuccess?: () => void; allUsers?: UserType[] }) {
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
    maxAttendees: meetup.maxAttendees?.toString() || '',
    sprintId: meetup.sprintId || '',
    speakerPoints: meetup.speakerPoints?.toString() || '100',
    volunteerPoints: meetup.volunteerPoints?.toString() || '75',
    hostPoints: meetup.hostPoints?.toString() || '50',
    endDate: meetup.endDate || ''
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
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined,
        speakerPoints: parseInt(formData.speakerPoints) || 0,
        volunteerPoints: parseInt(formData.volunteerPoints) || 0,
        hostPoints: parseInt(formData.hostPoints) || 0,
        sprintId: (formData.type === 'skill-sprint' && formData.sprintId) ? formData.sprintId : null,
        endDate: formData.endDate || undefined
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

          <div className="space-y-2">
            <Label>End Date (Optional)</Label>
            <Input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              If set, the event will automatically be marked as completed on this date.
            </p>
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
            <div className="col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-4">
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
              <div className="space-y-2">
                <Label>Speaker Pts</Label>
                <Input
                  type="number"
                  value={formData.speakerPoints}
                  onChange={(e) => setFormData({ ...formData, speakerPoints: e.target.value })}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Volunteer Pts</Label>
                <Input
                  type="number"
                  value={formData.volunteerPoints}
                  onChange={(e) => setFormData({ ...formData, volunteerPoints: e.target.value })}
                  min="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Host Pts</Label>
                <Input
                  type="number"
                  value={formData.hostPoints}
                  onChange={(e) => setFormData({ ...formData, hostPoints: e.target.value })}
                  min="0"
                />
              </div>
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

// End Event Dialog
function EndEventDialog({ meetup, onSuccess }: { meetup: Meetup; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const handleEnd = async () => {
    setLoading(true);
    try {
      await endMeetup(meetup.id, endDate);
      const selectedDate = new Date(endDate + 'T23:59:59');
      const now = new Date();
      if (selectedDate <= now) {
        toast.success('Event ended successfully!');
      } else {
        toast.success(`Event scheduled to end on ${format(new Date(endDate), 'MMM d, yyyy')}`);
      }
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error ending meetup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to end event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950">
          <XCircle className="h-4 w-4" />
          End Event
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>End Event</DialogTitle>
          <DialogDescription>
            End "{meetup.title}". Choose an end date — if the date is today or in the past, the event will be marked as completed immediately. A future date will schedule automatic completion.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {new Date(endDate + 'T23:59:59') <= new Date()
                ? '⚡ Event will be marked as completed immediately.'
                : `📅 Event will automatically complete on ${format(new Date(endDate), 'MMMM d, yyyy')}.`
              }
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleEnd}
            disabled={loading}
            className="gap-1 bg-amber-600 hover:bg-amber-700"
          >
            {loading ? (
              <><Clock className="h-4 w-4 animate-spin" /> Ending...</>
            ) : (
              <><XCircle className="h-4 w-4" /> Confirm End Event</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetupsManagementTab({ allUsers = [] }: { allUsers?: UserType[] }) {
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

  const handleDelete = async (meetup: Meetup) => {
    if (!confirm(`Are you sure you want to delete "${meetup.title}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteMeetup(meetup.id);
      toast.success('Meetup deleted successfully!');
      loadMeetups();
    } catch (error) {
      console.error('Error deleting meetup:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete meetup');
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
        <CreateMeetupDialog onSuccess={loadMeetups} allUsers={allUsers} />
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
                      {meetup.endDate && (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock className="h-4 w-4" />
                          {new Date(meetup.endDate) < new Date()
                            ? `Ended ${format(parseISO(meetup.endDate), 'MMM d, yyyy')}`
                            : `Ends ${format(parseISO(meetup.endDate), 'MMM d, yyyy')}`
                          }
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
                    {meetup.status === 'upcoming' && (
                      <EndEventDialog meetup={meetup} onSuccess={loadMeetups} />
                    )}
                    {(meetup.status === 'completed' || meetup.status === 'upcoming') && (
                      <MarkAttendanceDialog meetup={meetup} onSuccess={loadMeetups} />
                    )}
                    <EditMeetupDialog meetup={meetup} onSuccess={loadMeetups} allUsers={allUsers} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => window.open(`/meetups?id=${meetup.id}`, '_blank')}
                    >
                      <Eye className="h-4 w-4" />
                      View
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      onClick={() => handleDelete(meetup)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
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
function CreateTaskDialog({ task, onClose, onSuccess }: { task?: CollegeTask; onClose?: () => void; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    points: task?.points || 100,
    category: task?.category || 'learning' as CollegeTask['category'],
    order: task?.order || 1,
    isDefault: task?.isDefault || false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (task) {
        // Update existing task
        const { updateCollegeTask } = await import('@/lib/colleges');
        await updateCollegeTask(task.id, formData);
        toast.success('Task updated successfully!');
      } else {
        // Create new task
        const { createCollegeTask } = await import('@/lib/colleges');
        await createCollegeTask(formData);
        toast.success('Task created successfully!');
      }

      setOpen(false);
      onClose?.();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error('Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Default Task</Label>
                <p className="text-xs text-muted-foreground">
                  Available to all colleges automatically
                </p>
              </div>
              <Switch
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Assign Tasks to College Dialog
function AssignTasksDialog({ college, onSuccess }: { college: College; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>(college.assignedTaskIds || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allTasks, setAllTasks] = useState<CollegeTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch tasks when dialog opens
  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const { getAllCollegeTasks } = await import('@/lib/colleges');
      const tasks = await getAllCollegeTasks();
      setAllTasks(tasks);

      // Filter out any assigned task IDs that no longer exist or are now default
      const validAssignedTasks = (college.assignedTaskIds || []).filter(taskId => {
        const task = tasks.find(t => t.id === taskId);
        return task && !task.isDefault;
      });
      setSelectedTasks(validAssignedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  // Get non-default tasks that can be assigned
  const assignableTasks = allTasks.filter(task => !task.isDefault);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { assignTasksToCollege } = await import('@/lib/colleges');
      await assignTasksToCollege(college.id, selectedTasks);

      toast.success(`Tasks assigned to ${college.name}!`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error assigning tasks:', error);
      toast.error('Failed to assign tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <ListTodo className="h-4 w-4" />
          Assign Tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Tasks to {college.shortName}</DialogTitle>
          <DialogDescription>
            Select additional tasks for this college. Default tasks are automatically available to all colleges.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading tasks...</p>
            </div>
          ) : assignableTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No assignable tasks available.</p>
              <p className="text-sm">All tasks are marked as default.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Available Tasks ({assignableTasks.length})</Label>
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                {assignableTasks.map(task => (
                  <label
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedTasks.includes(task.id)
                      ? 'bg-primary/5 border-primary'
                      : 'hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center h-5">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.id)}
                        onChange={() => toggleTask(task.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{task.title}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {task.category}
                        </Badge>
                        {task.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    </div>
                    <Badge className="flex-shrink-0">{task.points} pts</Badge>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTasks.length} task(s) selected
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || assignableTasks.length === 0}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Tasks'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Verify Task Completion Dialog
function VerifyTaskDialog({ college, taskId, onSuccess }: { college: College; taskId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const task = getTaskById(taskId);
  const completion = college.completedTasks.find(t => t.taskId === taskId);

  if (!task) return null;

  const handleVerify = async () => {
    setIsSubmitting(true);
    try {
      const { completeTask } = await import('@/lib/colleges');
      await completeTask(college.id, taskId, bonusPoints, task.points);

      toast.success(`Task verified for ${college.name}! ${task.points + bonusPoints} points awarded.`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error verifying task:', error);
      toast.error('Failed to verify task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardCheck className="h-4 w-4" />
          Mark Complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Task as Complete</DialogTitle>
          <DialogDescription>
            Mark "{task.title}" as completed for {college.name}
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

          <Button onClick={handleVerify} className="w-full gap-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Marking Complete...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Mark Complete & Award Points
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Award Adhoc Points Dialog
function AwardPointsDialog({ college, onSuccess }: { college: College; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    reason: '',
    points: 50,
    category: 'special' as CollegeTask['category']
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reason || formData.points <= 0) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { updateCollege } = await import('@/lib/colleges');

      // Update college with new total points
      const newTotalPoints = college.totalPoints + formData.points;

      const newActivity = {
        id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        points: formData.points,
        reason: formData.reason,
        awardedAt: new Date().toISOString()
      };

      await updateCollege(college.id, {
        totalPoints: newTotalPoints,
        pointActivities: [...(college.pointActivities || []), newActivity]
      });

      toast.success(`${formData.points} points awarded to ${college.name}!`);
      setOpen(false);
      setFormData({ reason: '', points: 50, category: 'special' });
      onSuccess();
    } catch (error) {
      console.error('Error awarding points:', error);
      toast.error('Failed to award points');
    } finally {
      setIsSubmitting(false);
    }
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
          <Button type="submit" className="w-full gap-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Awarding...
              </>
            ) : (
              <>
                <Award className="h-4 w-4" />
                Award {formData.points} Points
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Create College Dialog
function CreateCollegeDialog({ isOpen, onOpenChange, onSuccess, allUsers = [] }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  allUsers?: UserType[];
}) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    shortName: '',
    location: '',
    champsLeadId: '',
    logo: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const logoUrl = await uploadFileToS3(file, 'college-logos');
      setFormData({ ...formData, logo: logoUrl });
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.shortName || !formData.location || !formData.champsLeadId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { createCollege } = await import('@/lib/colleges');

      // Get the selected user's name
      const selectedUser = allUsers.find(u => u.id === formData.champsLeadId);
      if (!selectedUser) {
        toast.error('Selected champs lead not found');
        return;
      }

      // Generate ID from short name if not provided
      const collegeId = formData.id || `college-${formData.shortName.toLowerCase().replace(/\s+/g, '-')}`;

      await createCollege({
        id: collegeId,
        name: formData.name,
        shortName: formData.shortName,
        location: formData.location,
        champsLead: selectedUser.name,
        champsLeadId: formData.champsLeadId,
        logo: formData.logo || undefined,
      });

      toast.success(`${formData.name} has been created`);

      // Reset form
      setFormData({
        id: '',
        name: '',
        shortName: '',
        location: '',
        champsLeadId: '',
        logo: '',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error creating college:', error);
      toast.error('Failed to create college');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add College
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New College</DialogTitle>
          <DialogDescription>
            Create a new college in the Champs program
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">College Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Indian Institute of Technology Delhi"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortName">Short Name *</Label>
            <Input
              id="shortName"
              placeholder="e.g., IIT Delhi"
              value={formData.shortName}
              onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input
              id="location"
              placeholder="e.g., New Delhi"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="champsLead">Champs Lead *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {formData.champsLeadId ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={allUsers.find(u => u.id === formData.champsLeadId)?.avatar} />
                        <AvatarFallback>
                          {allUsers.find(u => u.id === formData.champsLeadId)?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{allUsers.find(u => u.id === formData.champsLeadId)?.name}</span>
                    </div>
                  ) : (
                    "Select a champs lead"
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {allUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email}`}
                          onSelect={() => {
                            setFormData({ ...formData, champsLeadId: user.id });
                          }}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </div>
                            {formData.champsLeadId === user.id && (
                              <Check className="h-4 w-4" />
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              The selected user will be automatically added as a member
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">College Logo</Label>
            <div className="flex items-center gap-2">
              {formData.logo && (
                <img
                  src={formData.logo}
                  alt="College logo preview"
                  className="h-16 w-16 rounded-lg object-cover border"
                />
              )}
              <div className="flex-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full"
                >
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {formData.logo ? 'Change Logo' : 'Upload Logo'}
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a college logo (max 5MB, JPG/PNG)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || uploadingLogo}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create College'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Create Cloud Club Dialog
function CreateCloudClubDialog({ isOpen, onOpenChange, onSuccess, allUsers = [] }: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  allUsers?: UserType[];
}) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    shortName: '',
    location: '',
    clubLeadId: '',
    logo: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setUploadingLogo(true);
    try {
      const logoUrl = await uploadFileToS3(file, 'cloud-club-logos');
      setFormData({ ...formData, logo: logoUrl });
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.shortName || !formData.location || !formData.clubLeadId) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { createCloudClub } = await import('@/lib/cloudClubs');

      const selectedUser = allUsers.find(u => u.id === formData.clubLeadId);
      if (!selectedUser) {
        toast.error('Selected club captain not found');
        return;
      }

      const clubId = formData.id || `cloudclub-${formData.shortName.toLowerCase().replace(/\s+/g, '-')}`;

      await createCloudClub({
        id: clubId,
        name: formData.name,
        shortName: formData.shortName,
        location: formData.location,
        clubLead: selectedUser.name,
        clubLeadId: formData.clubLeadId,
        logo: formData.logo || undefined,
      });

      toast.success(`${formData.name} has been created`);

      setFormData({
        id: '',
        name: '',
        shortName: '',
        location: '',
        clubLeadId: '',
        logo: '',
      });

      onOpenChange(false);
      onSuccess();
    } catch (error) {
      console.error('Error creating cloud club:', error);
      toast.error('Failed to create cloud club');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-teal-500 hover:bg-teal-600 text-white">
          <Plus className="h-4 w-4" />
          Add Cloud Club
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Cloud Club</DialogTitle>
          <DialogDescription>
            Create a new cloud club in the program
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Club Name *</Label>
            <Input
              id="name"
              placeholder="e.g., Cloud Club at MIT"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortName">Short Name *</Label>
            <Input
              id="shortName"
              placeholder="e.g., CC MIT"
              value={formData.shortName}
              onChange={(e) => setFormData({ ...formData, shortName: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location *</Label>
            <Input
              id="location"
              placeholder="e.g., Boston"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="clubLead">Club Captain *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {formData.clubLeadId ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={allUsers.find(u => u.id === formData.clubLeadId)?.avatar} />
                        <AvatarFallback>
                          {allUsers.find(u => u.id === formData.clubLeadId)?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{allUsers.find(u => u.id === formData.clubLeadId)?.name}</span>
                    </div>
                  ) : (
                    "Select a club captain"
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {allUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email}`}
                          onSelect={() => {
                            setFormData({ ...formData, clubLeadId: user.id });
                          }}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="font-medium">{user.name}</div>
                              <div className="text-xs text-muted-foreground">{user.email}</div>
                            </div>
                            {formData.clubLeadId === user.id && (
                              <Check className="h-4 w-4" />
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              The selected user will be automatically added as a member
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="logo">Club Logo</Label>
            <div className="flex items-center gap-2">
              {formData.logo && (
                <img
                  src={formData.logo}
                  alt="Club logo preview"
                  className="h-16 w-16 rounded-lg object-cover border"
                />
              )}
              <div className="flex-1">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="w-full"
                >
                  {uploadingLogo ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {formData.logo ? 'Change Logo' : 'Upload Logo'}
                    </>
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a club logo (max 5MB, JPG/PNG)
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" className="bg-teal-500 hover:bg-teal-600 text-white" disabled={isSubmitting || uploadingLogo}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Cloud Club'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Change Champs Lead Dialog
function ChangeLeadDialog({ college, allUsers, onSuccess }: {
  college: College;
  allUsers: UserType[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(
    college.champsLeadId ? [college.champsLeadId] : []
  );
  const [searchQuery, setSearchQuery] = useState('');

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? [] : [userId]
    );
  };

  const filteredUsers = allUsers.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleChangeLead = async () => {
    if (selectedUserIds.length === 0) {
      toast.error('Please select a lead');
      return;
    }

    setIsSubmitting(true);
    try {
      const { updateCollege } = await import('@/lib/colleges');
      const selectedUsers = allUsers.filter(u => selectedUserIds.includes(u.id));

      if (selectedUsers.length === 0) {
        toast.error('Selected users not found');
        return;
      }

      // Use the first selected user as the primary lead
      const primaryLead = selectedUsers[0];
      const leadNames = selectedUsers.map(u => u.name).join(', ');

      await updateCollege(college.id, {
        champsLeadId: primaryLead.id,
        champsLead: leadNames
      });

      toast.success(`Champs lead updated for ${college.name}`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error changing lead:', error);
      toast.error('Failed to change champs lead');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <UserCog className="h-4 w-4" />
          Change Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change Champs Lead</DialogTitle>
          <DialogDescription>
            Select a champs lead for {college.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Lead */}
          <div className="p-3 rounded-lg bg-muted/30">
            <Label className="text-xs text-muted-foreground mb-2 block">Current Lead</Label>
            <p className="text-sm font-medium">{college.champsLead}</p>
          </div>

          {/* Select New Leads */}
          <div className="space-y-2">
            <Label>Select Lead</Label>

            {/* Search Input */}
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-2"
            />

            {/* User List */}
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No users found
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleUser(user.id)}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors ${isSelected ? 'bg-primary/10' : ''
                        }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-primary' : 'border-muted-foreground'
                        }`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{user.name}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleChangeLead} disabled={isSubmitting || selectedUserIds.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                `Update Lead${selectedUserIds.length > 1 ? 's' : ''}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// College Management Card
function CollegeManagementCard({ college, onDelete, onUpdate, allUsers }: {
  college: College;
  onDelete: () => void;
  onUpdate: () => void;
  allUsers: UserType[];
}) {
  const [expanded, setExpanded] = useState(false);
  const completedTaskIds = college.completedTasks.map(t => t.taskId);
  const pendingTasks = predefinedTasks.filter(t => !completedTaskIds.includes(t.id));
  const completedTasks = predefinedTasks.filter(t => completedTaskIds.includes(t.id));
  const progressPercent = (completedTasks.length / predefinedTasks.length) * 100;

  const lead = college.champsLeadId ? allUsers.find(u => u.id === college.champsLeadId) || null : null;

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
            {college.logo ? (
              <img
                src={college.logo}
                alt={`${college.name} logo`}
                className="w-12 h-12 rounded-xl object-cover shadow-lg"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-white font-bold text-lg shadow-lg"
              >
                #{college.rank}
              </div>
            )}
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
              <AssignTasksDialog college={college} onSuccess={onUpdate} />
              <AwardPointsDialog college={college} onSuccess={onUpdate} />
              <ChangeLeadDialog college={college} allUsers={allUsers} onSuccess={onUpdate} />
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            </div>
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
                        <VerifyTaskDialog college={college} taskId={task.id} onSuccess={onUpdate} />
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
                          <Badge variant="secondary" className="text-xs">
                            Completed
                          </Badge>
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
  const [colleges, setColleges] = useState<College[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [allTasks, setAllTasks] = useState<CollegeTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  // Fetch colleges from API
  useEffect(() => {
    fetchColleges();
    fetchUsers();
    fetchTasks();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setAllUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers(mockUsers);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const { getAllCollegeTasks } = await import('@/lib/colleges');
      const tasks = await getAllCollegeTasks();
      setAllTasks(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchColleges = async () => {
    try {
      setIsLoading(true);
      const { getAllColleges } = await import('@/lib/colleges');
      const data = await getAllColleges();
      setColleges(data);
    } catch (error) {
      console.error('Error fetching colleges:', error);
      toast.error('Failed to load colleges');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCollege = async (collegeId: string, collegeName: string) => {
    if (!confirm(`Are you sure you want to delete ${collegeName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { deleteCollege } = await import('@/lib/colleges');
      await deleteCollege(collegeId);
      toast.success(`${collegeName} has been deleted`);
      fetchColleges();
    } catch (error) {
      console.error('Error deleting college:', error);
      toast.error('Failed to delete college');
    }
  };

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${taskTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { deleteCollegeTask } = await import('@/lib/colleges');
      await deleteCollegeTask(taskId);
      toast.success('Task deleted successfully');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const sortedColleges = [...colleges].sort((a, b) => a.rank - b.rank);
  const filteredColleges = sortedColleges.filter(c =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.shortName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalColleges = colleges.length;
  const totalPoints = colleges.reduce((sum, c) => sum + (c.totalPoints || 0), 0);
  const totalCompletedTasks = colleges.reduce((sum, c) => sum + (c.completedTasks?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Task Submissions Review */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Task Submissions
          </CardTitle>
          <CardDescription>Review and approve task submissions from college captains</CardDescription>
        </CardHeader>
        <CardContent>
          <TaskSubmissionsPanel onSubmissionReviewed={fetchColleges} />
        </CardContent>
      </Card>

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
            <div className="text-3xl font-bold text-amber-500">{allTasks.length}</div>
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
            <CreateTaskDialog onSuccess={fetchTasks} />
          </div>
        </CardHeader>
        <CardContent>
          {loadingTasks ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Loading tasks...</p>
            </div>
          ) : allTasks.length === 0 ? (
            <div className="text-center py-8">
              <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No tasks found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allTasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(task => (
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
                    <CreateTaskDialog task={task} onSuccess={fetchTasks} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTask(task.id, task.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
              <CardDescription>Track progress and manage colleges</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search colleges..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
              <CreateCollegeDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSuccess={fetchColleges}
                allUsers={allUsers}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground mt-2">Loading colleges...</p>
            </div>
          ) : filteredColleges.length === 0 ? (
            <div className="text-center py-8">
              <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No colleges found</p>
            </div>
          ) : (
            filteredColleges.map(college => (
              <CollegeManagementCard
                key={college.id}
                college={college}
                allUsers={allUsers}
                onDelete={() => handleDeleteCollege(college.id, college.name)}
                onUpdate={fetchColleges}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Members Tab Component with integrated role management and points awarding

// ================== CLOUD CLUBS MANAGEMENT ==================

// Create/Edit Cloud Club Task Dialog
function CreateCloudClubTaskDialog({ task, onClose, onSuccess }: { task?: any; onClose?: () => void; onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    points: task?.points || 100,
    category: task?.category || 'learning',
    order: task?.order || 1,
    isDefault: task?.isDefault || false
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (task) {
        const { updateCloudClubTask } = await import('@/lib/cloudClubs');
        await updateCloudClubTask(task.id, formData);
        toast.success('Task updated successfully!');
      } else {
        const { createCloudClubTask } = await import('@/lib/cloudClubs');
        await createCloudClubTask(formData as any);
        toast.success('Task created successfully!');
      }

      setOpen(false);
      onClose?.();
      onSuccess?.();
    } catch (error) {
      console.error('Error saving task:', error);
      toast.error('Failed to save task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = [
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'Create New Task'}</DialogTitle>
          <DialogDescription>
            {task ? 'Update task details' : 'Define a new predefined task for cloud clubs'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
              onValueChange={(value: any) => setFormData({ ...formData, category: value })}
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Default Task</Label>
                <p className="text-xs text-muted-foreground">
                  Available to all clubs automatically
                </p>
              </div>
              <Switch
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
              />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Change Cloud Club Lead Dialog
function ChangeCloudClubLeadDialog({ club, allUsers, onSuccess }: { club: any; allUsers: UserType[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>(club.clubLeadId || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    const newLead = allUsers.find(u => u.id === selectedUserId);
    if (!newLead) return;

    setIsSubmitting(true);
    try {
      const { updateCloudClub } = await import('@/lib/cloudClubs');
      await updateCloudClub(club.id, {
        clubLead: newLead.name,
        clubLeadId: newLead.id
      });

      toast.success(`${newLead.name} is now the captain of ${club.name}`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error changing captain:', error);
      toast.error('Failed to update captain');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <UserCog className="h-4 w-4" />
          Change Captain
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Captain for {club.shortName}</DialogTitle>
          <DialogDescription>
            Select a new captain. They will be automatically added as a member if not already.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select User</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {selectedUserId ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={allUsers.find(u => u.id === selectedUserId)?.avatar} />
                        <AvatarFallback>
                          {allUsers.find(u => u.id === selectedUserId)?.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{allUsers.find(u => u.id === selectedUserId)?.name}</span>
                    </div>
                  ) : (
                    "Search users..."
                  )}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search users by name or email..." />
                  <CommandList>
                    <CommandEmpty>No user found.</CommandEmpty>
                    <CommandGroup>
                      {allUsers.map((user) => (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email}`}
                          onSelect={() => setSelectedUserId(user.id)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={user.avatar} />
                              <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{user.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                            </div>
                            {selectedUserId === user.id && (
                              <Check className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !selectedUserId} className="flex-1">
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Verify Cloud Club Task Dialog
function VerifyCloudClubTaskDialog({ club, taskId, task, onSuccess }: { club: any; taskId: string; task: any; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [bonusPoints, setBonusPoints] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!task) return null;

  const handleVerify = async () => {
    setIsSubmitting(true);
    try {
      const { completeClubTask } = await import('@/lib/cloudClubs');
      await completeClubTask(club.id, taskId, bonusPoints, task.points);

      toast.success(`Task verified for ${club.name}! ${task.points + bonusPoints} points awarded.`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error verifying task:', error);
      toast.error('Failed to verify task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <ClipboardCheck className="h-4 w-4" />
          Mark Complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark Task as Complete</DialogTitle>
          <DialogDescription>
            Mark "{task.title}" as completed for {club.name}
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

          <Button onClick={handleVerify} className="w-full gap-1" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Marking...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Mark Complete & Award Points
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Cloud Club Management Card
function CloudClubManagementCard({ club, onDelete, onUpdate, allUsers, allTasks }: {
  club: any;
  onDelete: () => void;
  onUpdate: () => void;
  allUsers: UserType[];
  allTasks: any[];
}) {
  const [expanded, setExpanded] = useState(false);
  const completedTaskIds = (club.completedTasks || []).map((t: any) => t.taskId);
  const clubTasks = allTasks.filter(t => t.isDefault || (club.assignedTaskIds || []).includes(t.id));
  const pendingTasks = clubTasks.filter(t => !completedTaskIds.includes(t.id));
  const completedTasksList = clubTasks.filter(t => completedTaskIds.includes(t.id));
  const progressPercent = clubTasks.length > 0 ? (completedTasksList.length / clubTasks.length) * 100 : 0;

  const lead = club.clubLeadId ? allUsers.find(u => u.id === club.clubLeadId) || null : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card overflow-hidden">
        <CardContent className="p-4">
          {/* Header */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {club.logo ? (
              <img
                src={club.logo}
                alt={`${club.name} logo`}
                className="w-12 h-12 rounded-xl object-cover shadow-lg"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-teal-500 to-teal-700 text-white font-bold text-lg shadow-lg"
              >
                #{club.rank}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold truncate">{club.name}</h3>
                <Badge variant="outline" className="text-xs shrink-0">{club.shortName}</Badge>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  {club.totalPoints || 0} pts
                </span>
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {completedTasksList.length}/{clubTasks.length} tasks
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {(club.members || []).length} members
                </span>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap justify-end shrink-0">
              <AssignCloudClubTasksDialog club={club} onSuccess={onUpdate} />
              <AwardCloudClubPointsDialog club={club} onSuccess={onUpdate} />
              <ChangeCloudClubLeadDialog club={club} allUsers={allUsers} onSuccess={onUpdate} />
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Lead Info */}
          {lead && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 mb-4">
              <Avatar className="h-8 w-8">
                <AvatarImage src={lead.avatar} />
                <AvatarFallback>{lead.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{lead.name}</p>
                <p className="text-xs text-muted-foreground">Captain</p>
              </div>
            </div>
          )}

          {/* Expanded Content */}
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-6 pt-4 border-t"
            >
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-muted-foreground">Overall Progress</span>
                  <span className="font-bold">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2 bg-teal-500/20" />
              </div>

              <Tabs defaultValue="pending" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pending">Pending Tasks ({pendingTasks.length})</TabsTrigger>
                  <TabsTrigger value="completed">Completed ({completedTasksList.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="pending" className="mt-4 space-y-3">
                  {pendingTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/10">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50 text-teal-500" />
                      <p>All assigned tasks completed! 🎉</p>
                    </div>
                  ) : (
                    pendingTasks.map(task => (
                      <div key={task.id} className="flex items-start justify-between p-3 rounded-lg border bg-card gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{task.title}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {task.category}
                            </Badge>
                            {task.isDefault && (
                              <Badge variant="secondary" className="text-[10px]">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 shadow-none">
                            {task.points} pts
                          </Badge>
                          <VerifyCloudClubTaskDialog
                            club={club}
                            taskId={task.id}
                            task={task}
                            onSuccess={onUpdate}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </TabsContent>
                <TabsContent value="completed" className="mt-4 space-y-3">
                  {completedTasksList.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/10">
                      <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No tasks completed yet.</p>
                    </div>
                  ) : (
                    completedTasksList.map(task => {
                      const completion = (club.completedTasks || []).find((t: any) => t.taskId === task.id);
                      const totalPoints = (completion?.taskPoints || task.points) + (completion?.bonusPoints || 0);

                      return (
                        <div key={task.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/50 gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium line-through text-muted-foreground">{task.title}</span>
                              <Badge variant="outline" className="text-[10px] capitalize opacity-70">
                                {task.category}
                              </Badge>
                            </div>
                            {completion?.completedAt && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <CheckCircle className="h-3 w-3 text-teal-500" />
                                Completed on {format(parseISO(completion.completedAt), 'MMM d, yyyy')}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <Badge className="bg-teal-500/10 text-teal-600 hover:bg-teal-500/20 shadow-none">
                              +{totalPoints} pts
                            </Badge>
                            {completion?.bonusPoints ? (
                              <span className="text-[10px] text-muted-foreground">
                                inc. {completion.bonusPoints} bonus
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}



// Cloud Clubs Tab Content
function CloudClubsTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [clubs, setClubs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);

  useEffect(() => {
    fetchClubs();
    fetchUsers();
    fetchTasks();
  }, []);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setAllUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers(mockUsers);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoadingTasks(true);
      const { getAllCloudClubTasks } = await import('@/lib/cloudClubs');
      const tasks = await getAllCloudClubTasks();
      setAllTasks(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load cloud club tasks');
    } finally {
      setLoadingTasks(false);
    }
  };

  const fetchClubs = async () => {
    try {
      setIsLoading(true);
      const { getAllCloudClubs } = await import('@/lib/cloudClubs');
      const data = await getAllCloudClubs();
      setClubs(data);
    } catch (error) {
      console.error('Error fetching cloud clubs:', error);
      toast.error('Failed to load cloud clubs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClub = async (clubId: string, clubName: string) => {
    if (!confirm(`Are you sure you want to delete ${clubName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { deleteCloudClub } = await import('@/lib/cloudClubs');
      await deleteCloudClub(clubId);
      toast.success(`${clubName} has been deleted`);
      fetchClubs();
    } catch (error) {
      console.error('Error deleting cloud club:', error);
      toast.error('Failed to delete cloud club');
    }
  };

  const handleDeleteTask = async (taskId: string, taskTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${taskTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { deleteCloudClubTask } = await import('@/lib/cloudClubs');
      await deleteCloudClubTask(taskId);
      toast.success('Task deleted successfully');
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const sortedClubs = [...clubs].sort((a: any, b: any) => (b.totalPoints || 0) - (a.totalPoints || 0));
  const filteredClubs = sortedClubs.filter((c: any) =>
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.shortName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalClubs = clubs.length;
  const totalPoints = clubs.reduce((sum: number, c: any) => sum + (c.totalPoints || 0), 0);
  const totalCompletedTasks = clubs.reduce((sum: number, c: any) => sum + (c.completedTasks?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* Task Submissions Review */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-teal-500" />
            Cloud Club Task Submissions
          </CardTitle>
          <CardDescription>Review and approve task submissions from cloud club captains</CardDescription>
        </CardHeader>
        <CardContent>
          <CloudClubTaskSubmissionsPanel onSubmissionReviewed={fetchClubs} />
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-teal-500">{totalClubs}</div>
            <p className="text-sm text-muted-foreground">Total Clubs</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-amber-500">{allTasks.length}</div>
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
            <div className="text-3xl font-bold text-emerald-500">{totalPoints.toLocaleString()}</div>
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
                <ListTodo className="h-5 w-5 text-teal-500" />
                Predefined Tasks
              </CardTitle>
              <CardDescription>Manage tasks that cloud clubs need to complete</CardDescription>
            </div>
            <CreateCloudClubTaskDialog onSuccess={fetchTasks} />
          </div>
        </CardHeader>
        <CardContent>
          {loadingTasks ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-500" />
              <p className="text-sm text-muted-foreground mt-2">Loading tasks...</p>
            </div>
          ) : allTasks.length === 0 ? (
            <div className="text-center py-8">
              <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No tasks found</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allTasks.sort((a, b) => (a.order || 0) - (b.order || 0)).map(task => (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-sm font-medium text-teal-600">
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
                    <CreateCloudClubTaskDialog task={task} onSuccess={fetchTasks} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteTask(task.id, task.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cloud Club Management */}
      <Card className="glass-card">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Cloud className="h-5 w-5 text-teal-500" />
                Cloud Club Management
              </CardTitle>
              <CardDescription>Track progress and manage cloud clubs</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search clubs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
              <CreateCloudClubDialog
                isOpen={isCreateDialogOpen}
                onOpenChange={setIsCreateDialogOpen}
                onSuccess={fetchClubs}
                allUsers={allUsers}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-teal-500" />
              <p className="text-sm text-muted-foreground mt-2">Loading cloud clubs...</p>
            </div>
          ) : filteredClubs.length === 0 ? (
            <div className="text-center py-8">
              <Cloud className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mt-2">No cloud clubs found</p>
            </div>
          ) : (
            filteredClubs.map((club: any) => (
              <CloudClubManagementCard
                key={club.id}
                club={club}
                allUsers={allUsers}
                allTasks={allTasks}
                onDelete={() => handleDeleteClub(club.id, club.name)}
                onUpdate={fetchClubs}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Assign Tasks to Cloud Club Dialog
function AssignCloudClubTasksDialog({ club, onSuccess }: { club: any; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedTasks, setSelectedTasks] = useState<string[]>(club.assignedTaskIds || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTasks();
    }
  }, [open]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const { getAllCloudClubTasks } = await import('@/lib/cloudClubs');
      const tasks = await getAllCloudClubTasks();
      setAllTasks(tasks);

      const validAssignedTasks = (club.assignedTaskIds || []).filter((taskId: string) => {
        const task = tasks.find(t => t.id === taskId);
        return task && !task.isDefault;
      });
      setSelectedTasks(validAssignedTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const assignableTasks = allTasks.filter(task => !task.isDefault);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { assignTasksToClub } = await import('@/lib/cloudClubs');
      await assignTasksToClub(club.id, selectedTasks);

      toast.success(`Tasks assigned to ${club.name}!`);
      setOpen(false);
      onSuccess();
    } catch (error) {
      console.error('Error assigning tasks:', error);
      toast.error('Failed to assign tasks');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleTask = (taskId: string) => {
    setSelectedTasks(prev =>
      prev.includes(taskId)
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <ListTodo className="h-4 w-4" />
          Assign Tasks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Tasks to {club.shortName}</DialogTitle>
          <DialogDescription>
            Select additional tasks for this cloud club. Default tasks are automatically available to all clubs.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading tasks...</p>
            </div>
          ) : assignableTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No assignable tasks available.</p>
              <p className="text-sm">All tasks are marked as default.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Available Tasks ({assignableTasks.length})</Label>
              <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-3">
                {assignableTasks.map(task => (
                  <label
                    key={task.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selectedTasks.includes(task.id)
                      ? 'bg-primary/5 border-primary'
                      : 'hover:bg-muted'
                      }`}
                  >
                    <div className="flex items-center h-5">
                      <input
                        type="checkbox"
                        checked={selectedTasks.includes(task.id)}
                        onChange={() => toggleTask(task.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{task.title}</span>
                        <Badge variant="outline" className="text-xs capitalize">
                          {task.category}
                        </Badge>
                        {task.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    </div>
                    <Badge className="flex-shrink-0">{task.points} pts</Badge>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedTasks.length} task(s) selected
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || assignableTasks.length === 0}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                'Assign Tasks'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Award Adhoc Points to Cloud Club Dialog
function AwardCloudClubPointsDialog({ club, onSuccess }: { club: any; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    reason: '',
    points: 50,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.reason || formData.points <= 0) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const { updateCloudClub } = await import('@/lib/cloudClubs');

      const newTotalPoints = (club.totalPoints || 0) + formData.points;

      const newActivity = {
        id: `pa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        points: formData.points,
        reason: formData.reason,
        awardedAt: new Date().toISOString()
      };

      await updateCloudClub(club.id, {
        totalPoints: newTotalPoints,
        pointActivities: [...(club.pointActivities || []), newActivity]
      });

      toast.success(`${formData.points} points awarded to ${club.name}!`);
      setOpen(false);
      setFormData({ reason: '', points: 50 });
      onSuccess();
    } catch (error) {
      console.error('Error awarding points:', error);
      toast.error('Failed to award points');
    } finally {
      setIsSubmitting(false);
    }
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
          <DialogTitle>Award Points to {club.shortName}</DialogTitle>
          <DialogDescription>
            Grant ad-hoc points for special achievements or activities outside of predefined tasks.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 bg-muted/50 p-4 rounded-lg">
            <div className="space-y-2">
              <Label>Number of Points</Label>
              <Input
                type="number"
                value={formData.points}
                onChange={(e) => setFormData({ ...formData, points: Number(e.target.value) })}
                min={1}
                max={1000}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="e.g., Outstanding performance in recent hackathon"
                required
                rows={3}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 gap-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Awarding...
                </>
              ) : (
                <>
                  <Award className="h-4 w-4" />
                  Award Points
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Members Tab Component with integrated role management and points awarding
function MembersTab({ allUsers, onRefresh }: { allUsers: UserType[]; onRefresh?: () => void }) {
  const { user: authUser, refreshUser } = useAuth();
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>(mockUserRoles);
  const [pointActivities, setPointActivities] = useState<PointActivity[]>(mockPointActivities);
  const [userPoints, setUserPoints] = useState<Record<string, number>>(
    () => allUsers.reduce((acc, u) => ({ ...acc, [u.id]: u.points }), {})
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [awardForm, setAwardForm] = useState({ points: '', reason: '' });

  // Load roles from API on mount
  useEffect(() => {
    const loadRoles = async () => {
      try {
        const { getAllUserRoles } = await import('@/lib/userRoles');
        const roles = await getAllUserRoles();
        setUserRoles(roles);
      } catch (error) {
        console.error('Error loading roles:', error);
        // Keep using mock data as fallback
      }
    };
    loadRoles();
  }, []);

  const filteredUsers = allUsers.filter(user =>
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

  const handleToggleRole = async (userId: string, role: CommunityRole) => {
    // Don't allow removing the member role
    if (role === 'member') {
      toast.error("Member role cannot be removed");
      return;
    }

    const existingRoleAssignment = userRoles.find(ur => ur.userId === userId && ur.role === role);

    try {
      if (existingRoleAssignment) {
        // Remove role
        const { removeRole } = await import('@/lib/userRoles');
        await removeRole(existingRoleAssignment.id);
        setUserRoles(prev => prev.filter(ur => !(ur.userId === userId && ur.role === role)));
        toast.success(`Removed ${role} role`);
      } else {
        // Add role
        const { assignRole } = await import('@/lib/userRoles');
        const newAssignment = await assignRole({
          userId,
          role,
          assignedBy: authUser?.id || ''
        });
        setUserRoles(prev => [...prev, newAssignment]);
        toast.success(`Assigned ${role} role`);
      }
    } catch (error) {
      console.error('Error toggling role:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update role');
    }
  };

  const handleAwardPoints = async () => {
    if (!selectedUser || !awardForm.points || !awardForm.reason) {
      toast.error("Please fill in all fields");
      return;
    }

    const pointsNum = parseInt(awardForm.points);
    if (isNaN(pointsNum) || pointsNum <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    try {
      const result = await callApi('/users/points/award', {
        method: 'POST',
        body: JSON.stringify({
          userId: selectedUser.id,
          points: pointsNum,
          reason: awardForm.reason,
          type: 'adhoc',
          awardedBy: authUser?.id || '',
        }),
      });

      const newActivity: PointActivity = {
        id: result.activity?.id || `pa-${Date.now()}`,
        userId: selectedUser.id,
        points: pointsNum,
        reason: awardForm.reason,
        type: 'adhoc',
        awardedBy: authUser?.id || '',
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
      await refreshUser();
    } catch (error) {
      console.error('Error awarding points:', error);
      toast.error('Failed to award points');
    }
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

                              {/* Meetup Verification */}
                              <div>
                                <h4 className="font-medium mb-3 flex items-center gap-2">
                                  <Link2 className="h-4 w-4 text-primary" />
                                  Meetup Verification
                                </h4>
                                {user.meetupVerified ? (
                                  <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                                    <CheckCircle className="h-5 w-5 text-green-500" />
                                    <div>
                                      <p className="text-sm font-medium text-green-700">Account Verified</p>
                                      <p className="text-xs text-green-600/80">User can join sprints and register for meetups</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                                    <div className="flex items-center gap-2">
                                      <Clock className="h-5 w-5 text-amber-500" />
                                      <div>
                                        <p className="text-sm font-medium text-amber-700">Verification Required</p>
                                        <p className="text-xs text-amber-600/80">User is currently blocked from joining sprints</p>
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="w-full bg-white hover:bg-amber-50 border-amber-200 text-amber-700"
                                      onClick={async () => {
                                        try {
                                          const { updateUserProfile } = await import('@/lib/userProfile');
                                          await updateUserProfile(user.id, {
                                            meetupVerified: true,
                                            meetupVerificationStatus: 'approved'
                                          });
                                          toast.success(`${user.name} has been verified!`);
                                          onRefresh?.();
                                        } catch (error) {
                                          console.error('Error verifying user:', error);
                                          toast.error('Failed to verify user');
                                        }
                                      }}
                                    >
                                      <CheckCircle className="h-4 w-4 mr-2" />
                                      Manually Verify Meetup Membership
                                    </Button>
                                  </div>
                                )}
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

// Badge Management Tab Component
function BadgesTab({ allUsers }: { allUsers: UserType[] }) {
  const { user: authUser, refreshUser } = useAuth();
  const [badges, setBadges] = useState<BadgeType[]>(mockBadges);
  const [badgeAwards, setBadgeAwards] = useState<BadgeAward[]>(mockBadgeAwards);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<BadgeType | null>(null);
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [awardReason, setAwardReason] = useState('');
  const [newBadge, setNewBadge] = useState({
    name: '',
    description: '',
    icon: '🏆',
    criteriaType: 'manual' as BadgeCriteriaType,
    threshold: 1
  });

  const filteredBadges = badges.filter(badge =>
    badge.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    badge.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCriteriaColor = (type: BadgeCriteriaType) => {
    switch (type) {
      case 'manual': return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
      case 'sprints_completed': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
      case 'meetups_attended': return 'bg-green-500/10 text-green-600 border-green-500/30';
      case 'submissions_approved': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'points_earned': return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
      case 'sessions_delivered': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30';
      case 'certifications_earned': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  const getUsersWithBadge = (badgeId: string) => {
    return allUsers.filter(user => user.badges.some(b => b.id === badgeId));
  };

  const getUsersWithoutBadge = (badgeId: string) => {
    return allUsers.filter(user => !user.badges.some(b => b.id === badgeId));
  };

  const handleAwardBadge = async () => {
    if (!selectedBadge || !selectedUserId) {
      toast.error('Please select a user');
      return;
    }

    const user = allUsers.find(u => u.id === selectedUserId);
    if (!user) {
      toast.error('User not found');
      return;
    }

    // Check if user already has this badge
    if (user.badges.some(b => b.id === selectedBadge.id)) {
      toast.error(`${user.name} already has this badge`);
      return;
    }

    const newBadgeForUser = {
      ...selectedBadge,
      earnedDate: new Date().toISOString().split('T')[0]
    };

    const updatedBadges = [...user.badges, newBadgeForUser];

    try {
      // Import updateUserProfile dynamically to avoid circular dependencies if any
      const { updateUserProfile } = await import('@/lib/userProfile');

      // Update user in the backend
      await updateUserProfile(selectedUserId, { badges: updatedBadges } as any);

      // Add badge to local tracking
      const newAward: BadgeAward = {
        id: `ba-${Date.now()}`,
        badgeId: selectedBadge.id,
        userId: selectedUserId,
        awardedAt: new Date().toISOString().split('T')[0],
        awardedBy: authUser?.id || '',
        reason: awardReason || 'Adhoc badge award',
        isAdhoc: true
      };

      setBadgeAwards(prev => [...prev, newAward]);

      // Update user badges in mock data to reflect immediately
      const userIndex = mockUsers.findIndex(u => u.id === selectedUserId);
      if (userIndex !== -1) {
        mockUsers[userIndex].badges.push(newBadgeForUser);
      }

      // Update user in the allUsers prop to reflect immediately in the UI
      user.badges.push(newBadgeForUser);

      toast.success(`Awarded "${selectedBadge.name}" badge to ${user.name}`);
      setSelectedUserId('');
      setAwardReason('');
      setIsAwardDialogOpen(false);

      // Refresh auth user if awarding to self
      if (authUser?.id === selectedUserId) {
        await refreshUser();
      }
    } catch (error) {
      console.error('Error awarding badge:', error);
      toast.error('Failed to award badge. Please try again.');
    }
  };

  const handleCreateBadge = () => {
    if (!newBadge.name || !newBadge.description) {
      toast.error('Please fill in all required fields');
      return;
    }

    const criteria: BadgeCriteria = {
      type: newBadge.criteriaType,
      threshold: newBadge.criteriaType !== 'manual' ? newBadge.threshold : undefined,
      description: newBadge.criteriaType === 'manual'
        ? 'Manually awarded by admins'
        : `${criteriaTypeLabels[newBadge.criteriaType]}: ${newBadge.threshold}`
    };

    const badge: BadgeType = {
      id: `b-${Date.now()}`,
      name: newBadge.name,
      description: newBadge.description,
      icon: newBadge.icon,
      criteria,
      earnedDate: new Date().toISOString().split('T')[0]
    };

    setBadges(prev => [...prev, badge]);
    toast.success(`Created badge "${badge.name}"`);
    setNewBadge({ name: '', description: '', icon: '🏆', criteriaType: 'manual', threshold: 1 });
    setIsCreateDialogOpen(false);
  };

  const emojiOptions = ['🏆', '🚀', '⭐', '🎯', '🔥', '💎', '🌟', '🎖️', '🥇', '🎓', '✨', '💡', '🤝', '✍️', '🔒', '☁️', '📜', '🎤'];

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Medal className="h-5 w-5 text-primary" />
            Badge Management
          </h2>
          <p className="text-sm text-muted-foreground">Create badges and award them to community members</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Badge
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Badge</DialogTitle>
              <DialogDescription>
                Create a custom badge to award to community members
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Badge Name *</Label>
                <Input
                  placeholder="e.g., Community Champion"
                  value={newBadge.name}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  placeholder="e.g., Awarded to exceptional community contributors"
                  value={newBadge.description}
                  onChange={(e) => setNewBadge(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full text-2xl h-12">
                        {newBadge.icon}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64">
                      <div className="grid grid-cols-6 gap-2">
                        {emojiOptions.map(emoji => (
                          <Button
                            key={emoji}
                            variant="ghost"
                            className="h-10 w-10 text-xl p-0"
                            onClick={() => setNewBadge(prev => ({ ...prev, icon: emoji }))}
                          >
                            {emoji}
                          </Button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Award Criteria *</Label>
                  <Select
                    value={newBadge.criteriaType}
                    onValueChange={(value: BadgeCriteriaType) =>
                      setNewBadge(prev => ({ ...prev, criteriaType: value }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual Award Only</SelectItem>
                      <SelectItem value="sprints_completed">Sprints Completed</SelectItem>
                      <SelectItem value="meetups_attended">Meetups Attended</SelectItem>
                      <SelectItem value="submissions_approved">Submissions Approved</SelectItem>
                      <SelectItem value="points_earned">Points Earned</SelectItem>
                      <SelectItem value="sessions_delivered">Sessions Delivered</SelectItem>
                      <SelectItem value="certifications_earned">Certifications Earned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {newBadge.criteriaType !== 'manual' && (
                <div className="space-y-2">
                  <Label>Threshold (e.g., complete {newBadge.threshold} {newBadge.criteriaType.replace('_', ' ')})</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newBadge.threshold}
                    onChange={(e) => setNewBadge(prev => ({ ...prev, threshold: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              )}
              <Button onClick={handleCreateBadge} className="w-full gap-1">
                <Plus className="h-4 w-4" />
                Create Badge
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Input
        placeholder="Search badges..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="max-w-md"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-primary">{badges.length}</div>
            <p className="text-sm text-muted-foreground">Total Badges</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-500">
              {badges.filter(b => b.criteria.type === 'manual').length}
            </div>
            <p className="text-sm text-muted-foreground">Manual</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-500">
              {badges.filter(b => b.criteria.type !== 'manual').length}
            </div>
            <p className="text-sm text-muted-foreground">Auto-Award</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-500">
              {badgeAwards.length}
            </div>
            <p className="text-sm text-muted-foreground">Total Awarded</p>
          </CardContent>
        </Card>
      </div>

      {/* Badges Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredBadges.map(badge => {
          const usersWithBadge = getUsersWithBadge(badge.id);
          return (
            <Card key={badge.id} className="glass-card hover-lift">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{badge.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{badge.name}</h3>
                      <Badge className={getCriteriaColor(badge.criteria.type)}>
                        {badge.criteria.type === 'manual' ? 'Manual' : 'Auto'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1 italic">
                      {badge.criteria.description}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">{badge.description}</p>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex -space-x-2">
                        {usersWithBadge.slice(0, 4).map(user => (
                          <Avatar key={user.id} className="h-6 w-6 border-2 border-background">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback className="text-xs">{user.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {usersWithBadge.length > 4 && (
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                            +{usersWithBadge.length - 4}
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {usersWithBadge.length} awarded
                      </span>
                    </div>
                    <Dialog
                      open={isAwardDialogOpen && selectedBadge?.id === badge.id}
                      onOpenChange={(open) => {
                        setIsAwardDialogOpen(open);
                        if (!open) setSelectedBadge(null);
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1"
                          onClick={() => {
                            setSelectedBadge(badge);
                            setIsAwardDialogOpen(true);
                          }}
                        >
                          <Award className="h-4 w-4" />
                          Award Badge
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle className="flex items-center gap-2">
                            <span className="text-2xl">{badge.icon}</span>
                            Award "{badge.name}"
                          </DialogTitle>
                          <DialogDescription>
                            Select a member to award this badge to
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="space-y-2">
                            <Label>Select Member *</Label>
                            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                              <SelectTrigger><SelectValue placeholder="Choose a member..." /></SelectTrigger>
                              <SelectContent>
                                {getUsersWithoutBadge(badge.id).map(user => (
                                  <SelectItem key={user.id} value={user.id}>
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.avatar} />
                                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                      </Avatar>
                                      {user.name}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Reason (Optional)</Label>
                            <Input
                              placeholder="e.g., Outstanding contribution to..."
                              value={awardReason}
                              onChange={(e) => setAwardReason(e.target.value)}
                            />
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => setIsAwardDialogOpen(false)}
                              className="flex-1"
                            >
                              Cancel
                            </Button>
                            <Button onClick={handleAwardBadge} className="flex-1 gap-1">
                              <Award className="h-4 w-4" />
                              Award Badge
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredBadges.length === 0 && (
        <Card className="glass-card">
          <CardContent className="p-12 text-center">
            <Medal className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Badges Found</h3>
            <p className="text-muted-foreground">
              {searchQuery ? 'No badges match your search.' : 'Create your first badge to get started!'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const spotlightTypeConfig: Record<string, { label: string; icon: typeof Code2; color: string }> = {
  project: { label: 'Project', icon: Code2, color: 'text-violet-400' },
  blog: { label: 'Blog', icon: FileText, color: 'text-sky-400' },
  video: { label: 'Video', icon: Video, color: 'text-rose-400' },
  other: { label: 'Other', icon: Sparkles, color: 'text-amber-400' },
};

function SpotlightManagementTab({
  spotlightSubmissions,
  pendingSpotlights,
  approvedSpotlights,
  rejectedSpotlights,
  loading,
  onRefresh,
  authUser,
}: {
  spotlightSubmissions: SpotlightSubmission[];
  pendingSpotlights: SpotlightSubmission[];
  approvedSpotlights: SpotlightSubmission[];
  rejectedSpotlights: SpotlightSubmission[];
  loading: boolean;
  onRefresh: () => void;
  authUser: any;
}) {
  const [reviewPoints, setReviewPoints] = useState<Record<string, number>>({});
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    setActionLoading(id);
    try {
      const pts = status === 'approved' ? (reviewPoints[id] || 0) : 0;
      await reviewSpotlight(id, {
        status,
        points: pts,
        adminNotes: reviewNotes[id] || undefined,
        reviewedBy: authUser?.id || '',
        reviewerName: authUser?.name,
      });
      toast.success(`Spotlight ${status}${pts > 0 ? ` with ${pts} points` : ''}`);
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to review');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this spotlight submission?')) return;
    try {
      await deleteSpotlight(id);
      toast.success('Spotlight deleted');
      onRefresh();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete');
    }
  };

  const renderSpotlightCard = (sub: SpotlightSubmission, showActions: boolean) => {
    const config = spotlightTypeConfig[sub.type] || spotlightTypeConfig.other;
    const Icon = config.icon;

    return (
      <Card key={sub.id} className="glass-card overflow-hidden border-border/40 hover:border-primary/30 transition-all duration-300">
        <CardContent className="p-0">
          <div className="flex flex-col lg:flex-row">
            {/* Image / Type preview */}
            <div className="lg:w-48 h-32 lg:h-auto flex-shrink-0 relative overflow-hidden bg-muted/30">
              {sub.imageUrl ? (
                <img src={sub.imageUrl} alt={sub.title} className="w-full h-full object-cover" />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Icon className={`h-12 w-12 ${config.color} opacity-40`} />
                </div>
              )}
              <div className="absolute top-2 left-2">
                <Badge className={`bg-background/80 backdrop-blur-sm border-border/50 ${config.color} gap-1 py-0.5 px-2 text-[10px] font-bold uppercase tracking-wider`}>
                  <Icon className="h-3 w-3" />
                  {config.label}
                </Badge>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-bold text-sm truncate">{sub.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{sub.description}</p>
                </div>
                <Badge
                  className={`capitalize font-semibold text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${sub.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      sub.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                    }`}
                >
                  {sub.status}
                </Badge>
              </div>

              {/* Tags */}
              {sub.tags && sub.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {sub.tags.map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold uppercase tracking-wider bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded-full border border-border/40">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* User & Link */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Avatar className="h-6 w-6 border border-border/50">
                    <AvatarImage src={sub.userAvatar} />
                    <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">{sub.userName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground">{sub.userName}</span>
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </span>
                </div>
                <a href={sub.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" /> View
                </a>
              </div>

              {/* Review result info */}
              {sub.status !== 'pending' && (
                <div className="text-[10px] text-muted-foreground flex items-center gap-3 pt-1 border-t border-border/30">
                  {sub.points > 0 && <span className="font-bold text-amber-500">⭐ {sub.points} pts</span>}
                  {sub.reviewerName && <span>Reviewed by {sub.reviewerName}</span>}
                  {sub.adminNotes && <span className="italic">&ldquo;{sub.adminNotes}&rdquo;</span>}
                </div>
              )}

              {/* Action buttons for pending submissions */}
              {showActions && sub.status === 'pending' && (
                <div className="pt-3 border-t border-border/30 space-y-3">
                  {/* Points */}
                  <div className="flex items-center gap-3">
                    <Label className="text-[11px] font-bold min-w-fit">Award Points</Label>
                    <div className="relative flex-1 max-w-[140px]">
                      <Input
                        type="number"
                        value={reviewPoints[sub.id] || 0}
                        onChange={(e) => setReviewPoints({ ...reviewPoints, [sub.id]: Number(e.target.value) })}
                        className="h-8 text-xs pl-7 font-bold"
                        min={0}
                        max={1000}
                      />
                      <Star className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-500" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-6 text-[10px] font-bold ${showNotes[sub.id] ? 'text-primary' : 'text-muted-foreground'}`}
                      onClick={() => setShowNotes({ ...showNotes, [sub.id]: !showNotes[sub.id] })}
                    >
                      {showNotes[sub.id] ? 'Cancel' : 'Add Note +'}
                    </Button>
                  </div>
                  {/* Notes */}
                  <AnimatePresence>
                    {showNotes[sub.id] && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                        <Textarea
                          placeholder="Admin notes..."
                          value={reviewNotes[sub.id] || ''}
                          onChange={(e) => setReviewNotes({ ...reviewNotes, [sub.id]: e.target.value })}
                          className="text-xs min-h-[60px] resize-none"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-9 text-xs font-bold"
                      disabled={actionLoading === sub.id}
                      onClick={() => handleReview(sub.id, 'rejected')}
                    >
                      {actionLoading === sub.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="h-9 text-xs font-bold bg-[#f97316] hover:bg-[#ea580c] text-white"
                      disabled={actionLoading === sub.id}
                      onClick={() => handleReview(sub.id, 'approved')}
                    >
                      {actionLoading === sub.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3.5 w-3.5 mr-1" />}
                      Approve
                    </Button>
                  </div>
                </div>
              )}

              {/* Delete button for reviewed submissions */}
              {sub.status !== 'pending' && (
                <div className="pt-2">
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] text-destructive hover:text-destructive" onClick={() => handleDelete(sub.id)}>
                    <Trash2 className="h-3 w-3 mr-1" /> Remove
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">Loading spotlight submissions...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Star className="h-5 w-5 text-amber-500" />
          Community Spotlight Management
        </h2>
        <Badge variant="outline" className="text-xs">{spotlightSubmissions.length} total</Badge>
      </div>

      {/* Pending */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide text-amber-500">
          <Clock className="h-4 w-4" />
          Pending Review ({pendingSpotlights.length})
        </h3>
        {pendingSpotlights.length === 0 ? (
          <div className="bg-muted/30 rounded-lg py-8 text-center">
            <Check className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">All spotlight submissions have been reviewed.</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {pendingSpotlights.map((sub) => renderSpotlightCard(sub, true))}
          </div>
        )}
      </div>

      {/* Approved */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between items-center py-4 border-t rounded-none hover:bg-muted/50 group">
            <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide text-emerald-500">
              <CheckCircle className="h-4 w-4" />
              Approved ({approvedSpotlights.length})
            </div>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {approvedSpotlights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No approved spotlights yet.</p>
          ) : (
            approvedSpotlights.map((sub) => renderSpotlightCard(sub, false))
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Rejected */}
      <Collapsible defaultOpen={false}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between items-center py-4 border-t rounded-none hover:bg-muted/50 group">
            <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide text-destructive">
              <XCircle className="h-4 w-4" />
              Rejected ({rejectedSpotlights.length})
            </div>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
          {rejectedSpotlights.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No rejected submissions.</p>
          ) : (
            rejectedSpotlights.map((sub) => renderSpotlightCard(sub, false))
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function Admin() {
  const { user: authUser, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState('sprints');
  const [meetupCount, setMeetupCount] = useState(0);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loadingSprints, setLoadingSprints] = useState(false);
  const [spotlightSubmissions, setSpotlightSubmissions] = useState<SpotlightSubmission[]>([]);
  const [loadingSpotlight, setLoadingSpotlight] = useState(false);
  
  const isAdmin = authUser?.role === 'organiser' || authUser?.role === 'admin';
  const isSpeaker = authUser?.role === 'speaker';

  // Derived submission stats
  const allSubmissions = sprints.flatMap(s => 
    (s.submissions || []).map(sub => ({ ...sub, sprintTitle: s.title, sprintId: s.id }))
  );
  const pendingSubmissions = allSubmissions.filter(s => s.status === 'pending');
  const reviewedSubmissions = allSubmissions.filter(s => s.status !== 'pending');

  const pendingSpotlights = spotlightSubmissions.filter(s => s.status === 'pending');
  const approvedSpotlights = spotlightSubmissions.filter(s => s.status === 'approved');
  const rejectedSpotlights = spotlightSubmissions.filter(s => s.status === 'rejected');

  // Fetch users from API
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const fetchedUsers = await getAllUsers();
      setAllUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      setAllUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };


  // Fetch sprints from API (for dashboard stats)
  const fetchSprints = useCallback(async () => {
    setLoadingSprints(true);
    try {
      const fetchedSprints = await getSprints();
      setSprints(fetchedSprints);
    } catch (error) {
      console.error('Error fetching sprints for stats:', error);
      setSprints([]);
    } finally {
      setLoadingSprints(false);
    }
  }, []);

  // Fetch meetups from API (for header stats only)
  const fetchMeetupCount = async () => {
    try {
      const allMeetups = await getMeetups();
      setMeetupCount(allMeetups.length);
    } catch (error) {
      console.error('Error fetching meetups for stats:', error);
      setMeetupCount(0);
    }
  };

  // Fetch spotlight submissions
  const fetchSpotlightSubmissions = async () => {
    setLoadingSpotlight(true);
    try {
      const allSpotlight = await getSpotlightSubmissions();
      setSpotlightSubmissions(allSpotlight);
    } catch (error) {
      console.error('Error fetching spotlight submissions:', error);
      setSpotlightSubmissions([]);
    } finally {
      setLoadingSpotlight(false);
    }
  };


  // Delete session
  const handleDeleteSession = async (sprintId: string, sessionId: string, sessionTitle: string) => {
    if (!confirm(`Are you sure you want to delete "${sessionTitle}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteSession(sprintId, sessionId);
      toast.success('Session deleted successfully');
      fetchSprints();
    } catch (error) {
      console.error('Error deleting session:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete session');
    }
  };


  // Load users and meetup stats when component mounts
  useEffect(() => {
    if (isAdmin) {
      fetchUsers();
      fetchMeetupCount();
      fetchSprints();
    }
  }, [isAdmin]);

  // Load spotlight submissions when spotlight tab is active
  useEffect(() => {
    if (isAdmin && activeTab === 'spotlight') {
      fetchSpotlightSubmissions();
    }
  }, [isAdmin, activeTab]);


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
                <div className="text-3xl font-bold text-amber-500">{sprints.length}</div>
                <p className="text-sm text-muted-foreground">Total Sprints</p>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-blue-500">{meetupCount}</div>
                <p className="text-sm text-muted-foreground">Total Meetups</p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6 flex-wrap">
              <TabsTrigger value="sprints" className="gap-2">
                <Rocket className="h-4 w-4" />
                Sprints
                {pendingSubmissions.length > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                    {pendingSubmissions.length}
                  </Badge>
                )}
              </TabsTrigger>
              {isAdmin && (
                <>
                  <TabsTrigger value="meetups" className="gap-2">
                    <Calendar className="h-4 w-4" />
                    Meetups
                  </TabsTrigger>
                  <TabsTrigger value="store" className="gap-2">
                    <ShoppingBag className="h-4 w-4" />
                    Store
                  </TabsTrigger>
                  <TabsTrigger value="members" className="gap-2">
                    <Users className="h-4 w-4" />
                    Members
                  </TabsTrigger>
                  <TabsTrigger value="badges" className="gap-2">
                    <Medal className="h-4 w-4" />
                    Badges
                  </TabsTrigger>
                  <TabsTrigger value="college-champs" className="gap-2">
                    <GraduationCap className="h-4 w-4" />
                    College Champs
                  </TabsTrigger>
                  <TabsTrigger value="cloud-clubs" className="gap-2">
                    <Cloud className="h-4 w-4" />
                    Cloud Clubs
                  </TabsTrigger>
                  <TabsTrigger value="certifications" className="gap-2">
                    <Award className="h-4 w-4" />
                    Certifications
                  </TabsTrigger>
                  <TabsTrigger value="spotlight" className="gap-2">
                    <Star className="h-4 w-4" />
                    Spotlight
                    {pendingSpotlights.length > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center">
                        {pendingSpotlights.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="aws-events" className="gap-2">
                    <Award className="h-4 w-4" />
                    AWS Events
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="sprints" className="space-y-6">
              <SprintsTab isAdmin={isAdmin} isSpeaker={isSpeaker} authUser={authUser} onRefreshStats={fetchSprints} />
            </TabsContent>

            <TabsContent value="aws-events" className="space-y-6">
              <AWSEventsTab />
            </TabsContent>

            {isAdmin && (
              <>
                <TabsContent value="meetups">
                  <MeetupsManagementTab allUsers={allUsers} />
                </TabsContent>

                <TabsContent value="store">
                  <StoreManagement />
                </TabsContent>

                <TabsContent value="members">
                  <MembersTab allUsers={allUsers} onRefresh={fetchUsers} />
                </TabsContent>

                <TabsContent value="badges">
                  <BadgesTab allUsers={allUsers} />
                </TabsContent>

                <TabsContent value="college-champs">
                  <CollegeChampsTab />
                </TabsContent>

                <TabsContent value="cloud-clubs">
                  <CloudClubsTab />
                </TabsContent>

                <TabsContent value="certifications">
                  <CertificationGroupsManagement allUsers={allUsers} />
                </TabsContent>

                <TabsContent value="spotlight">
                  <SpotlightManagementTab
                    spotlightSubmissions={spotlightSubmissions}
                    pendingSpotlights={pendingSpotlights}
                    approvedSpotlights={approvedSpotlights}
                    rejectedSpotlights={rejectedSpotlights}
                    loading={loadingSpotlight}
                    onRefresh={fetchSpotlightSubmissions}
                    authUser={authUser}
                  />
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
