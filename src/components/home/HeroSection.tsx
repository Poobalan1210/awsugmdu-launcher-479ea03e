import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { ArrowRight, Rocket, Users, UsersRound, Calendar, CalendarCheck, Award, Trophy, Zap, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { getCommunityStats } from '@/lib/stats';
import { MEETUP_MEMBER_COUNT, MEETUPS_HOSTED_COUNT, BEST_UG_NOMINATIONS } from '@/data/achievements';

export function HeroSection() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['community-stats'],
    queryFn: getCommunityStats,
  });

  const activeSprint = stats?.activeSprint ?? null;

  // `isStatic` values are shown as-is (already include their suffix) and never
  // show a loading skeleton; the rest come from the live /stats query.
  const statCards: {
    label: string;
    value: string | number;
    icon: LucideIcon;
    isStatic?: boolean;
  }[] = [
    { label: 'Meetup Members', value: MEETUP_MEMBER_COUNT, icon: UsersRound, isStatic: true },
    { label: 'Active Members', value: stats?.memberCount ?? 0, icon: Users },
    { label: 'Meetups Hosted', value: MEETUPS_HOSTED_COUNT, icon: CalendarCheck, isStatic: true },
    { label: 'Events in 2026', value: stats?.meetupCount ?? 0, icon: Calendar },
    { label: 'Best UG Nominations', value: BEST_UG_NOMINATIONS, icon: Trophy, isStatic: true },
    { label: 'Badges Awarded', value: stats?.badgeCount ?? 0, icon: Award },
  ];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.2 }
  }
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/50 py-20 md:py-28">
      {/* Animated background elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-10 right-10 w-96 h-96 bg-orange-500/5 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 10, repeat: Infinity }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          className="max-w-4xl mx-auto text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Active Sprint Badge */}
          {activeSprint && (
            <motion.div variants={itemVariants}>
              <Link 
                to={`/skill-sprint?id=${activeSprint.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors mb-6"
              >
                <motion.span
                  className="w-2 h-2 rounded-full bg-primary"
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <Rocket className="h-4 w-4" />
                {activeSprint.title} is Live!
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.div>
          )}

          <motion.h1
            variants={itemVariants}
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
          >
            Welcome to{' '}
            <br></br>
            <span className="gradient-text">AWS User Group Madurai</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
          >
            Join a vibrant community of cloud enthusiasts, learn from experts, 
            participate in hands-on challenges, and accelerate your AWS journey.
          </motion.p>

          {/* Award highlights — links to the full Achievements page */}
          <motion.div
            variants={itemVariants}
            className="flex flex-wrap items-center justify-center gap-3 mb-10"
          >
            <Link
              to="/achievements"
              className="group inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
            >
              <Trophy className="h-4 w-4" />
              4× Best AWS UG Nominee
            </Link>
            <Link
              to="/achievements"
              className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              <Zap className="h-4 w-4" />
              Most Active UG — APAC Q1 2026
            </Link>
            <Link
              to="/achievements"
              className="group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              See all
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-4 justify-center mb-16"
          >
            <Button size="lg" asChild className="group">
              <Link to="/skill-sprint">
                Join Skill Sprint
                <motion.span
                  className="ml-2"
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <ArrowRight className="h-5 w-5" />
                </motion.span>
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/meetups">
                Explore Events
              </Link>
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto"
          >
            {statCards.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="glass-card rounded-xl p-4 text-center"
                whileHover={{ scale: 1.05, y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                {stat.isStatic ? (
                  <motion.p
                    className="text-2xl md:text-3xl font-bold"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {stat.value}
                  </motion.p>
                ) : statsLoading ? (
                  <div className="mx-auto mb-1 h-8 md:h-9 w-16 rounded-md bg-muted animate-pulse" />
                ) : (
                  <motion.p
                    className="text-2xl md:text-3xl font-bold"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {stat.value}+
                  </motion.p>
                )}
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
