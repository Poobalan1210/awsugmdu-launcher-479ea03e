import { useState, useMemo, useEffect } from 'react';
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Rocket, Calendar, Users, Github, MessageSquare, 
  Video, Send, ThumbsUp, Clock, ExternalLink,
  ChevronRight, ChevronDown, Linkedin, User,
  CheckCircle, Image, FileText, PlayCircle, Link2, Youtube
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { mockSprints, mockForumPosts, Sprint, Session, currentUser, mockUsers, getUserById } from '@/data/mockData';
import { getSprints, getSprint, registerForSprint, registerForSession } from '@/lib/sprints';
import { format, parseISO, isPast } from 'date-fns';
import { marked } from 'marked';
import { useAuth } from '@/contexts/AuthContext';

// Helper to parse markdown or HTML content
function parseContent(content: string): string {
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) {
    return content;
  }
  return marked.parse(content) as string;
}

// Helper to format time with AM/PM
function formatTime(time: string): string {
  if (!time) return '';
  // Extract time part (e.g., "10:00" from "10:00 IST")
  const timeMatch = time.match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return time;
  
  const hours = parseInt(timeMatch[1], 10);
  const minutes = timeMatch[2];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  
  return `${displayHours}:${minutes} ${ampm}`;
}

function SprintCard({ sprint, onSelect }: { sprint: Sprint; onSelect: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card hover-lift cursor-pointer h-full" onClick={onSelect}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between mb-4">
            <span className="text-sm text-muted-foreground">
              {format(parseISO(sprint.startDate), 'MMM yyyy')}
            </span>
          </div>
          
          <h3 className="text-xl font-bold mb-2">{sprint.title}</h3>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {sprint.description}
          </p>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {sprint.participants}
            </div>
            <div className="flex items-center gap-1">
              <Video className="h-4 w-4" />
              {sprint.sessions.length} sessions
            </div>
          </div>
          
          <Button size="sm" className="w-full gap-1">
            View Details
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function SessionCard({ session: initialSession, sprint, isExpanded, onToggle, onSprintUpdate }: { 
  session: Session;
  sprint: Sprint;
  isExpanded: boolean;
  onToggle: () => void;
  onSprintUpdate?: (updatedSprint: Sprint) => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  // Get the latest session from sprint to ensure we have updated registeredUsers
  const session = sprint.sessions?.find(s => s.id === initialSession.id) || initialSession;
  const sessionDate = session.date ? parseISO(session.date) : new Date();
  const isUpcoming = session.date ? !isPast(sessionDate) : true;
  // Check registration status from the updated session
  const isRegistered = user && session.registeredUsers && Array.isArray(session.registeredUsers) && session.registeredUsers.includes(user.id);
  
  // Update when sprint changes
  useEffect(() => {
    // This will trigger re-render when sprint updates
  }, [sprint, session.registeredUsers]);

  const parsedDescription = useMemo(() => {
    if (session.richDescription) {
      return parseContent(session.richDescription);
    }
    return null;
  }, [session.richDescription]);

  const handleRegister = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to register for this session');
      return;
    }

    if (!session.meetupUrl) {
      toast.error('Meetup URL not available');
      return;
    }

    setIsRegistering(true);
    try {
      const result = await registerForSession(sprint.id, session.id, user.id);
      
      // Update sprint data with the response
      if (result.sprint && onSprintUpdate) {
        onSprintUpdate(result.sprint);
      }
      
      if (result.alreadyRegistered) {
        toast.info('You are already registered for this session');
      } else {
        toast.success('Successfully registered for the session!');
      }
      
      // Redirect to meetup URL after a short delay
      setTimeout(() => {
        if (session.meetupUrl) {
          window.open(session.meetupUrl, '_blank', 'noopener,noreferrer');
        }
      }, 1000);
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to register for session');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="glass-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{session.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {session.speakers && session.speakers.length > 0 
                      ? session.speakers.map(s => s.name).join(', ')
                      : session.speaker}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  {session.date && (
                    <p className="text-sm font-medium">{format(parseISO(session.date), 'MMM d, yyyy')}</p>
                  )}
                  {!session.date && (
                    <p className="text-sm font-medium text-muted-foreground">Date TBD</p>
                  )}
                  {session.time && (
                    <p className="text-xs text-muted-foreground">{formatTime(session.time)}</p>
                  )}
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </motion.div>
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-border">
              {/* Action Buttons - At the top */}
              <div className="p-6 pb-4 border-b">
                <div className="flex flex-wrap gap-3">
                  {isUpcoming ? (
                    <>
                      {session.meetupUrl && (
                        <Button 
                          size="lg" 
                          className="gap-2"
                          onClick={handleRegister}
                          disabled={isRegistering || isRegistered}
                        >
                          {isRegistering ? (
                            <>
                              <Clock className="h-4 w-4 animate-spin" />
                              Registering...
                            </>
                          ) : isRegistered ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Registered
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-4 w-4" />
                              Register on Meetup
                            </>
                          )}
                        </Button>
                      )}
                      {session.meetingLink && (
                        <Button variant="outline" size="lg" asChild className="gap-2">
                          <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                            <Video className="h-4 w-4" />
                            Join Session
                          </a>
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {session.meetupUrl && (
                        <Button size="lg" asChild className="gap-2">
                          <a href={session.meetupUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            View on Meetup
                          </a>
                        </Button>
                      )}
                      {session.meetingLink && (
                        <Button size="lg" asChild className="gap-2">
                          <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                            <Video className="h-4 w-4" />
                            Join Session
                          </a>
                        </Button>
                      )}
                    </>
                  )}
                  {session.youtubeUrl && (
                    <Button variant="outline" size="lg" asChild className="gap-2">
                      <a href={session.youtubeUrl} target="_blank" rel="noopener noreferrer">
                        <Youtube className="h-4 w-4" />
                        Watch on YouTube
                      </a>
                    </Button>
                  )}
                  {session.recordingUrl && (
                    <Button variant="outline" size="lg" asChild className="gap-2">
                      <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer">
                        <PlayCircle className="h-4 w-4" />
                        Watch Recording
                      </a>
                    </Button>
                  )}
                  {session.slidesUrl && (
                    <Button variant="outline" size="lg" asChild className="gap-2">
                      <a href={session.slidesUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4" />
                        View Slides
                      </a>
                    </Button>
                  )}
                </div>
              </div>

              {/* Two Column Layout */}
              <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
                {/* Left Column - Content */}
                <div className="lg:col-span-3 space-y-6">
                  {/* Session People */}
                <div>
                  <h4 className="font-semibold mb-4">Session Team</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Collect all team members with their roles */}
                    {(() => {
                      const teamMembers: Array<{
                        id: string;
                        name: string;
                        photo?: string;
                        designation?: string;
                        company?: string;
                        userId?: string;
                        role: 'Host' | 'Speaker' | 'Volunteer';
                        badgeVariant: 'outline' | 'default' | 'secondary';
                      }> = [];
                      
                      let index = 1;
                      
                      // Add hosts
                      if (session.hosts && session.hosts.length > 0) {
                        session.hosts.forEach((host) => {
                          teamMembers.push({
                            id: host.userId || `host-${index++}`,
                            name: host.name,
                            photo: host.photo,
                            designation: host.designation,
                            userId: host.userId,
                            role: 'Host',
                            badgeVariant: 'outline'
                          });
                        });
                      }
                      
                      // Add speakers
                      if (session.speakers && session.speakers.length > 0) {
                        session.speakers.forEach((speaker) => {
                          teamMembers.push({
                            id: speaker.userId || `speaker-${index++}`,
                            name: speaker.name,
                            photo: speaker.photo,
                            designation: speaker.designation,
                            company: speaker.company,
                            userId: speaker.userId,
                            role: 'Speaker',
                            badgeVariant: 'default'
                          });
                        });
                      }
                      
                      // Add volunteers
                      if (session.volunteers && session.volunteers.length > 0) {
                        session.volunteers.forEach((volunteer) => {
                          teamMembers.push({
                            id: volunteer.userId || `volunteer-${index++}`,
                            name: volunteer.name,
                            photo: volunteer.photo,
                            designation: volunteer.designation,
                            userId: volunteer.userId,
                            role: 'Volunteer',
                            badgeVariant: 'secondary'
                          });
                        });
                      }
                      
                      return teamMembers.map((member, idx) => (
                        <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <span className="text-sm font-medium text-muted-foreground min-w-[24px]">
                            {idx + 1}.
                          </span>
                          <Avatar className={`h-12 w-12 ${member.role === 'Speaker' ? 'border-2 border-primary/30' : ''}`}>
                            <AvatarImage src={member.photo} alt={member.name} />
                            <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {member.userId ? (
                                <Link 
                                  to={`/profile/${member.userId}`}
                                  className="font-medium hover:text-primary transition-colors"
                                >
                                  {member.name}
                                </Link>
                              ) : (
                                <span className="font-medium">{member.name}</span>
                              )}
                              <Badge variant={member.badgeVariant} className="text-xs">{member.role}</Badge>
                            </div>
                            {member.designation && (
                              <p className="text-xs text-muted-foreground">
                                {member.designation}
                                {member.company && ` at ${member.company}`}
                              </p>
                            )}
                          </div>
                        </div>
                      ));
                    })()}

                  </div>
                </div>

                {/* Session Details */}
                <div>
                  <h4 className="font-semibold mb-2">About this Session</h4>
                  {parsedDescription ? (
                    <div 
                      className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: parsedDescription }}
                    />
                  ) : (
                    <p className="text-muted-foreground">{session.description}</p>
                  )}
                </div>

                {/* Agenda */}
                {session.agenda && session.agenda.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-3">Session Agenda</h4>
                    <ul className="space-y-2">
                      {session.agenda.map((item, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                </div>

                {/* Right Column - Poster */}
                {session.posterImage && (
                  <div className="lg:col-span-2">
                    <div className="sticky top-6">
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <img 
                          src={session.posterImage} 
                          alt={session.title}
                          className="w-full h-auto rounded-lg shadow-lg object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}


function JoinSprintDialog({ sprint, open, onOpenChange, onSuccess }: { 
  sprint: Sprint; 
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    designation: user?.designation || '',
    company: user?.company || '',
    experience: '',
    expectations: ''
  });

  const isRegistered = user && sprint.registeredUsers?.includes(user.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Joining sprint:', sprint.id, formData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Join {sprint.title}</DialogTitle>
          <DialogDescription>
            Register to participate in this sprint and access all resources.
          </DialogDescription>
        </DialogHeader>
        
        {isRegistered ? (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">You're Already Registered!</h3>
            <p className="text-muted-foreground">
              You have access to all sprint resources, sessions, and the discussion forum.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input 
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input 
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  placeholder="e.g., Software Engineer"
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input 
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g., Tech Corp"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Experience Level</Label>
              <select 
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
                value={formData.experience}
                onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
              >
                <option value="">Select your experience level</option>
                <option value="beginner">Beginner - Just starting out</option>
                <option value="intermediate">Intermediate - Some experience</option>
                <option value="advanced">Advanced - Experienced practitioner</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>What do you hope to learn?</Label>
              <Textarea 
                value={formData.expectations}
                onChange={(e) => setFormData({ ...formData, expectations: e.target.value })}
                placeholder="Share your learning goals..."
                rows={3}
              />
            </div>
            <Button type="submit" className="w-full">
              <Rocket className="h-4 w-4 mr-2" />
              Join Sprint
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SprintDetail({ sprint: initialSprint, onBack }: { sprint: Sprint; onBack: () => void }) {
  const { user, isAuthenticated } = useAuth();
  const forumPosts = mockForumPosts.filter((p) => p.sprintId === initialSprint.id);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [sprint, setSprint] = useState<Sprint>(initialSprint);
  const isRegistered = user && sprint.registeredUsers && Array.isArray(sprint.registeredUsers) && sprint.registeredUsers.includes(user.id);

  // Refresh sprint data
  const refreshSprint = async () => {
    try {
      const updatedSprint = await getSprint(sprint.id);
      setSprint(updatedSprint);
    } catch (error) {
      console.error('Error refreshing sprint:', error);
    }
  };

  // Update sprint when it changes externally
  useEffect(() => {
    setSprint(initialSprint);
  }, [initialSprint]);

  // Handle sprint update from child components
  const handleSprintUpdate = (updatedSprint: Sprint) => {
    setSprint(updatedSprint);
    // Immediately update to reflect changes in UI
    // Also refresh from server to ensure consistency
    setTimeout(() => {
      refreshSprint();
    }, 500);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>← Back</Button>
      </div>

      <div className="glass-card p-6 md:p-8 rounded-lg">
        <h1 className="text-3xl font-bold mb-4">{sprint.title}</h1>
        <p className="text-muted-foreground mb-6">{sprint.description}</p>
        
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>
              {format(parseISO(sprint.startDate), 'MMM d')} - {format(parseISO(sprint.endDate), 'MMM d, yyyy')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span>{sprint.participants} participants</span>
          </div>
          {sprint.githubRepo && (
            <a 
              href={sprint.githubRepo} 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-primary hover:underline"
            >
              <Github className="h-4 w-4" />
              Starter Code
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

      </div>

      <JoinSprintDialog 
        sprint={sprint} 
        open={joinDialogOpen} 
        onOpenChange={setJoinDialogOpen}
        onSuccess={refreshSprint}
      />

      <Tabs defaultValue="sessions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 max-w-lg">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="forum">Discussion</TabsTrigger>
          <TabsTrigger value="submit">Submit</TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <div className="space-y-4">
            {sprint.sessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                sprint={sprint}
                isExpanded={expandedSession === session.id}
                onToggle={() => setExpandedSession(
                  expandedSession === session.id ? null : session.id
                )}
                onSprintUpdate={handleSprintUpdate}
              />
            ))}
            {sprint.sessions.length === 0 && (
              <Card className="glass-card">
                <CardContent className="p-8 text-center">
                  <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Sessions will be announced soon!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Participants Tab */}
        <TabsContent value="participants">
          <div className="space-y-6">
            {sprint.sessions && sprint.sessions.length > 0 ? (
              sprint.sessions.map((sessionItem) => {
                const sessionParticipants = sessionItem.registeredUsers || [];
                return (
                  <Card key={sessionItem.id} className="glass-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        {sessionItem.title}
                      </CardTitle>
                      <CardDescription>
                        {sessionParticipants.length} participant{sessionParticipants.length !== 1 ? 's' : ''} registered
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {sessionParticipants.length > 0 ? (
                          sessionParticipants.map((userId) => {
                            let displayUser = getUserById(userId);
                            
                            // If user not found in mockUsers, check if it's the current authenticated user
                            if (!displayUser && user && userId === user.id) {
                              displayUser = user;
                            }
                            
                            // Fallback display for users not in mockUsers or current user
                            if (!displayUser) {
                              // Extract a display name from userId (could be email or UUID)
                              const displayName = userId.includes('@') 
                                ? userId.split('@')[0] 
                                : `User ${userId.substring(0, 8)}`;
                              
                              return (
                                <motion.div
                                  key={userId}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                >
                                  <Avatar className="h-12 w-12 border-2 border-primary/20">
                                    <AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium truncate block">
                                      {displayName}
                                    </span>
                                    <p className="text-sm text-muted-foreground truncate">
                                      Participant
                                    </p>
                                  </div>
                                  <Badge variant="secondary" className="shrink-0">
                                    0 pts
                                  </Badge>
                                </motion.div>
                              );
                            }
                            
                            return (
                              <motion.div
                                key={userId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                              >
                                <Avatar className="h-12 w-12 border-2 border-primary/20">
                                  <AvatarImage src={displayUser.avatar} alt={displayUser.name} />
                                  <AvatarFallback>{displayUser.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <Link 
                                    to={`/profile/${displayUser.id}`}
                                    className="font-medium hover:text-primary transition-colors truncate block"
                                  >
                                    {displayUser.name}
                                  </Link>
                                  <p className="text-sm text-muted-foreground truncate">
                                    {displayUser.designation || 'Participant'}
                                  </p>
                                  {displayUser.company && (
                                    <p className="text-xs text-muted-foreground truncate">{displayUser.company}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="shrink-0">
                                  {displayUser.points} pts
                                </Badge>
                              </motion.div>
                            );
                          })
                        ) : (
                          <div className="col-span-full text-center py-4">
                            <p className="text-sm text-muted-foreground">No participants registered for this session yet.</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card className="glass-card">
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No sessions available yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Forum Tab */}
        <TabsContent value="forum">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Sprint Discussion Forum
              </CardTitle>
              <CardDescription>
                Ask questions, share learnings, and help fellow participants
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* New Post Form */}
              <div className="mb-6 p-4 rounded-lg bg-muted/50">
                <div className="flex gap-4">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback>{user?.name?.charAt(0) || 'U'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <Input placeholder="Post title..." />
                    <Textarea placeholder="Share your thoughts or ask a question..." rows={3} />
                    <Button size="sm">
                      <Send className="h-4 w-4 mr-2" />
                      Post
                    </Button>
                  </div>
                </div>
              </div>

              {/* Posts */}
              <div className="space-y-4">
                {forumPosts.map((post) => (
                  <Card key={post.id} className="border">
                    <CardContent className="p-4">
                      <div className="flex gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={post.userAvatar} />
                          <AvatarFallback>{post.userName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{post.userName}</span>
                            <span className="text-sm text-muted-foreground">
                              · {format(parseISO(post.createdAt), 'MMM d')}
                            </span>
                          </div>
                          <h4 className="font-medium mb-2">{post.title}</h4>
                          <p className="text-sm text-muted-foreground mb-3">{post.content}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <button className="flex items-center gap-1 hover:text-primary transition-colors">
                              <ThumbsUp className="h-4 w-4" />
                              {post.likes}
                            </button>
                            <button className="flex items-center gap-1 hover:text-primary transition-colors">
                              <MessageSquare className="h-4 w-4" />
                              {post.replies.length} replies
                            </button>
                            <button 
                              className="flex items-center gap-1 hover:text-primary transition-colors"
                              onClick={() => {
                                const url = `${window.location.origin}/skill-sprint?post=${post.id}`;
                                navigator.clipboard.writeText(url);
                                toast.success('Link copied to clipboard!');
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                              Share
                            </button>
                          </div>
                          {/* Replies */}
                          {post.replies.length > 0 && (
                            <div className="mt-4 pl-4 border-l-2 border-muted space-y-3">
                              {post.replies.slice(0, 2).map((reply) => (
                                <div key={reply.id} className="flex gap-3">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={reply.userAvatar} />
                                    <AvatarFallback>{reply.userName.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 text-sm">
                                      <span className="font-medium">{reply.userName}</span>
                                      <span className="text-muted-foreground">· {format(parseISO(reply.createdAt), 'MMM d')}</span>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{reply.content}</p>
                                    <button 
                                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                                      onClick={() => {
                                        const url = `${window.location.origin}/skill-sprint?reply=${reply.id}`;
                                        navigator.clipboard.writeText(url);
                                        toast.success('Link copied to clipboard!');
                                      }}
                                    >
                                      <Link2 className="h-3 w-3" />
                                      Share
                                    </button>
                                  </div>
                                </div>
                              ))}
                              {post.replies.length > 2 && (
                                <button className="text-sm text-primary hover:underline">
                                  View all {post.replies.length} replies
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Submit Tab */}
        <TabsContent value="submit">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                Submit Your Work
              </CardTitle>
              <CardDescription>
                Share your blog post or project repository to earn points
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="blog-url">Blog Post URL (Optional)</Label>
                  <Input 
                    id="blog-url" 
                    type="url" 
                    placeholder="https://dev.to/your-post" 
                  />
                  <p className="text-xs text-muted-foreground">
                    Share your learning journey through a blog post
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="repo-url">Repository URL (Optional)</Label>
                  <Input 
                    id="repo-url" 
                    type="url" 
                    placeholder="https://github.com/username/project" 
                  />
                  <p className="text-xs text-muted-foreground">
                    Link to your project repository
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    id="description" 
                    placeholder="Tell us about what you built and learned..."
                    rows={4}
                  />
                </div>

                <Button type="submit" className="w-full">
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Review
                </Button>
              </form>

              {/* Past Submissions */}
              {sprint.submissions.length > 0 && (
                <div className="mt-8 pt-8 border-t">
                  <h3 className="font-semibold mb-4">Community Submissions</h3>
                  <div className="space-y-3">
                    {sprint.submissions.map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={sub.userAvatar} />
                            <AvatarFallback>{sub.userName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{sub.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(sub.submittedAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <Badge variant={sub.status === 'approved' ? 'default' : 'secondary'}>
                          {sub.status === 'approved' ? `+${sub.points} pts` : sub.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

export default function SkillSprint() {
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch sprints from API
  useEffect(() => {
    const fetchSprints = async () => {
      try {
        const fetchedSprints = await getSprints();
        setSprints(fetchedSprints);
      } catch (error) {
        console.error('Error fetching sprints:', error);
        // Fallback to mock data if API fails
        setSprints(mockSprints);
      } finally {
        setLoading(false);
      }
    };
    fetchSprints();
  }, []);

  const activeSprints = sprints.filter((s) => s.status === 'active');
  const upcomingSprints = sprints.filter((s) => s.status === 'upcoming');
  const completedSprints = sprints.filter((s) => s.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {loading ? (
          <div className="text-center py-12">
            <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Loading sprints...</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {selectedSprint ? (
              <SprintDetail 
                key="detail"
                sprint={selectedSprint} 
                onBack={() => setSelectedSprint(null)} 
              />
            ) : (
              <motion.div
                key="list"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
              {/* Hero */}
              <motion.div 
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                  <Rocket className="h-4 w-4" />
                  Monthly Hands-on Challenges
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">Builders Skill Sprint</h1>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                  Each month, dive into a specific AWS theme with virtual sessions, hands-on challenges, 
                  and a supportive community. Build real projects and earn points!
                </p>
              </motion.div>

              {/* Active Sprints */}
              {activeSprints.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                    Active Sprint
                  </h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {activeSprints.map((sprint, index) => (
                      <motion.div
                        key={sprint.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <SprintCard 
                          sprint={sprint} 
                          onSelect={() => setSelectedSprint(sprint)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* Upcoming Sprints */}
              {upcomingSprints.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold mb-6">Upcoming Sprints</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {upcomingSprints.map((sprint, index) => (
                      <motion.div
                        key={sprint.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <SprintCard 
                          sprint={sprint} 
                          onSelect={() => setSelectedSprint(sprint)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}

              {/* Completed Sprints */}
              {completedSprints.length > 0 && (
                <section>
                  <h2 className="text-2xl font-bold mb-6">Past Sprints</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {completedSprints.map((sprint, index) => (
                      <motion.div
                        key={sprint.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <SprintCard 
                          sprint={sprint} 
                          onSelect={() => setSelectedSprint(sprint)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      <Footer />
    </div>
  );
}
