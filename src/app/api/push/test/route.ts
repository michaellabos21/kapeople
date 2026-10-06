import { ANY, route } from "@/lib/api";
import { sendTest } from "@/lib/services/push";

export const POST = route(ANY, async ({ db, user }) => {
  await sendTest(db, user.id);
  return { ok: true };
});
