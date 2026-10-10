import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShoppingBag, Coins, Loader2, Gift } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CheckoutDialog } from '@/components/store/CheckoutDialog';
import { usePrizeClaim } from '@/hooks/usePrizeClaim';
import { prizeTierById } from '@/lib/campaign';
import { getStoreItems, redeemStoreItem, SHIPPING_WINDOW, type RedeemRequest, type StoreItem } from '@/lib/store';
import { toast } from 'sonner';

export default function Store() {
  const { user, refreshUser } = useAuth();
  const [storeItems, setStoreItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  // Set when the checkout is a prize claim. Fixed when the dialog opens, so it
  // does not flip to a points checkout as the claimed coupon updates.
  const [checkoutCoupon, setCheckoutCoupon] = useState<{ code: string } | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const prizeClaim = usePrizeClaim();

  useEffect(() => {
    loadStoreItems();
  }, []);

  const loadStoreItems = async (quiet = false) => {
    try {
      if (!quiet) setLoading(true);
      const items = await getStoreItems();
      setStoreItems(items);
    } catch (error) {
      console.error('Failed to load store items:', error);
      if (!quiet) toast.error('Failed to load store items');
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  // The item an unused prize coupon claims: the one fixed when prizes were
  // issued, or for older coupons the prize's match by name.
  const prize = prizeClaim.canClaim ? prizeClaim.prize : null;
  const prizeTier = prizeTierById(prize?.tier);
  const prizeItem = prize
    ? storeItems.find((i) => i.id === prize.itemId) ??
      (prizeTier ? storeItems.find((i) => i.itemType !== 'virtual' && prizeTier.storeMatch.test(i.name)) : undefined)
    : undefined;

  const handleRedeemClick = (item: StoreItem) => {
    if (!user) {
      toast.error('Please sign in to redeem items');
      return;
    }
    setSelectedItem(item);
    setCheckoutCoupon(prize && item.id === prizeItem?.id ? { code: prize.code } : null);
    setCheckoutOpen(true);
  };

  /** Spend points on the item, or claim it with the prize coupon. Throws to keep the dialog open. */
  const handleCheckout = async (request: RedeemRequest) => {
    if (!selectedItem || !user) return;
    if (checkoutCoupon) {
      await prizeClaim.claim(request);
      await loadStoreItems(true);
      return;
    }
    try {
      const result = await redeemStoreItem(selectedItem.id, request);
      const isPhysical = selectedItem.itemType !== 'virtual';
      const next = !isPhysical
        ? (result.order.code ? 'Your code is on its way to your email.' : "We'll email your code once it's ready.")
        : request.fulfillmentMethod === 'ship'
          ? `It ships in ${SHIPPING_WINDOW}.`
          : 'Collect it at our next in-person event.';
      toast.success(
        `Redeemed ${selectedItem.name}. ${next} You have ${result.remainingPoints.toLocaleString()} points left.`,
      );
      // Refresh points and stock.
      await Promise.all([refreshUser(), loadStoreItems(true)]);
    } catch (error: unknown) {
      console.error('Failed to redeem item:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to redeem item');
      throw error;
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
                      <p className="text-sm text-muted-foreground">Available Balance</p>
                      <p className="text-3xl font-bold text-primary">{user.redeemablePoints.toLocaleString()}</p>
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
              {filteredItems.map((item) => {
                // A winner's prize: claimed with their coupon, free, even if
                // it shows out of stock while the organisers restock.
                const isPrize = item.id === prizeItem?.id;
                return (
                  <Card
                    key={item.id}
                    className={`glass-card hover-lift overflow-hidden ${isPrize ? 'ring-2 ring-orange-500/70' : ''}`}
                  >
                    <CardContent className="p-0">
                      <div className="h-40 bg-gradient-to-br from-purple-500/5 to-blue-500/5 flex items-center justify-center overflow-hidden">
                        {item.image?.startsWith('http') ? (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-contain p-2"
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
                          {isPrize ? (
                            <Badge className="shrink-0 gap-1 border-transparent bg-orange-500 text-white hover:bg-orange-500">
                              <Gift className="h-3 w-3" aria-hidden="true" />
                              Your prize
                            </Badge>
                          ) : !item.inStock && (
                            <Badge variant="secondary">Out of Stock</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">{item.description}</p>
                        <div className="flex items-center justify-between">
                          {isPrize ? (
                            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">
                              Free with your coupon
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 text-primary font-bold">
                              <Coins className="h-4 w-4" />
                              {item.points}
                            </div>
                          )}
                          {isPrize ? (
                            <Button
                              size="sm"
                              className="bg-orange-500 text-white hover:bg-orange-600"
                              onClick={() => handleRedeemClick(item)}
                            >
                              Claim free
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={!user || !item.inStock || (user.redeemablePoints < item.points)}
                              onClick={() => handleRedeemClick(item)}
                            >
                              {!user ? 'Sign In' : user.redeemablePoints < item.points ? 'Not Enough Points' : 'Redeem'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
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

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        item={selectedItem}
        coupon={checkoutCoupon}
        balance={user?.redeemablePoints}
        email={user?.email}
        defaultName={user?.name}
        onSubmit={handleCheckout}
      />
    </div>
  );
}
