import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import * as orders from "../src/lib/services/orders";
import { getMenu } from "../src/lib/services/catalog";
import { deleteAddon, deleteCategory, listMenuAdmin, moveCategory, saveAddon, saveCategory, saveProduct, setArchived, type ProductInput } from "../src/lib/services/menu-admin";

let db: Db;
let customer: orders.Actor;
let staff: orders.Actor;
const ING = { beans: 1, milk: 2, oat: 3, cups: 9 };
const ing = async (id: number) => (await db.query("select current_qty from ingredients where id=$1", [id]))[0].current_qty as number;

const base: ProductInput = {
  name: "Mocha", categoryId: 1, emoji: "🍫", description: "Chocolate espresso", basePrice: 130, available: true,
  variants: [
    { name: "Tall", priceDelta: 0, recipeMultiplier: 0.8, isDefault: false },
    { name: "Grande", priceDelta: 20, recipeMultiplier: 1, isDefault: true },
  ],
  addonIds: [2],
  recipe: [
    { ingredientId: ING.beans, qty: 0.018, scales: true },
    { ingredientId: ING.milk, qty: 0.2, scales: true },
    { ingredientId: ING.cups, qty: 1, scales: false },
  ],
};

beforeEach(async () => {
  db = await createDb({ memory: true });
  const id = async (e: string) => (await db.query("select id from users where email=$1", [e]))[0].id as number;
  customer = { id: await id("valerie@example.test"), role: "customer" };
  staff = { id: await id("staff@kapeople.test"), role: "employee" };
});

describe("adding a product by hand", () => {
  it("shows up on the menu, is orderable at the right price, and deducts its own recipe from stock", async () => {
    const id = await saveProduct(db, null, base);
    const menu = (await getMenu(db)).products.find((p) => p.id === id)!;
    expect(menu).toMatchObject({ name: "Mocha", base_price: 130, emoji: "🍫", sold_out: false });
    expect(menu.variants.map((v) => [v.name, v.is_default])).toEqual([["Tall", false], ["Grande", true]]);
    expect(menu.addons.map((a) => a.name)).toEqual(["Extra Shot"]);

    const grande = menu.variants.find((v) => v.name === "Grande")!;
    const { order } = await orders.createOrder(db, customer, { items: [{ productId: id, variantId: grande.id, addonIds: [2], qty: 2 }], paymentMethod: "gcash" });
    expect(order.total).toBe(2 * (130 + 20 + 25)); // base + size + add-on, times 2
    await orders.setStatus(db, staff, order.id, "completed");
    expect(await ing(ING.beans)).toBeCloseTo(4.2 - 2 * (0.018 + 0.009), 5); // recipe + extra shot, x2
    expect(await ing(ING.milk)).toBeCloseTo(12 - 0.4, 5);
    expect(await ing(ING.cups)).toBe(198);
  });

  it("works for a simple product with no sizes and no recipe (sold without stock tracking)", async () => {
    const id = await saveProduct(db, null, { ...base, name: "Bottled Water", variants: [], addonIds: [], recipe: [], basePrice: 40 });
    const { order } = await orders.createOrder(db, customer, { items: [{ productId: id, qty: 3 }], paymentMethod: "gcash" });
    expect(order.total).toBe(120);
    expect((await getMenu(db)).products.find((p) => p.id === id)!.sold_out).toBe(false);
  });

  it("places new products last in their category", async () => {
    const a = await saveProduct(db, null, { ...base, name: "A" });
    const b = await saveProduct(db, null, { ...base, name: "B" });
    const names = (await getMenu(db)).products.filter((p) => p.category_id === 1).map((p) => p.name);
    expect(names.slice(-2)).toEqual(["A", "B"]);
    expect(b).toBeGreaterThan(a);
  });
});

