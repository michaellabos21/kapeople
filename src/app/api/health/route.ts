import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Deployment check: which database is this running against, and is it reachable?
 * Reveals no secrets or user data (only a mode label and a product count).
 */
export async function GET() {
  const mode = process.env.DATABASE_URL ? "hosted-postgres" : "embedded";
  try {
    const db = await getDb();
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from products");
    const [{ schema, db_name }] = await db.query<{ schema: string; db_name: string }>(
      "select current_schema() as schema, current_database() as db_name",
    );
    return NextResponse.json({ ok: true, mode, schema, database: db_name, products: n, env: process.env.NODE_ENV });
  } catch (e) {
    return NextResponse.json({ ok: false, mode, error: (e as Error).message.slice(0, 200) }, { status: 500 });
  }
}
