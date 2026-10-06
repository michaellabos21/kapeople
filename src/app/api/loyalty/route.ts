import { route } from "@/lib/api";
import { getLoyalty } from "@/lib/services/loyalty";

export const GET = route(["customer"], async ({ db, user }) => getLoyalty(db, user.id));
