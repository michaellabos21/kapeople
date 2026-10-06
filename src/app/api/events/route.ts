import { ANY, route } from "@/lib/api";
import { subscribe } from "@/lib/bus";
import { isServerless } from "@/lib/runtime";

export const dynamic = "force-dynamic";

/** Server-sent events: tells the UI when to refetch. Clients also poll as a fallback. */
export const GET = route(ANY, async ({ req, user }) => {
  // Serverless hosts can't hold the stream open or share the in-memory bus between instances.
  // 204 tells EventSource to stop reconnecting; the UI falls back to polling.
  if (isServerless()) return new Response(null, { status: 204 });
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(enc.encode(data));
        } catch {
          cleanup();
        }
      };
      send("retry: 3000\n\n");
      const off = subscribe((e) => {
        // Notifications are private; everything else is a generic "something changed".
        if (e.type === "notification" && e.userId !== user.id) return;
        if (user.role === "customer" && e.type === "inventory") return;
        send(`data: ${JSON.stringify(e)}\n\n`);
      });
      const ping = setInterval(() => send(": ping\n\n"), 20000);
      cleanup = () => {
        off();
        clearInterval(ping);
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
});
