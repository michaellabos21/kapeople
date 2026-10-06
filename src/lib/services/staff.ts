import type { Queryable, Row } from "../db";
import { AppError } from "../errors";
import { hashPassword, MIN_PASSWORD } from "./auth";

export type StaffRole = "employee" | "admin";

export async function listStaff(q: Queryable) {
  return q.query(
    "select id, name, email, role, active, created_at from users where role in ('employee','admin') order by active desc, role, id",
  );
}

const checkPassword = (pw: string) => {
  if (pw.length < MIN_PASSWORD) throw new AppError(`Use at least ${MIN_PASSWORD} characters.`);
};

export async function createStaff(
  q: Queryable,
  input: { name: string; email: string; role: StaffRole; password: string },
) {
  checkPassword(input.password);
  const email = input.email.trim().toLowerCase();
  const [dupe] = await q.query("select 1 from users where email = $1", [email]);
  if (dupe) throw new AppError("An account with this email already exists.", 409);
  const [u] = await q.query<Row>(
    `insert into users (role, name, email, password_hash, branch_id) values ($1,$2,$3,$4,1)
     returning id, name, email, role, active`,
    [input.role, input.name.trim(), email, await hashPassword(input.password)],
  );
  return u;
}

async function staffRow(q: Queryable, id: number) {
  const [u] = await q.query<Row>(
    "select id, role, active from users where id = $1 and role in ('employee','admin') for update",
    [id],
  );
  if (!u) throw new AppError("Staff member not found.", 404);
  return u;
}

export async function setActive(q: Queryable, actorId: number, id: number, active: boolean) {
  await q.query("select pg_advisory_xact_lock(7002)"); // serialise so two admins can't remove each other
  const u = await staffRow(q, id);
  if (!active) {
    if (id === actorId) throw new AppError("You can't deactivate your own account.", 400);
    if (u.role === "admin") {
      const [{ n }] = await q.query<{ n: number }>(
        "select count(*)::int as n from users where role = 'admin' and active and id <> $1",
        [id],
      );
      if (n === 0) throw new AppError("There must be at least one active admin.", 400);
    }
  }
  await q.query("update users set active = $2 where id = $1", [id, active]);
  if (!active) await q.query("delete from sessions where user_id = $1", [id]); // sign them out everywhere
}

export async function resetStaffPassword(q: Queryable, id: number, password: string) {
  checkPassword(password);
  await staffRow(q, id);
  await q.query("update users set password_hash = $2 where id = $1", [id, await hashPassword(password)]);
  await q.query("delete from sessions where user_id = $1", [id]);
  await q.query("delete from login_attempts where email = (select email from users where id = $1)", [id]); // lift any lockout
}
