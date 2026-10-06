import type { Queryable } from "./db";
import { hashPassword } from "./services/auth";

/** Demo accounts for local development. Credentials are listed in README.md. */
export async function seedDemoUsers(db: Queryable) {
  const pw = await hashPassword("kapeople123");
  const rows: [string, string, string, string | null][] = [
    ["admin", "Ana Admin", "admin@kapeople.test", null],
    ["employee", "Ben Barista", "staff@kapeople.test", null],
    ["customer", "Valerie Cruz", "valerie@example.test", "0917 000 0001"],
  ];
  for (const [role, name, email, phone] of rows) {
    await db.query(
      `insert into users (role, name, email, phone, password_hash, branch_id)
       values ($1,$2,$3,$4,$5, case when $1 = 'customer' then null else 1 end)`,
      [role, name, email, phone, pw],
    );
  }
  // Valerie starts with 80 points (matches the example in the plan).
  const [{ id }] = await db.query<{ id: number }>("select id from users where email = 'valerie@example.test'");
  await db.query("update users set points_balance = 80 where id = $1", [id]);
  await db.query(
    "insert into loyalty_transactions (customer_id, type, points, balance_after, note) values ($1,'adjust',80,80,'Welcome bonus')",
    [id],
  );
}

/**
 * Production bootstrap: creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD (if both are set and
 * no such user exists yet). The password is only read from the environment, never stored in the repo.
 */
export async function ensureAdminFromEnv(db: Queryable) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  const hash = await hashPassword(password);
  await db.query(
    `insert into users (role, name, email, password_hash, branch_id)
     values ('admin', $1, $2, $3, 1) on conflict (email) do nothing`,
    [process.env.ADMIN_NAME?.trim() || "Admin", email, hash],
  );
}
