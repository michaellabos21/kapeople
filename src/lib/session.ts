import { cookies } from "next/headers";
import { getDb } from "./db";
import { userFromToken, type User } from "./services/auth";

export const SESSION_COOKIE = "kp_session";

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser(): Promise<User | null> {
  const token = await sessionToken();
  if (!token) return null;
  return userFromToken(await getDb(), token);
}
