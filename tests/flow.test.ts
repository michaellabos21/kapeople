import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import * as orders from "../src/lib/services/orders";
import { getMenu } from "../src/lib/services/catalog";
import { getLoyalty } from "../src/lib/services/loyalty";
import { recordMovement } from "../src/lib/services/inventory";
import { salesReport } from "../src/lib/services/reports";

let db: Db;
let customer: orders.Actor;
let staff: orders.Actor;

const ING = { beans: 1, milk: 2, oat: 3, ice: 4 };
const ing = async (id: number) => (await db.query("select current_qty from ingredients where id=$1", [id]))[0].current_qty as number;
const points = async () => (await db.query("select points_balance from users where id=$1", [customer.id]))[0].points_balance as number;

// Iced Latte (product 1), Grande (variant id 2), Oat Milk (1) + Extra Shot (2) = ₱195, per the plan.
const grandeOat = { productId: 1, variantId: 2, addonIds: [1, 2], qty: 1 };

beforeEach(async () => {
  db = await createDb({ memory: true });
  const [c] = await db.query("select id from users where email='valerie@example.test'");
  const [s] = await db.query("select id from users where email='staff@kapeople.test'");
  customer = { id: c.id, role: "customer" };
  staff = { id: s.id, role: "employee" };
});

describe("customer → POS → inventory → loyalty loop", () => {
  it("runs an app order end to end", async () => {
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash" });
    expect(order.total).toBe(195);
    expect(order.status).toBe("new");
    expect(order.payment_status).toBe("paid");
    expect(order.order_number).toBeGreaterThanOrEqual(1001);

    // POS sees it without anyone re-keying it
    const board = await orders.listOrders(db, staff, { statuses: ["new"] });
    expect(board.map((o) => o.id)).toContain(order.id);

    for (const s of ["accepted", "preparing", "ready"] as const) {
      expect((await orders.setStatus(db, staff, order.id, s)).status).toBe(s);
    }
    expect(await ing(ING.beans)).toBe(4.2); // nothing deducted until completion
    await orders.setStatus(db, staff, order.id, "completed");

    expect(await ing(ING.beans)).toBeCloseTo(4.2 - 0.018 - 0.009, 5); // base + extra shot
    expect(await ing(ING.oat)).toBeCloseTo(6 - 0.2, 5);
    expect(await ing(ING.milk)).toBe(12); // oat replaced fresh milk
    expect(await points()).toBe(80 + 19);

    const loyalty = await getLoyalty(db, customer.id);
    expect(loyalty.history[0]).toMatchObject({ type: "earn", points: 19, balance_after: 99 });
    const notes = await db.query("select title from notifications where user_id=$1 order by id", [customer.id]);
    expect(notes.map((n) => n.title)).toEqual([
      `Order #${order.order_number} received`,
      `Order #${order.order_number} accepted`,
      `Order #${order.order_number} is being prepared`,
      `Order #${order.order_number} is ready!`,
      `Order #${order.order_number} completed`,
    ]);
    const mine = await orders.listOrders(db, customer);
    expect(mine[0].status).toBe("completed");
  });

  it("awards 1 point per ₱10 and lets points be redeemed (100 pts = ₱50)", async () => {
    // ₱250 purchase: 2 x Grande Spanish Latte (150) + croissant... = 150*... keep simple: 2 x ₱125? use cookie
    const { order } = await orders.createOrder(db, customer, {
      items: [{ productId: 2, qty: 1 }, { productId: 9, qty: 1 }, { productId: 8, qty: 1 }], // 150 + 75 + 95 = 320
      paymentMethod: "gcash",
    });
    expect(order.subtotal).toBe(320);
    await orders.setStatus(db, staff, order.id, "completed");
    expect(await points()).toBe(80 + 32);

    const redeemed = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash", rewardId: 1 });
    expect(redeemed.order.reward_discount).toBe(50);
    expect(redeemed.order.total).toBe(145);
    expect(await points()).toBe(112 - 100);
    await orders.setStatus(db, staff, redeemed.order.id, "completed");
    expect(await points()).toBe(12 + 14);
  });

  it("rejects redeeming without enough points", async () => {
    await expect(
      orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash", rewardId: 1 }),
    ).rejects.toThrow(/Not enough points/); // Valerie has 80, reward costs 100
    expect(await points()).toBe(80);
  });
});

