import { z } from "zod";
import { ANY, route } from "@/lib/api";
import { changeOwnPassword } from "@/lib/services/auth";
import { sessionToken } from "@/lib/session";

const Body = z.object({ current: z.string(), next: z.string().max(200) });

export const POST = route(ANY, async ({ req, db, user }) => {
  const b = Body.parse(await req.json());
  await changeOwnPassword(db, user.id, b.current, b.next, await sessionToken());
  return { ok: true };
});
