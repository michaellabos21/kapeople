import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import pg from "pg";

export type Row = Record<string, any>;

export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<R>(fn: (q: Queryable) => Promise<R>): Promise<R>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

const NUMERIC = 1700;
const INT8 = 20;
const toNum = (v: string) => Number(v);

async function pgliteDb(dataDir?: string): Promise<Db> {
  if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  // Loaded lazily so hosted deployments (DATABASE_URL) never pay for the embedded engine.
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  const parsers = { [NUMERIC]: toNum, [INT8]: toNum };
  const wrap = (c: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await c.query<T>(sql, params, { parsers });
      return res.rows;
    },
  });
  return {
    ...wrap(client),
    tx: (fn) => client.transaction((t) => fn(wrap(t as unknown as PGlite))),
    exec: async (sql) => {
      await client.exec(sql);
    },
    close: () => client.close(),
  };
}

function postgresDb(url: string): Db {
  pg.types.setTypeParser(NUMERIC, toNum);
  pg.types.setTypeParser(INT8, toNum);
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 3) });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      return (await pool.query(sql, params as unknown[])).rows as T[];
    },
    async tx(fn) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        const out = await fn({
          async query<T>(sql: string, params: unknown[] = []) {
            return (await c.query(sql, params as unknown[])).rows as T[];
          },
        });
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

const root = () => process.cwd();
const readSql = (f: string) => fs.readFileSync(path.join(root(), "db", f), "utf8");

/** Demo accounts have well-known passwords, so they are never created in production unless explicitly asked for. */
const wantsDemoUsers = () => process.env.NODE_ENV !== "production" || process.env.SEED_DEMO_USERS === "true";

async function seedFresh(q: Queryable, run: (sql: string) => Promise<unknown>) {
  await run(readSql("schema.sql"));
  await run(readSql("seed.sql"));
  if (wantsDemoUsers()) {
    const { seedDemoUsers } = await import("./seed");
    await seedDemoUsers(q);
  }
}

/** Creates a connection and applies schema + catalog seed when the database is empty. */
export async function createDb(opts: { memory?: boolean } = {}): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const hosted = !!url && !opts.memory;
  // The embedded database lives on local disk. On a production host that means data is lost or split
  // across instances, so refuse to start rather than silently falling back to it.
  if (!hosted && !opts.memory && process.env.NODE_ENV === "production" && process.env.ALLOW_EMBEDDED_DB !== "true") {
    throw new Error(
      "DATABASE_URL is not set. Production needs a hosted Postgres (set DATABASE_URL), or set ALLOW_EMBEDDED_DB=true for a single-process self-hosted setup.",
    );
  }
  const db = hosted
    ? postgresDb(url)
    : await pgliteDb(opts.memory ? undefined : process.env.PGLITE_DIR ?? path.join(root(), ".data", "pglite"));

  const check = (q: Queryable) =>
    q.query<{ exists: boolean }>("select to_regclass('public.users') is not null as exists");

  if (hosted) {
    // Several serverless instances can cold-start at once: serialise first-time setup.
    await db.tx(async (q) => {
      await q.query("select pg_advisory_xact_lock(7000)");
      if ((await check(q))[0].exists) return;
      await seedFresh(q, (sql) => q.query(sql));
    });
  } else if (!(await check(db))[0].exists) {
    await seedFresh(db, (sql) => db.exec(sql));
  }

  const { ensureAdminFromEnv } = await import("./seed");
  await ensureAdminFromEnv(db);
  return db;
}

const g = globalThis as unknown as { __kapeopleDb?: Promise<Db> };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!g.__kapeopleDb) {
    g.__kapeopleDb = createDb().catch((e) => {
      g.__kapeopleDb = undefined; // don't cache a failed connection
      throw e;
    });
  }
  return g.__kapeopleDb;
}
