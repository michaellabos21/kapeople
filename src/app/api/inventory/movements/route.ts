import { STAFF, route } from "@/lib/api";
import { listMovements } from "@/lib/services/inventory";

export const GET = route(STAFF, async ({ req, db }) => {
  const id = req.nextUrl.searchParams.get("ingredient");
  return { movements: await listMovements(db, id ? Number(id) : undefined) };
});
