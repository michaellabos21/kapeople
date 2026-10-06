import { z } from "zod";
import { ANY, route } from "@/lib/api";
import { cancelOrder } from "@/lib/services/orders";

const Body = z.object({ reason: z.string().max(200).optional() });

export const POST = route(ANY, async ({ req, db, user, params }) => ({
  order: await cancelOrder(db, user, Number(params.id), Body.parse(await req.json().catch(() => ({}))).reason),
}));
