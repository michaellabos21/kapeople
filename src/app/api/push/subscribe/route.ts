import { z } from "zod";
import { ANY, route } from "@/lib/api";
import { isAllowedPushEndpoint, removeSubscription, saveSubscription } from "@/lib/services/push";

const Sub = z.object({
  endpoint: z.string().url().max(1000).refine(isAllowedPushEndpoint, "That browser's push service isn't supported"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

export const POST = route(ANY, async ({ req, db, user }) => {
  await saveSubscription(db, user.id, Sub.parse(await req.json()), req.headers.get("user-agent"));
  return { ok: true };
});

export const DELETE = route(ANY, async ({ req, db, user }) => {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(await req.json());
  await removeSubscription(db, user.id, endpoint);
  return { ok: true };
});
