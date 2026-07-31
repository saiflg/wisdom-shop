export interface CartLine {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  slug: string;
  variantName: string | null;
  imageUrl: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
  availableStock: number | null;
}

export interface CartSummary {
  id: string;
  currency: string;
  items: CartLine[];
  itemCount: number;
  subtotalCents: number;
}
