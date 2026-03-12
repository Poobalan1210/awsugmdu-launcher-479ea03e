import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { 
  GraduationCap, Users, Calendar, Award, ArrowRight, Trophy, Medal, 
  CheckCircle2, Circle, MapPin, Star, Zap, Target, PartyPopper,
  ChevronRight, Clock, ExternalLink, Loader2, Search, X, Upload, Share2,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CollegeTask, College, getAllCollegeTasks } from '@/lib/colleges';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { SubmitTaskDialog } from '@/components/college-champs/SubmitTaskDialog';
import { ShareButton } from '@/components/common/ShareButton';
import { generateCollegeRankShare, generateCollegeActivityShare } from '@/lib/sharing';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1: return <Trophy className="h-6 w-6 text-yellow-500" />;
    case 2: return <Medal className="h-6 w-6 text-gray-400" />;
    case 3: return <Medal className="h-6 w-6 text-amber-600" />;
    default: return <span className="text-lg font-bold text-muted-foreground">#{rank}</span>;
  }
};

const getCategoryIcon = (category: CollegeTask['category']) => {
  switch (category) {
    case 'onboarding': return <Users className="h-4 w-4" />;
    case 'learning': return <GraduationCap className="h-4 w-4" />;
    case 'community': return <Users className="h-4 w-4" />;
    case 'event': return <Calendar className="h-4 w-4" />;
    case 'special': return <Star className="h-4 w-4" />;
  }
};

const getCategoryColor = (category: CollegeTask['category']) => {
  switch (category) {
    case 'onboarding': return 'bg-blue-500/10 text-blue-600 border-blue-500/30';
    case 'learning': return 'bg-purple-500/10 text-purple-600 border-purple-500/30';
    case 'community': return 'bg-green-500/10 text-green-600 border-green-500/30';
    case 'event': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
    case 'special': return 'bg-pink-500/10 text-pink-600 border-pink-500/30';
  }
};

