import type { OrderStatus } from "@/lib/order-types";

const STYLES: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  PAID: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  PROCESSING: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  SHIPPED: "bg-blue-100 text-blue-900 dark:bg-blue-950/50 dark:text-blue-200",
  DELIVERED: "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-200",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  REFUNDED: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const LABELS: Record<OrderStatus, string> = {
  PENDING: "Pending payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
