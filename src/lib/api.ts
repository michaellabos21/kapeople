import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDb, type Db } from "./db";
import { AppError } from "./errors";
import { currentUser } from "./session";
import type { Role } from "./config";
import type { User } from "./services/auth";

type Ctx = { params: Promise<Record<string, string>> };

interface HandlerArgs {
  req: NextRequest;
  db: Db;
  user: User;
  params: Record<string, string>;
}

/**
 * Wraps a route handler: resolves the session user, enforces roles and turns
 * AppError / validation errors into JSON responses.
 * `roles: "public"` skips the auth requirement (user may be null at runtime).
 */
export function route(
  roles: Role[] | "public",
  fn: (a: HandlerArgs) => Promise<unknown>,
) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      const db = await getDb();
      const user = await currentUser();
      if (roles !== "public") {
        if (!user) throw new AppError("Please sign in.", 401);
        if (!roles.includes(user.role)) throw new AppError("You don't have access to this.", 403);
      }
      const params = ctx?.params ? await ctx.params : {};
      const out = await fn({ req, db, user: user as User, params });
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      }
      if (e instanceof ZodError) {
        const msg = e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      console.error(e);
      return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
    }
  };
}

export const STAFF: Role[] = ["employee", "admin"];
export const ANY: Role[] = ["customer", "employee", "admin"];

/**
 * Best available client IP for throttling, or null if there isn't a trustworthy one.
 * Netlify sets x-nf-client-connection-ip itself; x-forwarded-for is only used as a fallback.
 */
export function clientIp(req: NextRequest): string | null {
  const nf = req.headers.get("x-nf-client-connection-ip");
  if (nf) return nf.trim();
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || null;
}
