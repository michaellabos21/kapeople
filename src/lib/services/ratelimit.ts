import type { Queryable } from "../db";
import { AppError } from "../errors";

/**
 * Sliding-window throttle backed by the database (works across serverless instances).
 * `key` is typically the client IP; "unknown" means no trustworthy IP is available, so we skip limiting
 * rather than put every anonymous caller in one shared bucket.
 */
export async function assertUnderLimit(
  q: Queryable,
  bucket: string,
  key: string | null | undefined,
  max: number,
  windowMinutes: number,
  message: string,
) {
  if (!key) return;
  const [{ n }] = await q.query<{ n: number }>(
    `select count(*)::int as n from rate_events
      where bucket = $1 and key = $2 and created_at > now() - ($3::int * interval '1 minute')`,
    [bucket, key, windowMinutes],
  );
  if (n >= max) throw new AppError(message, 429);
}

export async function recordEvent(q: Queryable, bucket: string, key: string | null | undefined) {
  if (!key) return;
  await q.query("delete from rate_events where created_at < now() - interval '1 day'");
  await q.query("insert into rate_events (bucket, key) values ($1, $2)", [bucket, key]);
}
