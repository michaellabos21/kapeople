import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; payload: string; opts: unknown }[] = [];
let failWith: ((endpoint: string) => { statusCode?: number } | null) | null = null;
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string, opts: unknown) => {
      const err = failWith?.(sub.endpoint);
      if (err) throw Object.assign(new Error("push failed"), err);
      sent.push({ endpoint: sub.endpoint, payload, opts });
    }),
  },
}));

import { createDb, type Db } from "../src/lib/db";
import * as orders from "../src/lib/services/orders";
import { isAllowedPushEndpoint, pushConfigured, pushToUser, saveSubscription, removeSubscription, sendTest, pushUnsent } from "../src/lib/services/push";
import { listNotifications } from "../src/lib/services/notifications";

let db: Db;
let customer: orders.Actor;
let staff: orders.Actor;
const sub = (n: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(20) } });
const payloads = () => sent.map((s) => JSON.parse(s.payload));

beforeEach(async () => {
  vi.stubEnv("VAPID_PUBLIC_KEY", "pub-key");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv-key");
  sent.length = 0;
  failWith = null;
  db = await createDb({ memory: true });
  const id = async (e: string) => (await db.query("select id from users where email=$1", [e]))[0].id as number;
  customer = { id: await id("valerie@example.test"), role: "customer" };
  staff = { id: await id("staff@kapeople.test"), role: "employee" };
});
afterEach(() => vi.unstubAllEnvs());

const order = (extra = {}) => orders.createOrder(db, customer, { items: [{ productId: 2, qty: 1 }], paymentMethod: "gcash", ...extra });

describe("subscriptions", () => {
  it("upserts per device, moves a device to whoever subscribed last, and removes on request", async () => {
    await saveSubscription(db, customer.id, sub("a"), "UA");
    await saveSubscription(db, customer.id, sub("a"), "UA2"); // same device again
    expect(await db.query("select user_id from push_subscriptions")).toHaveLength(1);
    await saveSubscription(db, staff.id, sub("a")); // shared device, different login
    expect((await db.query("select user_id from push_subscriptions"))[0].user_id).toBe(staff.id);
    await removeSubscription(db, customer.id, sub("a").endpoint); // not theirs any more: no-op
    expect(await db.query("select 1 from push_subscriptions")).toHaveLength(1);
    await removeSubscription(db, staff.id, sub("a").endpoint);
    expect(await db.query("select 1 from push_subscriptions")).toHaveLength(0);
  });
});

describe("order alerts", () => {
  it("pushes each status change to the customer's devices, with a deep link and replace-tag", async () => {
    await saveSubscription(db, customer.id, sub("phone"));
    await saveSubscription(db, customer.id, sub("laptop"));
    const { order: o } = await order();
    expect(payloads().map((p) => p.title)).toEqual([`Order #${o.order_number} received`, `Order #${o.order_number} received`]); // 2 devices

    sent.length = 0;
    await orders.setStatus(db, staff, o.id, "accepted");
    await orders.setStatus(db, staff, o.id, "ready");
    const ready = payloads().filter((p) => p.title.includes("ready"));
    expect(ready).toHaveLength(2);
    expect(ready[0]).toMatchObject({ body: "Come pick it up at the counter.", url: `/app/orders/${o.id}`, tag: `order-${o.id}` });
    expect((sent[0].opts as { urgency: string; TTL: number })).toMatchObject({ urgency: "high", TTL: 3600 });
  });

  it("each notification is pushed exactly once, even if announced twice", async () => {
    await saveSubscription(db, customer.id, sub("phone"));
    await order();
    sent.length = 0;
    await pushUnsent(db, customer.id);
    await pushUnsent(db, customer.id);
    expect(sent).toHaveLength(0);
    expect((await listNotifications(db, customer.id)).every((n) => n.pushed)).toBe(true);
  });

  it("does not replay old notifications", async () => {
    await saveSubscription(db, customer.id, sub("phone"));
    await db.query("insert into notifications (user_id, title, created_at) values ($1,'Old news', now() - interval '1 hour')", [customer.id]);
    await pushUnsent(db, customer.id);
    expect(sent).toHaveLength(0);
  });

  it("alerts staff devices (not customers) when a customer places an app order, but not for POS sales", async () => {
    await saveSubscription(db, staff.id, sub("counter-tablet"));
    await saveSubscription(db, customer.id, sub("customer-phone"));
    const { order: o } = await order();
    const staffAlerts = sent.filter((s) => s.endpoint.endsWith("counter-tablet")).map((s) => JSON.parse(s.payload));
    expect(staffAlerts).toHaveLength(1);
    expect(staffAlerts[0]).toMatchObject({ title: `New order #${o.order_number}`, url: "/pos/orders" });
    expect(staffAlerts[0].body).toContain("1× Iced Spanish Latte");

    sent.length = 0;
    await orders.createOrder(db, staff, { items: [{ productId: 9, qty: 1 }], paymentMethod: "cash" });
    expect(sent.filter((s) => s.endpoint.endsWith("counter-tablet"))).toHaveLength(0);
  });

  it("deactivated staff stop receiving alerts", async () => {
    await saveSubscription(db, staff.id, sub("counter-tablet"));
    await db.query("update users set active = false where id = $1", [staff.id]);
    await order();
    expect(sent.filter((s) => s.endpoint.endsWith("counter-tablet"))).toHaveLength(0);
  });
});

