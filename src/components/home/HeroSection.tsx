import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { ArrowRight, Rocket, Users, Calendar, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockSprints, mockUsers, mockEvents } from '@/data/mockData';

const stats = [
  { label: 'Active Members', value: mockUsers.length * 12, icon: Users },
  { label: 'Events Hosted', value: mockEvents.length * 5, icon: Calendar },
  { label: 'Badges Awarded', value: 150, icon: Award },
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

export function HeroSection() {
  const activeSprint = mockSprints.find((s) => s.status === 'active');

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
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto"
          >
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="glass-card rounded-xl p-4 text-center"
                whileHover={{ scale: 1.05, y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
                <motion.p
                  className="text-2xl md:text-3xl font-bold"
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                >
                  {stat.value}+
                </motion.p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
