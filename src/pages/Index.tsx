import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/home/HeroSection';
import { Leaderboard } from '@/components/home/Leaderboard';
import { EventsSection } from '@/components/home/EventsSection';
import { InitiativesSection } from '@/components/home/InitiativesSection';

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
      </main>

      <Footer />
    </div>
  );
};

export default Index;
