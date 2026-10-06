import type { Queryable } from "../db";

export interface Variant {
  id: number;
  product_id: number;
  name: string;
  price_delta: number;
  recipe_multiplier: number;
  is_default: boolean;
}
export interface Addon {
  id: number;
  name: string;
  price: number;
  replaces_ingredient_id: number | null;
  replacement_ingredient_id: number | null;
  available: boolean;
  recipe: { ingredient_id: number; qty: number }[];
}
export interface CatalogProduct {
  id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  emoji: string;
  available: boolean;
  variants: Variant[];
  addons: Addon[];
  recipe: { ingredient_id: number; qty: number; scales: boolean }[];
}

/** Whole catalog in memory — a single cafe menu is tiny. */
export async function loadCatalog(q: Queryable): Promise<CatalogProduct[]> {
  const [products, variants, addons, links, recipes, addonRecipes] = await Promise.all([
    q.query<CatalogProduct>("select * from products order by category_id, sort, id"),
    q.query<Variant>("select * from product_variants order by product_id, sort, id"),
    q.query<Addon>("select * from addons order by id"),
    q.query<{ product_id: number; addon_id: number }>("select * from product_addons"),
    q.query<{ product_id: number; ingredient_id: number; qty: number; scales: boolean }>(
      "select * from recipe_items",
    ),
    q.query<{ addon_id: number; ingredient_id: number; qty: number }>("select * from addon_recipe_items"),
  ]);
  const addonById = new Map(addons.map((a) => [a.id, { ...a, recipe: [] as Addon["recipe"] }]));
  for (const r of addonRecipes) addonById.get(r.addon_id)?.recipe.push(r);
  return products.map((p) => ({
    ...p,
    variants: variants.filter((v) => v.product_id === p.id),
    addons: links
      .filter((l) => l.product_id === p.id)
      .map((l) => addonById.get(l.addon_id)!)
      .filter(Boolean),
    recipe: recipes.filter((r) => r.product_id === p.id),
  }));
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Ingredient usage for ONE unit of a configured product. */
export function computeUsage(
  product: CatalogProduct,
  variant: Variant | undefined,
  addons: Addon[],
): Map<number, number> {
  const mult = variant?.recipe_multiplier ?? 1;
  const use = new Map<number, number>();
  const add = (id: number, n: number) => use.set(id, (use.get(id) ?? 0) + n);
  for (const r of product.recipe) add(r.ingredient_id, r.scales ? r.qty * mult : r.qty);
  for (const a of addons) {
    if (a.replaces_ingredient_id && a.replacement_ingredient_id && use.has(a.replaces_ingredient_id)) {
      add(a.replacement_ingredient_id, use.get(a.replaces_ingredient_id)!);
      use.delete(a.replaces_ingredient_id);
    }
    for (const r of a.recipe) add(r.ingredient_id, r.qty);
  }
  for (const [k, v] of use) use.set(k, r4(v));
  return use;
}

/** current stock minus what open (not yet completed) orders have already claimed. */
export async function availableStock(q: Queryable): Promise<Map<number, number>> {
  const rows = await q.query<{ id: number; available: number }>(
    `select i.id, i.current_qty - coalesce(c.qty, 0) as available
       from ingredients i
       left join (
         select key::int as id, sum(value::numeric) as qty
           from orders o, jsonb_each_text(o.ingredient_usage)
          where o.status in ('new','accepted','preparing','ready') and not o.inventory_deducted
          group by key
       ) c on c.id = i.id`,
  );
  return new Map(rows.map((r) => [r.id, r.available]));
}

/** Add-on as exposed to clients: no recipe quantities or ingredient ids. */
export interface MenuAddon {
  id: number;
  name: string;
  price: number;
  available: boolean;
  sold_out: boolean;
  sold_out_reason?: string;
}

export interface MenuProduct extends Omit<CatalogProduct, "recipe" | "addons"> {
  addons: MenuAddon[];
  sold_out: boolean;
  sold_out_reason?: string;
}

export async function getMenu(q: Queryable) {
  const [catalog, categories, stock, ingredients] = await Promise.all([
    loadCatalog(q),
    q.query<{ id: number; name: string }>("select id, name from categories order by sort, id"),
    availableStock(q),
    q.query<{ id: number; name: string }>("select id, name from ingredients"),
  ]);
  const ingName = new Map(ingredients.map((i) => [i.id, i.name]));
  const products: MenuProduct[] = catalog.map(({ recipe, addons, ...p }) => {
    // Sellable if at least the smallest size can still be made.
    const minMult = p.variants.length ? Math.min(...p.variants.map((v) => v.recipe_multiplier)) : 1;
    const smallest = p.variants.find((v) => v.recipe_multiplier === minMult);
    // An add-on is sold out if the drink with that add-on (smallest size) can't be made from current stock.
    const menuAddons: MenuAddon[] = addons.map((a) => {
      const short = [...computeUsage({ ...p, recipe } as CatalogProduct, smallest, [a])].find(
        ([ing, n]) => (stock.get(ing) ?? 0) + 1e-9 < n,
      );
      const soldOut = !a.available || !!short;
      return {
        id: a.id,
        name: a.name,
        price: a.price,
        available: a.available,
        sold_out: soldOut,
        sold_out_reason: !a.available ? "Unavailable" : short ? `Out of ${ingName.get(short[0])}` : undefined,
      };
    });
    let reason: string | undefined;
    for (const r of recipe) {
      const need = r.scales ? r.qty * minMult : r.qty;
      if ((stock.get(r.ingredient_id) ?? 0) + 1e-9 < need) {
        reason = `Out of ${ingName.get(r.ingredient_id)}`;
        break;
      }
    }
    return { ...p, addons: menuAddons, sold_out: !p.available || !!reason, sold_out_reason: !p.available ? "Unavailable" : reason };
  });
  return { categories, products };
}