describe("editing", () => {
  it("keeps size ids that stay, adds new sizes, removes dropped ones, and keeps exactly one default", async () => {
    const id = await saveProduct(db, null, base);
    const before = (await listMenuAdmin(db)).products.find((p) => p.id === id)!;
    const grandeId = before.variants.find((v) => v.name === "Grande")!.id as number;
    await saveProduct(db, id, {
      ...base,
      variants: [
        { id: grandeId, name: "Grande", priceDelta: 25, recipeMultiplier: 1, isDefault: true },
        { name: "Venti", priceDelta: 45, recipeMultiplier: 1.25, isDefault: true }, // two defaults → only the first survives
      ],
    });
    const after = (await listMenuAdmin(db)).products.find((p) => p.id === id)!;
    expect(after.variants.map((v) => v.name)).toEqual(["Grande", "Venti"]);
    expect(after.variants[0].id).toBe(grandeId);
    expect(after.variants[0].price_delta).toBe(25);
    expect(after.variants.filter((v) => v.is_default)).toHaveLength(1);
    expect(after.variants[0].is_default).toBe(true);
  });

  it("changes price, category, add-ons and recipe, and leaves other products alone", async () => {
    const id = await saveProduct(db, null, base);
    const other = (await listMenuAdmin(db)).products.find((p) => p.name === "Americano")!;
    await saveProduct(db, id, { ...base, basePrice: 150, categoryId: 2, addonIds: [1, 3], recipe: [{ ingredientId: ING.beans, qty: 0.03, scales: true }] });
    const p = (await listMenuAdmin(db)).products.find((x) => x.id === id)!;
    expect(p).toMatchObject({ base_price: 150, category_id: 2 });
    expect([...p.addon_ids].sort()).toEqual([1, 3]);
    expect(p.recipe).toHaveLength(1);
    expect((await listMenuAdmin(db)).products.find((x) => x.name === "Americano")!.recipe).toHaveLength(other.recipe.length);
  });

  it("rejects bad input with clear messages", async () => {
    const t = (over: Partial<ProductInput>) => saveProduct(db, null, { ...base, ...over });
    await expect(t({ name: "  " })).rejects.toThrow(/product name/);
    await expect(t({ basePrice: -5 })).rejects.toThrow(/Price/);
    await expect(t({ categoryId: 999 })).rejects.toThrow(/category/i);
    await expect(t({ variants: [{ name: "Tall", priceDelta: 0, recipeMultiplier: 1, isDefault: true }, { name: "tall", priceDelta: 5, recipeMultiplier: 1, isDefault: false }] })).rejects.toThrow(/twice/);
    await expect(t({ variants: [{ name: "", priceDelta: 0, recipeMultiplier: 1, isDefault: true }] })).rejects.toThrow(/needs a name/);
    await expect(t({ variants: [{ name: "X", priceDelta: 0, recipeMultiplier: 0, isDefault: true }] })).rejects.toThrow(/above 0/);
    await expect(t({ recipe: [{ ingredientId: 1, qty: 1, scales: true }, { ingredientId: 1, qty: 2, scales: true }] })).rejects.toThrow(/twice/);
    await expect(t({ recipe: [{ ingredientId: 999, qty: 1, scales: true }] })).rejects.toThrow(/no longer exists/);
    await expect(t({ addonIds: [999] })).rejects.toThrow(/no longer exists/);
    await expect(saveProduct(db, 9999, base)).rejects.toThrow(/not found/);
    expect((await listMenuAdmin(db)).products.filter((p) => p.name === "Mocha")).toHaveLength(0); // failed saves leave nothing behind
  });
});

describe("archiving (hiding) products", () => {
  it("hides from the menu, can't be ordered, keeps history, and can be restored", async () => {
    const id = await saveProduct(db, null, base);
    const { order } = await orders.createOrder(db, customer, { items: [{ productId: id, qty: 1 }], paymentMethod: "gcash" });
    await setArchived(db, id, true);
    expect((await getMenu(db)).products.some((p) => p.id === id)).toBe(false);
    await expect(orders.createOrder(db, customer, { items: [{ productId: id, qty: 1 }], paymentMethod: "gcash" })).rejects.toThrow(/not available/);
    expect((await orders.getOrder(db, order.id)).items[0].name).toBe("Mocha"); // history intact
    const admin = (await listMenuAdmin(db)).products.find((p) => p.id === id)!;
    expect(admin).toMatchObject({ archived: true, available: false, has_orders: true });

    await setArchived(db, id, false);
    expect((await getMenu(db)).products.find((p) => p.id === id)).toMatchObject({ sold_out: true }); // back, but still switched off
  });
});

describe("categories", () => {
  it("adds, renames, reorders, and refuses to delete one that still has products", async () => {
    const c = await saveCategory(db, null, "Smoothies");
    expect(c.sort).toBe(5);
    await expect(saveCategory(db, null, "coffee")).rejects.toThrow(/already exists/);
    await saveCategory(db, c.id, "Shakes");
    await moveCategory(db, c.id, "up");
    expect((await getMenu(db)).categories.map((x) => x.name)).toEqual(["Coffee", "Non-Coffee", "Pastries", "Shakes", "Meals"]);
    await expect(deleteCategory(db, 1)).rejects.toThrow(/still has products/);
    await deleteCategory(db, c.id);
    expect((await getMenu(db)).categories).toHaveLength(4);
  });
});

describe("add-ons", () => {
  it("creates an add-on with a substitution, extra ingredients, attaches it, and it affects stock use", async () => {
    const addonId = await saveAddon(db, null, {
      name: "Soy Milk", price: 30, available: true, replacesIngredientId: ING.milk, replacementIngredientId: ING.oat, extras: [{ ingredientId: ING.beans, qty: 0.005 }],
    });
    const id = await saveProduct(db, null, { ...base, addonIds: [addonId] });
    const { order } = await orders.createOrder(db, customer, { items: [{ productId: id, variantId: undefined, addonIds: [addonId], qty: 1 }], paymentMethod: "gcash" });
    await orders.setStatus(db, staff, order.id, "completed");
    expect(await ing(ING.milk)).toBe(12); // replaced
    expect(await ing(ING.oat)).toBeCloseTo(6 - 0.2, 5);
  });

  it("validates substitutions and deletes safely", async () => {
    const mk = (o: object) => saveAddon(db, null, { name: "X", price: 10, available: true, replacesIngredientId: null, replacementIngredientId: null, extras: [], ...o });
    await expect(mk({ replacesIngredientId: 2 })).rejects.toThrow(/needs both/);
    await expect(mk({ replacesIngredientId: 2, replacementIngredientId: 2 })).rejects.toThrow(/itself/);
    await expect(mk({ price: -1 })).rejects.toThrow(/Price/);
    const id = await mk({});
    const pid = await saveProduct(db, null, { ...base, addonIds: [id] });
    await deleteAddon(db, id);
    expect((await listMenuAdmin(db)).products.find((p) => p.id === pid)!.addon_ids).toEqual([]);
  });
});
