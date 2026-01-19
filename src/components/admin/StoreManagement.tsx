import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Edit, Trash2, Package, ShoppingBag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getStoreItems, createStoreItem, updateStoreItem, deleteStoreItem, getOrders, assignCodeToOrder, updateOrderStatus, type StoreItem, type Order } from '@/lib/store';

export default function StoreManagement() {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userDetails, setUserDetails] = useState<Record<string, { name: string; email: string }>>({});
  const [loading, setLoading] = useState(true);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [showOrderDialog, setShowOrderDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<StoreItem | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [saving, setSaving] = useState(false);

  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    points: 0,
    image: '',
    itemType: 'physical' as 'physical' | 'virtual',
    category: 'general',
    inStock: true,
    availableCodes: [] as string[],
  });

  const [codeInput, setCodeInput] = useState('');
  const [orderCode, setOrderCode] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [itemsData, ordersData] = await Promise.all([
        getStoreItems(),
        getOrders()
      ]);
      setItems(itemsData);
      setOrders(ordersData);
      
      // Fetch user details for all orders
      const uniqueUserIds = [...new Set(ordersData.map(o => o.userId))];
      const userDetailsMap: Record<string, { name: string; email: string }> = {};
      
      await Promise.all(
        uniqueUserIds.map(async (userId) => {
          try {
            const response = await fetch(`${import.meta.env.VITE_API_ENDPOINT}/users/${userId}`);
            if (response.ok) {
              const user = await response.json();
              userDetailsMap[userId] = {
                name: user.name || 'Unknown User',
                email: user.email || ''
              };
            }
          } catch (error) {
            console.error(`Failed to fetch user ${userId}:`, error);
            userDetailsMap[userId] = { name: 'Unknown User', email: '' };
          }
        })
      );
      
      setUserDetails(userDetailsMap);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Failed to load store data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateItem = () => {
    setEditingItem(null);
    setItemForm({
      name: '',
      description: '',
      points: 0,
      image: '',
      itemType: 'physical',
      category: 'general',
      inStock: true,
      availableCodes: [],
    });
    setShowItemDialog(true);
  };

  const handleEditItem = (item: StoreItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      description: item.description,
      points: item.points,
      image: item.image,
      itemType: item.itemType,
      category: item.category || 'general',
      inStock: item.inStock,
      availableCodes: item.availableCodes || [],
    });
    setShowItemDialog(true);
  };

  const handleSaveItem = async () => {
    try {
      setSaving(true);
      if (editingItem) {
        await updateStoreItem(editingItem.id, itemForm);
        toast.success('Item updated successfully');
      } else {
        await createStoreItem(itemForm);
        toast.success('Item created successfully');
      }
      setShowItemDialog(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save item');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await deleteStoreItem(id);
      toast.success('Item deleted successfully');
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete item');
    }
  };

  const handleAddCode = () => {
    if (!codeInput.trim()) return;
    setItemForm({
      ...itemForm,
      availableCodes: [...itemForm.availableCodes, codeInput.trim()],
      inStock: true,
    });
    setCodeInput('');
  };

  const handleRemoveCode = (index: number) => {
    const newCodes = itemForm.availableCodes.filter((_, i) => i !== index);
    setItemForm({
      ...itemForm,
      availableCodes: newCodes,
      inStock: newCodes.length > 0 || itemForm.itemType === 'physical',
    });
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    setOrderCode('');
    setAdminNotes(order.adminNotes || '');
    setShowOrderDialog(true);
  };

  const handleAssignCode = async () => {
    if (!selectedOrder || !orderCode.trim()) return;

    try {
      setSaving(true);
      await assignCodeToOrder(selectedOrder.id, orderCode.trim());
      toast.success('Code assigned and email sent');
      setShowOrderDialog(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign code');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateOrderStatus = async (status: Order['status']) => {
    if (!selectedOrder) return;

    try {
      setSaving(true);
      await updateOrderStatus(selectedOrder.id, status, adminNotes);
      toast.success('Order status updated');
      setShowOrderDialog(false);
      loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update order');
    } finally {
      setSaving(false);
    }
  };

  const pendingOrders = orders
    .filter(o => o.status === 'pending')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const completedOrders = orders
    .filter(o => o.status === 'completed')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const otherOrders = orders
    .filter(o => o.status !== 'pending' && o.status !== 'completed')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6">
      <Tabs defaultValue="items" className="w-full">
        <TabsList>
          <TabsTrigger value="items">Store Items</TabsTrigger>
          <TabsTrigger value="orders">
            Orders {pendingOrders.length > 0 && <Badge className="ml-2">{pendingOrders.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Store Items</h3>
              <p className="text-sm text-muted-foreground">Manage store inventory and items</p>
            </div>
            <Button onClick={handleCreateItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="text-4xl">{item.image}</div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => handleEditItem(item)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    <CardDescription className="text-xs">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Points:</span>
                        <span className="font-semibold">{item.points}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Type:</span>
                        <Badge variant={item.itemType === 'virtual' ? 'default' : 'secondary'}>
                          {item.itemType}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Stock:</span>
                        <Badge variant={item.inStock ? 'default' : 'destructive'}>
                          {item.inStock ? 'In Stock' : 'Out of Stock'}
                        </Badge>
                      </div>
                      {item.itemType === 'virtual' && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Codes:</span>
                          <span className="font-semibold">{item.availableCodes?.length || 0}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Pending Orders</h3>
            <p className="text-sm text-muted-foreground">Orders awaiting processing</p>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : pendingOrders.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No pending orders
              </CardContent>
            </Card>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
              {pendingOrders.map((order) => (
                <Card key={order.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{order.itemName}</CardTitle>
                        <CardDescription className="text-xs">Order #{order.id.slice(-8)}</CardDescription>
                      </div>
                      <Badge>{order.itemType}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">User:</span>
                        <span className="font-semibold">{userDetails[order.userId]?.name || 'Loading...'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">User ID:</span>
                        <span className="font-mono text-xs">{order.userId}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Points:</span>
                        <span className="font-semibold">{order.points}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Date:</span>
                        <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                      </div>
                      {order.itemType === 'physical' && order.shippingAddress && (
                        <div className="text-sm pt-2 border-t">
                          <p className="font-semibold mb-1">Shipping Address:</p>
                          <p className="text-muted-foreground text-xs">
                            {order.shippingAddress.name}<br />
                            {order.shippingAddress.address}<br />
                            {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}<br />
                            {order.shippingAddress.phone}
                          </p>
                        </div>
                      )}
                      <Button className="w-full mt-2" onClick={() => handleViewOrder(order)}>
                        Process Order
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-4">Completed Orders</h3>
            {completedOrders.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No completed orders
                </CardContent>
              </Card>
            ) : (
              <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
                {completedOrders.map((order) => (
                  <Card key={order.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{order.itemName}</CardTitle>
                          <CardDescription className="text-xs">Order #{order.id.slice(-8)}</CardDescription>
                        </div>
                        <Badge variant="secondary">Completed</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">User:</span>
                          <span className="font-semibold">{userDetails[order.userId]?.name || 'Unknown'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Date:</span>
                          <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                        </div>
                        {order.code && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Code:</span>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{order.code}</code>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Item Dialog */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Item' : 'Create Item'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Update store item details' : 'Add a new item to the store'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={itemForm.name}
                onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                placeholder="AWS Credits $25"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                placeholder="$25 AWS promotional credits"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  type="number"
                  value={itemForm.points}
                  onChange={(e) => setItemForm({ ...itemForm, points: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="image">Emoji</Label>
                <Input
                  id="image"
                  value={itemForm.image}
                  onChange={(e) => setItemForm({ ...itemForm, image: e.target.value })}
                  placeholder="💳"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="itemType">Type</Label>
                <Select
                  value={itemForm.itemType}
                  onValueChange={(value: 'physical' | 'virtual') => setItemForm({ ...itemForm, itemType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virtual">Virtual (Code)</SelectItem>
                    <SelectItem value="physical">Physical (Shipping)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={itemForm.category}
                  onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                />
              </div>
            </div>

            {itemForm.itemType === 'virtual' && (
              <div className="grid gap-2">
                <Label>Available Codes</Label>
                <div className="flex gap-2">
                  <Input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Enter code"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCode()}
                  />
                  <Button type="button" onClick={handleAddCode}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {itemForm.availableCodes.map((code, index) => (
                    <Badge key={index} variant="secondary" className="gap-2">
                      {code}
                      <button onClick={() => handleRemoveCode(index)} className="ml-1">×</button>
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {itemForm.availableCodes.length} code(s) available
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveItem} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Dialog */}
      <Dialog open={showOrderDialog} onOpenChange={setShowOrderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Order</DialogTitle>
            <DialogDescription>
              Order #{selectedOrder?.id.slice(-8)} - {selectedOrder?.itemName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {selectedOrder?.itemType === 'virtual' ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="code">Assign Code</Label>
                  <Input
                    id="code"
                    value={orderCode}
                    onChange={(e) => setOrderCode(e.target.value)}
                    placeholder="Enter code to send to user"
                  />
                  <p className="text-xs text-muted-foreground">
                    Code will be sent via email and order will be marked as completed
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Shipping Address</Label>
                  <div className="text-sm bg-muted p-3 rounded">
                    <p>{selectedOrder?.shippingAddress?.name}</p>
                    <p>{selectedOrder?.shippingAddress?.address}</p>
                    <p>{selectedOrder?.shippingAddress?.city}, {selectedOrder?.shippingAddress?.state} {selectedOrder?.shippingAddress?.zipCode}</p>
                    <p>{selectedOrder?.shippingAddress?.phone}</p>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes">Admin Notes</Label>
                  <Textarea
                    id="notes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes about shipping, tracking, etc."
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOrderDialog(false)}>Cancel</Button>
            {selectedOrder?.itemType === 'virtual' ? (
              <Button onClick={handleAssignCode} disabled={saving || !orderCode.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Send Code
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleUpdateOrderStatus('processing')} disabled={saving}>
                  Mark Processing
                </Button>
                <Button onClick={() => handleUpdateOrderStatus('completed')} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Mark Completed
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
