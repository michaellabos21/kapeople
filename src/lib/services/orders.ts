import { randomBytes } from "node:crypto";
import type { Db, Queryable, Row } from "../db";
import { AppError } from "../errors";
import { ACTIVE_STATUSES, ORDER_FLOW, pointsForTotal, type OrderStatus, type PaymentMethod, type Role } from "../config";
import { availableStock, computeUsage, loadCatalog, type Addon } from "./catalog";
import { announce, notify } from "./notifications";
import { publish } from "../bus";

export interface Actor {
  id: number;
  role: Role;
}

export interface CreateOrderInput {
  items: { productId: number; variantId?: number | null; addonIds?: number[]; qty: number; notes?: string }[];
  paymentMethod: PaymentMethod;
  promoCode?: string;
  rewardId?: number;
  idempotencyKey?: string;
  notes?: string;
  // staff (POS) only
  customerId?: number;
  manualDiscount?: { kind: "percent" | "amount"; value: number };
  tendered?: number;
  completeNow?: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const isStaff = (a: Actor) => a.role !== "customer";
const lock = (q: Queryable) => q.query("select pg_advisory_xact_lock(7001)");

// ---------- reads ----------

export type OrderRow = Row & { items: Row[]; payments: Row[] };

export async function hydrate(q: Queryable, orders: Row[]): Promise<OrderRow[]> {
  if (!orders.length) return [];
  const ids = orders.map((o) => Number(o.id)).join(",");
  const [items, payments] = await Promise.all([
    q.query(`select * from order_items where order_id in (${ids}) order by id`),
    q.query(`select * from payments where order_id in (${ids}) order by id`),
  ]);
  return orders.map((o) => ({
    ...o,
    items: items.filter((i) => i.order_id === o.id),
    payments: payments.filter((p) => p.order_id === o.id),
  }));
}

const ORDER_SELECT = `select o.*, u.name as customer_name, u.email as customer_email
  from orders o left join users u on u.id = o.customer_id`;

export async function getOrder(q: Queryable, id: number) {
  const rows = await q.query(`${ORDER_SELECT} where o.id = $1`, [id]);
  if (!rows.length) throw new AppError("Order not found.", 404);
  return (await hydrate(q, rows))[0];
}

export async function getOrderFor(q: Queryable, actor: Actor, id: number) {
  const order = await getOrder(q, id);
  if (actor.role === "customer" && order.customer_id !== actor.id) throw new AppError("Order not found.", 404);
  return order;
}

export async function listOrders(
  q: Queryable,
  actor: Actor,
  f: { statuses?: string[]; limit?: number; search?: string } = {},
) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (actor.role === "customer") {
    params.push(actor.id);
    where.push(`o.customer_id = $${params.length}`);
  }
  if (f.statuses?.length) {
    params.push(f.statuses);
    where.push(`o.status = any($${params.length}::text[])`);
  }
  if (f.search) {
    params.push(`%${f.search}%`);
    where.push(`(o.order_number::text like $${params.length} or u.name ilike $${params.length})`);
  }
  params.push(Math.min(f.limit ?? 50, 200));
  const rows = await q.query(
    `${ORDER_SELECT} ${where.length ? "where " + where.join(" and ") : ""}
      order by o.created_at desc, o.id desc limit $${params.length}`,
    params,
  );
  return hydrate(q, rows);
}

// ---------- create ----------

