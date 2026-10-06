import { route } from "@/lib/api";
import { saveAddon } from "@/lib/services/menu-admin";
import { AddonBody } from "@/lib/menu-schemas";

export const POST = route(["admin"], async ({ req, db }) => ({ id: await saveAddon(db, null, AddonBody.parse(await req.json())) }));
