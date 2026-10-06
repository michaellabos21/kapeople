import { z } from "zod";
import { STAFF, route } from "@/lib/api";
import { recordMovement } from "@/lib/services/inventory";

const Body = z.object({
  type: z.enum(["stock_in", "stock_out", "waste", "adjustment"]),
  qty: z.number().min(0),
  note: z.string().max(200).optional(),
});

export const POST = route(STAFF, async ({ req, db, user, params }) => {
  const b = Body.parse(await req.json());
  return recordMovement(db, user.id, Number(params.id), b.type, b.qty, b.note);
});
