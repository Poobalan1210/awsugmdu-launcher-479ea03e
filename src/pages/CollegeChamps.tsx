import { useState } from 'react';
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
import { 
  GraduationCap, Users, Calendar, Award, ArrowRight, Trophy, Medal, 
  CheckCircle2, Circle, MapPin, Star, Zap, Target, PartyPopper,
  ChevronRight, Clock, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { mockColleges, predefinedTasks, getTaskById, getUserById, College, CollegeTask } from '@/data/mockData';

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

function CollegeLeaderboard({ colleges, onSelectCollege }: { colleges: College[], onSelectCollege: (college: College) => void }) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {colleges.map((college, index) => (
        <motion.div
          key={college.id}
          variants={itemVariants}
          whileHover={{ scale: 1.01, x: 5 }}
          className="cursor-pointer"
          onClick={() => onSelectCollege(college)}
        >
          <Card className={`glass-card overflow-hidden transition-all hover:shadow-lg ${index < 3 ? 'border-2' : ''} ${
            index === 0 ? 'border-yellow-500/50 bg-gradient-to-r from-yellow-500/5 to-transparent' :
            index === 1 ? 'border-gray-400/50 bg-gradient-to-r from-gray-400/5 to-transparent' :
            index === 2 ? 'border-amber-600/50 bg-gradient-to-r from-amber-600/5 to-transparent' : ''
          }`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 flex justify-center">
                  {getRankIcon(college.rank)}
                </div>
                
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${college.color} flex items-center justify-center text-white font-bold text-lg shadow-lg`}>
                  {college.shortName.substring(0, 2)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold truncate">{college.shortName}</h3>
                    <Badge variant="outline" className="text-xs hidden sm:inline-flex">
                      <MapPin className="h-3 w-3 mr-1" />
                      {college.location.split(',')[0]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                      {college.completedTasks.length}/{predefinedTasks.length} tasks
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {college.hostedEvents.filter(e => e.status === 'completed').length} events
                    </span>
                  </div>
                  <Progress 
                    value={(college.completedTasks.length / predefinedTasks.length) * 100} 
                    className="h-1.5 mt-2"
                  />
                </div>
                
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1 text-xl font-bold">
                    <Zap className="h-5 w-5 text-amber-500" />
                    {college.totalPoints.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">points</p>
                </div>
                
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}

function CollegeDetailView({ college, onClose }: { college: College, onClose: () => void }) {
  const progressPercentage = (college.completedTasks.length / predefinedTasks.length) * 100;

  // Get member details
  const memberDetails = college.members.map(memberId => getUserById(memberId)).filter(Boolean);
  const champsLead = college.champsLeadId ? getUserById(college.champsLeadId) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      {/* College Header */}
      <div className={`bg-gradient-to-br ${college.color} p-6 rounded-2xl text-white mb-6`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {getRankIcon(college.rank)}
              <h2 className="text-2xl font-bold">{college.name}</h2>
            </div>
            <div className="flex items-center gap-4 text-white/80">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {college.location}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {college.members.length} members
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold flex items-center gap-2">
              <Zap className="h-8 w-8" />
              {college.totalPoints.toLocaleString()}
            </div>
            <p className="text-white/80">total points</p>
          </div>
        </div>
        
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span>Task Progress</span>
            <span>{college.completedTasks.length}/{predefinedTasks.length} completed</span>
          </div>
          <div className="h-3 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-white rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>

      {/* Lead Info */}
      <Card className="glass-card mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-12 w-12">
              {champsLead?.avatar ? (
                <AvatarImage src={champsLead.avatar} alt={college.champsLead} />
              ) : null}
              <AvatarFallback className={`bg-gradient-to-br ${college.color} text-white`}>
                {college.champsLead.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-sm text-muted-foreground">Champs Lead</p>
              <p className="font-semibold">{college.champsLead}</p>
              {champsLead?.designation && (
                <p className="text-xs text-muted-foreground">{champsLead.designation}</p>
              )}
            </div>
            <Badge variant="secondary" className="ml-auto">
              <Award className="h-3 w-3 mr-1" />
              Lead
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="completed" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="completed">Completed ({college.completedTasks.length})</TabsTrigger>
          <TabsTrigger value="events">Events ({college.hostedEvents.length})</TabsTrigger>
          <TabsTrigger value="members">Members ({college.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="completed" className="space-y-4">
          {college.completedTasks.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Completed Tasks Yet</h3>
                <p className="text-sm text-muted-foreground">
                  This college is just getting started. Tasks will appear here once completed.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {college.completedTasks.map((completion) => {
                const task = getTaskById(completion.taskId);
                if (!task) return null;
                
                return (
                  <motion.div
                    key={completion.taskId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-4 rounded-lg border bg-green-500/5 border-green-500/30"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 text-green-500">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-green-700 dark:text-green-400">
                            {task.title}
                          </span>
                          <Badge variant="outline" className={getCategoryColor(task.category)}>
                            {getCategoryIcon(task.category)}
                            <span className="ml-1 capitalize">{task.category}</span>
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Completed on {new Date(completion.completedAt).toLocaleDateString()}
                          {completion.bonusPoints && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              +{completion.bonusPoints} bonus
                            </Badge>
                          )}
                        </p>
                      </div>
                      <Badge className="bg-green-500">
                        {task.points} pts
                      </Badge>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          {college.hostedEvents.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Events Yet</h3>
                <p className="text-sm text-muted-foreground">
                  This college hasn't hosted any events yet. Events will appear here once hosted.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {college.hostedEvents.map((event) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Card className="glass-card hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold">{event.title}</h4>
                            <Badge variant={event.status === 'upcoming' ? 'default' : 'secondary'}>
                              {event.status === 'upcoming' ? 'Upcoming' : 'Completed'}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(event.date).toLocaleDateString()}
                            </span>
                            <Badge variant="outline" className="capitalize">{event.type}</Badge>
                            {event.status === 'completed' && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {event.attendees} attendees
                              </span>
                            )}
                          </div>
                        </div>
                        {event.pointsAwarded > 0 && (
                          <Badge className="bg-amber-500 text-white">
                            +{event.pointsAwarded} pts
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          {memberDetails.length === 0 ? (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-2">No Members Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Members will appear here once they join the college chapter.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {memberDetails.map((member) => {
                if (!member) return null;
                const isLead = member.id === college.champsLeadId;
                
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <Card className={`glass-card hover:shadow-md transition-shadow ${isLead ? 'border-2 border-amber-500/50' : ''}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={member.avatar} alt={member.name} />
                            <AvatarFallback className={`bg-gradient-to-br ${college.color} text-white`}>
                              {member.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                          <div className="flex items-center gap-2">
                              <Link 
                                to={`/profile/${member.id}`}
                                className="font-semibold hover:text-primary transition-colors"
                              >
                                {member.name}
                              </Link>
                              {isLead && (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                                  <Award className="h-3 w-3 mr-1" />
                                  Lead
                                </Badge>
                              )}
                            </div>
                            {member.designation && (
                              <p className="text-sm text-muted-foreground">{member.designation}</p>
                            )}
                            {member.company && (
                              <p className="text-xs text-muted-foreground">{member.company}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <Zap className="h-4 w-4 text-amber-500" />
                              {member.points}
                            </div>
                            <p className="text-xs text-muted-foreground">points</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}

export default function CollegeChamps() {
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const sortedColleges = [...mockColleges].sort((a, b) => a.rank - b.rank);
  
  const totalPoints = mockColleges.reduce((sum, c) => sum + c.totalPoints, 0);
  const totalEvents = mockColleges.reduce((sum, c) => sum + c.hostedEvents.filter(e => e.status === 'completed').length, 0);
  const totalMembers = mockColleges.reduce((sum, c) => sum + c.members.length, 0);

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
                <div className="text-2xl font-bold text-primary">{mockColleges.length}</div>
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
                <Badge variant="outline" className="text-sm">
                  Season 2024-25
                </Badge>
              </div>
              
              <CollegeLeaderboard 
                colleges={sortedColleges} 
                onSelectCollege={setSelectedCollege}
              />
            </div>

            {/* Task Overview / Selected College */}
            <div className="lg:col-span-1">
              <AnimatePresence mode="wait">
                {selectedCollege ? (
                  <motion.div
                    key={selectedCollege.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold">College Details</h3>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedCollege(null)}>
                        Close
                      </Button>
                    </div>
                    <CollegeDetailView college={selectedCollege} onClose={() => setSelectedCollege(null)} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="welcome-message"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </section>

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
                    <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
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
