import { beforeEach, describe, expect, it } from "vitest";
import { suggestEmail } from "../src/lib/client/email";
import { lineKey, mergeLine, type CartLine } from "../src/lib/client/cart";
import { createDb, type Db } from "../src/lib/db";
import { login, updateProfile } from "../src/lib/services/auth";

describe("suggestEmail", () => {
  it("corrects common domain typos", () => {
    expect(suggestEmail("maria@gmial.com")).toBe("maria@gmail.com");
    expect(suggestEmail("maria@gmail.con")).toBe("maria@gmail.com");
    expect(suggestEmail("maria@yaho.com")).toBe("maria@yahoo.com");
    expect(suggestEmail("maria@hotmial.com")).toBe("maria@hotmail.com");
  });
  it("stays quiet for correct, unusual or incomplete addresses", () => {
    expect(suggestEmail("maria@gmail.com")).toBeNull();
    expect(suggestEmail("maria@mycompany.ph")).toBeNull();
    expect(suggestEmail("maria@")).toBeNull();
    expect(suggestEmail("not-an-email")).toBeNull();
  });
});

describe("cart merging", () => {
  const base: Omit<CartLine, "key"> = { productId: 1, name: "Latte", emoji: "x", variantId: 2, variantName: "Grande", addons: [{ id: 1, name: "Oat", price: 30 }, { id: 2, name: "Shot", price: 25 }], unitPrice: 195, qty: 1 };
  it("merges identical lines regardless of add-on order, and separates different ones", () => {
    const a = mergeLine([], base);
    const b = mergeLine(a, { ...base, addons: [...base.addons].reverse() });
    expect(b).toHaveLength(1);
    expect(b[0].qty).toBe(2);
    expect(mergeLine(b, { ...base, notes: "less ice" })).toHaveLength(2);
    expect(mergeLine(b, { ...base, variantId: 3 })).toHaveLength(2);
    expect(lineKey(base)).toBe(b[0].key);
  });
});

describe("updateProfile", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb({ memory: true });
  });
  it("updates name and phone, clears an empty phone, and rejects a blank name", async () => {
    const { user } = await login(db, "valerie@example.test", "kapeople123");
    const u = await updateProfile(db, user.id, { name: "  Val Cruz ", phone: " 0917 555 0000 " });
    expect(u).toMatchObject({ name: "Val Cruz", phone: "0917 555 0000", email: "valerie@example.test" });
    expect((await updateProfile(db, user.id, { name: "Val Cruz", phone: "" })).phone).toBeNull();
    await expect(updateProfile(db, user.id, { name: "   " })).rejects.toThrow(/name/i);
  });
});
