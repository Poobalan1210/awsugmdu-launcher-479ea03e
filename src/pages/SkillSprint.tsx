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
  CheckCircle, Image, FileText, PlayCircle, Link2, Youtube,
  Upload, X
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { mockForumPosts, Sprint, Session, currentUser, getUserByIdAsync, Meetup, User as UserType } from '@/data/mockData';
import { getSprints, getSprint, registerForSprint, registerForSession, submitWork } from '@/lib/sprints';
import { getMeetupsBySprint, registerForMeetup } from '@/lib/meetups';
import { getAllUsers } from '@/lib/userProfile';
import { uploadFileToS3 } from '@/lib/s3Upload';
import { format, parseISO, isPast } from 'date-fns';
import { marked } from 'marked';
import { useAuth } from '@/contexts/AuthContext';
import { DiscussionForum } from '@/components/DiscussionForum';

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

function SprintCard({ sprint, sessionCount, onSelect }: { sprint: Sprint; sessionCount?: number; onSelect: () => void }) {
  const [participantCount, setParticipantCount] = useState(sprint.participants || 0);

  // Fetch participant count only
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch fresh sprint data to get latest registeredUsers count
        const { getSprint } = await import('@/lib/sprints');
        const freshSprint = await getSprint(sprint.id);
        
        // Get participant count from registeredUsers array
        const registeredCount = freshSprint.registeredUsers?.length || 0;
        setParticipantCount(registeredCount);
      } catch (error) {
        console.error('Error fetching sprint data:', error);
        // Fallback to sprint.participants if API fails
        setParticipantCount(sprint.participants || 0);
      }
    };
    fetchData();
  }, [sprint.id, sprint.participants]);

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
              {participantCount}
            </div>
            <div className="flex items-center gap-1">
              <Video className="h-4 w-4" />
              {sessionCount} sessions
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

