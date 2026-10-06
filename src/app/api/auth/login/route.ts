import { NextResponse } from "next/server";
import { z } from "zod";
import { route } from "@/lib/api";
import { login } from "@/lib/services/auth";
import { SESSION_COOKIE } from "@/lib/session";

const Body = z.object({ email: z.string(), password: z.string() });

export const POST = route("public", async ({ req, db }) => {
  const b = Body.parse(await req.json());
  const { user, token } = await login(db, b.email, b.password);
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
});
