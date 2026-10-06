import { z } from "zod";
import { STAFF, route } from "@/lib/api";
import { setStatus } from "@/lib/services/orders";

const Body = z.object({ status: z.enum(["accepted", "preparing", "ready", "completed"]) });

export const POST = route(STAFF, async ({ req, db, user, params }) => ({
  order: await setStatus(db, user, Number(params.id), Body.parse(await req.json()).status),
}));