export async function createOrder(db: Db, actor: Actor, input: CreateOrderInput) {
  const staff = isStaff(actor);
  if (!input.items.length) throw new AppError("Your order is empty.");
  if (!staff && (input.customerId || input.manualDiscount || input.tendered || input.completeNow)) {
    throw new AppError("Not allowed.", 403);
  }

  const result = await db.tx(async (q) => {
    await lock(q); // serialises order creation so stock checks can't race

    // Keys are scoped to the caller, so one user can never collide with (or read) another user's order.
    const idemKey = input.idempotencyKey ? `${actor.id}:${input.idempotencyKey}` : null;
    if (idemKey) {
      const [dupe] = await q.query<{ id: number }>("select id from orders where idempotency_key = $1", [idemKey]);
      if (dupe) return { id: dupe.id, duplicate: true, customerId: null as number | null };
    }

    const catalog = new Map((await loadCatalog(q)).map((p) => [p.id, p]));

    // 1. Price every line from the database (never trust client prices) and total ingredient usage.
    const usage = new Map<number, number>();
    const lines = input.items.map((it) => {
      const p = catalog.get(it.productId);
      if (!p || !p.available) throw new AppError(`${p?.name ?? "That item"} is not available.`);
      let variant = p.variants.find((v) => v.id === it.variantId);
      if (it.variantId && !variant) throw new AppError(`Invalid size for ${p.name}.`);
      if (!variant && p.variants.length) variant = p.variants.find((v) => v.is_default) ?? p.variants[0];
      const addons: Addon[] = (it.addonIds ?? []).map((id) => {
        const a = p.addons.find((x) => x.id === id);
        if (!a || !a.available) throw new AppError(`Add-on not available for ${p.name}.`);
        return a;
      });
      const unit = r2(p.base_price + (variant?.price_delta ?? 0) + addons.reduce((s, a) => s + a.price, 0));
      for (const [ing, n] of computeUsage(p, variant, addons)) {
        usage.set(ing, (usage.get(ing) ?? 0) + n * it.qty);
      }
      return { p, variant, addons, unit, qty: it.qty, notes: it.notes?.trim() || null };
    });
    const subtotal = r2(lines.reduce((s, l) => s + l.unit * l.qty, 0));

    // 2. Stock check against what is still unclaimed.
    const stock = await availableStock(q);
    const names = new Map((await q.query<{ id: number; name: string }>("select id, name from ingredients")).map((i) => [i.id, i.name]));
    const short = [...usage].filter(([id, n]) => (stock.get(id) ?? 0) + 1e-9 < n).map(([id]) => names.get(id));
    if (short.length) {
      throw new AppError(`Sorry, we're short on ${short.join(", ")} — please remove an item and try again.`, 409, "out_of_stock");
    }

    // 3. Discounts: manual (staff) wins over a promo code; reward stacks on top.
    let discount = 0;
    let discountLabel: string | null = null;
    let promoCode: string | null = null;
    if (input.manualDiscount && input.manualDiscount.value > 0) {
      const m = input.manualDiscount;
      discount = m.kind === "percent" ? subtotal * (Math.min(m.value, 100) / 100) : m.value;
      discountLabel = m.kind === "percent" ? `Staff discount ${m.value}%` : "Staff discount";
    } else if (input.promoCode) {
      const [promo] = await q.query<Row>("select * from promotions where upper(code) = upper($1) and active", [
        input.promoCode.trim(),
      ]);
      if (!promo) throw new AppError("That promo code isn't valid.");
      if (subtotal < promo.min_spend) throw new AppError(`This promo needs a minimum spend of ₱${promo.min_spend}.`);
      if (promo.max_uses_per_customer != null) {
        const promoCustomer = staff ? (input.customerId ?? null) : actor.id;
        if (!promoCustomer) throw new AppError("This promo is limited per customer — attach a customer account first.");
        const [{ n }] = await q.query<{ n: number }>(
          `select count(*)::int as n from orders
            where customer_id = $1 and promo_code = $2 and status not in ('cancelled','refunded')`,
          [promoCustomer, promo.code],
        );
        if (n >= promo.max_uses_per_customer) throw new AppError(`You've already used ${promo.code}.`, 409, "promo_used");
      }
      discount = promo.kind === "percent" ? subtotal * (promo.value / 100) : promo.value;
      discountLabel = `${promo.code}`;
      promoCode = promo.code;
    }
    discount = r2(Math.min(discount, subtotal));

    const customerId = staff ? (input.customerId ?? null) : actor.id;
    let rewardDiscount = 0;
    let pointsRedeemed = 0;
    if (input.rewardId) {
      if (!customerId) throw new AppError("Rewards need a customer account.");
      const [reward] = await q.query<Row>("select * from rewards where id = $1 and active", [input.rewardId]);
      if (!reward) throw new AppError("Reward not found.");
      const [cust] = await q.query<Row>("select points_balance from users where id = $1 for update", [customerId]);
      if (!cust || cust.points_balance < reward.points_cost) throw new AppError("Not enough points for that reward.");
      rewardDiscount = r2(Math.min(reward.discount_amount, subtotal - discount));
      pointsRedeemed = reward.points_cost;
    }
    const total = r2(Math.max(0, subtotal - discount - rewardDiscount));

    // 4. Payment rules.
    //    POS: paid at the counter. App: gcash/card are simulated (gateway integration is deferred), cash is paid at pickup.
    const paidNow = staff || input.paymentMethod !== "cash";
    let tendered: number | null = null;
    if (staff && input.paymentMethod === "cash") {
      tendered = Number(input.tendered ?? total);
      if (tendered + 1e-9 < total) throw new AppError("Cash received is less than the total.", 400, "underpaid");
    }

    // 5. Write the order.
    const status: OrderStatus = staff ? "preparing" : "new";
    const usageObj = Object.fromEntries([...usage].map(([k, v]) => [k, r2(v * 1000) / 1000]));
    const [order] = await q.query<{ id: number; order_number: number }>(
      `insert into orders (order_number, branch_id, customer_id, created_by, source, status, payment_method, payment_status,
          subtotal, discount, discount_label, reward_discount, total, points_redeemed, ingredient_usage, notes,
          idempotency_key, accepted_at, promo_code)
       values ((select coalesce(max(order_number), 1000) + 1 from orders), 1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15, $16, $17)
       returning id, order_number`,
      [
        customerId, actor.id, staff ? "pos" : "app", status, input.paymentMethod, paidNow ? "paid" : "unpaid",
        subtotal, discount, discountLabel, rewardDiscount, total, pointsRedeemed, JSON.stringify(usageObj),
        input.notes?.trim() || null, idemKey, staff ? new Date().toISOString() : null, promoCode,
      ],
    );
    for (const l of lines) {
      await q.query(
        `insert into order_items (order_id, product_id, name, variant_name, addons, unit_price, qty, line_total, notes)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
        [
          order.id, l.p.id, l.p.name, l.variant?.name ?? null,
          JSON.stringify(l.addons.map((a) => ({ id: a.id, name: a.name, price: a.price }))),
          l.unit, l.qty, r2(l.unit * l.qty), l.notes,
        ],
      );
    }
    if (paidNow) {
      const reference = staff ? null : `SIMULATED-${randomBytes(3).toString("hex").toUpperCase()}`;
      await q.query(
        `insert into payments (order_id, kind, method, amount, tendered, change_given, reference, created_by)
         values ($1,'payment',$2,$3,$4,$5,$6,$7)`,
        [order.id, input.paymentMethod, total, tendered, tendered === null ? null : r2(tendered - total), reference, actor.id],
      );
    }
    if (pointsRedeemed && customerId) {
      const [u] = await q.query<{ points_balance: number }>(
        "update users set points_balance = points_balance - $1 where id = $2 returning points_balance",
        [pointsRedeemed, customerId],
      );
      await q.query(
        `insert into loyalty_transactions (customer_id, order_id, type, points, balance_after, note)
         values ($1,$2,'redeem',$3,$4,$5)`,
        [customerId, order.id, -pointsRedeemed, u.points_balance, `Redeemed on order #${order.order_number}`],
      );
    }
    if (customerId && !staff) {
      await notify(q, customerId, `Order #${order.order_number} received`, "We'll let you know once the store accepts it.", order.id);
    }
    return { id: order.id, duplicate: false, customerId };
  });

  if (!result.duplicate) {
    announce(result.customerId, result.id);
    if (input.completeNow && staff) await setStatus(db, actor, result.id, "completed");
  }
  return { order: await getOrder(db, result.id), duplicate: result.duplicate };
}

