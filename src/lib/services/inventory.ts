import type { Db, Queryable, Row } from "../db";
import { AppError } from "../errors";
import { publish } from "../bus";
import { availableStock } from "./catalog";

export async function listIngredients(q: Queryable) {
  const [rows, stock] = await Promise.all([
    q.query<Row>("select * from ingredients order by name"),
    availableStock(q),
  ]);
  return rows.map((i) => ({
    ...(i as Row & { id: number; name: string; unit: string; current_qty: number; low_stock_threshold: number }),
    available_qty: stock.get(i.id) ?? i.current_qty,
    reserved_qty: Math.round((i.current_qty - (stock.get(i.id) ?? i.current_qty)) * 1000) / 1000,
    low: i.current_qty <= i.low_stock_threshold,
  }));
}

export async function listMovements(q: Queryable, ingredientId?: number) {
  return q.query(
    `select m.*, i.name as ingredient_name, i.unit, u.name as user_name
       from stock_movements m join ingredients i on i.id = m.ingredient_id
       left join users u on u.id = m.created_by
      ${ingredientId ? "where m.ingredient_id = $1" : ""}
      order by m.created_at desc, m.id desc limit 60`,
    ingredientId ? [ingredientId] : [],
  );
}

export type MovementType = "stock_in" | "stock_out" | "waste" | "adjustment";

/** stock_in / stock_out / waste take a positive qty. adjustment takes the counted qty. */
export async function recordMovement(
  db: Db,
  userId: number,
  ingredientId: number,
  type: MovementType,
  qty: number,
  note?: string,
) {
  if (qty < 0) throw new AppError("Quantity can't be negative.");
  if (type !== "adjustment" && qty === 0) throw new AppError("Enter a quantity above zero.");
  const out = await db.tx(async (q) => {
    const [ing] = await q.query<Row>("select * from ingredients where id = $1 for update", [ingredientId]);
    if (!ing) throw new AppError("Ingredient not found.", 404);
    const change = type === "stock_in" ? qty : type === "adjustment" ? qty - ing.current_qty : -qty;
    const next = Math.round((ing.current_qty + change) * 1000) / 1000;
    if (next < 0) throw new AppError(`Only ${ing.current_qty} ${ing.unit} on hand.`);
    await q.query("update ingredients set current_qty = $2 where id = $1", [ingredientId, next]);
    await q.query(
      `insert into stock_movements (ingredient_id, type, qty_change, balance_after, note, created_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [ingredientId, type, Math.round(change * 1000) / 1000, next, note?.trim() || null, userId],
    );
    return { id: ingredientId, current_qty: next };
  });
  publish({ type: "inventory" });
  return out;
}

export async function createIngredient(
  db: Db,
  input: { name: string; unit: string; qty: number; lowStock: number },
  userId: number,
) {
  const [dupe] = await db.query("select 1 from ingredients where lower(name) = lower($1)", [input.name.trim()]);
  if (dupe) throw new AppError("That ingredient already exists.", 409);
  const [ing] = await db.query<Row>(
    "insert into ingredients (name, unit, current_qty, low_stock_threshold) values ($1,$2,$3,$4) returning *",
    [input.name.trim(), input.unit.trim(), input.qty, input.lowStock],
  );
  if (input.qty > 0) {
    await db.query(
      `insert into stock_movements (ingredient_id, type, qty_change, balance_after, note, created_by)
       values ($1,'stock_in',$2,$2,'Opening stock',$3)`,
      [ing.id, input.qty, userId],
    );
  }
  publish({ type: "inventory" });
  return ing;
}

export async function setThreshold(db: Db, id: number, lowStock: number) {
  await db.query("update ingredients set low_stock_threshold = $2 where id = $1", [id, lowStock]);
  publish({ type: "inventory" });
}
