import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { logout } from "@/lib/services/auth";
import { SESSION_COOKIE, sessionToken } from "@/lib/session";

export const POST = route("public", async ({ db }) => {
  await logout(db, await sessionToken());
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
