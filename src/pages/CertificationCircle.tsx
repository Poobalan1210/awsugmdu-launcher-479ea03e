import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
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
  ChevronDown, Crown, ArrowLeft, Link2, Trash2
} from 'lucide-react';
import { toast } from 'sonner';
import { mockCertificationGroups, CertificationGroup, currentUser, getUserById } from '@/data/mockData';
import { format, parseISO } from 'date-fns';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';
import { getMeetupsByCertificationGroup } from '@/lib/meetups';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listCertificationGroups, joinCertificationGroup, postGroupMessage, getCertificationGroup, addMessageReply, toggleMessageLike, toggleReplyLike } from '@/lib/certifications';
import { API_BASE_URL } from '@/lib/aws-config';

function GroupCard({ group, onSelect }: { group: CertificationGroup; onSelect: () => void }) {
  const { user } = useAuth();
  const isOwner = user && group.owners.includes(user.id);
  const isMember = user && group.members.includes(user.id);

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
            {isMember ? 'View Group' : 'Join Group'}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function GroupDetail({ group: initialGroup, onBack }: { group: CertificationGroup; onBack: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // Fetch fresh group data
  const { data: group = initialGroup } = useQuery({
    queryKey: ['certification-group', initialGroup.id],
    queryFn: () => getCertificationGroup(initialGroup.id),
    initialData: initialGroup,
    staleTime: 0, // Always refetch
  });

  const isOwner = user && group.owners.includes(user.id);
  const isMember = user && group.members.includes(user.id);

  // Fetch owner details from backend
  const { data: ownerDetails = [] } = useQuery({
    queryKey: ['group-owners', group.id],
    queryFn: async () => {
      const owners = await Promise.all(
        group.owners.map(async (ownerId) => {
          try {
            const response = await fetch(`${API_BASE_URL}/users/${ownerId}`);
            if (response.ok) {
              const userData = await response.json();
              // API returns user data directly, not wrapped in { user: ... }
              return userData;
            }
          } catch (error) {
            console.error(`Error fetching owner ${ownerId}:`, error);
          }
          return null;
        })
      );
      return owners.filter(Boolean);
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch member details from backend
  const { data: memberDetails = [] } = useQuery({
    queryKey: ['group-members', group.id],
    queryFn: async () => {
      const members = await Promise.all(
        group.members.map(async (memberId) => {
          try {
            const response = await fetch(`${API_BASE_URL}/users/${memberId}`);
            if (response.ok) {
              const userData = await response.json();
              // API returns user data directly, not wrapped in { user: ... }
              return userData;
            }
          } catch (error) {
            console.error(`Error fetching member ${memberId}:`, error);
          }
          return null;
        })
      );
      return members.filter(Boolean);
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch meetups for this certification group
  const { data: groupMeetups = [] } = useQuery({
    queryKey: ['certification-group-meetups', group.id],
    queryFn: () => getMeetupsByCertificationGroup(group.id),
    staleTime: 60000, // Cache for 1 minute
  });

  // Scroll to message if messageId or replyId in URL
  useEffect(() => {
    const messageId = searchParams.get('message');
    const replyId = searchParams.get('reply');
    
    if (replyId) {
      // If it's a reply, find the parent message and expand it
      const parentMessage = group.messages.find(m => 
        m.replies.some(r => r.id === replyId)
      );
      
      if (parentMessage) {
        // Expand the parent message to show replies
        setExpandedMessages(prev => new Set([...prev, parentMessage.id]));
        
        // Scroll to the reply after a delay to ensure it's rendered
        setTimeout(() => {
          messageRefs.current[replyId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          messageRefs.current[replyId]?.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
          setTimeout(() => {
            messageRefs.current[replyId]?.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
          }, 2000);
        }, 500);
      }
    } else if (messageId && messageRefs.current[messageId]) {
      // Scroll to message
      setTimeout(() => {
        messageRefs.current[messageId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageRefs.current[messageId]?.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(() => {
          messageRefs.current[messageId]?.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        }, 2000);
      }, 500);
    }
  }, [searchParams, group.messages]);

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please login to post messages');
      navigate('/login');
      return;
    }
    if (!newMessage.trim()) return;

    try {
      await postGroupMessage(group.id, {
        userId: user.id,
        userName: user.name || 'Unknown User',
        userAvatar: user.avatar || user.profilePicture || '',
        content: newMessage,
      });
      
      setNewMessage('');
      toast.success('Message posted!');
      
      // Refetch group data
      queryClient.invalidateQueries({ queryKey: ['certification-group', group.id] });
    } catch (error) {
      console.error('Error posting message:', error);
      toast.error('Failed to post message');
    }
  };

  const handleSendReply = async (messageId: string) => {
    if (!user) {
      toast.error('Please login to reply');
      navigate('/login');
      return;
    }
    if (!replyContent.trim()) return;

    try {
      await addMessageReply(group.id, messageId, {
        userId: user.id,
        userName: user.name || 'Unknown User',
        userAvatar: user.avatar || user.profilePicture || '',
        content: replyContent,
      });
      
      setReplyingTo(null);
      setReplyContent('');
      toast.success('Reply posted!');
      
      // Refetch group data
      queryClient.invalidateQueries({ queryKey: ['certification-group', group.id] });
    } catch (error) {
      console.error('Error posting reply:', error);
      toast.error('Failed to post reply');
    }
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
        </div>

        {!isMember && (
          <Button className="mt-6" onClick={async () => {
            if (!user) {
              toast.error('Please login to join groups');
              navigate('/login');
              return;
            }
            try {
              await joinCertificationGroup(group.id, user.id);
              toast.success('Joined group successfully!');
              // Refresh the group data without full page reload
              queryClient.invalidateQueries({ queryKey: ['certification-group', group.id] });
              queryClient.invalidateQueries({ queryKey: ['certification-groups'] });
            } catch (error) {
              console.error('Error joining group:', error);
              toast.error('Failed to join group');
            }
          }}>
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
              {/* New Message Form - Only show if logged in */}
              {user ? (
                isMember && (
                  <form onSubmit={handleSendMessage} className="p-4 rounded-lg bg-muted/50">
                    <div className="flex gap-4">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
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
                )
              ) : (
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-muted-foreground mb-3">Please login to post messages</p>
                  <Button onClick={() => navigate('/login')}>Login to Post</Button>
                </div>
              )}

              {/* Pinned Messages */}
              {pinnedMessages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Pin className="h-4 w-4" />
                    Pinned
                  </h3>
                  {pinnedMessages.map((message) => (
                    <div key={message.id} ref={el => messageRefs.current[message.id] = el}>
                      <MessageCard 
                        message={message}
                        groupId={group.id}
                        isExpanded={expandedMessages.has(message.id)}
                        onToggle={() => toggleMessageExpand(message.id)}
                        replyingTo={replyingTo}
                        setReplyingTo={setReplyingTo}
                        replyContent={replyContent}
                        setReplyContent={setReplyContent}
                        onSendReply={handleSendReply}
                        isPinned
                        isOwner={isOwner}
                        currentUserId={user?.id}
                        currentUser={user}
                        messageRefs={messageRefs}
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Regular Messages */}
              <div className="space-y-4">
                {regularMessages.map((message) => (
                  <div key={message.id} ref={el => messageRefs.current[message.id] = el}>
                    <MessageCard 
                      message={message}
                      groupId={group.id}
                      isExpanded={expandedMessages.has(message.id)}
                      onToggle={() => toggleMessageExpand(message.id)}
                      replyingTo={replyingTo}
                      setReplyingTo={setReplyingTo}
                      replyContent={replyContent}
                      setReplyContent={setReplyContent}
                      onSendReply={handleSendReply}
                      isOwner={isOwner}
                      currentUserId={user?.id}
                      currentUser={user}
                      messageRefs={messageRefs}
                    />
                  </div>
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
          <div className="space-y-4">
            {(group.scheduledSessions.length > 0 || groupMeetups.length > 0) ? (
              <>
                {/* Display meetups from the meetups system */}
                {groupMeetups.map((meetup) => (
                  <Link key={meetup.id} to={`/meetups?id=${meetup.id}`} className="block">
                    <Card className="glass-card hover:shadow-lg transition-shadow cursor-pointer">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="text-xl font-semibold mb-3">{meetup.title}</h3>
                            <p className="text-muted-foreground mb-4">{meetup.description}</p>
                            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {format(parseISO(meetup.date), 'EEEE, MMM d, yyyy')}
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                {meetup.time}
                              </div>
                              {meetup.speakers && meetup.speakers.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Users className="h-4 w-4" />
                                  {meetup.speakers.map(s => s.name).join(', ')}
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <Users className="h-4 w-4" />
                                {meetup.attendees} registered
                              </div>
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
                        <div className="mt-4 pt-4 border-t flex items-center justify-between">
                          <Button variant="outline" className="gap-2">
                            View Details
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                          {meetup.meetingLink && (
                            <Button size="sm" asChild>
                              <a href={meetup.meetingLink} target="_blank" rel="noopener noreferrer">
                                <Video className="h-4 w-4 mr-2" />
                                Join
                              </a>
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                
                {/* Display legacy scheduled sessions */}
                {group.scheduledSessions.map((session) => (
                  <Card key={session.id} className="glass-card">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-semibold mb-3">{session.title}</h3>
                          <p className="text-muted-foreground mb-4">{session.description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {format(parseISO(session.date), 'EEEE, MMM d, yyyy')}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {session.time}
                            </div>
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Host: {session.hostName}
                            </div>
                          </div>
                        </div>
                      </div>
                      {session.meetingLink && (
                        <div className="mt-4 pt-4 border-t">
                          <Button size="sm" asChild>
                            <a href={session.meetingLink} target="_blank" rel="noopener noreferrer">
                              <Video className="h-4 w-4 mr-2" />
                              Join
                            </a>
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </>
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
                {ownerDetails.map((owner) => owner && (
                  <div 
                    key={owner.userId}
                    className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={owner.avatar || owner.profilePicture} alt={owner.name} />
                      <AvatarFallback>{owner.name?.charAt(0) || 'U'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <Link 
                        to={`/profile/${owner.userId}`}
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
                {memberDetails.filter(member => member && !group.owners.includes(member.userId)).map((member) => {
                  if (!member) return null;
                  return (
                    <div 
                      key={member.userId}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.avatar || member.profilePicture} alt={member.name} />
                        <AvatarFallback>{member.name?.charAt(0) || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <Link 
                          to={`/profile/${member.userId}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {member.name}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          {member.designation || 'Member'}
                        </p>
                      </div>
                      <Badge variant="outline">{member.points || 0} pts</Badge>
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
  groupId,
  isExpanded, 
  onToggle,
  replyingTo,
  setReplyingTo,
  replyContent,
  setReplyContent,
  onSendReply,
  isPinned = false,
  isOwner = false,
  currentUserId,
  currentUser,
  messageRefs
}: { 
  message: CertificationGroup['messages'][0];
  groupId: string;
  isExpanded: boolean;
  onToggle: () => void;
  replyingTo: string | null;
  setReplyingTo: (id: string | null) => void;
  replyContent: string;
  setReplyContent: (content: string) => void;
  onSendReply: (messageId: string) => void;
  isPinned?: boolean;
  isOwner?: boolean;
  currentUserId?: string;
  currentUser?: any;
  messageRefs: React.MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canDelete = isOwner || message.userId === currentUserId;

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this message?')) {
      toast.success('Message deleted');
      // TODO: Call API to delete message
    }
  };

  const handleDeleteReply = (replyId: string) => {
    if (confirm('Are you sure you want to delete this reply?')) {
      toast.success('Reply deleted');
      // TODO: Call API to delete reply
    }
  };

  const handleLike = async () => {
    if (!currentUserId) {
      toast.error('Please login to like messages');
      navigate('/login');
      return;
    }
    
    try {
      await toggleMessageLike(groupId, message.id, currentUserId);
      
      // Refresh the group data to show updated likes
      await queryClient.invalidateQueries({ queryKey: ['certification-group', groupId] });
      await queryClient.refetchQueries({ queryKey: ['certification-group', groupId] });
    } catch (error) {
      console.error('Error toggling like:', error);
      toast.error('Failed to toggle like');
    }
  };

  const isLiked = message.likedBy?.includes(currentUserId || '');

  return (
    <Card className={`border ${isPinned ? 'border-primary/30 bg-primary/5' : ''}`}>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Link to={`/profile/${message.userId}`}>
            <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary">
              <AvatarImage src={message.userAvatar} />
              <AvatarFallback>{message.userName.charAt(0)}</AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to={`/profile/${message.userId}`} className="font-semibold hover:text-primary">
                {message.userName}
              </Link>
              <span className="text-sm text-muted-foreground">
                · {format(parseISO(message.createdAt), 'MMM d, yyyy')}
              </span>
              {isPinned && <Pin className="h-3 w-3 text-primary" />}
              {canDelete && (
                <button 
                  onClick={handleDelete}
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  title="Delete message"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-sm mb-3">{message.content}</p>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <button 
                className={`flex items-center gap-1 hover:text-primary transition-colors ${isLiked ? 'text-primary' : ''}`}
                onClick={handleLike}
              >
                <ThumbsUp className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
                {message.likes}
              </button>
              <button 
                className="flex items-center gap-1 hover:text-primary transition-colors"
                onClick={() => {
                  if (!currentUserId) {
                    toast.error('Please login to reply');
                    navigate('/login');
                    return;
                  }
                  setReplyingTo(replyingTo === message.id ? null : message.id);
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Reply
              </button>
              <button 
                className="flex items-center gap-1 hover:text-primary transition-colors"
                onClick={() => {
                  const url = `${window.location.origin}/certification-circle?group=${groupId}&message=${message.id}`;
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
                      <AvatarImage src={currentUser?.avatar || currentUser?.profilePicture} />
                      <AvatarFallback>{currentUser?.name?.charAt(0) || 'U'}</AvatarFallback>
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
                  {message.replies.map((reply) => {
                    const canDeleteReply = isOwner || reply.userId === currentUserId;
                    const isReplyLiked = reply.likedBy?.includes(currentUserId || '');
                    
                    const handleReplyLike = async () => {
                      if (!currentUserId) {
                        toast.error('Please login to like replies');
                        navigate('/login');
                        return;
                      }
                      
                      try {
                        await toggleReplyLike(groupId, message.id, reply.id, currentUserId);
                        
                        // Refresh the group data
                        await queryClient.invalidateQueries({ queryKey: ['certification-group', groupId] });
                        await queryClient.refetchQueries({ queryKey: ['certification-group', groupId] });
                      } catch (error) {
                        console.error('Error toggling reply like:', error);
                        toast.error('Failed to toggle like');
                      }
                    };
                    
                    return (
                      <div key={reply.id} className="flex gap-3" ref={el => messageRefs.current[reply.id] = el}>
                        <Link to={`/profile/${reply.userId}`}>
                          <Avatar className="h-7 w-7 cursor-pointer hover:ring-2 hover:ring-primary">
                            <AvatarImage src={reply.userAvatar} />
                            <AvatarFallback>{reply.userName.charAt(0)}</AvatarFallback>
                          </Avatar>
                        </Link>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 text-sm">
                            <Link to={`/profile/${reply.userId}`} className="font-medium hover:text-primary">
                              {reply.userName}
                            </Link>
                            <span className="text-muted-foreground">· {format(parseISO(reply.createdAt), 'MMM d')}</span>
                            {canDeleteReply && (
                              <button 
                                onClick={() => handleDeleteReply(reply.id)}
                                className="ml-auto text-muted-foreground hover:text-destructive"
                                title="Delete reply"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm">{reply.content}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <button 
                              className={`flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors ${isReplyLiked ? 'text-primary' : ''}`}
                              onClick={handleReplyLike}
                            >
                              <ThumbsUp className={`h-3 w-3 ${isReplyLiked ? 'fill-current' : ''}`} />
                              {reply.likes}
                            </button>
                            <button 
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                              onClick={() => {
                                const url = `${window.location.origin}/certification-circle?group=${groupId}&reply=${reply.id}`;
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
                    );
                  })}
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
  const [searchParams] = useSearchParams();
  const messageId = searchParams.get('message');
  const replyId = searchParams.get('reply');
  const groupId = searchParams.get('group');
  
  const [selectedGroup, setSelectedGroup] = useState<CertificationGroup | null>(null);

  // Fetch certification groups from backend
  const { data: allGroups = [], isLoading } = useQuery({
    queryKey: ['certification-groups'],
    queryFn: () => listCertificationGroups(),
    staleTime: 60000, // Cache for 1 minute
  });

  // If there's a group ID in the URL, open that group
  useEffect(() => {
    if (groupId && allGroups.length > 0 && !selectedGroup) {
      const group = allGroups.find(g => g.id === groupId);
      if (group) {
        setSelectedGroup(group);
      }
    }
  }, [groupId, allGroups, selectedGroup]);

  const groupsByLevel = {
    Foundational: allGroups.filter(g => g.level === 'Foundational'),
    Associate: allGroups.filter(g => g.level === 'Associate'),
    Professional: allGroups.filter(g => g.level === 'Professional'),
    Specialty: allGroups.filter(g => g.level === 'Specialty'),
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

              {/* Loading State */}
              {isLoading && (
                <Card className="glass-card">
                  <CardContent className="p-12 text-center">
                    <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
                    <p className="text-muted-foreground">Loading certification groups...</p>
                  </CardContent>
                </Card>
              )}

              {/* Empty State */}
              {!isLoading && allGroups.length === 0 && (
                <Card className="glass-card">
                  <CardContent className="p-12 text-center">
                    <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No Certification Groups Yet</h3>
                    <p className="text-muted-foreground">Check back soon for new study groups!</p>
                  </CardContent>
                </Card>
              )}

              {/* Study Groups by Level */}
              {!isLoading && Object.entries(groupsByLevel).map(([level, groups]) => groups.length > 0 && (
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