function CollegeLeaderboard({ colleges, onSelectCollege, tasks }: { colleges: College[], onSelectCollege: (college: College, rank: number) => void, tasks: CollegeTask[] }) {
  // Helper to calculate available tasks for a college
  const getAvailableTasks = (college: College) => {
    const defaultTasks = tasks.filter(task => task.isDefault);
    const assignedTasks = tasks.filter(task => 
      college.assignedTaskIds?.includes(task.id)
    );
    return [...defaultTasks, ...assignedTasks];
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {colleges.map((college, index) => {
        const displayRank = index + 1;
        const availableTasks = getAvailableTasks(college);
        const taskProgress = availableTasks.length > 0 
          ? ((college.completedTasks?.length || 0) / availableTasks.length) * 100 
          : 0;
        
        return (
          <motion.div
            key={college.id}
            variants={itemVariants}
            whileHover={{ scale: 1.01, x: 5 }}
            className="cursor-pointer focus:outline-none"
            onClick={() => onSelectCollege(college, displayRank)}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectCollege(college, displayRank);
              }
            }}
          >
            <Card className={`glass-card overflow-hidden transition-all hover:shadow-lg ${index < 3 ? 'border-2' : ''} ${
              index === 0 ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-500/5 to-transparent' :
              index === 1 ? 'border-gray-400/50 bg-gradient-to-r from-gray-400/5 to-transparent' :
              index === 2 ? 'border-amber-600/50 bg-gradient-to-r from-amber-600/5 to-transparent' : ''
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-12 flex justify-center">
                    {getRankIcon(displayRank)}
                  </div>
                  
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                    college.logo 
                      ? '' 
                      : 'bg-gradient-to-br from-primary to-primary/70 text-white font-bold text-lg'
                  }`}>
                    {college.logo ? (
                      <img src={college.logo} alt={college.shortName} className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      college.shortName?.substring(0, 2) || 'NA'
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold truncate">{college.shortName}</h3>
                      <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                        <MapPin className="h-3 w-3 mr-1" />
                        {college.location?.split(',')[0] || 'Unknown'}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1 text-xl font-bold">
                      <Zap className="h-5 w-5 text-amber-500" />
                      {(college.totalPoints || 0).toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">points</p>
                  </div>
                  
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

function CollegeDetailView({ college, rank }: { college: College, rank: number }) {
  const { user } = useAuth();
  const [memberDetails, setMemberDetails] = useState<any[]>([]);
  const [champsLead, setChampsLead] = useState<any>(null);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<CollegeTask | null>(null);
  const [allTasks, setAllTasks] = useState<CollegeTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  
  // Check if current user is the captain of this college
  const isCaptain = user?.id === college.champsLeadId;
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('completed');

  // Fetch tasks from API
  useEffect(() => {
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

    fetchTasks();
  }, []);

  // Get college-specific tasks (default tasks + assigned tasks)
  const collegeCompletedTaskIds = college.completedTasks?.map(ct => ct.taskId) || [];
  
  // Get all tasks available to this college:
  // 1. Default tasks (isDefault: true) - available to all colleges
  // 2. College-specific assigned tasks (assignedTaskIds)
  const defaultTasks = allTasks.filter(task => task.isDefault);
  const assignedTasks = allTasks.filter(task => 
    college.assignedTaskIds?.includes(task.id)
  );
  const allAvailableTasks = [...defaultTasks, ...assignedTasks];
  
  const completedTasks = allAvailableTasks.filter(task => collegeCompletedTaskIds.includes(task.id));
  const pendingTasks = allAvailableTasks.filter(task => !collegeCompletedTaskIds.includes(task.id));
  
  const progressPercentage = allAvailableTasks.length > 0 
    ? (completedTasks.length / allAvailableTasks.length) * 100 
    : 0;

  // Fetch member details from API
  useEffect(() => {
    const fetchMembers = async () => {
      try {
        setLoadingMembers(true);
        const { getAllUsers } = await import('@/lib/userProfile');
        const allUsers = await getAllUsers();

        // Filter to get only members of this college
        const members = allUsers.filter(user => college.members.includes(user.id));
        setMemberDetails(members);

        // Find the champs lead
        if (college.champsLeadId) {
          const lead = allUsers.find(user => user.id === college.champsLeadId);
          setChampsLead(lead || null);
        }
      } catch (error) {
        console.error('Error fetching members:', error);
        toast.error('Failed to load members');
      } finally {
        setLoadingMembers(false);
      }
    };

    fetchMembers();
  }, [college.members, college.champsLeadId]);

  // Filter members based on search query
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return memberDetails;

    const query = memberSearchQuery.toLowerCase();
    return memberDetails.filter(member =>
      member.name.toLowerCase().includes(query) ||
      member.designation?.toLowerCase().includes(query) ||
      member.company?.toLowerCase().includes(query)
    );
  }, [memberDetails, memberSearchQuery]);

  // Separate past and upcoming events
  const now = new Date();
  const pastEvents = college.hostedEvents.filter(event => new Date(event.date) < now || event.status === 'completed');
  const upcomingEvents = college.hostedEvents.filter(event => new Date(event.date) >= now && event.status === 'upcoming');

  return (
    <div className="flex flex-col overflow-hidden h-full gap-4">
      {/* College Header - Redesigned */}
      <div className="flex-shrink-0 relative overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/80 p-6 text-white">
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-white/20 backdrop-blur-sm">
                {getRankIcon(rank)}
              </div>
              <div>
                <h2 className="text-2xl font-bold">{college.name}</h2>
                <div className="flex items-center gap-3 text-white/90 text-sm mt-1">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {college.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {college.members.length} members
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="text-right">
                <div className="text-3xl font-bold flex items-center gap-2">
                  <Zap className="h-7 w-7" />
                  {college.totalPoints.toLocaleString()}
                </div>
                <p className="text-white/80 text-sm">total points</p>
              </div>
              <ShareButton
                data={generateCollegeRankShare(college.name, rank, college.totalPoints)}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              />
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />
      </div>

      {/* Lead Info - Redesigned */}
      {champsLead && (
        <Card className="flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/20">
                {champsLead?.avatar ? (
                  <AvatarImage src={champsLead.avatar} alt={college.champsLead} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-white font-semibold">
                  {college.champsLead.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-0.5">Champs Lead</p>
                <p className="font-semibold text-lg">{college.champsLead}</p>
                {champsLead?.designation && (
                  <p className="text-sm text-muted-foreground">{champsLead.designation}</p>
                )}
              </div>
              <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <Award className="h-3 w-3 mr-1" />
                Lead
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col overflow-hidden flex-1 min-h-0">
        <TabsList className="grid w-full grid-cols-4 flex-shrink-0">
          <TabsTrigger value="completed">
            Tasks ({completedTasks.length}/{allAvailableTasks.length})
          </TabsTrigger>
          <TabsTrigger value="events">
            Events ({college.hostedEvents.length})
          </TabsTrigger>
          <TabsTrigger value="activity">
            Activity
          </TabsTrigger>
          <TabsTrigger value="members">
            Members ({college.members.length})
          </TabsTrigger>
        </TabsList>

        <div className="overflow-y-auto flex-1 min-h-0 mt-4">
        <TabsContent value="completed" className="space-y-4 mt-0">
          {loadingTasks ? (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <span className="text-muted-foreground">Loading tasks...</span>
                </div>
              </CardContent>
            </Card>
          ) : completedTasks.length === 0 && pendingTasks.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Tasks Available</h3>
                <p className="text-sm text-muted-foreground">
                  Tasks will appear here once they are assigned to this college.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Completed Tasks ({completedTasks.length})
                  </h3>
                  {completedTasks.map((task) => {
                    const completion = college.completedTasks.find(ct => ct.taskId === task.id);
                    return (
                      <Card key={task.id} className="border-green-500/30 bg-green-500/5">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-medium">{task.title}</span>
                                <Badge variant="outline" className={getCategoryColor(task.category)}>
                                  {getCategoryIcon(task.category)}
                                  <span className="ml-1 capitalize">{task.category}</span>
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{task.description}</p>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {completion && new Date(completion.completedAt).toLocaleDateString()}
                                </span>
                                {completion?.bonusPoints && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{completion.bonusPoints} bonus
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <Badge className="bg-green-500 flex-shrink-0">
                              {task.points} pts
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Pending Tasks */}
              {pendingTasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <Circle className="h-4 w-4" />
                    Pending Tasks ({pendingTasks.length})
                  </h3>
                  {pendingTasks.map((task) => (
                    <Card key={task.id} className="border-muted">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Circle className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-medium">{task.title}</span>
                              <Badge variant="outline" className={getCategoryColor(task.category)}>
                                {getCategoryIcon(task.category)}
                                <span className="ml-1 capitalize">{task.category}</span>
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="outline">
                              {task.points} pts
                            </Badge>
                            {isCaptain && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedTask(task);
                                  setSubmitDialogOpen(true);
                                }}
                              >
                                <Upload className="h-4 w-4 mr-1" />
                                Submit
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4 mt-0">
          {college.hostedEvents.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Events Yet</h3>
                <p className="text-sm text-muted-foreground">
                  This college hasn't hosted any events yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Upcoming Events */}
              {upcomingEvents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    Upcoming Events ({upcomingEvents.length})
                  </h3>
                  {upcomingEvents.map((event) => (
                    <Link key={event.id} to={`/meetups?id=${event.id}`} className="block">
                      <Card className="border-blue-500/30 bg-blue-500/5 hover:shadow-md transition-all cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-semibold">{event.title}</h4>
                                <Badge variant="default" className="bg-blue-500">Upcoming</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(event.date).toLocaleDateString()}
                                </span>
                                <Badge variant="outline" className="capitalize">{event.type}</Badge>
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}

              {/* Past Events */}
              {pastEvents.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Past Events ({pastEvents.length})
                  </h3>
                  {pastEvents.map((event) => (
                    <Link key={event.id} to={`/meetups?id=${event.id}`} className="block">
                      <Card className="hover:shadow-md transition-all cursor-pointer">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h4 className="font-semibold">{event.title}</h4>
                                <Badge variant="secondary">Completed</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(event.date).toLocaleDateString()}
                                </span>
                                <Badge variant="outline" className="capitalize">{event.type}</Badge>
                                {event.attendees > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Users className="h-3 w-3" />
                                    {event.attendees} attendees
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {event.pointsAwarded > 0 && (
                                <Badge className="bg-amber-500 text-white">
                                  +{event.pointsAwarded} pts
                                </Badge>
                              )}
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4 mt-0">
          {(() => {
            // Build unified activity feed from tasks + events
            type ActivityItem = {
              id: string;
              type: 'task' | 'event' | 'adhoc';
              title: string;
              description?: string;
              date: string;
              points: number;
              category?: string;
              status?: string;
              eventType?: string;
              attendees?: number;
            };

            const activities: ActivityItem[] = [];

            // Add completed tasks
            college.completedTasks?.forEach((ct) => {
              const task = allAvailableTasks.find(t => t.id === ct.taskId);
              if (task) {
                activities.push({
                  id: `task-${ct.taskId}`,
                  type: 'task',
                  title: task.title,
                  description: task.description,
                  date: ct.completedAt,
                  points: (ct.taskPoints !== undefined ? ct.taskPoints : task.points) + (ct.bonusPoints || 0),
                  category: task.category,
                });
              }
            });

            // Add hosted events (completed or upcoming)
            college.hostedEvents.forEach((event) => {
              activities.push({
                id: `event-${event.id}`,
                type: 'event',
                title: event.title,
                description: event.description,
                date: event.date,
                points: event.pointsAwarded || 0,
                status: event.status,
                eventType: event.type,
                attendees: event.attendees,
              });
            });

            // Add point activities
            college.pointActivities?.forEach((pa) => {
              activities.push({
                id: pa.id,
                type: 'adhoc',
                title: 'Points Awarded',
                description: pa.reason,
                date: pa.awardedAt,
                points: pa.points,
              });
            });

            // Sort by date descending (most recent first)
            activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            if (activities.length === 0) {
              return (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-2">No Activity Yet</h3>
                    <p className="text-sm text-muted-foreground">
                      Activities will appear here as the college completes tasks and hosts events.
                    </p>
                  </CardContent>
                </Card>
              );
            }

            return (
              <div className="space-y-3">
                {activities.map((item) => {
                  const shareData = generateCollegeActivityShare(
                    college.name,
                    item.type,
                    item.title,
                    item.points,
                    item.status === 'upcoming'
                  );
                  
                  return (
                  <Card key={item.id} className="hover:shadow-sm transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className={`flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 mt-0.5 ${
                          item.type === 'task'
                            ? 'bg-green-500/10 text-green-600'
                            : item.type === 'adhoc'
                            ? 'bg-amber-500/10 text-amber-600'
                            : 'bg-blue-500/10 text-blue-600'
                        }`}>
                          {item.type === 'task' ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : item.type === 'adhoc' ? (
                            <Star className="h-4 w-4" />
                          ) : (
                            <Calendar className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{item.title}</span>
                            {item.type === 'task' && (
                              <Badge variant="secondary">Completed</Badge>
                            )}
                            {item.type === 'task' && item.category && (
                              <Badge variant="outline" className={getCategoryColor(item.category as CollegeTask['category'])}>
                                {getCategoryIcon(item.category as CollegeTask['category'])}
                                <span className="ml-1 capitalize">{item.category}</span>
                              </Badge>
                            )}
                            {item.type === 'event' && item.status && (
                              <Badge variant={item.status === 'completed' ? 'secondary' : 'default'}
                                className={item.status === 'upcoming' ? 'bg-blue-500' : ''}>
                                {item.status === 'completed' ? 'Completed' : 'Upcoming'}
                              </Badge>
                            )}
                            {item.type === 'event' && item.eventType && (
                              <Badge variant="outline" className="capitalize">{item.eventType}</Badge>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(item.date).toLocaleDateString()}
                            </span>
                            {item.type === 'event' && Number(item.attendees) > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {item.attendees} attendees
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          {item.points > 0 && (
                            <Badge className="bg-amber-500 text-white">
                              <Zap className="h-3 w-3 mr-1" />
                              {item.points} pts
                            </Badge>
                          )}
                          {shareData && (
                            <ShareButton 
                              data={shareData}
                              variant="outline"
                              size="sm"
                              className="h-8 shadow-sm"
                            />
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="members" className="space-y-4 mt-0">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members by name, role, or company..."
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {memberSearchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setMemberSearchQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {loadingMembers ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
                <h3 className="font-semibold mb-2">Loading Members...</h3>
              </CardContent>
            </Card>
          ) : filteredMembers.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">
                  {memberSearchQuery ? 'No Members Found' : 'No Members Yet'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {memberSearchQuery
                    ? 'Try adjusting your search query.'
                    : 'Members will appear here once they join the college chapter.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                if (!member) return null;

                return (
                  <Card key={member.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={member.avatar} alt={member.name} />
                          <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-white">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Link
                              to={`/profile/${member.id}`}
                              className="font-semibold hover:text-primary transition-colors"
                            >
                              {member.name}
                            </Link>
                          </div>
                          {member.designation && (
                            <p className="text-sm text-muted-foreground truncate">{member.designation}</p>
                          )}
                          {member.company && (
                            <p className="text-xs text-muted-foreground truncate">{member.company}</p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Zap className="h-4 w-4 text-amber-500" />
                            {member.points || 0}
                          </div>
                          <p className="text-xs text-muted-foreground">points</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
        </div>
      </Tabs>

      {/* Submit Task Dialog */}
      {selectedTask && (
        <SubmitTaskDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          task={selectedTask}
          collegeId={college.id}
          onSuccess={() => {
            toast.success('Task submitted successfully!');
            setSubmitDialogOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default function CollegeChamps() {
  const [selectedCollege, setSelectedCollege] = useState<{ college: College; rank: number } | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [allTasks, setAllTasks] = useState<CollegeTask[]>([]);

  useEffect(() => {
    fetchColleges();
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const tasks = await getAllCollegeTasks();
      setAllTasks(tasks);
    } catch (error) {
      console.error('Error fetching college tasks:', error);
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

  const handleSelectCollege = async (college: College, rank: number) => {
    // Fetch fresh college data before opening
    try {
      const { getCollege } = await import('@/lib/colleges');
      const freshCollege = await getCollege(college.id);
      setSelectedCollege({ college: freshCollege, rank });
      setIsDialogOpen(true);
    } catch (error) {
      console.error('Error fetching college details:', error);
      // Fallback to cached data
      setSelectedCollege({ college, rank });
      setIsDialogOpen(true);
    }
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    // Delay clearing the selected college to allow exit animation
    setTimeout(() => setSelectedCollege(null), 200);
    // Refresh colleges list when closing
    fetchColleges();
  };

  const sortedColleges = [...colleges].sort((a, b) => b.totalPoints - a.totalPoints);
  
  const totalPoints = colleges.reduce((sum, c) => sum + (c.totalPoints || 0), 0);
  const totalEvents = colleges.reduce((sum, c) => sum + (c.hostedEvents?.filter(e => e.status === 'completed').length || 0), 0);
  const totalMembers = colleges.reduce((sum, c) => sum + (c.members?.length || 0), 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-background relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern opacity-5" />
          <motion.div 
            className="container mx-auto px-4 text-center relative z-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <motion.div 
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 text-blue-600 text-sm font-medium mb-4"
              whileHover={{ scale: 1.05 }}
            >
              <GraduationCap className="h-4 w-4" />
              Student Program
            </motion.div>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              College Champs 🏆
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Empowering the next generation of cloud professionals. Compete with other colleges, 
              complete tasks, host events, and climb the leaderboard!
            </p>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
              <motion.div 
                className="glass-card rounded-xl p-4"
                whileHover={{ scale: 1.05 }}
              >
                <div className="text-2xl font-bold text-primary">{colleges.length}</div>
                <div className="text-sm text-muted-foreground">Colleges</div>
              </motion.div>
              <motion.div 
                className="glass-card rounded-xl p-4"
                whileHover={{ scale: 1.05 }}
              >
                <div className="text-2xl font-bold text-amber-500">{totalPoints.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">Total Points</div>
              </motion.div>
              <motion.div 
                className="glass-card rounded-xl p-4"
                whileHover={{ scale: 1.05 }}
              >
                <div className="text-2xl font-bold text-green-500">{totalEvents}</div>
                <div className="text-sm text-muted-foreground">Events Hosted</div>
              </motion.div>
              <motion.div 
                className="glass-card rounded-xl p-4"
                whileHover={{ scale: 1.05 }}
              >
                <div className="text-2xl font-bold text-purple-500">{totalMembers}</div>
                <div className="text-sm text-muted-foreground">Total Members</div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* Main Content */}
        <section className="py-12 container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Leaderboard */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Trophy className="h-6 w-6 text-amber-500" />
                    College Leaderboard
                  </h2>
                  <p className="text-muted-foreground">Ranked by total points earned</p>
                </div>
              </div>
              
              {isLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
                  <p className="text-muted-foreground">Loading colleges...</p>
                </div>
              ) : colleges.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="p-12 text-center">
                    <GraduationCap className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Colleges Yet</h3>
                    <p className="text-muted-foreground">
                      Be the first to register your college in the Champs program!
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <CollegeLeaderboard 
                  colleges={sortedColleges} 
                  onSelectCollege={handleSelectCollege}
                  tasks={allTasks}
                />
              )}
            </div>

            {/* Info Card */}
            <div className="lg:col-span-1">
              <Card className="glass-card sticky top-24">
                <CardContent className="p-8 text-center">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <GraduationCap className="h-16 w-16 text-primary mx-auto mb-4" />
                  </motion.div>
                  <h3 className="text-lg font-semibold mb-2">Select a College</h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Click on any college from the leaderboard to view their completed tasks, hosted events, and team members.
                  </p>
                  <div className="space-y-3 text-left">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-sm">View completed tasks & points earned</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Calendar className="h-5 w-5 text-blue-500" />
                      <span className="text-sm">See hosted events & workshops</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Users className="h-5 w-5 text-purple-500" />
                      <span className="text-sm">Meet the team members</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* College Details Modal */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-4xl h-[90vh] overflow-hidden p-0 w-[95vw] sm:w-full flex flex-col focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0">
            <DialogHeader className="sr-only">
              <DialogTitle>College Details</DialogTitle>
            </DialogHeader>
            {selectedCollege && (
              <div className="p-4 sm:p-6 flex flex-col overflow-hidden h-full">
                <CollegeDetailView 
                  college={selectedCollege.college} 
                  rank={selectedCollege.rank} 
                />
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Join CTA */}
        <section className="py-16 container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="glass-card overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-8 md:p-12 text-white">
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 mb-4">
                    <PartyPopper className="h-8 w-8" />
                    <h2 className="text-2xl md:text-3xl font-bold">Join the College Champs Program!</h2>
                  </div>
                  <p className="text-white/80 mb-6">
                    Start your college chapter today. Get access to exclusive resources, mentorship, 
                    and the chance to compete with top engineering colleges across India.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <Button size="lg" variant="secondary" className="bg-white text-blue-600 hover:bg-white/90">
                      Register Your College
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                    <Button size="lg" variant="outline" className="border-white/50 text-white hover:bg-white/10 hover:border-white bg-transparent">
                      Learn More
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
