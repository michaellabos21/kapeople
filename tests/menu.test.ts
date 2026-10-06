import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import { getMenu } from "../src/lib/services/catalog";
import { recordMovement } from "../src/lib/services/inventory";

let db: Db;
let staffId: number;
beforeEach(async () => {
  db = await createDb({ memory: true });
  staffId = (await db.query("select id from users where email='staff@kapeople.test'"))[0].id;
});

describe("menu add-ons", () => {
  it("marks an add-on sold out when its ingredient runs out, but keeps the drink orderable", async () => {
    await recordMovement(db, staffId, 3, "adjustment", 0); // oat milk to 0
    const latte = (await getMenu(db)).products.find((p) => p.id === 1)!;
    expect(latte.sold_out).toBe(false);
    const oat = latte.addons.find((a) => a.name === "Oat Milk")!;
    expect(oat).toMatchObject({ sold_out: true, sold_out_reason: "Out of Oat Milk" });
    expect(latte.addons.find((a) => a.name === "Extra Shot")!.sold_out).toBe(false);
  });

  it("flags every add-on as available when stock is fine", async () => {
    const products = (await getMenu(db)).products;
    expect(products.flatMap((p) => p.addons).every((a) => !a.sold_out)).toBe(true);
  });

  it("does not expose recipe quantities or ingredient ids on the public menu", async () => {
    const json = JSON.stringify(await getMenu(db));
    expect(json).not.toContain("replaces_ingredient_id");
    expect(json).not.toContain("replacement_ingredient_id");
    expect(json).not.toContain('"recipe"');
  });
});
