import { STAFF, route } from "@/lib/api";

/** Customer lookup for attaching loyalty to a POS sale. */
export const GET = route(STAFF, async ({ req, db }) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return { customers: [] };
  const like = `%${q}%`;
  return {
    customers: await db.query(
      `select id, name, email, phone, points_balance from users
        where role = 'customer' and (name ilike $1 or email ilike $1 or phone ilike $1)
        order by name limit 8`,
      [like],
    ),
  };
});
