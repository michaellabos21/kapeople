import type { Queryable } from "../db";
import { publish } from "../bus";

/**
 * In-app notification feed. This is the seam for push: when Firebase Cloud
 * Messaging credentials are configured, send from here as well (not wired yet).
 */
export async function notify(q: Queryable, userId: number, title: string, body = "", orderId?: number) {
  await q.query("insert into notifications (user_id, title, body, order_id) values ($1,$2,$3,$4)", [
    userId,
    title,
    body,
    orderId ?? null,
  ]);
}

/** Call AFTER the transaction commits. */
export function announce(userId: number | null | undefined, orderId?: number) {
  publish({ type: "orders", orderId });
  if (userId) publish({ type: "notification", userId, orderId });
}

export async function listNotifications(q: Queryable, userId: number) {
  return q.query(
    "select * from notifications where user_id = $1 order by created_at desc, id desc limit 30",
    [userId],
  );
}

export async function markAllRead(q: Queryable, userId: number) {
  await q.query("update notifications set read = true where user_id = $1 and not read", [userId]);
}
