import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness/readiness for uptime monitors. Deliberately reveals nothing about the database
 * or configuration (details go to the server log), and does the cheapest possible query.
 */
export async function GET() {
  try {
    await (await getDb()).query("select 1");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("health check failed:", (e as Error).message);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
