import { z } from "zod";
import { route } from "@/lib/api";
import { resetStaffPassword, setActive } from "@/lib/services/staff";

const Body = z.object({ active: z.boolean().optional(), password: z.string().max(200).optional() });

export const PATCH = route(["admin"], async ({ req, db, user, params }) => {
  const b = Body.parse(await req.json());
  const id = Number(params.id);
  await db.tx(async (q) => {
    if (b.active !== undefined) await setActive(q, user.id, id, b.active);
    if (b.password !== undefined) await resetStaffPassword(q, id, b.password);
  });
  return { ok: true };
});
