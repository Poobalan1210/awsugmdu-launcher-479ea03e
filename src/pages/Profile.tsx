import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useParams } from 'react-router-dom';

export default function Profile() {
  const { id } = useParams();
  
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold mb-4">User Profile</h1>
        <p className="text-muted-foreground">Profile ID: {id}</p>
      </main>
      <Footer />
    </div>
  );
}
