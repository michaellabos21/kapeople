import webpush from "web-push";
import type { Queryable, Row } from "../db";
import { AppError } from "../errors";
import { assertUnderLimit, recordEvent } from "./ratelimit";

export interface PushPayload {
  title: string;
  body: string;
  /** Where tapping the notification goes (same-origin path). */
  url: string;
  /** Notifications with the same tag replace each other instead of stacking. */
  tag?: string;
}

let appliedKeys = "";

/**
 * VAPID keys come from the environment; without them push is simply off. Re-read on every call, and handed to
 * web-push again only when they change, so rotating or removing the keys takes effect without a restart.
 */
export function pushConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  const fingerprint = `${pub}|${priv}|${subject}`;
  if (fingerprint !== appliedKeys) {
    webpush.setVapidDetails(subject, pub, priv);
    appliedKeys = fingerprint;
  }
  return true;
}

// The server POSTs to whatever endpoint a browser registers, so only accept the real browser push services.
// (Otherwise a signed-in user could make the server send requests to any https host.)
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android, Samsung
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)push\.apple\.com$/, // Safari / iOS
  /(^|\.)notify\.windows\.com$/, // legacy Edge / WNS
];

export function isAllowedPushEndpoint(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  return PUSH_HOSTS.some((re) => re.test(u.hostname.toLowerCase()));
}

export const publicKey = () => process.env.VAPID_PUBLIC_KEY || null;

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Saves (or moves to this user) a browser subscription. A device belongs to whoever subscribed last. */
export async function saveSubscription(q: Queryable, userId: number, sub: SubscriptionInput, userAgent?: string | null) {
  if (!isAllowedPushEndpoint(sub.endpoint)) throw new AppError("That browser's push service isn't supported.", 400);
  await q.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     values ($1,$2,$3,$4,$5)
     on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
       auth = excluded.auth, user_agent = excluded.user_agent, failures = 0`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 200) ?? null],
  );
}

export async function removeSubscription(q: Queryable, userId: number, endpoint: string) {
  await q.query("delete from push_subscriptions where user_id = $1 and endpoint = $2", [userId, endpoint]);
}

async function deliver(q: Queryable, subs: Row[], payload: PushPayload) {
  const body = JSON.stringify(payload);
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60, // a "your order is ready" alert is worthless after an hour
          urgency: "high",
          timeout: 4000,
        });
        await q.query("update push_subscriptions set last_success_at = now(), failures = 0 where id = $1", [s.id]);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await q.query("delete from push_subscriptions where id = $1", [s.id]); // browser says it's gone
        } else {
          await q.query("update push_subscriptions set failures = failures + 1 where id = $1", [s.id]);
          await q.query("delete from push_subscriptions where id = $1 and failures >= 5", [s.id]);
        }
      }
    }),
  );
}

/** Sends to every device of one user. Never throws: a push problem must not break the order flow. */
export async function pushToUser(q: Queryable, userId: number, payload: PushPayload) {
  if (!pushConfigured()) return;
  try {
    await deliver(q, await q.query("select * from push_subscriptions where user_id = $1", [userId]), payload);
  } catch (e) {
    console.error("push failed:", (e as Error).message);
  }
}

/** Sends to every staff/admin device (new-order alerts). Never throws. */
export async function pushToStaff(q: Queryable, payload: PushPayload) {
  if (!pushConfigured()) return;
  try {
    const subs = await q.query(
      `select p.* from push_subscriptions p join users u on u.id = p.user_id
        where u.role in ('employee','admin') and u.active`,
    );
    await deliver(q, subs, payload);
  } catch (e) {
    console.error("staff push failed:", (e as Error).message);
  }
}

/**
 * Pushes the user's not-yet-pushed in-app notifications (claimed atomically, so two overlapping
 * status changes can't send the same alert twice). Only recent ones: no replaying old history.
 */
export async function pushUnsent(q: Queryable, userId: number) {
  if (!pushConfigured()) return;
  try {
    const rows = await q.query<Row>(
      `update notifications set pushed = true
        where user_id = $1 and not pushed and created_at > now() - interval '10 minutes'
        returning id, title, body, order_id`,
      [userId],
    );
    // Devices are contacted in parallel inside pushToUser; the (few) notifications go out together.
    await Promise.all(rows.sort((a, b) => a.id - b.id).map((n) =>
      pushToUser(q, userId, {
        title: n.title,
        body: n.body,
        url: n.order_id ? `/app/orders/${n.order_id}` : "/app/notifications",
        tag: n.order_id ? `order-${n.order_id}` : undefined,
      }),
    ));
  } catch (e) {
    console.error("push failed:", (e as Error).message);
  }
}

/** "Send me a test alert" — limited so it can't be used to spam a device. */
export async function sendTest(q: Queryable, userId: number) {
  if (!pushConfigured()) throw new AppError("Alerts aren't set up on this server yet.", 503);
  await assertUnderLimit(q, "push-test", String(userId), 5, 60, "That's a lot of test alerts. Try again in an hour.");
  const [{ n }] = await q.query<{ n: number }>("select count(*)::int as n from push_subscriptions where user_id = $1", [userId]);
  if (!n) throw new AppError("Turn on alerts on this device first.", 400);
  await recordEvent(q, "push-test", String(userId));
  await pushToUser(q, userId, { title: "Kapeople alerts are on ☕", body: "You'll get a message like this when your order is ready.", url: "/app/profile", tag: "test" });
}
