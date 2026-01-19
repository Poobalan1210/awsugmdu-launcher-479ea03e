import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { Calendar, Users, ArrowRight, MapPin, Video, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO, isPast } from 'date-fns';
import { useState, useEffect } from 'react';
import { getMeetups } from '@/lib/meetups';
import { Meetup } from '@/data/mockData';

const getEventTypeBadge = (type: string) => {
  switch (type) {
    case 'virtual':
      return <Badge variant="secondary" className="gap-1"><Video className="h-3 w-3" />Virtual</Badge>;
    case 'in-person':
      return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1"><MapPin className="h-3 w-3" />In-Person</Badge>;
    case 'hybrid':
      return <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">Hybrid</Badge>;
    case 'skill-sprint':
      return <Badge className="bg-primary/10 text-primary border-primary/30">Skill Sprint</Badge>;
    case 'certification-circle':
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Certification</Badge>;
    case 'college-champ':
      return <Badge className="bg-pink-500/10 text-pink-600 border-pink-500/30">College Champ</Badge>;
    default:
      return null;
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } }
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

function EventCard({ event }: { event: Meetup }) {
  const eventDate = parseISO(event.date);
  const isUpcoming = event.status === 'upcoming' || event.status === 'draft';

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
    >
      <Card className="glass-card h-full flex flex-col">
        <CardContent className="p-5 flex-1 flex flex-col">
          <div className="flex flex-wrap gap-2 mb-3">
            {getEventTypeBadge(event.type)}
          </div>
          <h3 className="font-semibold text-lg mb-2 line-clamp-2">{event.title}</h3>
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2 flex-1">
            {event.description}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {format(eventDate, 'MMM d, yyyy')}
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {event.attendees}
            </div>
          </div>
          <Button 
            className="w-full group" 
            variant={isUpcoming ? "default" : "outline"} 
            size="sm"
            asChild
          >
            <Link to={`/meetups?id=${event.id}`}>
              {isUpcoming ? 'Register Now' : 'View Details'}
              <ExternalLink className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function EventsSection() {
  const [meetups, setMeetups] = useState<Meetup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMeetups = async () => {
      try {
        const allMeetups = await getMeetups();
        setMeetups(allMeetups.filter(m => m.status !== 'draft'));
      } catch (error) {
        console.error('Failed to fetch meetups:', error);
        setMeetups([]);
      } finally {
        setLoading(false);
      }
    };
    fetchMeetups();
  }, []);

  const upcomingEvents = meetups.filter((e) => e.status === 'upcoming');
  const pastEvents = meetups.filter((e) => e.status === 'completed');

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Calendar className="h-7 w-7 text-primary" />
            Events & Highlights
          </h2>
        </div>
        <Card className="glass-card">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Loading events...</p>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
          >
            <Calendar className="h-7 w-7 text-primary" />
          </motion.div>
          Events & Highlights
        </h2>
        <Button variant="ghost" asChild>
          <Link to="/meetups" className="flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-xs mb-6">
          <TabsTrigger value="upcoming" className="relative">
            Upcoming
            {upcomingEvents.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center">
                {upcomingEvents.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upcoming">
          {upcomingEvents.length > 0 ? (
            <motion.div 
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {upcomingEvents.slice(0, 6).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </motion.div>
          ) : (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No upcoming events scheduled.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="past">
          {pastEvents.length > 0 ? (
            <motion.div 
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {pastEvents.slice(0, 6).map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </motion.div>
          ) : (
            <Card className="glass-card">
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No past events yet.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
