import { z } from "zod";
import { route } from "@/lib/api";
import { publish } from "@/lib/bus";
import { AppError } from "@/lib/errors";

const Body = z.object({ available: z.boolean().optional(), basePrice: z.number().min(0).optional() });

/** Admin: switch a product on/off or change its base price. */
export const PATCH = route(["admin"], async ({ req, db, params }) => {
  const b = Body.parse(await req.json());
  const rows = await db.query(
    `update products set available = coalesce($2, available), base_price = coalesce($3, base_price)
      where id = $1 returning id`,
    [Number(params.id), b.available ?? null, b.basePrice ?? null],
  );
  if (!rows.length) throw new AppError("Product not found.", 404);
  publish({ type: "inventory" });
  return { ok: true };
});
