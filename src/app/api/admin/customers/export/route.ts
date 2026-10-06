import { route } from "@/lib/api";
import { customersCsv } from "@/lib/services/customers";

export const GET = route(["admin"], async ({ db }) => {
  const day = new Date().toISOString().slice(0, 10);
  return new Response(await customersCsv(db), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kapeople-customers-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
