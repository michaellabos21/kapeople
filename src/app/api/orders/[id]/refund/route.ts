import { z } from "zod";
import { STAFF, route } from "@/lib/api";
import { refundOrder } from "@/lib/services/orders";

const Body = z.object({ restock: z.boolean().optional(), reason: z.string().max(200).optional() });

export const POST = route(STAFF, async ({ req, db, user, params }) => ({
  order: await refundOrder(db, user, Number(params.id), Body.parse(await req.json().catch(() => ({})))),
}));
