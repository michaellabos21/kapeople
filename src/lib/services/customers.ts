import type { Queryable, Row } from "../db";
import { AppError } from "../errors";

export type CustomerSort = "recent" | "spent" | "orders" | "points" | "name" | "last_order";

const ORDER_BY: Record<CustomerSort, string> = {
  recent: "u.created_at desc, u.id desc",
  spent: "coalesce(o.spent, 0) desc, u.id",
  orders: "coalesce(o.orders, 0) desc, u.id",
  points: "u.points_balance desc, u.id",
  name: "lower(u.name), u.id",
  last_order: "o.last_order desc nulls last, u.id",
};

/** Treat user input as literal text in LIKE patterns. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

const BASE = `
  from users u
  left join (
    select customer_id,
           count(*) filter (where status = 'completed')::int as orders,
           coalesce(sum(total) filter (where status = 'completed'), 0) as spent,
           max(created_at) as last_order
      from orders where customer_id is not null group by customer_id
  ) o on o.customer_id = u.id
  where u.role = 'customer'`;

export async function listCustomers(
  q: Queryable,
  f: { search?: string; sort?: CustomerSort; limit?: number; offset?: number } = {},
) {
  const params: unknown[] = [];
  let where = "";
  if (f.search?.trim()) {
    params.push(`%${escapeLike(f.search.trim())}%`);
    where = ` and (u.name ilike $1 or u.email ilike $1 or coalesce(u.phone, '') ilike $1)`;
  }
  const limit = Math.min(Math.max(f.limit ?? 25, 1), 200);
  const offset = Math.max(f.offset ?? 0, 0);
  const [rows, [{ total }]] = await Promise.all([
    q.query(
      `select u.id, u.name, u.email, u.phone, u.points_balance, u.active, u.created_at,
              coalesce(o.orders, 0) as orders, coalesce(o.spent, 0) as spent, o.last_order
       ${BASE}${where} order by ${ORDER_BY[f.sort ?? "recent"]} limit ${limit} offset ${offset}`,
      params,
    ),
    q.query<{ total: number }>(`select count(*)::int as total ${BASE}${where}`, params),
  ]);
  return { customers: rows, total };
}

export async function getCustomer(q: Queryable, id: number) {
  const [customer] = await q.query<Row>(
    `select id, name, email, phone, points_balance, active, staff_notes, created_at
       from users where id = $1 and role = 'customer'`,
    [id],
  );
  if (!customer) throw new AppError("Customer not found.", 404);
  const [[stats], orders, loyalty] = await Promise.all([
    q.query<Row>(
      `select count(*) filter (where status = 'completed')::int as orders,
              coalesce(sum(total) filter (where status = 'completed'), 0) as spent,
              count(*) filter (where status = 'cancelled')::int as cancelled,
              count(*) filter (where status = 'refunded')::int as refunded,
              max(created_at) as last_order
         from orders where customer_id = $1`,
      [id],
    ),
    q.query(
      `select id, order_number, status, total, payment_method, source, created_at
         from orders where customer_id = $1 order by created_at desc, id desc limit 20`,
      [id],
    ),
    q.query("select * from loyalty_transactions where customer_id = $1 order by created_at desc, id desc limit 30", [id]),
  ]);
  return { customer, stats, orders, loyalty };
}

export async function updateNotes(q: Queryable, id: number, notes: string) {
  const rows = await q.query("update users set staff_notes = $2 where id = $1 and role = 'customer' returning id", [
    id,
    notes.trim() || null,
  ]);
  if (!rows.length) throw new AppError("Customer not found.", 404);
}

/** Blocks (or restores) sign-in for a customer. Their orders and points are kept. */
export async function setCustomerActive(q: Queryable, id: number, active: boolean) {
  const rows = await q.query("update users set active = $2 where id = $1 and role = 'customer' returning id", [id, active]);
  if (!rows.length) throw new AppError("Customer not found.", 404);
  if (!active) await q.query("delete from sessions where user_id = $1", [id]);
}

/** Manual correction of a points balance. Always leaves a ledger row naming the admin and the reason. */
export async function adjustPoints(q: Queryable, adminId: number, customerId: number, delta: number, reason: string) {
  if (!Number.isInteger(delta) || delta === 0) throw new AppError("Enter a whole number of points (not zero).");
  if (!reason.trim()) throw new AppError("A reason is required for point adjustments.");
  const [c] = await q.query<Row>("select points_balance from users where id = $1 and role = 'customer' for update", [customerId]);
  if (!c) throw new AppError("Customer not found.", 404);
  if (c.points_balance + delta < 0) throw new AppError(`That would take the balance below zero (current: ${c.points_balance}).`);
  const [admin] = await q.query<{ name: string }>("select name from users where id = $1", [adminId]);
  const [u] = await q.query<{ points_balance: number }>(
    "update users set points_balance = points_balance + $2 where id = $1 returning points_balance",
    [customerId, delta],
  );
  await q.query(
    `insert into loyalty_transactions (customer_id, type, points, balance_after, note) values ($1,'adjust',$2,$3,$4)`,
    [customerId, delta, u.points_balance, `${reason.trim()} (adjusted by ${admin?.name ?? "admin"})`],
  );
  return u.points_balance;
}

// ---- CSV export ----

/** Quotes a CSV field and defuses spreadsheet formula injection (a name like `=HYPERLINK(...)`). */
export function csvField(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function customersCsv(q: Queryable): Promise<string> {
  const { customers } = await listCustomers(q, { sort: "name", limit: 200000 });
  const head = ["Name", "Email", "Phone", "Joined", "Completed orders", "Total spent", "Points", "Last order", "Active"];
  const lines = [head.map(csvField).join(",")];
  for (const c of customers) {
    lines.push(
      [c.name, c.email, c.phone, c.created_at, c.orders, c.spent, c.points_balance, c.last_order, c.active ? "yes" : "no"]
        .map(csvField)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
