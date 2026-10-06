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

export async function login(q: Queryable, emailRaw: string, password: string) {
  const [row] = await q.query<Row>("select * from users where email = $1", [
    emailRaw.trim().toLowerCase(),
  ]);
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw new AppError("Incorrect email or password.", 401);
  }
  const { password_hash: _ph, created_at: _c, ...user } = row;
  void _ph;
  void _c;
  return { user: user as User, token: await createSession(q, row.id) };
}

export async function userFromToken(q: Queryable, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const [u] = await q.query<User>(
    `select ${USER_COLS.split(", ").map((c) => "u." + c).join(", ")}
       from sessions s join users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now()`,
    [token],
  );
  return u ?? null;
}

export async function logout(q: Queryable, token: string | undefined) {
  if (token) await q.query("delete from sessions where token = $1", [token]);
}
