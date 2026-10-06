import { z } from "zod";
import { route } from "@/lib/api";
import { saveCategory } from "@/lib/services/menu-admin";

export const POST = route(["admin"], async ({ req, db }) => ({
  category: await saveCategory(db, null, z.object({ name: z.string().max(80) }).parse(await req.json()).name),
}));
