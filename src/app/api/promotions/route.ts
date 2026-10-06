import { route } from "@/lib/api";
import { listPromotions } from "@/lib/services/loyalty";

export const GET = route("public", async ({ db }) => ({ promotions: await listPromotions(db) }));
