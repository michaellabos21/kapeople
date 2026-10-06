import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Queryable, Row } from "../db";
import type { Role } from "../config";
import { AppError } from "../errors";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export interface User {
  id: number;
  role: Role;
  name: string;
  email: string;
  phone: string | null;
  points_balance: number;
  branch_id: number | null;
}

const USER_COLS = "id, role, name, email, phone, points_balance, branch_id";

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  const key = await scrypt(pw, Buffer.from(saltHex, "hex"), 32);
  const expected = Buffer.from(keyHex, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}

async function createSession(q: Queryable, userId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await q.query(
    "insert into sessions (token, user_id, expires_at) values ($1, $2, now() + interval '30 days')",
    [token, userId],
  );
  return token;
}

export async function signup(
  q: Queryable,
  input: { name: string; email: string; password: string; phone?: string },
) {
  const email = input.email.trim().toLowerCase();
  const [dupe] = await q.query("select 1 from users where email = $1", [email]);
  if (dupe) throw new AppError("An account with this email already exists.", 409);
  const hash = await hashPassword(input.password);
  const [user] = await q.query<User>(
    `insert into users (role, name, email, phone, password_hash) values ('customer', $1, $2, $3, $4)
     returning ${USER_COLS}`,
    [input.name.trim(), email, input.phone?.trim() || null, hash],
  );
  return { user, token: await createSession(q, user.id) };
}

const MAX_FAILED_LOGINS = 5; // per email, per 15 minutes
export const MIN_PASSWORD = 12;

export async function login(q: Queryable, emailRaw: string, password: string) {
  const email = emailRaw.trim().toLowerCase();
  const [{ n }] = await q.query<{ n: number }>(
    "select count(*)::int as n from login_attempts where email = $1 and not success and created_at > now() - interval '15 minutes'",
    [email],
  );
  if (n >= MAX_FAILED_LOGINS) {
    throw new AppError("Too many failed attempts. Please wait 15 minutes and try again.", 429);
  }

  const [row] = await q.query<Row>("select * from users where email = $1", [email]);
  const valid = !!row && (await verifyPassword(password, row.password_hash));
  if (!valid) {
    await q.query("delete from login_attempts where created_at < now() - interval '1 day'");
    await q.query("insert into login_attempts (email, success) values ($1, false)", [email]);
    throw new AppError("Incorrect email or password.", 401);
  }
  if (!row.active) throw new AppError("This account has been deactivated. Please contact an admin.", 403);

  await q.query("delete from login_attempts where email = $1", [email]); // reset the counter
  const { password_hash: _ph, created_at: _c, active: _a, ...user } = row;
  void _ph;
  void _c;
  void _a;
  return { user: user as User, token: await createSession(q, row.id) };
}

export async function userFromToken(q: Queryable, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [u] = await q.query<User>(
    `select ${USER_COLS.split(", ").map((c) => "u." + c).join(", ")}
       from sessions s join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now() and u.active`,
    [token],
  );
  return u ?? null;
}

export async function logout(q: Queryable, token: string | undefined) {
  if (token) await q.query("delete from sessions where token = $1", [token]);
}

export async function changeOwnPassword(q: Queryable, userId: number, current: string, next: string, keepToken?: string) {
  if (next.length < MIN_PASSWORD) throw new AppError(`Use at least ${MIN_PASSWORD} characters.`);
  const [row] = await q.query<Row>("select password_hash from users where id = $1", [userId]);
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw new AppError("Your current password is incorrect.", 400);
  }
  await q.query("update users set password_hash = $2 where id = $1", [userId, await hashPassword(next)]);
  // Sign out other devices, keep this session.
  await q.query("delete from sessions where user_id = $1 and token <> $2", [userId, keepToken ?? ""]);
}
