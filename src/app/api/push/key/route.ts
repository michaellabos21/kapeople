import { route } from "@/lib/api";
import { publicKey, pushConfigured } from "@/lib/services/push";

/** The public VAPID key (safe to expose) or null when push isn't configured. Read at runtime, so no rebuild is needed. */
export const GET = route("public", async () => ({ publicKey: pushConfigured() ? publicKey() : null }));
