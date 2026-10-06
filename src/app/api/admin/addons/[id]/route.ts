import { route } from "@/lib/api";
import { deleteAddon, saveAddon } from "@/lib/services/menu-admin";
import { AddonBody } from "@/lib/menu-schemas";

export const PUT = route(["admin"], async ({ req, db, params }) => ({
  id: await saveAddon(db, Number(params.id), AddonBody.parse(await req.json())),
}));

export const DELETE = route(["admin"], async ({ db, params }) => {
  await deleteAddon(db, Number(params.id));
  return { ok: true };
});
