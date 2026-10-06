import { route } from "@/lib/api";
import { currentUser } from "@/lib/session";

export const GET = route("public", async () => ({ user: await currentUser() }));
