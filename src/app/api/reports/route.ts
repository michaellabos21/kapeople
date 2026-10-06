import { STAFF, route } from "@/lib/api";
import { salesReport, type Range } from "@/lib/services/reports";

export const GET = route(STAFF, async ({ req, db }) => {
  const r = req.nextUrl.searchParams.get("range");
  return salesReport(db, (["today", "week", "month"].includes(r ?? "") ? r : "today") as Range);
});
