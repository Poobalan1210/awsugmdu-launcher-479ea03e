import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { Leaderboard } from '@/components/home/Leaderboard';
import { EventsSection } from '@/components/home/EventsSection';
import { InitiativesSection } from '@/components/home/InitiativesSection';
import { Bug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        <HeroSection />
        
        <div className="container mx-auto px-4 py-16">
          <InitiativesSection />
        </div>

        {/* Events Section - Full Width */}
        <div className="container mx-auto px-4 py-16">
          <EventsSection />
        </div>

        {/* Leaderboard Section - Full Width */}
        <div className="container mx-auto px-4 py-16">
          <Leaderboard />
        </div>
        {/* Bug Report Section */}
        <div className="container mx-auto px-4 py-12">
          <Card className="glass-card border-dashed">
            <CardContent className="p-6 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left">
              <Bug className="h-6 w-6 text-amber-500 shrink-0" />
              <p className="text-muted-foreground">
                Found a bug? Please report it to us so we can fix it —{' '}
                <a
                  href="https://forms.gle/Wvm1SPmQrzapLESA7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  report a bug
                </a>
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Index;
