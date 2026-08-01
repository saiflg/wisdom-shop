export interface Address {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
}

export interface CheckoutPreviewItem {
  productId: string;
  variantId: string | null;
  title: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface CheckoutPreview {
  currency: string;
  requiresShipping: boolean;
  items: CheckoutPreviewItem[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

export interface OrderItem {
  id: string;
  productId: string;
  variantId: string | null;
  titleSnapshot: string;
  unitPriceCents: number;
  quantity: number;
}

export type OrderStatus =
  | "PARTIALLY_REFUNDED"
  | "PENDING"
  | "PAID"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  createdAt: string;
  items: OrderItem[];
  address: Address | null;
}
