import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../src/lib/db";
import { login } from "../src/lib/services/auth";

afterEach(() => vi.unstubAllEnvs());

const emails = async (db: Awaited<ReturnType<typeof createDb>>) =>
  (await db.query<{ email: string }>("select email from users order by id")).map((u) => u.email);

describe("production bootstrap", () => {
  it("creates demo accounts in development", async () => {
    const db = await createDb({ memory: true });
    expect(await emails(db)).toContain("admin@kapeople.test");
  });

  it("does NOT create well-known demo accounts in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const db = await createDb({ memory: true });
    expect(await emails(db)).toEqual([]);
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from products");
    expect(n).toBeGreaterThan(0); // catalogue is still seeded
  });

  it("creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAIL", "Owner@Example.test");
    vi.stubEnv("ADMIN_PASSWORD", "a-long-unique-passphrase");
    const db = await createDb({ memory: true });
    expect(await emails(db)).toEqual(["owner@example.test"]);
    const { user } = await login(db, "owner@example.test", "a-long-unique-passphrase");
    expect(user.role).toBe("admin");
    await expect(login(db, "owner@example.test", "kapeople123")).rejects.toThrow(/Incorrect/);
  });

  it("refuses to start in production without DATABASE_URL instead of using the embedded database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    await expect(createDb()).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("refuses a short ADMIN_PASSWORD", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_EMAIL", "owner@example.test");
    vi.stubEnv("ADMIN_PASSWORD", "short");
    await expect(createDb({ memory: true })).rejects.toThrow(/at least 12/);
  });
});
