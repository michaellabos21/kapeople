import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
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

function pgliteDb(dataDir?: string): Db {
  if (dataDir) fs.mkdirSync(path.dirname(dataDir), { recursive: true });
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
  const pool = new pg.Pool({ connectionString: url, max: 5 });
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

/** Creates a connection and applies schema + catalog seed when the database is empty. */
export async function createDb(opts: { memory?: boolean } = {}): Promise<Db> {
  const url = process.env.DATABASE_URL;
  const db = url && !opts.memory
    ? postgresDb(url)
    : pgliteDb(opts.memory ? undefined : process.env.PGLITE_DIR ?? path.join(root(), ".data", "pglite"));

  const [{ exists }] = await db.query<{ exists: boolean }>(
    "select to_regclass('public.users') is not null as exists",
  );
  if (!exists) {
    await db.exec(readSql("schema.sql"));
    await db.exec(readSql("seed.sql"));
    const { seedDemoUsers } = await import("./seed");
    await seedDemoUsers(db);
  }
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
