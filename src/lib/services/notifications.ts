import type { Queryable } from "../db";
import { publish } from "../bus";
import { pushUnsent } from "./push";
import { defer } from "../runtime";

/**
 * In-app notification feed. Each row is also sent as a Web Push alert (see announce → pushUnsent)
 * to the user's subscribed devices.
 */
export async function notify(q: Queryable, userId: number, title: string, body = "", orderId?: number) {
  await q.query("insert into notifications (user_id, title, body, order_id) values ($1,$2,$3,$4)", [
    userId,
    title,
    body,
    orderId ?? null,
  ]);
}

/** Call AFTER the transaction commits. Updates live screens and pushes any new notifications to the user's devices. */
export async function announce(q: Queryable, userId: number | null | undefined, orderId?: number) {
  publish({ type: "orders", orderId });
  if (userId) {
    publish({ type: "notification", userId, orderId });
    await defer(() => pushUnsent(q, userId)); // after the response: a slow push service never delays the user
  }
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
