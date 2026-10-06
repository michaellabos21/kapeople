import { route } from "@/lib/api";
import { listMenuAdmin } from "@/lib/services/menu-admin";

export const GET = route(["admin"], async ({ db }) => listMenuAdmin(db));
