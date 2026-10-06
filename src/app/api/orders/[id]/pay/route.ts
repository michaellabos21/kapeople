import { z } from "zod";
import { STAFF, route } from "@/lib/api";
import { recordPayment } from "@/lib/services/orders";

const Body = z.object({
  method: z.enum(["cash", "gcash", "card"]),
  tendered: z.number().min(0).optional(),
  reference: z.string().max(80).optional(),
});

export const POST = route(STAFF, async ({ req, db, user, params }) => ({
  order: await recordPayment(db, user, Number(params.id), Body.parse(await req.json())),
}));
