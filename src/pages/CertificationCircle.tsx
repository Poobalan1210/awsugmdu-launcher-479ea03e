import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Award, Users, BookOpen, Calendar, CheckCircle, ArrowRight, 
  MessageSquare, Send, ThumbsUp, Pin, Video, Clock,
  ChevronDown, Crown, ArrowLeft, Link2
} from 'lucide-react';
import { toast } from 'sonner';
import { mockCertificationGroups, CertificationGroup, currentUser, getUserById } from '@/data/mockData';
import { format, parseISO } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

function GroupCard({ group, onSelect }: { group: CertificationGroup; onSelect: () => void }) {
  const isOwner = group.owners.includes(currentUser.id);
  const isMember = group.members.includes(currentUser.id);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass-card hover-lift cursor-pointer h-full" onClick={onSelect}>
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge className={group.color}>{group.level}</Badge>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {group.members.length}
            </div>
          </div>
          <CardTitle className="text-lg flex items-center gap-2">
            {group.name}
            {isOwner && <Crown className="h-4 w-4 text-amber-500" />}
          </CardTitle>
          <CardDescription className="line-clamp-2">{group.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
            <MessageSquare className="h-4 w-4" />
            {group.messages.length} messages
            {group.scheduledSessions.length > 0 && (
              <>
                <span className="mx-2">·</span>
                <Calendar className="h-4 w-4" />
                {group.scheduledSessions.length} upcoming
              </>
            )}
          </div>
          <Button variant={isMember ? "outline" : "default"} className="w-full">
            {isMember ? 'Open Channel' : 'Join Group'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function GroupDetail({ group, onBack }: { group: CertificationGroup; onBack: () => void }) {
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const isOwner = group.owners.includes(currentUser.id);
  const isMember = group.members.includes(currentUser.id);
  const owners = group.owners.map(id => getUserById(id)).filter(Boolean);

  const toggleMessageExpand = (messageId: string) => {
    setExpandedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Sending message:', newMessage);
    setNewMessage('');
  };

  const handleSendReply = (messageId: string) => {
    console.log('Sending reply to', messageId, ':', replyContent);
    setReplyingTo(null);
    setReplyContent('');
  };

  const pinnedMessages = group.messages.filter(m => m.isPinned);
  const regularMessages = group.messages.filter(m => !m.isPinned);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="glass-card p-6 rounded-lg">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <Badge className={group.color}>{group.level}</Badge>
          {isOwner && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Group Owner
            </Badge>
          )}
        </div>
        
        <h1 className="text-3xl font-bold mb-2">{group.name}</h1>
        <p className="text-muted-foreground mb-4">{group.description}</p>
        
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span>{group.members.length} members</span>
          </div>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-amber-500" />
            <span>Owners: {owners.map(o => o?.name).join(', ')}</span>
          </div>
        </div>

        {!isMember && (
          <Button className="mt-6">
            <Users className="h-4 w-4 mr-2" />
            Join This Group
          </Button>
        )}
      </div>

      <Tabs defaultValue="discussion" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="discussion">Discussion</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>

        {/* Discussion Tab */}
        <TabsContent value="discussion">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Channel Discussion
              </CardTitle>
              <CardDescription>
                Share resources, ask questions, and support fellow learners
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* New Message Form */}
              {isMember && (
                <form onSubmit={handleSendMessage} className="p-4 rounded-lg bg-muted/50">
                  <div className="flex gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={currentUser.avatar} />
                      <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <Textarea 
                        placeholder="Share something with the group..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        rows={3}
                      />
                      <Button type="submit" size="sm" disabled={!newMessage.trim()}>
                        <Send className="h-4 w-4 mr-2" />
                        Post
                      </Button>
                    </div>
                  </div>
                </form>
              )}

              {/* Pinned Messages */}
              {pinnedMessages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Pin className="h-4 w-4" />
                    Pinned
                  </h3>
                  {pinnedMessages.map((message) => (
                    <MessageCard 
                      key={message.id} 
                      message={message}
                      isExpanded={expandedMessages.has(message.id)}
                      onToggle={() => toggleMessageExpand(message.id)}
                      replyingTo={replyingTo}
                      setReplyingTo={setReplyingTo}
                      replyContent={replyContent}
                      setReplyContent={setReplyContent}
                      onSendReply={handleSendReply}
                      isPinned
                    />
                  ))}
                </div>
              )}

              {/* Regular Messages */}
              <div className="space-y-4">
                {regularMessages.map((message) => (
                  <MessageCard 
                    key={message.id} 
                    message={message}
                    isExpanded={expandedMessages.has(message.id)}
                    onToggle={() => toggleMessageExpand(message.id)}
                    replyingTo={replyingTo}
                    setReplyingTo={setReplyingTo}
                    replyContent={replyContent}
                    setReplyContent={setReplyContent}
                    onSendReply={handleSendReply}
                  />
                ))}
              </div>

              {group.messages.length === 0 && (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No messages yet. Start the conversation!</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sessions Tab */}
        <TabsContent value="sessions">
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Scheduled Sessions
                  </CardTitle>
                  <CardDescription>
                    Study sessions and group calls organized by owners
                  </CardDescription>
                </div>
                {isOwner && (
                  <Button size="sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Session
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {group.scheduledSessions.length > 0 ? (
                <div className="space-y-4">
                  {group.scheduledSessions.map((session) => (
                    <Card key={session.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold">{session.title}</h3>
                            <p className="text-sm text-muted-foreground mb-2">{session.description}</p>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {format(parseISO(session.date), 'MMM d, yyyy')}
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4" />
                                {session.time}
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                Host: {session.hostName}
                              </div>
                            </div>
                          </div>
                          {session.meetingLink && (
                            <Button size="sm" asChild>
                              <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                                <Video className="h-4 w-4 mr-2" />
                                Join
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No sessions scheduled yet.</p>
                  {isOwner && (
                    <p className="text-sm text-muted-foreground mt-2">
                      As a group owner, you can schedule study sessions for members.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                Group Members ({group.members.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* Owners first */}
                {owners.map((owner) => owner && (
                  <div 
                    key={owner.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={owner.avatar} alt={owner.name} />
                      <AvatarFallback>{owner.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <Link 
                        to={`/profile/${owner.id}`}
                        className="font-medium hover:text-primary transition-colors"
                      >
                        {owner.name}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {owner.designation || 'Group Owner'}
                      </p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="h-3 w-3" />
                      Owner
                    </Badge>
                  </div>
                ))}
                {/* Regular members */}
                {group.members.filter(id => !group.owners.includes(id)).map((memberId) => {
                  const member = getUserById(memberId);
                  if (!member) return null;
                  return (
                    <div 
                      key={member.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar} alt={member.name} />
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <Link 
                          to={`/profile/${member.id}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {member.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {member.designation || 'Member'}
                        </p>
                      </div>
                      <Badge variant="outline">{member.points} pts</Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

function MessageCard({ 
  message, 
  isExpanded, 
  onToggle,
  replyingTo,
  setReplyingTo,
  replyContent,
  setReplyContent,
  onSendReply,
  isPinned = false
}: { 
  message: CertificationGroup['messages'][0];
  isExpanded: boolean;
  onToggle: () => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyContent: string;
  setReplyContent: (content: string) => void;
  onSendReply: (messageId: string) => void;
  isPinned?: boolean;
}) {
  return (
    <Card className={`border ${isPinned ? 'border-primary/30 bg-primary/5' : ''}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Avatar className="h-10 w-10">
            <AvatarImage src={message.userAvatar} />
            <AvatarFallback>{message.userName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">{message.userName}</span>
              <span className="text-sm text-muted-foreground">
                · {format(parseISO(message.createdAt), 'MMM d, yyyy')}
              </span>
              {isPinned && <Pin className="h-3 w-3 text-primary" />}
            </div>
            <p className="text-sm mb-3">{message.content}</p>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <button className="flex items-center gap-1 hover:text-primary transition-colors">
                <ThumbsUp className="h-4 w-4" />
                {message.likes}
              </button>
              <button 
                className="flex items-center gap-1 hover:text-primary transition-colors"
                onClick={() => setReplyingTo(replyingTo === message.id ? null : message.id)}
              >
                <MessageSquare className="h-4 w-4" />
                Reply
              </button>
              <button 
                className="flex items-center gap-1 hover:text-primary transition-colors"
                onClick={() => {
                  const url = `${window.location.origin}/certification-circle?message=${message.id}`;
                  navigator.clipboard.writeText(url);
                  toast.success('Link copied to clipboard!');
                }}
              >
                <Link2 className="h-4 w-4" />
                Share
              </button>
              {message.replies.length > 0 && (
                <button 
                  className="flex items-center gap-1 hover:text-primary transition-colors"
                  onClick={onToggle}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  {message.replies.length} {message.replies.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>

            {/* Reply Form */}
            <AnimatePresence>
              {replyingTo === message.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={currentUser.avatar} />
                      <AvatarFallback>{currentUser.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-2">
                      <Input
                        placeholder="Write a reply..."
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => onSendReply(message.id)}
                          disabled={!replyContent.trim()}
                        >
                          Reply
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => setReplyingTo(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Replies */}
            <AnimatePresence>
              {isExpanded && message.replies.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 pl-4 border-l-2 border-muted space-y-3"
                >
                  {message.replies.map((reply) => (
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
                        <p className="text-sm">{reply.content}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
                            <ThumbsUp className="h-3 w-3" />
                            {reply.likes}
                          </button>
                          <button 
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                            onClick={() => {
                              const url = `${window.location.origin}/certification-circle?reply=${reply.id}`;
                              navigator.clipboard.writeText(url);
                              toast.success('Link copied to clipboard!');
                            }}
                          >
                            <Link2 className="h-3 w-3" />
                            Share
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CertificationCircle() {
  const [selectedGroup, setSelectedGroup] = useState<CertificationGroup | null>(null);

  const groupsByLevel = {
    Foundational: mockCertificationGroups.filter(g => g.level === 'Foundational'),
    Associate: mockCertificationGroups.filter(g => g.level === 'Associate'),
    Professional: mockCertificationGroups.filter(g => g.level === 'Professional'),
    Specialty: mockCertificationGroups.filter(g => g.level === 'Specialty'),
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {selectedGroup ? (
            <GroupDetail 
              key="detail"
              group={selectedGroup} 
              onBack={() => setSelectedGroup(null)} 
            />
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Hero */}
              <motion.section 
                className="text-center mb-12"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-600 text-sm font-medium mb-4">
                  <Award className="h-4 w-4" />
                  Study Groups & Channels
                </div>
                <h1 className="text-3xl md:text-5xl font-bold mb-4">Certification Circle</h1>
                <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                  Join our study group channels to prepare for AWS certifications together. 
                  Share resources, discuss concepts, schedule study sessions, and ace your exams.
                </p>
                <Button size="lg">
                  Find Your Study Group
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </motion.section>

              {/* Benefits */}
              <section className="mb-12 py-8 px-6 rounded-xl bg-muted/30">
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 max-w-4xl mx-auto">
                  {[
                    { icon: MessageSquare, text: 'Discussion channels' },
                    { icon: Users, text: 'Group study sessions' },
                    { icon: CheckCircle, text: 'Practice questions' },
                    { icon: Calendar, text: 'Scheduled meetups' },
                  ].map((item, i) => (
                    <motion.div 
                      key={i} 
                      className="flex flex-col items-center text-center p-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                    >
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <item.icon className="h-6 w-6 text-primary" />
                      </div>
                      <p className="font-medium">{item.text}</p>
                    </motion.div>
                  ))}
                </div>
              </section>

              {/* Study Groups by Level */}
              {Object.entries(groupsByLevel).map(([level, groups]) => groups.length > 0 && (
                <section key={level} className="mb-12">
                  <h2 className="text-2xl font-bold mb-6">{level} Level</h2>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {groups.map((group, index) => (
                      <motion.div
                        key={group.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        <GroupCard 
                          group={group} 
                          onSelect={() => setSelectedGroup(group)}
                        />
                      </motion.div>
                    ))}
                  </div>
                </section>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <Footer />
    </div>
  );
}