import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig
} from '@/components/ui/chart';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import {
  GraduationCap, Calendar, Rocket, Users, TrendingUp,
  Trophy, Target, Activity, CheckCircle, Clock, XCircle
} from 'lucide-react';
import { format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, eachWeekOfInterval, eachMonthOfInterval, isWithinInterval,
  subMonths, subWeeks, subYears
} from 'date-fns';
import { getAllColleges, getAllCollegeTasks, College, CollegeTask } from '@/lib/colleges';
import { getMeetups } from '@/lib/meetups';
import { getSprints } from '@/lib/sprints';
import { Meetup, Sprint } from '@/data/mockData';
import { useAuth } from '@/contexts/AuthContext';

type Period = 'weekly' | 'monthly' | 'yearly';

const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#6366f1', '#14b8a6'];

// ─── College Champs Dashboard ───

function CollegeChampsDashboard() {
  const [colleges, setColleges] = useState<College[]>([]);
  const [tasks, setTasks] = useState<CollegeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('monthly');

  useEffect(() => {
    async function load() {
      try {
        const [c, t] = await Promise.all([getAllColleges(), getAllCollegeTasks()]);
        setColleges(c);
        setTasks(t);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const totalColleges = colleges.length;
    const totalPoints = colleges.reduce((s, c) => s + (c.totalPoints || 0), 0);
    const totalMembers = colleges.reduce((s, c) => s + (c.members?.length || 0), 0);
    const totalTasksCompleted = colleges.reduce((s, c) => s + (c.completedTasks?.length || 0), 0);
    return { totalColleges, totalPoints, totalMembers, totalTasksCompleted };
  }, [colleges]);

  const pointsTrend = useMemo(() => {
    const now = new Date();
    if (period === 'weekly') {
      const start = subWeeks(now, 12);
      const weeks = eachWeekOfInterval({ start, end: now });
      return weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart);
        const label = format(weekStart, 'MMM d');
        let points = 0;
        colleges.forEach(c => {
          c.completedTasks?.forEach(ct => {
            if (ct.completedAt && isWithinInterval(parseISO(ct.completedAt), { start: weekStart, end: weekEnd })) {
              const task = tasks.find(t => t.id === ct.taskId);
              points += ct.bonusPoints || ct.taskPoints || task?.points || 0;
            }
          });
        });
        return { label, points };
      });
    }
    if (period === 'monthly') {
      const start = subMonths(now, 12);
      const months = eachMonthOfInterval({ start, end: now });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const label = format(monthStart, 'MMM yyyy');
        let points = 0;
        colleges.forEach(c => {
          c.completedTasks?.forEach(ct => {
            if (ct.completedAt && isWithinInterval(parseISO(ct.completedAt), { start: monthStart, end: monthEnd })) {
              const task = tasks.find(t => t.id === ct.taskId);
              points += ct.bonusPoints || ct.taskPoints || task?.points || 0;
            }
          });
        });
        return { label, points };
      });
    }
    // yearly
    const years = [subYears(now, 2), subYears(now, 1), now];
    return years.map(y => {
      const yearStart = startOfYear(y);
      const yearEnd = endOfYear(y);
      const label = format(y, 'yyyy');
      let points = 0;
      colleges.forEach(c => {
        c.completedTasks?.forEach(ct => {
          if (ct.completedAt && isWithinInterval(parseISO(ct.completedAt), { start: yearStart, end: yearEnd })) {
            const task = tasks.find(t => t.id === ct.taskId);
            points += ct.bonusPoints || ct.taskPoints || task?.points || 0;
          }
        });
      });
      return { label, points };
    });
  }, [colleges, tasks, period]);

  const collegeRanking = useMemo(() => {
    return [...colleges]
      .sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0))
      .slice(0, 10)
      .map(c => ({ name: c.shortName || c.name, points: c.totalPoints || 0 }));
  }, [colleges]);

  const taskCategoryData = useMemo(() => {
    const catMap: Record<string, number> = {};
    colleges.forEach(c => {
      c.completedTasks?.forEach(ct => {
        const task = tasks.find(t => t.id === ct.taskId);
        if (task) {
          catMap[task.category] = (catMap[task.category] || 0) + 1;
        }
      });
    });
    return Object.entries(catMap).map(([name, value]) => ({ name, value }));
  }, [colleges, tasks]);

  const pointsChartConfig: ChartConfig = {
    points: { label: 'Points Earned', color: '#8b5cf6' },
  };
  const rankingChartConfig: ChartConfig = {
    points: { label: 'Total Points', color: '#06b6d4' },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Clock className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-purple-500" /> College Champs Progress
        </h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-purple-500">{stats.totalColleges}</div>
          <p className="text-sm text-muted-foreground">Colleges</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-cyan-500">{stats.totalMembers}</div>
          <p className="text-sm text-muted-foreground">Total Members</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-amber-500">{stats.totalPoints.toLocaleString()}</div>
          <p className="text-sm text-muted-foreground">Total Points</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-green-500">{stats.totalTasksCompleted}</div>
          <p className="text-sm text-muted-foreground">Tasks Completed</p>
        </CardContent></Card>
      </div>

      {/* Points Trend Chart */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Points Earned Over Time</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={pointsChartConfig} className="h-[300px] w-full">
            <LineChart data={pointsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="points" stroke="var(--color-points)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* College Ranking */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Top Colleges by Points</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={rankingChartConfig} className="h-[300px] w-full">
              <BarChart data={collegeRanking} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={11} tickLine={false} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="points" fill="var(--color-points)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Task Categories */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Tasks by Category</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[300px] w-full">
              <PieChart>
                <Pie data={taskCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {taskCategoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


// ─── Meetups Dashboard ───

function MeetupsDashboard() {
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('monthly');

  useEffect(() => {
    async function load() {
      try {
        const m = await getMeetups();
        setMeetups(m);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const total = meetups.length;
    const completed = meetups.filter(m => m.status === 'completed').length;
    const upcoming = meetups.filter(m => m.status === 'upcoming').length;
    const totalAttendees = meetups.reduce((s, m) => s + (m.attendedUsers?.length || m.attendees || 0), 0);
    const totalRegistered = meetups.reduce((s, m) => s + (m.registeredUsers?.length || 0), 0);
    return { total, completed, upcoming, totalAttendees, totalRegistered };
  }, [meetups]);

  const meetupsTrend = useMemo(() => {
    const now = new Date();
    if (period === 'weekly') {
      const start = subWeeks(now, 12);
      const weeks = eachWeekOfInterval({ start, end: now });
      return weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart);
        const label = format(weekStart, 'MMM d');
        let count = 0;
        let attendees = 0;
        meetups.forEach(m => {
          try {
            const d = parseISO(m.date);
            if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
              count++;
              attendees += m.attendedUsers?.length || m.attendees || 0;
            }
          } catch {}
        });
        return { label, count, attendees };
      });
    }
    if (period === 'monthly') {
      const start = subMonths(now, 12);
      const months = eachMonthOfInterval({ start, end: now });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const label = format(monthStart, 'MMM yyyy');
        let count = 0;
        let attendees = 0;
        meetups.forEach(m => {
          try {
            const d = parseISO(m.date);
            if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
              count++;
              attendees += m.attendedUsers?.length || m.attendees || 0;
            }
          } catch {}
        });
        return { label, count, attendees };
      });
    }
    // yearly
    const years = [subYears(now, 2), subYears(now, 1), now];
    return years.map(y => {
      const yearStart = startOfYear(y);
      const yearEnd = endOfYear(y);
      const label = format(y, 'yyyy');
      let count = 0;
      let attendees = 0;
      meetups.forEach(m => {
        try {
          const d = parseISO(m.date);
          if (isWithinInterval(d, { start: yearStart, end: yearEnd })) {
            count++;
            attendees += m.attendedUsers?.length || m.attendees || 0;
          }
        } catch {}
      });
      return { label, count, attendees };
    });
  }, [meetups, period]);

  const typeDistribution = useMemo(() => {
    const typeMap: Record<string, number> = {};
    meetups.forEach(m => {
      const t = m.type || 'other';
      typeMap[t] = (typeMap[t] || 0) + 1;
    });
    return Object.entries(typeMap).map(([name, value]) => ({ name, value }));
  }, [meetups]);

  const meetupsChartConfig: ChartConfig = {
    count: { label: 'Meetups', color: '#06b6d4' },
    attendees: { label: 'Attendees', color: '#8b5cf6' },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Clock className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-cyan-500" /> Meetups Progress
        </h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-cyan-500">{stats.total}</div>
          <p className="text-sm text-muted-foreground">Total Meetups</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-green-500">{stats.completed}</div>
          <p className="text-sm text-muted-foreground">Completed</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-amber-500">{stats.upcoming}</div>
          <p className="text-sm text-muted-foreground">Upcoming</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-purple-500">{stats.totalAttendees}</div>
          <p className="text-sm text-muted-foreground">Total Attendees</p>
        </CardContent></Card>
      </div>

      {/* Meetups & Attendees Trend */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Meetups & Attendance Over Time</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={meetupsChartConfig} className="h-[300px] w-full">
            <BarChart data={meetupsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="attendees" fill="var(--color-attendees)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Type Distribution */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Meetups by Type</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={{}} className="h-[300px] w-full">
            <PieChart>
              <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                {typeDistribution.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Skill Sprint Dashboard ───

function SprintsDashboard() {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('monthly');

  useEffect(() => {
    async function load() {
      try {
        const s = await getSprints();
        setSprints(s);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const stats = useMemo(() => {
    const total = sprints.length;
    const active = sprints.filter(s => s.status === 'active').length;
    const completed = sprints.filter(s => s.status === 'completed').length;
    const totalParticipants = sprints.reduce((sum, s) => sum + (s.registeredUsers?.length || s.participants || 0), 0);
    const totalSubmissions = sprints.reduce((sum, s) => sum + (s.submissions?.length || 0), 0);
    const totalSessions = sprints.reduce((sum, s) => sum + (s.sessions?.length || 0), 0);
    return { total, active, completed, totalParticipants, totalSubmissions, totalSessions };
  }, [sprints]);

  const sprintsTrend = useMemo(() => {
    const now = new Date();
    if (period === 'weekly') {
      const start = subWeeks(now, 12);
      const weeks = eachWeekOfInterval({ start, end: now });
      return weeks.map(weekStart => {
        const weekEnd = endOfWeek(weekStart);
        const label = format(weekStart, 'MMM d');
        let submissions = 0;
        let participants = 0;
        sprints.forEach(s => {
          s.submissions?.forEach(sub => {
            try {
              const d = parseISO(sub.submittedAt);
              if (isWithinInterval(d, { start: weekStart, end: weekEnd })) {
                submissions++;
              }
            } catch {}
          });
          // Count participants who joined in this period
          try {
            const sd = parseISO(s.startDate);
            if (isWithinInterval(sd, { start: weekStart, end: weekEnd })) {
              participants += s.registeredUsers?.length || s.participants || 0;
            }
          } catch {}
        });
        return { label, submissions, participants };
      });
    }
    if (period === 'monthly') {
      const start = subMonths(now, 12);
      const months = eachMonthOfInterval({ start, end: now });
      return months.map(monthStart => {
        const monthEnd = endOfMonth(monthStart);
        const label = format(monthStart, 'MMM yyyy');
        let submissions = 0;
        let participants = 0;
        sprints.forEach(s => {
          s.submissions?.forEach(sub => {
            try {
              const d = parseISO(sub.submittedAt);
              if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
                submissions++;
              }
            } catch {}
          });
          try {
            const sd = parseISO(s.startDate);
            if (isWithinInterval(sd, { start: monthStart, end: monthEnd })) {
              participants += s.registeredUsers?.length || s.participants || 0;
            }
          } catch {}
        });
        return { label, submissions, participants };
      });
    }
    // yearly
    const years = [subYears(now, 2), subYears(now, 1), now];
    return years.map(y => {
      const yearStart = startOfYear(y);
      const yearEnd = endOfYear(y);
      const label = format(y, 'yyyy');
      let submissions = 0;
      let participants = 0;
      sprints.forEach(s => {
        s.submissions?.forEach(sub => {
          try {
            const d = parseISO(sub.submittedAt);
            if (isWithinInterval(d, { start: yearStart, end: yearEnd })) {
              submissions++;
            }
          } catch {}
        });
        try {
          const sd = parseISO(s.startDate);
          if (isWithinInterval(sd, { start: yearStart, end: yearEnd })) {
            participants += s.registeredUsers?.length || s.participants || 0;
          }
        } catch {}
      });
      return { label, submissions, participants };
    });
  }, [sprints, period]);

  const submissionStatus = useMemo(() => {
    const statusMap: Record<string, number> = {};
    sprints.forEach(s => {
      s.submissions?.forEach(sub => {
        const st = sub.status || 'pending';
        statusMap[st] = (statusMap[st] || 0) + 1;
      });
    });
    return Object.entries(statusMap).map(([name, value]) => ({ name, value }));
  }, [sprints]);

  const sprintChartConfig: ChartConfig = {
    submissions: { label: 'Submissions', color: '#f59e0b' },
    participants: { label: 'Participants', color: '#10b981' },
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Clock className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Rocket className="h-5 w-5 text-amber-500" /> Builders Skill Sprint Progress
        </h2>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-amber-500">{stats.total}</div>
          <p className="text-sm text-muted-foreground">Total Sprints</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-green-500">{stats.active}</div>
          <p className="text-sm text-muted-foreground">Active</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-blue-500">{stats.completed}</div>
          <p className="text-sm text-muted-foreground">Completed</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-purple-500">{stats.totalParticipants}</div>
          <p className="text-sm text-muted-foreground">Participants</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-cyan-500">{stats.totalSubmissions}</div>
          <p className="text-sm text-muted-foreground">Submissions</p>
        </CardContent></Card>
        <Card className="glass-card"><CardContent className="p-4 text-center">
          <div className="text-3xl font-bold text-pink-500">{stats.totalSessions}</div>
          <p className="text-sm text-muted-foreground">Sessions</p>
        </CardContent></Card>
      </div>

      {/* Submissions & Participants Trend */}
      <Card className="glass-card">
        <CardHeader><CardTitle className="text-base">Submissions & Participants Over Time</CardTitle></CardHeader>
        <CardContent>
          <ChartContainer config={sprintChartConfig} className="h-[300px] w-full">
            <LineChart data={sprintsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} tickLine={false} />
              <YAxis fontSize={12} tickLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="submissions" stroke="var(--color-submissions)" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="participants" stroke="var(--color-participants)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Submission Status */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Submission Status</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[300px] w-full">
              <PieChart>
                <Pie data={submissionStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {submissionStatus.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Sprint Leaderboard */}
        <Card className="glass-card">
          <CardHeader><CardTitle className="text-base">Sprints by Participation</CardTitle></CardHeader>
          <CardContent>
            <ChartContainer config={{ participants: { label: 'Participants', color: '#10b981' } }} className="h-[300px] w-full">
              <BarChart data={sprints.map(s => ({ name: s.title.length > 20 ? s.title.slice(0, 20) + '…' : s.title, participants: s.registeredUsers?.length || s.participants || 0 })).sort((a, b) => b.participants - a.participants).slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" fontSize={12} tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={11} tickLine={false} width={120} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="participants" fill="var(--color-participants)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Main Dashboard Page ───

export default function Dashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('champs');
  const isAdmin = user?.role === 'organiser' || user?.role === 'admin';

  if (!isAdmin) {
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
          <div className="mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" /> Dashboard
            </h1>
            <p className="text-muted-foreground">Track progress across all community initiatives</p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="champs" className="gap-2">
                <GraduationCap className="h-4 w-4" />
                College Champs
              </TabsTrigger>
              <TabsTrigger value="meetups" className="gap-2">
                <Calendar className="h-4 w-4" />
                Meetups
              </TabsTrigger>
              <TabsTrigger value="sprints" className="gap-2">
                <Rocket className="h-4 w-4" />
                Skill Sprints
              </TabsTrigger>
            </TabsList>

            <TabsContent value="champs">
              <CollegeChampsDashboard />
            </TabsContent>
            <TabsContent value="meetups">
              <MeetupsDashboard />
            </TabsContent>
            <TabsContent value="sprints">
              <SprintsDashboard />
            </TabsContent>
          </Tabs>
        </motion.div>
      </main>
      <Footer />
    </div>
  );
}
