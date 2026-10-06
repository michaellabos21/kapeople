import { z } from "zod";
import { STAFF, route } from "@/lib/api";
import { createIngredient, listIngredients } from "@/lib/services/inventory";

export const GET = route(STAFF, async ({ db }) => ({ ingredients: await listIngredients(db) }));

const Body = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().min(1).max(12),
  qty: z.number().min(0),
  lowStock: z.number().min(0),
});
export const POST = route(["admin"], async ({ req, db, user }) => ({
  ingredient: await createIngredient(db, Body.parse(await req.json()), user.id),
}));
