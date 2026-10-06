import { z } from "zod";
import { route } from "@/lib/api";
import { listCustomers } from "@/lib/services/customers";

const Query = z.object({
  q: z.string().max(100).optional(),
  sort: z.enum(["recent", "spent", "orders", "points", "name", "last_order"]).catch("recent"),
  page: z.coerce.number().int().min(1).catch(1),
  size: z.coerce.number().int().min(1).max(100).catch(25),
});

export const GET = route(["admin"], async ({ req, db }) => {
  const p = Query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listCustomers(db, { search: p.q, sort: p.sort, limit: p.size, offset: (p.page - 1) * p.size });
});
