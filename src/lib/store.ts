import { callApi } from './api';

export type ItemType = 'virtual' | 'physical';

/** How a physical order reaches the member. */
export type FulfillmentMethod = 'ship' | 'pickup';

/** When shipped orders go out. Shown at checkout, so nobody expects it next week. */
export const SHIPPING_WINDOW = 'November and December';

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  points: number;
  image: string;
  inStock: boolean;
  quantity?: number; // For physical items
  category?: string;
  itemType: ItemType;
  availableCodes?: string[]; // For virtual items. Only organisers receive these.
  /** What members get instead of the codes themselves. */
  availableCodeCount?: number;
  // Optional custom email (virtual items). When set, overrides the default code email.
  // Supported placeholders in subject/message: {{code}}, {{itemName}}, {{points}}, {{name}}
  emailSubject?: string;
  emailMessage?: string;
  emailImageUrl?: string; // Optional image URL rendered at the top of the email body
  createdAt?: string;
  updatedAt?: string;
}

export interface Order {
  id: string;
  userId: string;
  itemId: string;
  itemName: string;
  itemType: ItemType;
  points: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'completed';
  code?: string; // For virtual items
  /**
   * Physical items: shipped to the address, or collected at the next in-person
   * event. Missing on orders from before the choice existed, which all shipped.
   */
  fulfillmentMethod?: FulfillmentMethod;
  /** Contact details. For collection, only the name and phone. */
  shippingAddress?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    phone?: string;
  };
  /** Anything the member asked the organisers to know, such as a T-shirt size. */
  customerNotes?: string;
  adminNotes?: string;
  /** Set on a Kiro University prize claimed with this coupon: the member paid no points. */
  prizeCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RedeemRequest {
  fulfillmentMethod?: FulfillmentMethod;
  shippingAddress?: Order['shippingAddress'];
  notes?: string;
}

export interface RedeemResponse {
  message: string;
  order: Order;
  remainingPoints: number;
}

/** How a physical order is fulfilled. Orders from before the choice existed all shipped. */
export function fulfillmentOf(order: Pick<Order, 'itemType' | 'fulfillmentMethod'>): FulfillmentMethod | null {
  if (order.itemType === 'virtual') return null;
  return order.fulfillmentMethod ?? 'ship';
}

/**
 * A mobile number as digits with an optional leading +, or '' when it does not
 * look like one. Must match normalisePhone in the store Lambda.
 */
export function normalisePhone(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim().slice(0, 30).replace(/[\s().-]/g, '');
  return /^\+?\d{10,15}$/.test(compact) ? compact : '';
}

/** Indian PIN codes are six digits. */
export function isValidPinCode(value: string): boolean {
  return /^\d{6}$/.test(value.replace(/\s/g, ''));
}

// Every call goes through callApi, which sends the sign-in token. The store
// Lambda uses it to check whose points are spent and who may manage orders.

// Store Items API
export const getStoreItems = (): Promise<StoreItem[]> => callApi<StoreItem[]>('/store/items');

export const getStoreItem = (id: string): Promise<StoreItem> =>
  callApi<StoreItem>(`/store/items/${encodeURIComponent(id)}`);

export const createStoreItem = (item: Omit<StoreItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoreItem> =>
  callApi<StoreItem>('/store/items', { method: 'POST', body: JSON.stringify(item) });

export const updateStoreItem = (id: string, updates: Partial<StoreItem>): Promise<StoreItem> =>
  callApi<StoreItem>(`/store/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(updates) });

export const deleteStoreItem = async (id: string): Promise<void> => {
  await callApi(`/store/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
};

/** Redeem an item for the signed-in member. Physical items need the fulfilment choice and contact details. */
export const redeemStoreItem = (itemId: string, request: RedeemRequest): Promise<RedeemResponse> =>
  callApi<RedeemResponse>(`/store/items/${encodeURIComponent(itemId)}/redeem`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

// Orders API
/** Members get their own orders. Organisers get anyone's, or every order without a userId. */
export const getOrders = (userId?: string): Promise<Order[]> =>
  callApi<Order[]>(userId ? `/store/orders?userId=${encodeURIComponent(userId)}` : '/store/orders');

export const getOrder = (id: string): Promise<Order> =>
  callApi<Order>(`/store/orders/${encodeURIComponent(id)}`);

export const updateOrderStatus = (id: string, status: Order['status'], adminNotes?: string): Promise<Order> =>
  callApi<Order>(`/store/orders/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, adminNotes }),
  });

export const assignCodeToOrder = (orderId: string, code: string): Promise<Order> =>
  callApi<Order>(`/store/orders/${encodeURIComponent(orderId)}/assign-code`, {
    method: 'PATCH',
    body: JSON.stringify({ code }),
  });
