import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { marked } from 'marked';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  Calendar, MapPin, Users, Video, Clock, 
  ArrowLeft, ExternalLink, PlayCircle,
  Linkedin, Github, CheckCircle, Search, Rocket, Award, GraduationCap
} from 'lucide-react';
import { PersonCard } from '@/components/PersonCard';
import { Meetup } from '@/data/mockData';
import { format, parseISO, isPast } from 'date-fns';
import { getMeetups, registerForMeetup, getMeetupParticipants, getMeetup } from '@/lib/meetups';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Configure marked for safe HTML rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Helper to parse markdown or HTML content
function parseContent(content: string): string {
  // Check if content looks like HTML (has HTML tags)
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) {
    return content;
  }
  // Otherwise parse as markdown
  return marked.parse(content) as string;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

function MeetupCard({ meetup, onSelect }: { meetup: Meetup; onSelect: () => void }) {
  const eventDate = parseISO(meetup.date);
  const isUpcoming = !isPast(eventDate);
  const spotsLeft = meetup.maxAttendees ? meetup.maxAttendees - meetup.attendees : null;

  // Get type badge info
  const getTypeBadge = () => {
    switch (meetup.type) {
      case 'virtual':
        return { label: 'Virtual', variant: 'secondary' as const, icon: <Video className="h-3 w-3 mr-1" /> };
      case 'in-person':
        return { label: 'In-Person', variant: 'default' as const, icon: <MapPin className="h-3 w-3 mr-1" /> };
      case 'skill-sprint':
        return { label: 'Skill Sprint', variant: 'default' as const, icon: <Rocket className="h-3 w-3 mr-1" /> };
      case 'certification-circle':
        return { label: 'Certification Circle', variant: 'default' as const, icon: <Award className="h-3 w-3 mr-1" /> };
      case 'college-champ':
        return { label: 'College Champ', variant: 'default' as const, icon: <GraduationCap className="h-3 w-3 mr-1" /> };
      default:
        return { label: meetup.type, variant: 'secondary' as const, icon: null };
    }
  };

  const typeBadge = getTypeBadge();

  return (
    <motion.div variants={cardVariants} whileHover={{ y: -5 }}>
      <Card className="glass-card h-full overflow-hidden cursor-pointer" onClick={onSelect}>
        {meetup.image && (
          <div className="h-64 overflow-hidden bg-muted/20 flex items-center justify-center">
            <img 
              src={meetup.image} 
              alt={meetup.title} 
              className="w-full h-full object-contain transition-transform duration-300 hover:scale-105"
            />
          </div>
        )}
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant={typeBadge.variant}>
              {typeBadge.icon}
              {typeBadge.label}
            </Badge>
          </div>
          
          <h3 className="font-semibold text-lg mb-2 line-clamp-2">{meetup.title}</h3>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{meetup.description}</p>
          
          <div className="space-y-2 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(eventDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {meetup.time}
            </div>
            {meetup.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                {meetup.location}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {meetup.attendees}{spotsLeft !== null && ` / ${meetup.maxAttendees}`} attendees
              {spotsLeft !== null && spotsLeft <= 10 && spotsLeft > 0 && (
                <span className="text-amber-600 text-xs">({spotsLeft} spots left)</span>
              )}
            </div>
          </div>

          {meetup.speakers.length > 0 && (
            <div className="flex -space-x-2 mb-4">
              {meetup.speakers.slice(0, 3).map((speaker, index) => (
                <Avatar key={speaker.id || `speaker-${index}`} className="h-8 w-8 border-2 border-background">
                  <AvatarImage src={speaker.photo} alt={speaker.name} />
                  <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
                </Avatar>
              ))}
              {meetup.speakers.length > 3 && (
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs border-2 border-background">
                  +{meetup.speakers.length - 3}
                </div>
              )}
            </div>
          )}

          <Button className="w-full" variant="outline">
            View Details
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MeetupDetail({ meetup: initialMeetup, onBack }: { meetup: Meetup; onBack: () => void }) {
  const eventDate = parseISO(initialMeetup.date);
  const isUpcoming = !isPast(eventDate);
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [isRegistering, setIsRegistering] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch fresh meetup data
  const { data: meetup = initialMeetup } = useQuery({
    queryKey: ['meetup', initialMeetup.id],
    queryFn: async () => {
      try {
        return await getMeetup(initialMeetup.id);
      } catch (error) {
        console.error('Error fetching meetup:', error);
        return initialMeetup;
      }
    },
    initialData: initialMeetup,
    staleTime: 0, // Always refetch
  });

  // Fetch participants for this meetup
  const { data: participants = [] } = useQuery({
    queryKey: ['meetup-participants', meetup.id],
    queryFn: () => getMeetupParticipants(meetup.id),
    enabled: !!meetup.id,
  });

  // Parse markdown or HTML content
  const parsedDescription = useMemo(() => {
    if (!meetup.richDescription) return null;
    return parseContent(meetup.richDescription);
  }, [meetup.richDescription]);

  // Get type badge info
  const getTypeBadge = () => {
    switch (meetup.type) {
      case 'virtual':
        return { label: 'Virtual', variant: 'secondary' as const, icon: <Video className="h-3 w-3 mr-1" /> };
      case 'in-person':
        return { label: 'In-Person', variant: 'default' as const, icon: <MapPin className="h-3 w-3 mr-1" /> };
      case 'skill-sprint':
        return { label: 'Skill Sprint', variant: 'default' as const, icon: <Rocket className="h-3 w-3 mr-1" /> };
      case 'certification-circle':
        return { label: 'Certification Circle', variant: 'default' as const, icon: <Award className="h-3 w-3 mr-1" /> };
      case 'college-champ':
        return { label: 'College Champ', variant: 'default' as const, icon: <GraduationCap className="h-3 w-3 mr-1" /> };
      default:
        return { label: meetup.type, variant: 'secondary' as const, icon: null };
    }
  };

  const typeBadge = getTypeBadge();

  // Combine all people and filter by search query
  const allPeople = useMemo(() => {
    const people = [
      ...(meetup.speakers?.map(s => ({ ...s, role: 'Speaker' })) || []),
      ...(meetup.hosts?.map((h, i) => ({ ...h, id: `host-${i}`, role: 'Organizer' })) || []),
      ...(meetup.volunteers?.map((v, i) => ({ ...v, id: `volunteer-${i}`, role: 'Volunteer' })) || []),
      ...participants.map(p => ({ ...p, userId: p.id, photo: p.avatar, role: null }))
    ];

    if (!searchQuery.trim()) return people;

    const query = searchQuery.toLowerCase();
    return people.filter(person => 
      person.name.toLowerCase().includes(query) ||
      person.designation?.toLowerCase().includes(query) ||
      person.company?.toLowerCase().includes(query)
    );
  }, [meetup.speakers, meetup.hosts, meetup.volunteers, participants, searchQuery]);

  // Check if user is registered
  const isRegistered = user && meetup.registeredUsers?.includes(user.id);

  const handleRegister = async () => {
    if (!isAuthenticated || !user) {
      toast.error('Please log in to register for this meetup');
      return;
    }

    if (!meetup.meetupUrl) {
      toast.error('Meetup URL not available');
      return;
    }

    setIsRegistering(true);
    try {
      // First, register in our system
      const result = await registerForMeetup(meetup.id, user.id);
      
      if (result.alreadyRegistered) {
        toast.info('You are already registered for this meetup');
        // Still redirect to meetup URL
        window.open(meetup.meetupUrl, '_blank');
      } else {
        toast.success('Successfully registered! Redirecting to Meetup.com...');
        // Refresh meetup data and participants
        queryClient.invalidateQueries({ queryKey: ['meetup', meetup.id] });
        queryClient.invalidateQueries({ queryKey: ['meetups'] });
        queryClient.invalidateQueries({ queryKey: ['meetup-participants', meetup.id] });
        
        // Redirect to meetup URL after registration
        setTimeout(() => {
          window.open(meetup.meetupUrl, '_blank');
        }, 1500);
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to register for meetup');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Meetups
      </Button>

      {/* Two-column layout: Description on left, People on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Event Details & Description */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-card">
            <CardContent className="p-6">
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant={typeBadge.variant}>
                  {typeBadge.icon}
                  {typeBadge.label}
                </Badge>
              </div>
              
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{meetup.title}</h1>
              <p className="text-muted-foreground mb-6">{meetup.description}</p>
              
              <div className="flex flex-wrap gap-6 text-sm mb-6">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {format(eventDate, 'EEEE, MMMM d, yyyy')}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary" />
                  {meetup.time}
                  {meetup.duration && ` (${meetup.duration})`}
                </div>
                {meetup.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    {meetup.location}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {meetup.attendees} registered
                </div>
              </div>

              {/* Action Buttons - Different for upcoming vs past events and event type */}
              <div className="flex flex-wrap gap-4">
                {meetup.type === 'in-person' ? (
                  // In-person events: only meetup links
                  <>
                    {isUpcoming ? (
                      meetup.meetupUrl && (
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
                      )
                    ) : (
                      meetup.meetupUrl && (
                        <Button size="lg" asChild className="gap-2">
                          <a href={meetup.meetupUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            View on Meetup
                          </a>
                        </Button>
                      )
                    )}
                  </>
                ) : (
                  // Virtual/online events: meetup + meeting/recording links
                  <>
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
                              Join Event
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
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Event Poster */}
          {meetup.image && (
            <Card className="glass-card">
              <CardContent className="p-0">
                <div className="rounded-xl overflow-hidden bg-muted/20 flex items-center justify-center">
                  <img 
                    src={meetup.image} 
                    alt={meetup.title} 
                    className="w-full h-auto object-contain"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rich Description Section - Supports HTML and Markdown */}
          {parsedDescription && (
            <Card className="glass-card">
              <CardHeader>
                <CardTitle>About this Event</CardTitle>
              </CardHeader>
              <CardContent>
                <div 
                  className="prose prose-sm max-w-none dark:prose-invert
                    prose-headings:text-foreground prose-headings:font-semibold
                    prose-h2:text-xl prose-h2:mt-0 prose-h2:mb-4
                    prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
                    prose-p:text-muted-foreground prose-p:leading-relaxed
                    prose-ul:text-muted-foreground prose-ul:my-4
                    prose-li:my-1
                    prose-strong:text-foreground
                    prose-em:text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: parsedDescription }}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Combined People Section (Scrollable) */}
        <div className="lg:col-span-1">
          <Card className="glass-card sticky top-4 flex flex-col max-h-[calc(100vh-2rem)]">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                People ({allPeople.length})
              </CardTitle>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-3">
                {allPeople.length > 0 ? (
                  allPeople.map((person, index) => (
                    <PersonCard
                      key={person.id || `person-${index}`}
                      userId={person.userId}
                      name={person.name}
                      photo={person.photo}
                      avatar={person.avatar}
                      designation={person.designation}
                      company={person.company}
                      role={person.role}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {searchQuery ? 'No people found matching your search.' : 'No people registered yet.'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

export default function Meetups() {
  const [searchParams] = useSearchParams();
  const meetupId = searchParams.get('id');
  
  // Fetch meetups from backend
  const { data: allMeetups = [], isLoading } = useQuery({
    queryKey: ['meetups'],
    queryFn: async () => {
      try {
        return await getMeetups();
      } catch (error) {
        console.error('Error fetching meetups:', error);
        toast.error('Failed to load meetups');
        return [];
      }
    },
    staleTime: 60000, // Cache for 1 minute
  });

  const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(
    meetupId ? allMeetups.find(m => m.id === meetupId) || null : null
  );

  // Filter meetups - only show published (upcoming/completed), not drafts
  const upcomingMeetups = allMeetups.filter(m => m.status === 'upcoming');
  const pastMeetups = allMeetups.filter(m => m.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        {selectedMeetup ? (
          <MeetupDetail meetup={selectedMeetup} onBack={() => setSelectedMeetup(null)} />
        ) : (
          <>
            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <Calendar className="h-4 w-4" />
                Community Events
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">Meetups & Events</h1>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Join our virtual and in-person events to learn, network, and grow with the AWS community.
              </p>
            </motion.div>

            <Tabs defaultValue="upcoming" className="space-y-8">
              <TabsList className="grid w-full grid-cols-2 max-w-xs mx-auto">
                <TabsTrigger value="upcoming" className="relative">
                  Upcoming
                  {upcomingMeetups.length > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                      {upcomingMeetups.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="past">Past Events</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming">
                {isLoading ? (
                  <Card className="glass-card">
                    <CardContent className="p-12 text-center">
                      <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
                      <p className="text-muted-foreground">Loading events...</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <motion.div
                      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                      variants={containerVariants}
                      initial="hidden"
                      animate="visible"
                    >
                      {upcomingMeetups.map((meetup) => (
                        <MeetupCard
                          key={meetup.id}
                          meetup={meetup}
                          onSelect={() => setSelectedMeetup(meetup)}
                        />
                      ))}
                    </motion.div>
                    {upcomingMeetups.length === 0 && (
                      <Card className="glass-card">
                        <CardContent className="p-12 text-center">
                          <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">No Upcoming Events</h3>
                          <p className="text-muted-foreground">Check back soon for new events!</p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="past">
                {isLoading ? (
                  <Card className="glass-card">
                    <CardContent className="p-12 text-center">
                      <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
                      <p className="text-muted-foreground">Loading events...</p>
                    </CardContent>
                  </Card>
                ) : (
                  <motion.div
                    className="grid gap-6 md:grid-cols-2 lg:grid-cols-3"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {pastMeetups.map((meetup) => (
                      <MeetupCard
                        key={meetup.id}
                        meetup={meetup}
                        onSelect={() => setSelectedMeetup(meetup)}
                      />
                    ))}
                  </motion.div>
                )}
                {!isLoading && pastMeetups.length === 0 && (
                  <Card className="glass-card">
                    <CardContent className="p-12 text-center">
                      <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">No Past Events</h3>
                      <p className="text-muted-foreground">Past events will appear here.</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
