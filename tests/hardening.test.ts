import { beforeEach, describe, expect, it } from "vitest";
import { createDb, migrate, type Db } from "../src/lib/db";
import * as orders from "../src/lib/services/orders";
import { listPromotions } from "../src/lib/services/loyalty";
import { login, signup } from "../src/lib/services/auth";

let db: Db;
let valerie: orders.Actor;
let staff: orders.Actor;
const latte = { items: [{ productId: 2, qty: 1 }, { productId: 4, qty: 1 }], paymentMethod: "gcash" as const }; // ₱315

beforeEach(async () => {
  db = await createDb({ memory: true });
  const [v] = await db.query("select id from users where email='valerie@example.test'");
  const [s] = await db.query("select id from users where email='staff@kapeople.test'");
  valerie = { id: v.id, role: "customer" };
  staff = { id: s.id, role: "employee" };
});

describe("migrations", () => {
  it("records applied migrations and is a no-op the second time", async () => {
    const names = async () => db.query<{ name: string; applied_at: string }>("select name, applied_at from schema_migrations order by name");
    const first = await names();
    expect(first.map((m) => m.name)).toEqual([
      "001_staff_and_login_attempts.sql",
      "002_promo_limits_and_rate_events.sql",
      "003_customer_notes.sql",
    ]);
    await migrate(db, false);
    expect(await names()).toEqual(first); // nothing re-applied
  });

  it("upgrades a database created before migrations existed", async () => {
    await db.exec(`
      drop table schema_migrations; drop table login_attempts; drop table rate_events;
      alter table users drop column active;
      alter table orders drop column promo_code;
      alter table promotions drop column max_uses_per_customer;`);
    await migrate(db, false);
    const [u] = await db.query("select active from users limit 1");
    expect(u.active).toBe(true);
    const [p] = await db.query("select max_uses_per_customer from promotions where code='WELCOME10'");
    expect(p.max_uses_per_customer).toBe(1);
    await expect(login(db, "staff@kapeople.test", "kapeople123")).resolves.toBeTruthy(); // login_attempts exists again
  });
});

describe("idempotency keys are scoped to the caller", () => {
  it("another user reusing a key gets their own order, never someone else's", async () => {
    const other = await signup(db, { name: "Other", email: "other@example.test", password: "longenough-password" });
    const a = await orders.createOrder(db, valerie, { ...latte, idempotencyKey: "shared-key" });
    const b = await orders.createOrder(db, { id: other.user.id, role: "customer" }, { ...latte, idempotencyKey: "shared-key" });
    expect(b.duplicate).toBe(false);
    expect(b.order.id).not.toBe(a.order.id);
    expect(b.order.customer_id).toBe(other.user.id);
    // the same user retrying still dedupes
    expect((await orders.createOrder(db, valerie, { ...latte, idempotencyKey: "shared-key" })).order.id).toBe(a.order.id);
  });
});

describe("promo limits", () => {
  it("WELCOME10 works once per customer; cancelling frees the use; unlimited promos stay unlimited", async () => {
    const first = await orders.createOrder(db, valerie, { ...latte, promoCode: "WELCOME10" });
    expect(first.order.promo_code).toBe("WELCOME10");
    expect(first.order.discount).toBe(31.5);
    await expect(orders.createOrder(db, valerie, { ...latte, promoCode: "welcome10" })).rejects.toMatchObject({ code: "promo_used" });

    expect((await listPromotions(db, valerie.id)).map((p) => p.code)).not.toContain("WELCOME10");
    expect((await listPromotions(db, null)).map((p) => p.code)).toContain("WELCOME10"); // logged-out visitors see it

    await orders.cancelOrder(db, valerie, first.order.id);
    await expect(orders.createOrder(db, valerie, { ...latte, promoCode: "WELCOME10" })).resolves.toBeTruthy();

    const big = { items: [{ productId: 13, qty: 2 }], paymentMethod: "gcash" as const }; // ₱420
    await orders.createOrder(db, valerie, { ...big, promoCode: "PASTRY30" });
    await expect(orders.createOrder(db, valerie, { ...big, promoCode: "PASTRY30" })).resolves.toBeTruthy();
  });

  it("a limited promo needs a customer on the POS", async () => {
    await expect(
      orders.createOrder(db, staff, { ...latte, paymentMethod: "cash", promoCode: "WELCOME10" }),
    ).rejects.toThrow(/attach a customer/);
    await expect(
      orders.createOrder(db, staff, { ...latte, paymentMethod: "cash", promoCode: "WELCOME10", customerId: valerie.id }),
    ).resolves.toBeTruthy();
  });
});

describe("throttling and enumeration", () => {
  it("limits sign-ups to 10 per hour per IP, independently per IP, and ignores unknown IPs", async () => {
    for (let i = 0; i < 10; i++) await signup(db, { name: "N", email: `n${i}@example.test`, password: "longenough-password" }, "1.2.3.4");
    await expect(signup(db, { name: "N", email: "n11@example.test", password: "longenough-password" }, "1.2.3.4")).rejects.toMatchObject({ status: 429 });
    await expect(signup(db, { name: "N", email: "n12@example.test", password: "longenough-password" }, "5.6.7.8")).resolves.toBeTruthy();
    for (let i = 0; i < 12; i++) await signup(db, { name: "N", email: `u${i}@example.test`, password: "longenough-password" }, null);
  });

  it("probing existing emails via signup also counts toward the limit", async () => {
    for (let i = 0; i < 10; i++) await signup(db, { name: "N", email: "valerie@example.test", password: "longenough-password" }, "9.9.9.9").catch(() => {});
    await expect(signup(db, { name: "N", email: "free@example.test", password: "longenough-password" }, "9.9.9.9")).rejects.toMatchObject({ status: 429 });
  });

  it("blocks an IP after 20 failed logins across different emails, even for valid credentials", async () => {
    for (let i = 0; i < 20; i++) await login(db, `ghost${i}@example.test`, "x", "8.8.8.8").catch(() => {});
    await expect(login(db, "staff@kapeople.test", "kapeople123", "8.8.8.8")).rejects.toMatchObject({ status: 429 });
    await expect(login(db, "staff@kapeople.test", "kapeople123", "4.4.4.4")).resolves.toBeTruthy();
    await expect(login(db, "staff@kapeople.test", "kapeople123", null)).resolves.toBeTruthy();
  });

  it("unknown email and wrong password give the same error", async () => {
    const msg = async (email: string) => login(db, email, "wrong-password").catch((e) => `${e.status} ${e.message}`);
    expect(await msg("nobody@example.test")).toBe(await msg("staff@kapeople.test"));
  });
});
