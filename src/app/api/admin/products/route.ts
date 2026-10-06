import { route } from "@/lib/api";
import { saveProduct } from "@/lib/services/menu-admin";
import { ProductBody } from "@/lib/menu-schemas";

export const POST = route(["admin"], async ({ req, db }) => ({ id: await saveProduct(db, null, ProductBody.parse(await req.json())) }));
