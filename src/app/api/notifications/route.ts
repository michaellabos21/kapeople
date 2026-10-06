import { ANY, route } from "@/lib/api";
import { listNotifications, markAllRead } from "@/lib/services/notifications";

export const GET = route(ANY, async ({ db, user }) => ({ notifications: await listNotifications(db, user.id) }));
export const POST = route(ANY, async ({ db, user }) => {
  await markAllRead(db, user.id);
  return { ok: true };
});