// Meetup Session Card - for sessions created as meetups
function MeetupSessionCard({ meetup, isExpanded, onToggle }: { 
  meetup: Meetup;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const [isRegistering, setIsRegistering] = useState(false);
  const sessionDate = parseISO(meetup.date);
  const isUpcoming = !isPast(sessionDate);
  const isRegistered = user && meetup.registeredUsers?.includes(user.id);

  const parsedDescription = useMemo(() => {
    if (meetup.richDescription) {
      return parseContent(meetup.richDescription);
    }
    return null;
  }, [meetup.richDescription]);

  const handleRegister = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to register for this session');
      return;
    }

    if (!meetup.meetupUrl) {
      toast.error('Meetup URL not available');
      return;
    }

    setIsRegistering(true);
    try {
      const result = await registerForMeetup(meetup.id, user.id);
      
      if (result.alreadyRegistered) {
        toast.info('You are already registered for this session');
      } else {
        toast.success('Successfully registered for the session!');
      }
      
      setTimeout(() => {
        if (meetup.meetupUrl) {
          window.open(meetup.meetupUrl, '_blank', 'noopener,noreferrer');
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
      <Card className="glass-card overflow-hidden border-l-4 border-l-primary/50">
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <Badge variant="outline" className="shrink-0">Meetup</Badge>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate">{meetup.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">
                    {meetup.speakers && meetup.speakers.length > 0 
                      ? meetup.speakers.map(s => s.name).join(', ')
                      : 'Community Session'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{format(sessionDate, 'MMM d, yyyy')}</p>
                  {meetup.time && (
                    <p className="text-xs text-muted-foreground">{formatTime(meetup.time)}</p>
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
              {/* Action Buttons */}
              <div className="p-6 pb-4 border-b">
                <div className="flex flex-wrap gap-3">
                  {isUpcoming ? (
                    <>
                      {meetup.meetupUrl && (
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
                      {meetup.meetingLink && (
                        <Button variant="outline" size="lg" asChild className="gap-2">
                          <a href={meetup.meetingLink} target="_blank" rel="noopener noreferrer">
                            <Video className="h-4 w-4" />
                            Join Session
                          </a>
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {meetup.meetupUrl && (
                        <Button size="lg" asChild className="gap-2">
                          <a href={meetup.meetupUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            View on Meetup
                          </a>
                        </Button>
                      )}
                      {meetup.meetingLink && (
                        <Button variant="outline" size="lg" asChild className="gap-2">
                          <a href={meetup.meetingLink} target="_blank" rel="noopener noreferrer">
                            <PlayCircle className="h-4 w-4" />
                            Watch Recording
                          </a>
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 space-y-6">
                  {/* Session Team */}
                  {(meetup.speakers?.length > 0 || meetup.hosts?.length > 0 || meetup.volunteers?.length > 0) && (
                    <div>
                      <h4 className="font-semibold mb-4">Session Team</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {meetup.hosts?.map((host, idx) => (
                          <div key={`host-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
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
                          </div>
                        ))}
                        {meetup.speakers?.map((speaker, idx) => (
                          <div key={`speaker-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Avatar className="h-10 w-10 border-2 border-primary/30">
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
                          </div>
                        ))}
                        {meetup.volunteers?.map((volunteer, idx) => (
                          <div key={`volunteer-${idx}`} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
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
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <h4 className="font-semibold mb-2">About this Session</h4>
                    {parsedDescription ? (
                      <div 
                        className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground"
                        dangerouslySetInnerHTML={{ __html: parsedDescription }}
                      />
                    ) : (
                      <p className="text-muted-foreground">{meetup.description}</p>
                    )}
                  </div>
                </div>

                {/* Poster */}
                {meetup.image && (
                  <div className="lg:col-span-2">
                    <div className="sticky top-6">
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <img 
                          src={meetup.image} 
                          alt={meetup.title}
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

function SubmitWorkForm({ sprint, onSuccess }: { sprint: Sprint; onSuccess?: () => void }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [blogUrl, setBlogUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [comments, setComments] = useState('');
  const [supportingFiles, setSupportingFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setSupportingFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (index: number) => {
    setSupportingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Please log in to submit work');
      return;
    }

    // Validate AWS Builder Center URL
    if (blogUrl) {
      const builderUrlPattern = /^https:\/\/builder\.aws\.com\/content\/[a-zA-Z0-9]+\/.+$/;
      if (!builderUrlPattern.test(blogUrl)) {
        toast.error('Please provide a valid AWS Builder Center URL (e.g., https://builder.aws.com/content/...)');
        return;
      }
    }

    // Validate GitHub URL
    if (githubUrl) {
      const githubUrlPattern = /^https:\/\/(www\.)?github\.com\/.+\/.+$/;
      if (!githubUrlPattern.test(githubUrl)) {
        toast.error('Please provide a valid GitHub repository URL');
        return;
      }
    }

    // At least one URL is required
    if (!blogUrl && !githubUrl) {
      toast.error('Please provide at least one of: AWS Builder Center blog URL or GitHub repository URL');
      return;
    }

    setLoading(true);
    try {
      // Upload supporting documents if any
      let uploadedDocUrls: string[] = [];
      if (supportingFiles.length > 0) {
        setUploadingFiles(true);
        try {
          uploadedDocUrls = await Promise.all(
            supportingFiles.map(file => uploadFileToS3(file, 'meetup-posters'))
          );
          toast.success(`Uploaded ${supportingFiles.length} supporting document(s)`);
        } catch (error) {
          console.error('Error uploading files:', error);
          toast.error('Failed to upload some files. Continuing with submission...');
        } finally {
          setUploadingFiles(false);
        }
      }

      // Submit work
      await submitWork(sprint.id, {
        userId: user.id,
        userName: user.name,
        userAvatar: user.avatar,
        blogUrl: blogUrl || undefined,
        githubUrl: githubUrl || undefined,
        comments: comments || undefined,
        supportingDocuments: uploadedDocUrls.length > 0 ? uploadedDocUrls : undefined,
      });

      toast.success('Work submitted successfully! Awaiting review.');
      
      // Reset form
      setBlogUrl('');
      setGithubUrl('');
      setComments('');
      setSupportingFiles([]);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Submission error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to submit work');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          Submit Your Work
        </CardTitle>
        <CardDescription>
          Share your AWS Builder Center blog post and/or GitHub repository to earn points
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="blog-url">
              AWS Builder Center Blog URL <span className="text-muted-foreground text-xs">(Optional)</span>
            </Label>
            <Input 
              id="blog-url" 
              type="url" 
              placeholder="https://builder.aws.com/content/..." 
              value={blogUrl}
              onChange={(e) => setBlogUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Share your learning journey through an AWS Builder Center blog post
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-url">
              GitHub Repository URL <span className="text-muted-foreground text-xs">(Optional)</span>
            </Label>
            <Input 
              id="github-url" 
              type="url" 
              placeholder="https://github.com/username/project" 
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Link to your project repository
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supporting-docs">
              Supporting Documents <span className="text-muted-foreground text-xs">(Optional)</span>
            </Label>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input 
                  id="supporting-docs"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('supporting-docs')?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Files
                </Button>
                <span className="text-xs text-muted-foreground">
                  Screenshots, diagrams, or other supporting materials
                </span>
              </div>
              
              {supportingFiles.length > 0 && (
                <div className="space-y-2">
                  {supportingFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea 
              id="comments" 
              placeholder="Tell us about what you built and learned..."
              rows={4}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading || uploadingFiles}>
            {loading || uploadingFiles ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                {uploadingFiles ? 'Uploading files...' : 'Submitting...'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for Review
              </>
            )}
          </Button>
        </form>

        {/* Past Submissions */}
        {sprint.submissions && sprint.submissions.length > 0 && (
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
                  <div className="flex items-center gap-2">
                    {sub.blogUrl && (
                      <a 
                        href={sub.blogUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                      </a>
                    )}
                    {sub.githubUrl && (
                      <a 
                        href={sub.githubUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    )}
                    <Badge variant={sub.status === 'approved' ? 'default' : 'secondary'}>
                      {sub.status === 'approved' ? `+${sub.points} pts` : sub.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function JoinSprintDialog({ sprint, open, onOpenChange, onSuccess }: { 
  sprint: Sprint; 
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    designation: user?.designation || '',
    company: user?.company || '',
    experience: '',
    expectations: ''
  });

  const isRegistered = user && sprint.registeredUsers?.includes(user.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !user) {
      toast.error('Please log in to join this sprint');
      return;
    }

    setLoading(true);
    try {
      const result = await registerForSprint(sprint.id, user.id);
      
      if (result.alreadyRegistered) {
        toast.info('You are already registered for this sprint');
      } else {
        toast.success('Successfully joined the sprint!');
      }
      
      onOpenChange(false);
      // Pass the updated sprint data back
      if (onSuccess) {
        onSuccess();
      }
      // Force page reload to refresh all data
      window.location.reload();
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to join sprint');
    } finally {
      setLoading(false);
    }
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Rocket className="h-4 w-4 mr-2" />
                  Join Sprint
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SprintDetail({ sprint: initialSprint, onBack, defaultTab = 'sessions' }: { sprint: Sprint; onBack: () => void; defaultTab?: string }) {
  const { user, isAuthenticated } = useAuth();
  const forumPosts = mockForumPosts.filter((p) => p.sprintId === initialSprint.id);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [sprint, setSprint] = useState<Sprint>(initialSprint);
  const [meetupSessions, setMeetupSessions] = useState<Meetup[]>([]);
  const [loadingMeetups, setLoadingMeetups] = useState(true);
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

  // Fetch meetup sessions linked to this sprint
  const fetchMeetupSessions = async () => {
    setLoadingMeetups(true);
    try {
      const meetups = await getMeetupsBySprint(sprint.id);
      setMeetupSessions(meetups);
    } catch (error) {
      console.error('Error fetching meetup sessions:', error);
      setMeetupSessions([]);
    } finally {
      setLoadingMeetups(false);
    }
  };

  // Update sprint when it changes externally
  useEffect(() => {
    setSprint(initialSprint);
    fetchMeetupSessions();
  }, [initialSprint]);

  // Refresh sprint on mount to get latest data
  useEffect(() => {
    refreshSprint();
  }, [sprint.id]);

  // Handle sprint update from child components
  const handleSprintUpdate = (updatedSprint: Sprint) => {
    setSprint(updatedSprint);
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

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg">
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="forum">Discussion</TabsTrigger>
          <TabsTrigger value="submit">Submit</TabsTrigger>
        </TabsList>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          {!isRegistered ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <Rocket className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Join Sprint to View Sessions</h3>
                <p className="text-muted-foreground mb-6">
                  Register to access sessions, discussions, and submit your work
                </p>
                <Button size="lg" onClick={() => setJoinDialogOpen(true)} className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Join Sprint
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Meetup-based Sessions */}
              {loadingMeetups ? (
                <Card className="glass-card">
                  <CardContent className="p-8 text-center">
                    <Clock className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Loading sessions...</p>
                  </CardContent>
                </Card>
              ) : meetupSessions.length > 0 ? (
                meetupSessions.map((meetup) => (
                  <Link key={meetup.id} to={`/meetups?id=${meetup.id}`} className="block">
                    <Card className="glass-card hover:shadow-lg transition-shadow cursor-pointer">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <h3 className="text-xl font-semibold">{meetup.title}</h3>
                              <Badge variant="outline">
                                <Rocket className="h-3 w-3 mr-1" />
                                Sprint Session
                              </Badge>
                            </div>
                            <p className="text-muted-foreground mb-4">{meetup.description}</p>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {format(parseISO(meetup.date), 'EEEE, MMM d, yyyy')}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                {formatTime(meetup.time)}
                              </div>
                              {meetup.speakers && meetup.speakers.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4" />
                                  {meetup.speakers.map(s => s.name).join(', ')}
                                </div>
                              )}
                            </div>
                          </div>
                          {meetup.image && (
                            <div className="w-32 h-32 rounded-lg overflow-hidden flex-shrink-0">
                              <img 
                                src={meetup.image} 
                                alt={meetup.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-4 border-t">
                          <Button variant="outline" className="gap-2">
                            View Details
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              ) : (
                <Card className="glass-card">
                  <CardContent className="p-8 text-center">
                    <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No sessions scheduled yet!</p>
                    <p className="text-sm text-muted-foreground mt-2">Sessions will be announced soon.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        {/* Forum Tab */}
        <TabsContent value="forum">
          {!isRegistered ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Join Sprint to Access Discussions</h3>
                <p className="text-muted-foreground mb-6">
                  Register for this sprint to participate in discussions and connect with other learners
                </p>
                <Button size="lg" onClick={() => setJoinDialogOpen(true)} className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Join Sprint
                </Button>
              </CardContent>
            </Card>
          ) : (
            <DiscussionForum sprintId={sprint.id} />
          )}
        </TabsContent>

        {/* Submit Tab */}
        <TabsContent value="submit">
          {!isRegistered ? (
            <Card className="glass-card">
              <CardContent className="p-12 text-center">
                <Send className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-xl font-semibold mb-2">Join Sprint to Submit Work</h3>
                <p className="text-muted-foreground mb-6">
                  Register for this sprint to submit your projects and earn points
                </p>
                <Button size="lg" onClick={() => setJoinDialogOpen(true)} className="gap-2">
                  <Rocket className="h-4 w-4" />
                  Join Sprint
                </Button>
              </CardContent>
            </Card>
          ) : (
            <SubmitWorkForm sprint={sprint} onSuccess={refreshSprint} />
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

export default function SkillSprint() {
  const [selectedSprint, setSelectedSprint] = useState<Sprint | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintSessionCounts, setSprintSessionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sessions');

  // Handle URL parameters for deep linking to posts/replies
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sprintId = params.get('sprint');

    if (sprintId) {
      // Find and select the sprint
      const sprint = sprints.find(s => s.id === sprintId);
      if (sprint) {
        setSelectedSprint(sprint);
        // Check if we need to show the forum tab
        const postId = params.get('post');
        const replyId = params.get('reply');
        if (postId || replyId) {
          setActiveTab('forum');
        }
      }
    }
  }, [sprints]);

  // Fetch sprints from API
  useEffect(() => {
    const fetchSprints = async () => {
      try {
        const fetchedSprints = await getSprints();
        setSprints(fetchedSprints);
        
        // Fetch session counts for all sprints at once
        const sessionCounts: Record<string, number> = {};
        await Promise.all(
          fetchedSprints.map(async (sprint) => {
            try {
              const meetups = await getMeetupsBySprint(sprint.id);
              sessionCounts[sprint.id] = meetups.length;
            } catch (error) {
              console.error(`Error fetching sessions for sprint ${sprint.id}:`, error);
              sessionCounts[sprint.id] = 0;
            }
          })
        );
        setSprintSessionCounts(sessionCounts);
      } catch (error) {
        console.error('Error fetching sprints:', error);
        toast.error('Failed to load sprints');
        setSprints([]);
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
                defaultTab={activeTab}
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
                          sessionCount={sprintSessionCounts[sprint.id] || 0}
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
                          sessionCount={sprintSessionCounts[sprint.id] || 0}
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
                          sessionCount={sprintSessionCounts[sprint.id] || 0}
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
