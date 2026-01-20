import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingBag, Coins, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getStoreItems, redeemStoreItem, type StoreItem } from '@/lib/store';
import { toast } from 'sonner';

export default function Store() {
  const { user, refreshUser } = useAuth();
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeemingItemId, setRedeemingItemId] = useState<string | null>(null);
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [shippingAddress, setShippingAddress] = useState({
    name: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
  });

  useEffect(() => {
    loadStoreItems();
  }, []);

  const loadStoreItems = async () => {
    try {
      setLoading(true);
      const items = await getStoreItems();
      setStoreItems(items);
    } catch (error) {
      console.error('Failed to load store items:', error);
      toast.error('Failed to load store items');
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemClick = (item: StoreItem) => {
    if (!user) {
      toast.error('Please sign in to redeem items');
      return;
    }
    setSelectedItem(item);
    setShippingAddress({
      name: user.name || '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      phone: '',
    });
    setShowRedeemDialog(true);
  };

  const handleRedeem = async () => {
    if (!selectedItem || !user) return;

    try {
      setRedeemingItemId(selectedItem.id);
      const result = await redeemStoreItem(selectedItem.id, user.id, shippingAddress);
      toast.success(`Successfully redeemed ${selectedItem.name}! Remaining points: ${result.remainingPoints}`);
      setShowRedeemDialog(false);
      
      // Refresh user data to update points
      await refreshUser();
    } catch (error: any) {
      console.error('Failed to redeem item:', error);
      toast.error(error.message || 'Failed to redeem item');
    } finally {
      setRedeemingItemId(null);
    }
  };

  // Get unique categories
  const categories = ['all', ...new Set(storeItems.map(item => item.category || 'general'))];
  
  // Filter items by category
  const filteredItems = categoryFilter === 'all' 
    ? storeItems 
    : storeItems.filter(item => (item.category || 'general') === categoryFilter);

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
              {user && (
                <Card className="glass-card px-8 py-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Coins className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Your Balance</p>
                      <p className="text-3xl font-bold text-primary">{user.points.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">points</p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </section>

        {/* Products */}
        <section className="py-16 container mx-auto px-4">
          {/* Category Filter */}
          <div className="mb-6 flex items-center gap-4">
            <Label htmlFor="category-filter" className="text-sm font-medium">Filter by Category:</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="category-filter" className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category === 'all' ? 'All Items' : category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {filteredItems.map((item) => (
                <Card key={item.id} className="glass-card hover-lift overflow-hidden">
                  <CardContent className="p-0">
                    <div className="h-40 bg-gradient-to-br from-purple-500/5 to-blue-500/5 flex items-center justify-center overflow-hidden">
                      {item.image?.startsWith('http') ? (
                        <img 
                          src={item.image} 
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span role="img" aria-label={item.name} className="text-7xl">
                          {item.image}
                        </span>
                      )}
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
                          disabled={!user || !item.inStock || (user.points < item.points)}
                          onClick={() => handleRedeemClick(item)}
                        >
                          {!user ? 'Sign In' : user.points < item.points ? 'Not Enough Points' : 'Redeem'}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
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

      {/* Redeem Dialog */}
      <Dialog open={showRedeemDialog} onOpenChange={setShowRedeemDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Redeem {selectedItem?.name}</DialogTitle>
            <DialogDescription>
              This will cost {selectedItem?.points} points. Please provide your shipping address.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={shippingAddress.name}
                onChange={(e) => setShippingAddress({ ...shippingAddress, name: e.target.value })}
                placeholder="John Doe"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={shippingAddress.address}
                onChange={(e) => setShippingAddress({ ...shippingAddress, address: e.target.value })}
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={shippingAddress.city}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={shippingAddress.state}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, state: e.target.value })}
                  placeholder="State"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="zipCode">ZIP Code</Label>
                <Input
                  id="zipCode"
                  value={shippingAddress.zipCode}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, zipCode: e.target.value })}
                  placeholder="12345"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={shippingAddress.phone}
                  onChange={(e) => setShippingAddress({ ...shippingAddress, phone: e.target.value })}
                  placeholder="+1234567890"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRedeemDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRedeem} 
              disabled={redeemingItemId === selectedItem?.id || !shippingAddress.name || !shippingAddress.address}
            >
              {redeemingItemId === selectedItem?.id ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redeeming...
                </>
              ) : (
                'Confirm Redemption'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
