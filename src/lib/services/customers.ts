import type { Queryable, Row } from "../db";
import { AppError } from "../errors";
import { NO_PASSWORD } from "./auth";

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
              (u.password_hash like '!%') as not_activated,
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
    `select id, name, email, phone, points_balance, active, staff_notes, created_at,
            (password_hash like '!%') as not_activated
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

// ---- import from a sign-up sheet ----

export interface SheetRow {
  signedUpAt: Date;
  name: string;
  email: string;
  phone: string;
  handle: string;
  consent: string;
  sheetId: string;
}
export interface SkippedRow {
  line: number;
  name: string;
  reason: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "9/19/2026 21:04:42" (M/D/YYYY, store local time = Philippines, UTC+8) → Date. */
export function parseSheetDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, mo, d, y, h, mi, se] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${mi}:${se}+08:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Tab-separated: timestamp, name, email, phone, social handle, consent, sheet id. */
export function parseSignupSheet(text: string): { rows: SheetRow[]; skipped: SkippedRow[] } {
  const rows: SheetRow[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const c = raw.split("\t").map((x) => x.trim());
    const name = c[1] ?? "";
    const email = (c[2] ?? "").toLowerCase();
    const at = parseSheetDate(c[0] ?? "");
    const skip = (reason: string) => skipped.push({ line: i + 1, name: name || "(no name)", reason });
    if (!name) return skip("no name");
    if (!email) return skip("no email address");
    if (!EMAIL_RE.test(email)) return skip(`invalid email "${email}"`);
    if (!at) return skip(`unreadable date "${c[0]}"`);
    if (seen.has(email)) return skip("duplicate email in the sheet");
    seen.add(email);
    rows.push({
      signedUpAt: at,
      name: name.replace(/\s+/g, " "),
      email,
      phone: c[3] ?? "",
      handle: /^(n\/?a|none|-)?$/i.test(c[4] ?? "") ? "" : c[4],
      consent: c[5] ?? "",
      sheetId: c[6] ?? "",
    });
  });
  return { rows, skipped };
}

const noteFor = (r: SheetRow) =>
  [
    `Imported from sign-up sheet${r.sheetId ? ` (row ${r.sheetId})` : ""}, signed up ${r.signedUpAt.toISOString().slice(0, 16).replace("T", " ")} UTC.`,
    `Consent: ${r.consent || "not recorded"}.`,
    r.handle ? `Social: ${r.handle}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

/**
 * Creates customer accounts without a password (they claim them by signing up with the same email + mobile).
 * Existing emails are left untouched. `apply: false` only reports what would happen.
 */
export async function importCustomers(q: Queryable, rows: SheetRow[], opts: { apply: boolean }) {
  const created: string[] = [];
  const existing: string[] = [];
  for (const r of rows) {
    const [dupe] = await q.query("select 1 from users where email = $1", [r.email]);
    if (dupe) {
      existing.push(r.email);
      continue;
    }
    if (opts.apply) {
      await q.query(
        `insert into users (role, name, email, phone, password_hash, staff_notes, created_at)
         values ('customer', $1, $2, $3, $4, $5, $6)`,
        [r.name, r.email, r.phone || null, NO_PASSWORD, noteFor(r), r.signedUpAt.toISOString()],
      );
    }
    created.push(r.email);
  }
  return { created, existing };
}
