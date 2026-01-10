import { Link } from 'react-router-dom';
import { motion, Variants } from 'framer-motion';
import { Rocket, GraduationCap, Award, ShoppingBag, ArrowRight, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const initiatives = [
  {
    title: 'Builders Skill Sprint',
    description: 'Monthly themed challenges with hands-on labs, virtual sessions, and mentorship to build real-world AWS skills.',
    icon: Rocket,
    path: '/skill-sprint',
    color: 'from-primary/20 to-orange-500/20',
    iconColor: 'text-primary',
    highlight: true,
  },
  {
    title: 'Meetups',
    description: 'Join virtual and in-person events, workshops, and community gatherings to learn and network.',
    icon: Calendar,
    path: '/meetups',
    color: 'from-teal-500/20 to-emerald-500/20',
    iconColor: 'text-teal-600',
  },
  {
    title: 'College Champs',
    description: 'Empowering students with cloud skills through workshops, mentorship, and certification support.',
    icon: GraduationCap,
    path: '/college-champs',
    color: 'from-blue-500/20 to-indigo-500/20',
    iconColor: 'text-blue-600',
  },
  {
    title: 'Certification Circle',
    description: 'Study groups, resources, and peer support to help you earn AWS certifications faster.',
    icon: Award,
    path: '/certification-circle',
    color: 'from-amber-500/20 to-yellow-500/20',
    iconColor: 'text-amber-600',
  },
  {
    title: 'Community Store',
    description: 'Redeem your earned points for exclusive AWS merchandise and community swag.',
    icon: ShoppingBag,
    path: '/store',
    color: 'from-purple-500/20 to-pink-500/20',
    iconColor: 'text-purple-600',
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { duration: 0.4 }
  }
};

export function InitiativesSection() {
  return (
    <section>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Our <span className="gradient-text">Initiatives</span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Explore our programs designed to help you learn, grow, and connect with the AWS community.
        </p>
      </motion.div>

      <motion.div
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-50px" }}
      >
        {initiatives.map((initiative) => (
          <motion.div 
            key={initiative.title} 
            variants={cardVariants}
            whileHover={{ y: -8, transition: { duration: 0.2 } }}
            className={initiative.highlight ? 'sm:col-span-2 lg:col-span-1' : ''}
          >
            <Card className={`glass-card h-full relative overflow-hidden group ${initiative.highlight ? 'ring-2 ring-primary/20' : ''}`}>
              {/* Gradient background */}
              <div className={`absolute inset-0 bg-gradient-to-br ${initiative.color} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              
              <CardHeader className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <motion.div
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.5 }}
                    className={`p-2 rounded-lg bg-muted ${initiative.iconColor}`}
                  >
                    <initiative.icon className="h-6 w-6" />
                  </motion.div>
                  {initiative.highlight && (
                    <motion.span
                      className="text-xs px-2 py-1 rounded-full bg-primary text-primary-foreground font-medium"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      Popular
                    </motion.span>
                  )}
                </div>
                <CardTitle className="text-xl">{initiative.title}</CardTitle>
                <CardDescription>{initiative.description}</CardDescription>
              </CardHeader>
              <CardContent className="relative z-10">
                <Button variant="ghost" className="group/btn p-0 h-auto" asChild>
                  <Link to={initiative.path} className="flex items-center gap-2">
                    Explore
                    <ArrowRight className="h-4 w-4 group-hover/btn:translate-x-1 transition-transform" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