// ---------- status flow ----------

/** Deducts ingredients and awards points. Runs inside the caller's transaction. */
async function finalize(q: Queryable, order: Row) {
  if (order.payment_status !== "paid") {
    throw new AppError("Record the payment before completing this order.", 402, "unpaid");
  }
  if (!order.inventory_deducted) {
    const usage = order.ingredient_usage as Record<string, number>;
    for (const [id, n] of Object.entries(usage)) {
      const [ing] = await q.query<{ current_qty: number }>(
        "update ingredients set current_qty = current_qty - $1 where id = $2 returning current_qty",
        [n, Number(id)],
      );
      await q.query(
        `insert into stock_movements (ingredient_id, type, qty_change, balance_after, note, order_id)
         values ($1,'sale',$2,$3,$4,$5)`,
        [Number(id), -n, ing.current_qty, `Order #${order.order_number}`, order.id],
      );
    }
  }
  const pts = order.customer_id ? pointsForTotal(order.total) : 0;
  if (pts > 0) {
    const [u] = await q.query<{ points_balance: number }>(
      "update users set points_balance = points_balance + $1 where id = $2 returning points_balance",
      [pts, order.customer_id],
    );
    await q.query(
      `insert into loyalty_transactions (customer_id, order_id, type, points, balance_after, note)
       values ($1,$2,'earn',$3,$4,$5)`,
      [order.customer_id, order.id, pts, u.points_balance, `Earned on order #${order.order_number}`],
    );
  }
  await q.query(
    `update orders set status = 'completed', completed_at = now(), updated_at = now(),
            inventory_deducted = true, points_earned = $2 where id = $1`,
    [order.id, pts],
  );
  if (order.customer_id) {
    await notify(
      q, order.customer_id, `Order #${order.order_number} completed`,
      pts ? `⭐ You earned ${pts} points. Thank you!` : "Thank you!", order.id,
    );
  }
}

