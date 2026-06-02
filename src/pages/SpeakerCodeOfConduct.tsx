import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';
import { SpeakerCodeOfConductContent } from '@/components/common/SpeakerCodeOfConductContent';

export default function SpeakerCodeOfConduct() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ScrollText className="h-5 w-5" />
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold">Speaker Code of Conduct for Meetups</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-8">
            AWS User Group Madurai
          </p>

          <Card className="glass-card">
            <CardContent className="p-6 sm:p-8">
              <SpeakerCodeOfConductContent />
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
