import { z } from "zod";
import { route } from "@/lib/api";
import { getCustomer, setCustomerActive, updateNotes } from "@/lib/services/customers";

export const GET = route(["admin"], async ({ db, params }) => getCustomer(db, Number(params.id)));

const Body = z.object({ notes: z.string().max(2000).optional(), active: z.boolean().optional() });

export const PATCH = route(["admin"], async ({ req, db, params }) => {
  const b = Body.parse(await req.json());
  const id = Number(params.id);
  await db.tx(async (q) => {
    if (b.notes !== undefined) await updateNotes(q, id, b.notes);
    if (b.active !== undefined) await setCustomerActive(q, id, b.active);
  });
  return { ok: true };
});
