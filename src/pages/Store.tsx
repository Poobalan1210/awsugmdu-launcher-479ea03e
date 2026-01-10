import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingBag, Coins, Package } from 'lucide-react';
import { currentUser } from '@/data/mockData';

const storeItems = [
  {
    id: '1',
    name: 'AWS User Group T-Shirt',
    description: 'Premium cotton t-shirt with community logo',
    points: 500,
    image: '👕',
    inStock: true,
  },
  {
    id: '2',
    name: 'Cloud Sticker Pack',
    description: 'Set of 10 AWS-themed stickers',
    points: 100,
    image: '🎨',
    inStock: true,
  },
  {
    id: '3',
    name: 'Developer Hoodie',
    description: 'Comfortable hoodie for late-night coding',
    points: 800,
    image: '🧥',
    inStock: true,
  },
  {
    id: '4',
    name: 'Laptop Sleeve',
    description: 'Protective sleeve with community branding',
    points: 400,
    image: '💼',
    inStock: false,
  },
  {
    id: '5',
    name: 'Coffee Mug',
    description: 'Ceramic mug for your morning brew',
    points: 200,
    image: '☕',
    inStock: true,
  },
  {
    id: '6',
    name: 'Notebook & Pen Set',
    description: 'For sketching your architecture diagrams',
    points: 150,
    image: '📓',
    inStock: true,
  },
];

export default function Store() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1">
        {/* Hero */}
        <section className="py-16 bg-gradient-to-br from-purple-500/10 via-background to-background">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 text-purple-600 text-sm font-medium mb-4">
                  <ShoppingBag className="h-4 w-4" />
                  Community Store
                </div>
                <h1 className="text-3xl md:text-4xl font-bold mb-4">Redeem Your Points</h1>
                <p className="text-muted-foreground max-w-xl">
                  Exchange your hard-earned points for exclusive community merchandise and swag.
                </p>
              </div>
              <Card className="glass-card px-8 py-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <Coins className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Your Balance</p>
                    <p className="text-3xl font-bold text-primary">{currentUser.points.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">points</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* Products */}
        <section className="py-16 container mx-auto px-4">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {storeItems.map((item) => (
              <Card key={item.id} className="glass-card hover-lift overflow-hidden">
                <CardContent className="p-0">
                  <div className="h-40 bg-muted/50 flex items-center justify-center text-6xl">
                    {item.image}
                  </div>
                  <div className="p-6">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold">{item.name}</h3>
                      {!item.inStock && (
                        <Badge variant="secondary">Out of Stock</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-primary font-bold">
                        <Coins className="h-4 w-4" />
                        {item.points}
                      </div>
                      <Button 
                        size="sm" 
                        disabled={!item.inStock || currentUser.points < item.points}
                      >
                        {currentUser.points < item.points ? 'Not Enough Points' : 'Redeem'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-2xl font-bold mb-8">How to Earn Points</h2>
            <div className="grid gap-6 md:grid-cols-3 max-w-3xl mx-auto">
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="font-semibold mb-2">Complete Sprints</h3>
                <p className="text-sm text-muted-foreground">
                  Participate in monthly skill sprints and submit your work
                </p>
              </div>
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">2</span>
                </div>
                <h3 className="font-semibold mb-2">Write Blogs</h3>
                <p className="text-sm text-muted-foreground">
                  Share your learning journey through technical blog posts
                </p>
              </div>
              <div className="p-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-xl font-bold text-primary">3</span>
                </div>
                <h3 className="font-semibold mb-2">Help Others</h3>
                <p className="text-sm text-muted-foreground">
                  Answer questions and support fellow community members
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
