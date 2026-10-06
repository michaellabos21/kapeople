import { z } from "zod";
import { ANY, route } from "@/lib/api";
import { createOrder, listOrders } from "@/lib/services/orders";

const Item = z.object({
  productId: z.number().int(),
  variantId: z.number().int().nullish(),
  addonIds: z.array(z.number().int()).max(10).optional(),
  qty: z.number().int().min(1).max(50),
  notes: z.string().max(200).optional(),
});
const Body = z.object({
  items: z.array(Item).min(1).max(40),
  paymentMethod: z.enum(["cash", "gcash", "card"]),
  promoCode: z.string().max(40).optional(),
  rewardId: z.number().int().optional(),
  idempotencyKey: z.string().max(80).optional(),
  notes: z.string().max(300).optional(),
  customerId: z.number().int().optional(),
  manualDiscount: z.object({ kind: z.enum(["percent", "amount"]), value: z.number().min(0) }).optional(),
  tendered: z.number().min(0).optional(),
  completeNow: z.boolean().optional(),
});

export const POST = route(ANY, async ({ req, db, user }) => {
  const input = Body.parse(await req.json());
  const out = await createOrder(db, user, input);
  return out;
});

export const GET = route(ANY, async ({ req, db, user }) => {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  return {
    orders: await listOrders(db, user, {
      statuses: status ? status.split(",") : undefined,
      limit: Number(sp.get("limit") ?? 50),
      search: sp.get("q") ?? undefined,
    }),
  };
});
