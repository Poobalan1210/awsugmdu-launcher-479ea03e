import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Calendar, MapPin, Users, Video, Clock, 
  ArrowLeft, ExternalLink, CheckCircle, UserPlus,
  Linkedin, Github, BookOpen, ListChecks, Star, AlertCircle
} from 'lucide-react';
import { mockMeetups, Meetup, currentUser } from '@/data/mockData';
import { format, parseISO, isPast } from 'date-fns';

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
  const isRegistered = meetup.registeredUsers.includes(currentUser.id);
  const spotsLeft = meetup.maxAttendees ? meetup.maxAttendees - meetup.attendees : null;

  return (
    <motion.div variants={cardVariants} whileHover={{ y: -5 }}>
      <Card className="glass-card h-full overflow-hidden cursor-pointer" onClick={onSelect}>
        {meetup.image && (
          <div className="h-40 overflow-hidden">
            <img 
              src={meetup.image} 
              alt={meetup.title} 
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
            />
          </div>
        )}
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant={meetup.type === 'virtual' ? 'secondary' : meetup.type === 'in-person' ? 'default' : 'outline'}>
              {meetup.type === 'virtual' && <Video className="h-3 w-3 mr-1" />}
              {meetup.type === 'in-person' && <MapPin className="h-3 w-3 mr-1" />}
              {meetup.type.charAt(0).toUpperCase() + meetup.type.slice(1)}
            </Badge>
            {!isUpcoming && <Badge variant="outline">Completed</Badge>}
            {isRegistered && isUpcoming && (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                <CheckCircle className="h-3 w-3 mr-1" />
                Registered
              </Badge>
            )}
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
              {meetup.speakers.slice(0, 3).map((speaker) => (
                <Avatar key={speaker.id} className="h-8 w-8 border-2 border-background">
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

          <Button className="w-full" variant={isUpcoming ? 'default' : 'outline'}>
            {isUpcoming ? (isRegistered ? 'View Details' : 'Register Now') : 'View Details'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MeetupDetail({ meetup, onBack }: { meetup: Meetup; onBack: () => void }) {
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const eventDate = parseISO(meetup.date);
  const isUpcoming = !isPast(eventDate);
  const isRegistered = meetup.registeredUsers.includes(currentUser.id);

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

      {/* Hero Section */}
      <div className="relative">
        {meetup.image && (
          <div className="h-64 md:h-80 rounded-xl overflow-hidden">
            <img 
              src={meetup.image} 
              alt={meetup.title} 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
          </div>
        )}
        
        <div className={`${meetup.image ? 'absolute bottom-0 left-0 right-0 p-6' : 'glass-card rounded-xl p-6'}`}>
          <div className="flex flex-wrap gap-2 mb-4">
            <Badge variant="secondary">
              {meetup.type === 'virtual' && <Video className="h-3 w-3 mr-1" />}
              {meetup.type === 'in-person' && <MapPin className="h-3 w-3 mr-1" />}
              {meetup.type}
            </Badge>
            {meetup.status === 'completed' && <Badge variant="outline">Completed</Badge>}
          </div>
          
          <h1 className="text-2xl md:text-3xl font-bold mb-4">{meetup.title}</h1>
          <p className="text-muted-foreground mb-6">{meetup.description}</p>
          
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              {format(eventDate, 'EEEE, MMMM d, yyyy')}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {meetup.time}
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

          {isUpcoming && (
            <div className="mt-6 flex gap-4">
              {isRegistered ? (
                <Button disabled className="gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Already Registered
                </Button>
              ) : (
                <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2">
                      <UserPlus className="h-4 w-4" />
                      Register Now
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Register for {meetup.title}</DialogTitle>
                      <DialogDescription>
                        Fill in your details to register for this event.
                      </DialogDescription>
                    </DialogHeader>
                    <form className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input id="name" defaultValue={currentUser.name} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" defaultValue={currentUser.email} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="designation">Designation</Label>
                        <Input id="designation" placeholder="e.g., Software Engineer" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company">Company/Organization</Label>
                        <Input id="company" placeholder="e.g., Tech Corp" />
                      </div>
                      <Button type="submit" className="w-full" onClick={() => setShowJoinDialog(false)}>
                        Complete Registration
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
              {meetup.meetingLink && isRegistered && (
                <Button variant="outline" size="lg" asChild>
                  <a href={meetup.meetingLink} target="_blank" rel="noopener noreferrer" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Join Meeting
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* What to Expect Section */}
      {meetup.whatToExpect && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              What to Expect
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{meetup.whatToExpect}</p>
          </CardContent>
        </Card>
      )}

      {/* Highlights Section */}
      {meetup.highlights && meetup.highlights.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              Event Highlights
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {meetup.highlights.map((highlight, index) => (
                <li key={index} className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-500 mt-1 flex-shrink-0" />
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Prerequisites Section */}
      {meetup.prerequisites && meetup.prerequisites.length > 0 && (
        <Card className="glass-card border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Prerequisites
            </CardTitle>
            <CardDescription>Please ensure you meet these requirements before attending</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {meetup.prerequisites.map((prereq, index) => (
                <li key={index} className="flex items-start gap-2">
                  <div className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center mt-1 flex-shrink-0">
                    <span className="text-[10px] font-bold text-amber-600">{index + 1}</span>
                  </div>
                  <span>{prereq}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Agenda Section */}
      {meetup.agenda && meetup.agenda.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5 text-primary" />
              Event Agenda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {meetup.agenda.map((item, index) => {
                const speaker = item.speakerId 
                  ? meetup.speakers.find(s => s.id === item.speakerId) 
                  : null;
                return (
                  <div key={index} className="flex gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <div className="text-sm font-mono text-primary min-w-[60px]">
                      {item.time}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium">{item.title}</h4>
                      {item.description && (
                        <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                      )}
                      {speaker && (
                        <div className="flex items-center gap-2 mt-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={speaker.photo} alt={speaker.name} />
                            <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground">{speaker.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Speakers Section */}
      {meetup.speakers.length > 0 && (
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Speakers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              {meetup.speakers.map((speaker) => (
                <div key={speaker.id} className="flex gap-4 p-4 rounded-lg bg-muted/50">
                  <Avatar className="h-16 w-16 border-2 border-primary">
                    <AvatarImage src={speaker.photo} alt={speaker.name} />
                    <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <h4 className="font-semibold text-lg">{speaker.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {speaker.designation}
                      {speaker.company && ` at ${speaker.company}`}
                    </p>
                    <p className="text-sm text-primary mt-1">{speaker.topic}</p>
                    {speaker.bio && (
                      <p className="text-sm text-muted-foreground mt-2">{speaker.bio}</p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {speaker.linkedIn && (
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                          <a href={speaker.linkedIn} target="_blank" rel="noopener noreferrer">
                            <Linkedin className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Github className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}

export default function Meetups() {
  const [searchParams] = useSearchParams();
  const meetupId = searchParams.get('id');
  const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(
    meetupId ? mockMeetups.find(m => m.id === meetupId) || null : null
  );

  const upcomingMeetups = mockMeetups.filter(m => m.status === 'upcoming');
  const pastMeetups = mockMeetups.filter(m => m.status === 'completed');

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
              </TabsContent>

              <TabsContent value="past">
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
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
