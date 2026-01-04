import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

export default function CollegeChamps() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-4">College Champs</h1>
        <p className="text-muted-foreground">Coming soon...</p>
      </main>
      <Footer />
    </div>
  );
}
