import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, route } from "@/lib/api";
import { signup } from "@/lib/services/auth";
import { SESSION_COOKIE } from "@/lib/session";

const Body = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters"),
  phone: z.string().optional(),
});

export const POST = route("public", async ({ req, db }) => {
  const { user, token } = await signup(db, Body.parse(await req.json()), clientIp(req));
  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
});
