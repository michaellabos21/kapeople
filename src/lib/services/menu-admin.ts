import type { Db, Queryable, Row } from "../db";
import { AppError } from "../errors";
import { publish } from "../bus";

export interface VariantInput {
  id?: number;
  name: string;
  /** Extra price over the product's base price. */
  priceDelta: number;
  /** Ingredient amounts relative to the recipe (1 = as written). */
  recipeMultiplier: number;
  isDefault: boolean;
}
export interface ProductInput {
  name: string;
  categoryId: number;
  emoji: string;
  description: string;
  basePrice: number;
  available: boolean;
  variants: VariantInput[];
  addonIds: number[];
  recipe: { ingredientId: number; qty: number; scales: boolean }[];
}
export interface AddonInput {
  name: string;
  price: number;
  available: boolean;
  /** Substitution (e.g. oat milk): this ingredient's usage moves to `replacementIngredientId`. Both or neither. */
  replacesIngredientId: number | null;
  replacementIngredientId: number | null;
  extras: { ingredientId: number; qty: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const bad = (msg: string) => new AppError(msg, 400);

function checkMoney(n: number, label: string) {
  if (!Number.isFinite(n) || n < 0 || n > 100000) throw bad(`${label} must be between 0 and 100,000.`);
}

function validateProduct(i: ProductInput) {
  if (!i.name.trim()) throw bad("Enter a product name.");
  if (i.name.trim().length > 80) throw bad("The product name is too long (80 characters max).");
  checkMoney(i.basePrice, "Price");
  const seen = new Set<string>();
  for (const v of i.variants) {
    const name = v.name.trim();
    if (!name) throw bad("Every size needs a name.");
    if (seen.has(name.toLowerCase())) throw bad(`The size "${name}" is listed twice.`);
    seen.add(name.toLowerCase());
    checkMoney(v.priceDelta, `The price of ${name}`);
    if (!(v.recipeMultiplier > 0 && v.recipeMultiplier <= 10)) throw bad(`The ingredient amount for ${name} must be above 0 and at most 10×.`);
  }
  const ing = new Set<number>();
  for (const r of i.recipe) {
    if (!(r.qty > 0) || !Number.isFinite(r.qty)) throw bad("Ingredient amounts must be above zero.");
    if (ing.has(r.ingredientId)) throw bad("An ingredient is listed twice in the recipe.");
    ing.add(r.ingredientId);
  }
  if (new Set(i.addonIds).size !== i.addonIds.length) throw bad("An add-on is selected twice.");
}

// ---------- read ----------

export type AdminProduct = Row & { has_orders: boolean; variants: Row[]; addon_ids: number[]; recipe: Row[] };

export async function listMenuAdmin(q: Queryable) {
  const [categories, products, variants, productAddons, recipe, addons, addonRecipe, ingredients, sold] = await Promise.all([
    q.query("select id, name, sort from categories order by sort, id"),
    q.query("select id, category_id, name, description, base_price, emoji, available, archived, sort from products order by category_id, sort, id"),
    q.query("select id, product_id, name, price_delta, recipe_multiplier, is_default, sort from product_variants order by product_id, sort, id"),
    q.query<{ product_id: number; addon_id: number }>("select product_id, addon_id from product_addons"),
    q.query("select product_id, ingredient_id, qty, scales from recipe_items"),
    q.query("select id, name, price, available, replaces_ingredient_id, replacement_ingredient_id from addons order by id"),
    q.query("select addon_id, ingredient_id, qty from addon_recipe_items"),
    q.query("select id, name, unit from ingredients order by name"),
    q.query<{ product_id: number }>("select distinct product_id from order_items"),
  ]);
  const soldIds = new Set(sold.map((s) => s.product_id));
  return {
    categories,
    products: products.map((p): AdminProduct => ({
      ...p,
      has_orders: soldIds.has(p.id),
      variants: variants.filter((v) => v.product_id === p.id),
      addon_ids: productAddons.filter((a) => a.product_id === p.id).map((a) => a.addon_id),
      recipe: recipe.filter((r) => r.product_id === p.id),
    })),
    addons: addons.map((a) => ({ ...a, extras: addonRecipe.filter((r) => r.addon_id === a.id) })),
    ingredients,
  };
}

// ---------- products ----------

export async function saveProduct(db: Db, id: number | null, input: ProductInput) {
  validateProduct(input);
  const pid = await db.tx(async (q) => {
    await q.query("select pg_advisory_xact_lock(7003)");
    const [cat] = await q.query("select 1 from categories where id = $1", [input.categoryId]);
    if (!cat) throw bad("Choose a category.");

    const fields = [input.name.trim(), input.description.trim(), r2(input.basePrice), input.emoji.trim().slice(0, 8) || "🍽️", input.available];
    let productId: number;
    if (id) {
      const rows = await q.query<{ id: number }>(
        `update products set name = $2, description = $3, base_price = $4, emoji = $5, available = $6, category_id = $7
          where id = $1 returning id`,
        [id, ...fields, input.categoryId],
      );
      if (!rows.length) throw new AppError("Product not found.", 404);
      productId = id;
    } else {
      const [{ next }] = await q.query<{ next: number }>(
        "select coalesce(max(sort), 0) + 1 as next from products where category_id = $1",
        [input.categoryId],
      );
      const [row] = await q.query<{ id: number }>(
        `insert into products (name, description, base_price, emoji, available, category_id, sort)
         values ($1,$2,$3,$4,$5,$6,$7) returning id`,
        [...fields, input.categoryId, next],
      );
      productId = row.id;
    }

    // Sizes: keep ids where given (so carts and history stay valid), insert new, delete removed. Exactly one default.
    const existing = new Set((await q.query<{ id: number }>("select id from product_variants where product_id = $1", [productId])).map((v) => v.id));
    const keep = input.variants.map((v) => v.id).filter((x): x is number => !!x && existing.has(x));
    await q.query("delete from product_variants where product_id = $1 and not (id = any($2::int[]))", [productId, keep]);
    const defaultIdx = Math.max(0, input.variants.findIndex((v) => v.isDefault));
    for (const [idx, v] of input.variants.entries()) {
      const vals = [v.name.trim(), r2(v.priceDelta), v.recipeMultiplier, idx === defaultIdx, idx];
      if (v.id && existing.has(v.id)) {
        await q.query(
          "update product_variants set name = $2, price_delta = $3, recipe_multiplier = $4, is_default = $5, sort = $6 where id = $1 and product_id = $7",
          [v.id, ...vals, productId],
        );
      } else {
        await q.query(
          "insert into product_variants (product_id, name, price_delta, recipe_multiplier, is_default, sort) values ($1,$2,$3,$4,$5,$6)",
          [productId, ...vals],
        );
      }
    }

    await q.query("delete from product_addons where product_id = $1", [productId]);
    for (const addonId of input.addonIds) {
      const rows = await q.query("insert into product_addons (product_id, addon_id) select $1, id from addons where id = $2 returning 1", [productId, addonId]);
      if (!rows.length) throw bad("One of the selected add-ons no longer exists.");
    }

    await q.query("delete from recipe_items where product_id = $1", [productId]);
    for (const r of input.recipe) {
      const rows = await q.query(
        "insert into recipe_items (product_id, ingredient_id, qty, scales) select $1, id, $3, $4 from ingredients where id = $2 returning 1",
        [productId, r.ingredientId, r.qty, r.scales],
      );
      if (!rows.length) throw bad("One of the recipe ingredients no longer exists.");
    }
    return productId;
  });
  publish({ type: "inventory" }); // menus refresh
  return pid;
}

/** Products with order history are hidden, never deleted. */
export async function setArchived(db: Db, id: number, archived: boolean) {
  const rows = await db.query(
    "update products set archived = $2, available = case when $2 then false else available end where id = $1 returning id",
    [id, archived],
  );
  if (!rows.length) throw new AppError("Product not found.", 404);
  publish({ type: "inventory" });
}

// ---------- categories ----------

export async function saveCategory(db: Db, id: number | null, name: string) {
  const n = name.trim();
  if (!n) throw bad("Enter a category name.");
  if (n.length > 40) throw bad("The category name is too long.");
  const [dupe] = await db.query("select 1 from categories where lower(name) = lower($1) and id is distinct from $2", [n, id]);
  if (dupe) throw new AppError("That category already exists.", 409);
  let row: Row;
  if (id) {
    [row] = await db.query("update categories set name = $2 where id = $1 returning id, name, sort", [id, n]);
    if (!row) throw new AppError("Category not found.", 404);
  } else {
    [row] = await db.query(
      "insert into categories (name, sort) values ($1, (select coalesce(max(sort), 0) + 1 from categories)) returning id, name, sort",
      [n],
    );
  }
  publish({ type: "inventory" });
  return row;
}

export async function deleteCategory(db: Db, id: number) {
  const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from products where category_id = $1", [id]);
  if (n) throw new AppError("Move or hide its products first: this category still has products.", 409);
  await db.query("delete from categories where id = $1", [id]);
  publish({ type: "inventory" });
}

export async function moveCategory(db: Db, id: number, dir: "up" | "down") {
  await db.tx(async (q) => {
    const all = await q.query<{ id: number }>("select id from categories order by sort, id");
    const i = all.findIndex((c) => c.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [idx, c] of all.entries()) await q.query("update categories set sort = $2 where id = $1", [c.id, idx + 1]);
  });
  publish({ type: "inventory" });
}

// ---------- add-ons ----------

function validateAddon(i: AddonInput) {
  if (!i.name.trim()) throw bad("Enter an add-on name.");
  checkMoney(i.price, "Price");
  const a = i.replacesIngredientId;
  const b = i.replacementIngredientId;
  if ((a == null) !== (b == null)) throw bad("A substitution needs both the ingredient it replaces and the one it uses instead.");
  if (a != null && a === b) throw bad("An add-on can't replace an ingredient with itself.");
  const seen = new Set<number>();
  for (const e of i.extras) {
    if (!(e.qty > 0)) throw bad("Ingredient amounts must be above zero.");
    if (seen.has(e.ingredientId)) throw bad("An ingredient is listed twice.");
    seen.add(e.ingredientId);
  }
}

export async function saveAddon(db: Db, id: number | null, input: AddonInput) {
  validateAddon(input);
  const out = await db.tx(async (q) => {
    const vals = [input.name.trim(), r2(input.price), input.available, input.replacesIngredientId, input.replacementIngredientId];
    let addonId: number;
    if (id) {
      const rows = await q.query<{ id: number }>(
        "update addons set name = $2, price = $3, available = $4, replaces_ingredient_id = $5, replacement_ingredient_id = $6 where id = $1 returning id",
        [id, ...vals],
      );
      if (!rows.length) throw new AppError("Add-on not found.", 404);
      addonId = id;
    } else {
      const [row] = await q.query<{ id: number }>(
        "insert into addons (name, price, available, replaces_ingredient_id, replacement_ingredient_id) values ($1,$2,$3,$4,$5) returning id",
        vals,
      );
      addonId = row.id;
    }
    await q.query("delete from addon_recipe_items where addon_id = $1", [addonId]);
    for (const e of input.extras) {
      const rows = await q.query(
        "insert into addon_recipe_items (addon_id, ingredient_id, qty) select $1, id, $3 from ingredients where id = $2 returning 1",
        [addonId, e.ingredientId, e.qty],
      );
      if (!rows.length) throw bad("One of the ingredients no longer exists.");
    }
    return addonId;
  });
  publish({ type: "inventory" });
  return out;
}

export async function deleteAddon(db: Db, id: number) {
  // Past orders keep their own copy of the add-on name and price, so deleting is safe.
  await db.query("delete from addons where id = $1", [id]);
  publish({ type: "inventory" });
}
