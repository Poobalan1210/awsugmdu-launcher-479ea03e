import { API_BASE_URL } from './aws-config';

export type ItemType = 'virtual' | 'physical';

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  points: number;
  image: string;
  inStock: boolean;
  category?: string;
  itemType: ItemType;
  availableCodes?: string[]; // For virtual items
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
  shippingAddress?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    phone?: string;
  };
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RedeemResponse {
  message: string;
  order: Order;
  remainingPoints: number;
}

// Store Items API
export const getStoreItems = async (): Promise<StoreItem[]> => {
  const response = await fetch(`${API_BASE_URL}/store/items`);
  if (!response.ok) {
    throw new Error('Failed to fetch store items');
  }
  return response.json();
};

export const getStoreItem = async (id: string): Promise<StoreItem> => {
  const response = await fetch(`${API_BASE_URL}/store/items/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch store item');
  }
  return response.json();
};

export const createStoreItem = async (item: Omit<StoreItem, 'id' | 'createdAt' | 'updatedAt'>): Promise<StoreItem> => {
  const response = await fetch(`${API_BASE_URL}/store/items`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(item),
  });
  if (!response.ok) {
    throw new Error('Failed to create store item');
  }
  return response.json();
};

export const updateStoreItem = async (id: string, updates: Partial<StoreItem>): Promise<StoreItem> => {
  const response = await fetch(`${API_BASE_URL}/store/items/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error('Failed to update store item');
  }
  return response.json();
};

export const deleteStoreItem = async (id: string): Promise<void> => {
  const response = await fetch(`${API_BASE_URL}/store/items/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete store item');
  }
};

export const redeemStoreItem = async (
  itemId: string,
  userId: string,
  shippingAddress?: Order['shippingAddress']
): Promise<RedeemResponse> => {
  const response = await fetch(`${API_BASE_URL}/store/items/${itemId}/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId, shippingAddress }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to redeem item');
  }
  return response.json();
};

// Orders API
export const getOrders = async (userId?: string): Promise<Order[]> => {
  const url = userId 
    ? `${API_BASE_URL}/store/orders?userId=${userId}`
    : `${API_BASE_URL}/store/orders`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch orders');
  }
  return response.json();
};

export const getOrder = async (id: string): Promise<Order> => {
  const response = await fetch(`${API_BASE_URL}/store/orders/${id}`);
  if (!response.ok) {
    throw new Error('Failed to fetch order');
  }
  return response.json();
};

export const updateOrderStatus = async (
  id: string,
  status: Order['status'],
  adminNotes?: string
): Promise<Order> => {
  const response = await fetch(`${API_BASE_URL}/store/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, adminNotes }),
  });
  if (!response.ok) {
    throw new Error('Failed to update order status');
  }
  return response.json();
};

export const assignCodeToOrder = async (
  orderId: string,
  code: string
): Promise<Order> => {
  const response = await fetch(`${API_BASE_URL}/store/orders/${orderId}/assign-code`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) {
    throw new Error('Failed to assign code to order');
  }
  return response.json();
};
