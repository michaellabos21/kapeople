import { z } from "zod";
import { route } from "@/lib/api";
import { adjustPoints } from "@/lib/services/customers";

const Body = z.object({ points: z.number().int(), reason: z.string().max(200) });

export const POST = route(["admin"], async ({ req, db, user, params }) => {
  const b = Body.parse(await req.json());
  return { balance: await db.tx((q) => adjustPoints(q, user.id, Number(params.id), b.points, b.reason)) };
});
