import type { Db } from "./db";
import { hashPassword } from "./services/auth";

/** Demo accounts for local development. Credentials are listed in README.md. */
export async function seedDemoUsers(db: Db) {
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
