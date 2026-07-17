import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { Trophy, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { awards, milestones } from '@/data/achievements';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4 } },
};

export function AchievementsSection() {
  return (
    <section>
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, -8, 8, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <Trophy className="h-7 w-7 text-amber-500" />
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-bold">
            Our <span className="gradient-text">Achievements</span>
          </h2>
        </div>
        <Button variant="ghost" asChild className="shrink-0">
          <Link to="/achievements" className="flex items-center gap-1">
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Milestone stats */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px' }}
      >
        {milestones.map((stat) => (
          <motion.div
            key={stat.id}
            variants={itemVariants}
            whileHover={{ scale: 1.04, y: -4 }}
          >
            <Card className="glass-card h-full">
              <CardContent className="p-5 text-center">
                <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl md:text-3xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Award highlights */}
      <motion.div
        className="grid gap-4 sm:grid-cols-2"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px' }}
      >
        {awards.map((award) => (
          <motion.div key={award.id} variants={itemVariants}>
            <Link to="/achievements" className="block h-full">
              <Card className="glass-card h-full relative overflow-hidden group hover:shadow-xl transition-shadow">
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${award.accent} opacity-50 group-hover:opacity-100 transition-opacity duration-300`}
                />
                <CardContent className="relative z-10 p-5 flex items-center gap-4">
                  <div className={`shrink-0 p-2.5 rounded-lg bg-background/70 backdrop-blur ${award.iconColor}`}>
                    <award.icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-tight">{award.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{award.detail}</p>
                  </div>
                  {award.years && (
                    <div className="hidden sm:flex flex-wrap justify-end gap-1 shrink-0 max-w-[45%]">
                      {award.years.map((year) => (
                        <span
                          key={year}
                          className="inline-flex items-center rounded-full bg-background/80 border border-border/60 px-2 py-0.5 text-xs font-semibold"
                        >
                          {year}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