describe("failure handling", () => {
  it("removes subscriptions the browser reports gone (404/410), keeps others, never breaks the order", async () => {
    await saveSubscription(db, customer.id, sub("gone"));
    await saveSubscription(db, customer.id, sub("flaky"));
    await saveSubscription(db, customer.id, sub("good"));
    failWith = (e) => (e.endsWith("gone") ? { statusCode: 410 } : e.endsWith("flaky") ? { statusCode: 500 } : null);
    const { order: o } = await order();
    expect(o.status).toBe("new"); // order succeeded regardless
    const left = await db.query<{ endpoint: string; failures: number }>("select endpoint, failures from push_subscriptions order by endpoint");
    expect(left.map((r) => r.endpoint.split("/").pop())).toEqual(["flaky", "good"]);
    expect(left.find((r) => r.endpoint.endsWith("flaky"))!.failures).toBe(1);
    expect(left.find((r) => r.endpoint.endsWith("good"))!.failures).toBe(0);
  });

  it("drops a subscription after 5 consecutive failures", async () => {
    await saveSubscription(db, customer.id, sub("flaky"));
    failWith = () => ({ statusCode: 503 });
    for (let i = 0; i < 5; i++) await pushToUser(db, customer.id, { title: "t", body: "b", url: "/app" });
    expect(await db.query("select 1 from push_subscriptions")).toHaveLength(0);
  });

  it("is a silent no-op when VAPID keys aren't configured", async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await saveSubscription(db, customer.id, sub("phone"));
    await expect(order()).resolves.toBeTruthy();
    expect(sent).toHaveLength(0);
  });
});

describe("test alert", () => {
  it("needs a subscription, sends to the caller only, and is rate-limited", async () => {
    await expect(sendTest(db, customer.id)).rejects.toThrow(/Turn on alerts/);
    await saveSubscription(db, customer.id, sub("phone"));
    await saveSubscription(db, staff.id, sub("other"));
    await sendTest(db, customer.id);
    expect(sent.map((s) => s.endpoint)).toEqual([sub("phone").endpoint]);
    for (let i = 0; i < 4; i++) await sendTest(db, customer.id);
    await expect(sendTest(db, customer.id)).rejects.toThrow(/lot of test alerts/);
  });
});

describe("endpoint allowlist (no server-side requests to arbitrary hosts)", () => {
  it("accepts the real browser push services and nothing else", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/x", // not https
      "https://evil.example/x",
      "https://fcm.googleapis.com.evil.example/x", // look-alike suffix
      "https://evilfcm.googleapis.com/x",
      "https://user:pw@fcm.googleapis.com/x", // credentials
      "https://fcm.googleapis.com:8443/x", // odd port
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "not a url",
    ]) expect(isAllowedPushEndpoint(bad), bad).toBe(false);
  });

  it("refuses to store a disallowed endpoint", async () => {
    await expect(saveSubscription(db, customer.id, { endpoint: "https://evil.example/x", keys: sub("a").keys })).rejects.toThrow(/isn't supported/);
    expect(await db.query("select 1 from push_subscriptions")).toHaveLength(0);
  });
});

describe("configuration is re-read, not cached forever", () => {
  it("follows the environment as keys are removed or rotated", () => {
    expect(pushConfigured()).toBe(true);
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(pushConfigured()).toBe(false);
    vi.stubEnv("VAPID_PRIVATE_KEY", "rotated-key");
    expect(pushConfigured()).toBe(true);
  });
});