const COPY: Partial<Record<OrderStatus, [string, string]>> = {
  accepted: ["accepted", "The store is on it."],
  preparing: ["is being prepared", "Your order is in the works."],
  ready: ["is ready!", "Come pick it up at the counter."],
};

export async function setStatus(db: Db, actor: Actor, id: number, next: OrderStatus) {
  if (!isStaff(actor)) throw new AppError("Only staff can update orders.", 403);
  if (!(ORDER_FLOW as readonly string[]).includes(next) || next === "new") throw new AppError("Invalid status.");

  const customerId = await db.tx(async (q) => {
    await lock(q);
    const [order] = await q.query<Row>("select * from orders where id = $1 for update", [id]);
    if (!order) throw new AppError("Order not found.", 404);
    const flow: readonly string[] = ORDER_FLOW;
    const from = flow.indexOf(order.status);
    const to = flow.indexOf(next);
    if (from < 0) throw new AppError(`This order is already ${order.status}.`, 409);
    if (to <= from) throw new AppError(`Order is already ${order.status}.`, 409);

    if (next === "completed") {
      await finalize(q, order);
    } else {
      await q.query(
        `update orders set status = $2, updated_at = now(),
                accepted_at = coalesce(accepted_at, now()),
                ready_at = case when $2 = 'ready' then now() else ready_at end where id = $1`,
        [id, next],
      );
      const copy = COPY[next];
      if (order.customer_id && copy) {
        await notify(q, order.customer_id, `Order #${order.order_number} ${copy[0]}`, copy[1], id);
      }
    }
    return order.customer_id as number | null;
  });
  announce(customerId, id);
  if (next === "completed") publish({ type: "inventory" });
  return getOrder(db, id);
}

// ---------- payment / cancel / refund ----------

export async function recordPayment(
  db: Db,
  actor: Actor,
  id: number,
  p: { method: PaymentMethod; tendered?: number; reference?: string },
) {
  if (!isStaff(actor)) throw new AppError("Only staff can record payments.", 403);
  await db.tx(async (q) => {
    const [order] = await q.query<Row>("select * from orders where id = $1 for update", [id]);
    if (!order) throw new AppError("Order not found.", 404);
    if (order.payment_status === "paid") throw new AppError("This order is already paid.", 409);
    if (!(ACTIVE_STATUSES as readonly string[]).includes(order.status)) throw new AppError("This order is closed.", 409);
    let tendered: number | null = null;
    if (p.method === "cash") {
      tendered = Number(p.tendered ?? order.total);
      if (tendered + 1e-9 < order.total) throw new AppError("Cash received is less than the total.", 400, "underpaid");
    }
    await q.query(
      `insert into payments (order_id, kind, method, amount, tendered, change_given, reference, created_by)
       values ($1,'payment',$2,$3,$4,$5,$6,$7)`,
      [id, p.method, order.total, tendered, tendered === null ? null : r2(tendered - order.total), p.reference ?? null, actor.id],
    );
    await q.query("update orders set payment_status = 'paid', payment_method = $2, updated_at = now() where id = $1", [id, p.method]);
  });
  announce(null, id);
  return getOrder(db, id);
}