describe("payments", () => {
  it("cash at pickup: cannot complete until paid; underpayment rejected; change computed", async () => {
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "cash" });
    expect(order.payment_status).toBe("unpaid");
    await expect(orders.setStatus(db, staff, order.id, "completed")).rejects.toThrow(/payment/i);
    await expect(orders.recordPayment(db, staff, order.id, { method: "cash", tendered: 100 })).rejects.toThrow(/less than/);
    const paid = await orders.recordPayment(db, staff, order.id, { method: "cash", tendered: 200 });
    expect(paid.payment_status).toBe("paid");
    expect(paid.payments[0]).toMatchObject({ amount: 195, tendered: 200, change_given: 5 });
    await orders.setStatus(db, staff, order.id, "completed");
    expect(await ing(ING.beans)).toBeCloseTo(4.173, 5);
    await expect(orders.recordPayment(db, staff, order.id, { method: "cash", tendered: 200 })).rejects.toThrow();
  });

  it("POS walk-in sale: cash with change, complete immediately, shows in report", async () => {
    const { order } = await orders.createOrder(db, staff, {
      items: [grandeOat, { productId: 8, qty: 2 }],
      paymentMethod: "cash",
      tendered: 500,
      completeNow: true,
    });
    expect(order.source).toBe("pos");
    expect(order.total).toBe(385);
    expect(order.status).toBe("completed");
    expect(order.payments[0].change_given).toBe(115);
    expect(await ing(10)).toBe(16); // croissants 18 - 2
    const report = await salesReport(db, "today");
    expect(report.sales).toBe(385);
    expect(report.orders).toBe(1);
    expect(report.average_order).toBe(385);
    expect(report.by_payment[0]).toMatchObject({ method: "cash", amount: 385 });
    expect(report.best_sellers[0]).toMatchObject({ name: "Butter Croissant", qty: 2 });
  });

  it("applies promo codes and staff discounts to the total", async () => {
    const promo = await orders.createOrder(db, customer, { items: [{ productId: 2, qty: 1 }, { productId: 4, qty: 1 }], paymentMethod: "gcash", promoCode: "WELCOME10" });
    expect(promo.order.subtotal).toBe(315); // 150 + 165
    expect(promo.order.discount).toBe(31.5);
    expect(promo.order.total).toBe(283.5);
    await expect(
      orders.createOrder(db, customer, { items: [{ productId: 9, qty: 1 }], paymentMethod: "gcash", promoCode: "PASTRY30" }),
    ).rejects.toThrow(/minimum spend/);
    const manual = await orders.createOrder(db, staff, { items: [{ productId: 9, qty: 2 }], paymentMethod: "cash", manualDiscount: { kind: "percent", value: 20 } });
    expect(manual.order.total).toBe(120);
  });
});

describe("cancellations and refunds", () => {
  it("customer can cancel only while NEW; paid orders are refunded and redeemed points returned", async () => {
    await db.query("update users set points_balance = 200 where id=$1", [customer.id]);
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash", rewardId: 1 });
    expect(await points()).toBe(100);
    const cancelled = await orders.cancelOrder(db, customer, order.id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.payment_status).toBe("refunded");
    expect(cancelled.payments.map((p) => p.kind)).toEqual(["payment", "refund"]);
    expect(await points()).toBe(200);
    expect(await ing(ING.beans)).toBe(4.2); // never deducted

    const second = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "cash" });
    await orders.setStatus(db, staff, second.order.id, "accepted");
    await expect(orders.cancelOrder(db, customer, second.order.id)).rejects.toThrow(/already started/);
    expect((await orders.cancelOrder(db, staff, second.order.id, "Out of oat milk")).status).toBe("cancelled");
  });

  it("customers cannot touch other people's orders or staff endpoints", async () => {
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash" });
    await expect(orders.setStatus(db, customer, order.id, "accepted")).rejects.toThrow(/staff/);
    await expect(orders.getOrderFor(db, { id: 9999, role: "customer" }, order.id)).rejects.toThrow(/not found/);
    await expect(orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "cash", completeNow: true })).rejects.toThrow();
  });

  it("refunding a completed order reverses points, optionally restocks, and blocks double refunds", async () => {
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash" });
    await orders.setStatus(db, staff, order.id, "completed");
    expect(await points()).toBe(99);
    const refunded = await orders.refundOrder(db, staff, order.id, { restock: true });
    expect(refunded.status).toBe("refunded");
    expect(await points()).toBe(80);
    expect(await ing(ING.beans)).toBeCloseTo(4.2, 5);
    await expect(orders.refundOrder(db, staff, order.id)).rejects.toThrow(/completed/);
    const history = (await getLoyalty(db, customer.id)).history.map((h) => h.type);
    expect(history.slice(0, 2)).toEqual(["reverse", "earn"]);
    expect((await salesReport(db, "today")).sales).toBe(0);
  });
});

