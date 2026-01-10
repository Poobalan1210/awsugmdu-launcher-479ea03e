import { useState } from 'react';
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
  CheckCircle, Image, FileText, PlayCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { mockSprints, mockForumPosts, Sprint, Session, currentUser, mockUsers, getUserById } from '@/data/mockData';
import { format, parseISO } from 'date-fns';

const getStatusBadge = (status: Sprint['status']) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Active</Badge>;
    case 'upcoming':
      return <Badge variant="secondary">Upcoming</Badge>;
    case 'completed':
      return <Badge variant="outline">Completed</Badge>;
  }
};

function SessionCard({ session, isExpanded, onToggle }: { 
  session: Session; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="glass-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 border-2 border-primary/30">
                  <AvatarImage 
                    src={session.speakers && session.speakers.length > 0 ? session.speakers[0].photo : session.speakerPhoto} 
                    alt={session.speakers && session.speakers.length > 0 ? session.speakers[0].name : session.speaker} 
                  />
                  <AvatarFallback>
                    {session.speakers && session.speakers.length > 0 
                      ? session.speakers[0].name.charAt(0) 
                      : session.speaker.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{session.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {session.speakers && session.speakers.length > 0 
                      ? session.speakers.map(s => s.name).join(', ')
                      : session.speaker}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{format(parseISO(session.date), 'MMM d, yyyy')}</p>
                  <p className="text-xs text-muted-foreground">{session.time}</p>
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
              {/* Session Poster */}
              {session.posterImage && (
                <div className="relative h-48 overflow-hidden">
                  <img 
                    src={session.posterImage} 
                    alt={session.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/90 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <Badge variant="secondary" className="mb-2">
                      <Clock className="h-3 w-3 mr-1" />
                      {session.duration || '90 minutes'}
                    </Badge>
                  </div>
                </div>
              )}
              
              <div className="p-6 space-y-6">
                {/* Session People */}
                <div>
                  <h4 className="font-semibold mb-4">Session Team</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Hosts */}
                    {session.hosts && session.hosts.length > 0 && (
                      <>
                        {session.hosts.map((host) => (
                          <div key={host.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={host.photo} />
                              <AvatarFallback>{host.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {host.userId ? (
                                  <Link 
                                    to={`/profile/${host.userId}`}
                                    className="font-medium hover:text-primary transition-colors"
                                  >
                                    {host.name}
                                  </Link>
                                ) : (
                                  <span className="font-medium">{host.name}</span>
                                )}
                                <Badge variant="outline" className="text-xs">Host</Badge>
                              </div>
                              {host.designation && (
                                <p className="text-xs text-muted-foreground">{host.designation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Speakers */}
                    {session.speakers && session.speakers.length > 0 && (
                      <>
                        {session.speakers.map((speaker) => (
                          <div key={speaker.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Avatar className="h-12 w-12 border-2 border-primary/30">
                              <AvatarImage src={speaker.photo} alt={speaker.name} />
                              <AvatarFallback>{speaker.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {speaker.userId ? (
                                  <Link 
                                    to={`/profile/${speaker.userId}`}
                                    className="font-medium hover:text-primary transition-colors"
                                  >
                                    {speaker.name}
                                  </Link>
                                ) : (
                                  <span className="font-medium">{speaker.name}</span>
                                )}
                                <Badge variant="default" className="text-xs">Speaker</Badge>
                              </div>
                              {speaker.designation && (
                                <p className="text-xs text-muted-foreground">
                                  {speaker.designation}
                                  {speaker.company && ` at ${speaker.company}`}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Volunteers */}
                    {session.volunteers && session.volunteers.length > 0 && (
                      <>
                        {session.volunteers.map((volunteer) => (
                          <div key={volunteer.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={volunteer.photo} />
                              <AvatarFallback>{volunteer.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {volunteer.userId ? (
                                  <Link 
                                    to={`/profile/${volunteer.userId}`}
                                    className="font-medium hover:text-primary transition-colors"
                                  >
                                    {volunteer.name}
                                  </Link>
                                ) : (
                                  <span className="font-medium">{volunteer.name}</span>
                                )}
                                <Badge variant="secondary" className="text-xs">Volunteer</Badge>
                              </div>
                              {volunteer.designation && (
                                <p className="text-xs text-muted-foreground">{volunteer.designation}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                  </div>
                </div>

                {/* Session Details */}
                <div>
                  <h4 className="font-semibold mb-2">About this Session</h4>
                  <p className="text-muted-foreground">{session.description}</p>
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

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-4 border-t">
                  {session.meetingLink && (
                    <Button asChild>
                      <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-2" />
                        Join Session
                      </a>
                    </Button>
                  )}
                  {session.recordingUrl && (
                    <Button variant="outline" asChild>
                      <a href={session.recordingUrl} target="_blank" rel="noopener noreferrer">
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Watch Recording
                      </a>
                    </Button>
                  )}
                  {session.slidesUrl && (
                    <Button variant="outline" asChild>
                      <a href={session.slidesUrl} target="_blank" rel="noopener noreferrer">
                        <FileText className="h-4 w-4 mr-2" />
                        View Slides
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
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
        {sprint.posterImage && (
          <div className="relative h-40 overflow-hidden rounded-t-lg">
            <img 
              src={sprint.posterImage} 
              alt={sprint.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <div className="absolute top-3 left-3">
              {getStatusBadge(sprint.status)}
            </div>
          </div>
        )}
        <CardContent className={sprint.posterImage ? "p-5" : "p-6"}>
          {!sprint.posterImage && (
            <div className="flex items-start justify-between mb-4">
              {getStatusBadge(sprint.status)}
              <span className="text-sm text-muted-foreground">
                {format(parseISO(sprint.startDate), 'MMM yyyy')}
              </span>
            </div>
          )}
          
          <h3 className="text-xl font-bold mb-2">{sprint.title}</h3>
          <Badge variant="outline" className="mb-4">{sprint.theme}</Badge>
          
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {sprint.description}
          </p>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {sprint.participants}
            </div>
            <div className="flex items-center gap-1">
              <Video className="h-4 w-4" />
              {sprint.sessions.length} sessions
            </div>
          </div>
          
          <Button className="w-full mt-4" variant={sprint.status === 'active' ? 'default' : 'outline'}>
            {sprint.status === 'active' ? 'Join Sprint' : 'View Details'}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function JoinSprintDialog({ sprint, open, onOpenChange }: { 
  sprint: Sprint; 
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [formData, setFormData] = useState({
    name: currentUser.name,
    email: currentUser.email,
    designation: currentUser.designation || '',
    company: currentUser.company || '',
    experience: '',
    expectations: ''
  });

  const isRegistered = sprint.registeredUsers.includes(currentUser.id);

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
              <Label>Experience with {sprint.theme}</Label>
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

function SprintDetail({ sprint, onBack }: { sprint: Sprint; onBack: () => void }) {
  const forumPosts = mockForumPosts.filter((p) => p.sprintId === sprint.id);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const isRegistered = sprint.registeredUsers.includes(currentUser.id);

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
        {sprint.posterImage && (
          <div className="relative h-48 md:h-64 -mx-6 -mt-6 md:-mx-8 md:-mt-8 mb-6 overflow-hidden rounded-t-lg">
            <img 
              src={sprint.posterImage} 
              alt={sprint.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}
        
        <div className="flex flex-wrap items-center gap-4 mb-4">
          {getStatusBadge(sprint.status)}
          <Badge variant="outline" className="text-base">{sprint.theme}</Badge>
        </div>
        
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

        {sprint.status !== 'completed' && (
          <div className="mt-6 flex gap-3">
            <Button size="lg" onClick={() => setJoinDialogOpen(true)}>
              <Rocket className="h-4 w-4 mr-2" />
              {isRegistered ? 'Already Joined' : 'Join This Sprint'}
            </Button>
            {isRegistered && (
              <Badge variant="secondary" className="flex items-center gap-1 px-4">
                <CheckCircle className="h-4 w-4" />
                Registered
              </Badge>
            )}
          </div>
        )}
      </div>

      <JoinSprintDialog 
        sprint={sprint} 
        open={joinDialogOpen} 
        onOpenChange={setJoinDialogOpen}
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
                isExpanded={expandedSession === session.id}
                onToggle={() => setExpandedSession(
                  expandedSession === session.id ? null : session.id
                )}
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
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Registered Participants ({sprint.registeredUsers.length})
              </CardTitle>
              <CardDescription>
                Community members participating in this sprint
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {sprint.registeredUsers.map((userId) => {
                  const user = getUserById(userId);
                  if (!user) return null;
                  return (
                    <motion.div
                      key={userId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Avatar className="h-12 w-12 border-2 border-primary/20">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <Link 
                          to={`/profile/${user.id}`}
                          className="font-medium hover:text-primary transition-colors truncate block"
                        >
                          {user.name}
                        </Link>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.designation || 'Participant'}
                        </p>
                        {user.company && (
                          <p className="text-xs text-muted-foreground truncate">{user.company}</p>
                        )}
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {user.points} pts
                      </Badge>
                    </motion.div>
                  );
                })}
              </div>
              {sprint.registeredUsers.length === 0 && (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No participants registered yet. Be the first!</p>
                </div>
              )}
            </CardContent>
          </Card>
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
                    <AvatarImage src={currentUser.avatar} />
                    <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
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

  const activeSprints = mockSprints.filter((s) => s.status === 'active');
  const upcomingSprints = mockSprints.filter((s) => s.status === 'upcoming');
  const completedSprints = mockSprints.filter((s) => s.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
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
      </main>

      <Footer />
    </div>
  );
}
