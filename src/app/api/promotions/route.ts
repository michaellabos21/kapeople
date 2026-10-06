import { route } from "@/lib/api";
import { listPromotions } from "@/lib/services/loyalty";

export const GET = route("public", async ({ db, user }) => ({
  promotions: await listPromotions(db, user?.role === "customer" ? user.id : null),
}));