describe("stock, duplicates and sync", () => {
  it("rejects an order when an ingredient is out, and the menu marks it sold out", async () => {
    await recordMovement(db, staff.id, ING.milk, "adjustment", 0.1);
    await expect(
      orders.createOrder(db, customer, { items: [{ productId: 1, variantId: 2, qty: 1 }], paymentMethod: "gcash" }),
    ).rejects.toMatchObject({ code: "out_of_stock" });
    const menu = await getMenu(db);
    const latte = menu.products.find((p) => p.id === 1)!;
    expect(latte.sold_out).toBe(true);
    expect(latte.sold_out_reason).toMatch(/Fresh Milk/);
    expect(menu.products.find((p) => p.id === 5)!.sold_out).toBe(false); // americano needs no milk
  });

  it("open orders reserve stock so the same milk can't be sold twice", async () => {
    await recordMovement(db, staff.id, ING.milk, "adjustment", 0.5); // enough for two Grande lattes (0.2 each)
    const latte = { items: [{ productId: 1, variantId: 2, qty: 1 }], paymentMethod: "gcash" as const };
    await orders.createOrder(db, customer, latte);
    await orders.createOrder(db, customer, latte);
    await expect(orders.createOrder(db, customer, latte)).rejects.toMatchObject({ code: "out_of_stock" });
  });

  it("duplicate submissions with the same idempotency key create one order", async () => {
    const input = { items: [grandeOat], paymentMethod: "gcash" as const, idempotencyKey: "tap-1" };
    const a = await orders.createOrder(db, customer, input);
    const b = await orders.createOrder(db, customer, input);
    expect(b.duplicate).toBe(true);
    expect(b.order.id).toBe(a.order.id);
    const [{ n }] = await db.query("select count(*)::int as n from orders");
    expect(n).toBe(1);
  });

  it("concurrent identical submissions still produce one order", async () => {
    const input = { items: [grandeOat], paymentMethod: "gcash" as const, idempotencyKey: "race" };
    const results = await Promise.allSettled([1, 2, 3].map(() => orders.createOrder(db, customer, input)));
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const [{ n }] = await db.query("select count(*)::int as n from orders");
    expect(n).toBe(1);
  });

  it("order numbers are gapless and sequential from 1001", async () => {
    const nums: number[] = [];
    for (let i = 0; i < 3; i++) {
      nums.push((await orders.createOrder(db, customer, { items: [{ productId: 9, qty: 1 }], paymentMethod: "gcash" })).order.order_number);
    }
    expect(nums).toEqual([1001, 1002, 1003]);
  });

  it("status can only move forward", async () => {
    const { order } = await orders.createOrder(db, customer, { items: [grandeOat], paymentMethod: "gcash" });
    await orders.setStatus(db, staff, order.id, "preparing");
    await expect(orders.setStatus(db, staff, order.id, "accepted")).rejects.toThrow(/already/);
    await orders.setStatus(db, staff, order.id, "completed");
    await expect(orders.setStatus(db, staff, order.id, "completed")).rejects.toThrow(/already/);
    expect(await points()).toBe(99); // points awarded once
  });

  it("rejects bad input: unknown products, sizes that don't belong, add-ons not offered", async () => {
    const bad = (item: object) => orders.createOrder(db, customer, { items: [item as never], paymentMethod: "gcash" });
    await expect(bad({ productId: 999, qty: 1 })).rejects.toThrow(/not available/);
    await expect(bad({ productId: 1, variantId: 15, qty: 1 })).rejects.toThrow(/Invalid size/);
    await expect(bad({ productId: 8, addonIds: [1], qty: 1 })).rejects.toThrow(/Add-on/);
  });
});

describe("inventory", () => {
  it("records stock-in, stock-out, waste and adjustments with an audit trail and low-stock flags", async () => {
    await recordMovement(db, staff.id, ING.beans, "stock_in", 1, "Delivery");
    await recordMovement(db, staff.id, ING.beans, "waste", 0.2, "Spilled");
    await recordMovement(db, staff.id, ING.beans, "stock_out", 0.5, "Transfer");
    expect(await ing(ING.beans)).toBeCloseTo(4.5, 5);
    await recordMovement(db, staff.id, ING.beans, "adjustment", 1.5, "Recount");
    const rows = await db.query("select type, qty_change, balance_after from stock_movements where ingredient_id=1 order by id");
    expect(rows.map((r) => r.type)).toEqual(["stock_in", "waste", "stock_out", "adjustment"]);
    expect(rows[3]).toMatchObject({ qty_change: -3, balance_after: 1.5 });
    const { low_stock } = await salesReport(db, "today");
    expect(low_stock.map((i) => i.name)).toContain("Coffee Beans"); // 1.5 kg <= 2 kg threshold
    await expect(recordMovement(db, staff.id, ING.beans, "stock_out", 50)).rejects.toThrow(/on hand/);
  });
});
