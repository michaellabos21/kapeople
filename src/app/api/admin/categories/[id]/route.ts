import { z } from "zod";
import { route } from "@/lib/api";
import { deleteCategory, moveCategory, saveCategory } from "@/lib/services/menu-admin";

const Body = z.object({ name: z.string().max(80).optional(), move: z.enum(["up", "down"]).optional() });

export const PATCH = route(["admin"], async ({ req, db, params }) => {
  const b = Body.parse(await req.json());
  const id = Number(params.id);
  if (b.name !== undefined) await saveCategory(db, id, b.name);
  if (b.move) await moveCategory(db, id, b.move);
  return { ok: true };
});

export const DELETE = route(["admin"], async ({ db, params }) => {
  await deleteCategory(db, Number(params.id));
  return { ok: true };
});
