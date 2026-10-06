import { z } from "zod";
import { route } from "@/lib/api";
import { saveProduct, setArchived } from "@/lib/services/menu-admin";
import { ProductBody } from "@/lib/menu-schemas";

export const PUT = route(["admin"], async ({ req, db, params }) => ({
  id: await saveProduct(db, Number(params.id), ProductBody.parse(await req.json())),
}));

const Archive = z.object({ archived: z.boolean() });
export const PATCH = route(["admin"], async ({ req, db, params }) => {
  await setArchived(db, Number(params.id), Archive.parse(await req.json()).archived);
  return { ok: true };
});
