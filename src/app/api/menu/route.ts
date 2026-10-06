import { route } from "@/lib/api";
import { getMenu } from "@/lib/services/catalog";

export const GET = route("public", async ({ db }) => getMenu(db));