async function returnRedeemedPoints(q: Queryable, order: Row) {
  if (!order.points_redeemed || !order.customer_id) return;
  const [u] = await q.query<{ points_balance: number }>(
    "update users set points_balance = points_balance + $1 where id = $2 returning points_balance",
    [order.points_redeemed, order.customer_id],
  );
  await q.query(
    `insert into loyalty_transactions (customer_id, order_id, type, points, balance_after, note)
     values ($1,$2,'redeem_return',$3,$4,$5)`,
    [order.customer_id, order.id, order.points_redeemed, u.points_balance, `Points returned — order #${order.order_number}`],
  );
}

async function refundPayment(q: Queryable, order: Row, actorId: number) {
  if (order.payment_status !== "paid") return;
  await q.query(
    `insert into payments (order_id, kind, method, amount, created_by) values ($1,'refund',$2,$3,$4)`,
    [order.id, order.payment_method, order.total, actorId],
  );
}

export async function cancelOrder(db: Db, actor: Actor, id: number, reason?: string) {
  const customerId = await db.tx(async (q) => {
    await lock(q);
    const [order] = await q.query<Row>("select * from orders where id = $1 for update", [id]);
    if (!order || (actor.role === "customer" && order.customer_id !== actor.id)) throw new AppError("Order not found.", 404);
    if (actor.role === "customer" && order.status !== "new") {
      throw new AppError("The store has already started on this order, so it can't be cancelled in the app.", 409);
    }
    if (!(ACTIVE_STATUSES as readonly string[]).includes(order.status)) throw new AppError(`Order is already ${order.status}.`, 409);

    await refundPayment(q, order, actor.id);
    await returnRedeemedPoints(q, order);
    await q.query(
      `update orders set status = 'cancelled', cancelled_at = now(), updated_at = now(), cancel_reason = $2,
              payment_status = case when payment_status = 'paid' then 'refunded' else payment_status end
        where id = $1`,
      [id, reason?.trim() || null],
    );
    if (order.customer_id && isStaff(actor)) {
      await notify(q, order.customer_id, `Order #${order.order_number} cancelled`, reason?.trim() || "The store cancelled your order.", id);
    }
    return order.customer_id as number | null;
  });
  announce(customerId, id);
  return getOrder(db, id);
}

export async function refundOrder(db: Db, actor: Actor, id: number, opts: { restock?: boolean; reason?: string } = {}) {
  if (!isStaff(actor)) throw new AppError("Only staff can refund orders.", 403);
  const customerId = await db.tx(async (q) => {
    await lock(q);
    const [order] = await q.query<Row>("select * from orders where id = $1 for update", [id]);
    if (!order) throw new AppError("Order not found.", 404);
    if (order.status !== "completed") throw new AppError("Only completed orders can be refunded.", 409);

    await refundPayment(q, order, actor.id);
    await returnRedeemedPoints(q, order);
    if (order.points_earned && order.customer_id) {
      const [u] = await q.query<{ points_balance: number }>(
        "update users set points_balance = points_balance - $1 where id = $2 returning points_balance",
        [order.points_earned, order.customer_id],
      );
      await q.query(
        `insert into loyalty_transactions (customer_id, order_id, type, points, balance_after, note)
         values ($1,$2,'reverse',$3,$4,$5)`,
        [order.customer_id, id, -order.points_earned, u.points_balance, `Refund — order #${order.order_number}`],
      );
    }
    if (opts.restock) {
      for (const [ingId, n] of Object.entries(order.ingredient_usage as Record<string, number>)) {
        const [ing] = await q.query<{ current_qty: number }>(
          "update ingredients set current_qty = current_qty + $1 where id = $2 returning current_qty",
          [n, Number(ingId)],
        );
        await q.query(
          `insert into stock_movements (ingredient_id, type, qty_change, balance_after, note, order_id, created_by)
           values ($1,'refund_return',$2,$3,$4,$5,$6)`,
          [Number(ingId), n, ing.current_qty, `Refund — order #${order.order_number}`, id, actor.id],
        );
      }
    }
    await q.query(
      `update orders set status = 'refunded', payment_status = 'refunded', refunded_at = now(), updated_at = now(),
              cancel_reason = $2 where id = $1`,
      [id, opts.reason?.trim() || null],
    );
    if (order.customer_id) {
      await notify(q, order.customer_id, `Order #${order.order_number} refunded`, `₱${order.total} was refunded.`, id);
    }
    return order.customer_id as number | null;
  });
  announce(customerId, id);
  if (opts.restock) publish({ type: "inventory" });
  return getOrder(db, id);
}
