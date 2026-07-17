import { useState, useEffect } from 'react';
import { motion, Variants } from 'framer-motion';
import { Trophy, ArrowRight, Linkedin, Loader2 } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { milestones } from '@/data/achievements';
import { getAchievements, type Achievement } from '@/lib/communityAchievements';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: React.ReactNode;
  description?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="text-center mb-12"
    >
      <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 py-1 px-4 text-xs font-bold uppercase tracking-widest hover:bg-primary/10">
        {eyebrow}
      </Badge>
      <h2 className="text-2xl md:text-3xl font-bold mb-3">{title}</h2>
      {description && (
        <p className="text-muted-foreground max-w-2xl mx-auto">{description}</p>
      )}
    </motion.div>
  );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
  const hasLink = !!achievement.linkedInUrl;
  return (
    <motion.a
      variants={itemVariants}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      href={hasLink ? achievement.linkedInUrl : undefined}
      target={hasLink ? '_blank' : undefined}
      rel={hasLink ? 'noopener noreferrer' : undefined}
      className={`group block ${hasLink ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <Card className="glass-card h-full overflow-hidden">
        <div className="aspect-video overflow-hidden bg-gradient-to-br from-primary/10 to-amber-500/10">
          {achievement.imageUrl ? (
            <img
              src={achievement.imageUrl}
              alt={achievement.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Trophy className="h-10 w-10 text-primary/40" />
            </div>
          )}
        </div>
        <CardContent className="p-5">
          <h3 className="font-semibold leading-snug line-clamp-2">{achievement.title}</h3>
          {hasLink && (
            <span className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-[#0A66C2]">
              <Linkedin className="h-4 w-4" />
              View on LinkedIn
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
            </span>
          )}
        </CardContent>
      </Card>
    </motion.a>
  );
}

export default function Achievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAchievements().then((data) => {
      if (mounted) {
        setAchievements(data);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/50 py-20 md:py-28 border-b border-border/50">
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              className="absolute top-16 left-10 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl"
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 9, repeat: Infinity }}
            />
            <motion.div
              className="absolute bottom-10 right-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
              animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
              transition={{ duration: 11, repeat: Infinity }}
            />
          </div>

          <div className="container mx-auto px-4 relative z-10">
            <motion.div
              className="max-w-3xl mx-auto text-center"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants}>
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-600 text-sm font-medium mb-6">
                  <Trophy className="h-4 w-4" />
                  Celebrating our community
                </span>
              </motion.div>

              <motion.h1
                variants={itemVariants}
                className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6"
              >
                Our <span className="gradient-text">Achievements</span>
              </motion.h1>

              <motion.p
                variants={itemVariants}
                className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
              >
                From a handful of cloud enthusiasts to one of India&apos;s most
                celebrated AWS communities — here are the milestones, awards, and
                the people who got us here.
              </motion.p>
            </motion.div>

            {/* Milestone stat band */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto mt-14"
            >
              {milestones.map((stat) => (
                <motion.div
                  key={stat.id}
                  variants={itemVariants}
                  whileHover={{ scale: 1.04, y: -4 }}
                  className="glass-card rounded-xl p-5 text-center"
                >
                  <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl md:text-3xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Achievement gallery (admin-managed) */}
        <section className="container mx-auto px-4 py-16 md:py-20">
          <SectionHeading
            eyebrow="Highlights"
            title={
              <>
                Awards, features &amp; <span className="gradient-text">proud moments</span>
              </>
            }
            description="Recognition from across our journey — tap a card to read the full story on LinkedIn."
          />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : achievements.length === 0 ? (
            <div className="max-w-md mx-auto text-center py-16">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Trophy className="h-7 w-7 text-primary" />
              </div>
              <p className="text-muted-foreground">
                Our achievement highlights will appear here soon. Check back shortly.
              </p>
            </div>
          ) : (
            <motion.div
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-50px' }}
            >
              {achievements.map((achievement) => (
                <AchievementCard key={achievement.id} achievement={achievement} />
              ))}
            </motion.div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
