import { ANY, route } from "@/lib/api";
import { getOrderFor } from "@/lib/services/orders";

export const GET = route(ANY, async ({ db, user, params }) => ({
  order: await getOrderFor(db, user, Number(params.id)),
}));
