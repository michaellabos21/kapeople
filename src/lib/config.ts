// Business rules in one place.
export const TIMEZONE = "Asia/Manila";

/** ₱10 spent = 1 point. */
export const PESOS_PER_POINT = 10;

export const ORDER_FLOW = ["new", "accepted", "preparing", "ready", "completed"] as const;
export const ACTIVE_STATUSES = ["new", "accepted", "preparing", "ready"] as const;

export type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled"
  | "refunded";
export type PaymentMethod = "cash" | "gcash" | "card";
export type Role = "customer" | "employee" | "admin";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function pointsForTotal(total: number): number {
  return Math.max(0, Math.floor(total / PESOS_PER_POINT));
}
