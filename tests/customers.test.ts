import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import * as orders from "../src/lib/services/orders";
import { login, signup, userFromToken } from "../src/lib/services/auth";
import { adjustPoints, csvField, customersCsv, getCustomer, listCustomers, setCustomerActive, updateNotes } from "../src/lib/services/customers";

let db: Db;
let staff: orders.Actor;
let adminId: number;
let valerie: orders.Actor;
const buy = (who: orders.Actor, productId = 2, qty = 1) =>
  orders.createOrder(db, who, { items: [{ productId, qty }], paymentMethod: "gcash" });

beforeEach(async () => {
  db = await createDb({ memory: true });
  const id = async (email: string) => (await db.query("select id from users where email=$1", [email]))[0].id as number;
  staff = { id: await id("staff@kapeople.test"), role: "employee" };
  adminId = await id("admin@kapeople.test");
  valerie = { id: await id("valerie@example.test"), role: "customer" };
});

describe("customer list", () => {
  it("shows only customers, with completed-order spend, counts and last order", async () => {
    const a = await buy(valerie); // 150
    await orders.setStatus(db, staff, a.order.id, "completed");
    const b = await buy(valerie, 4); // 165
    await orders.setStatus(db, staff, b.order.id, "completed");
    const pending = await buy(valerie, 9); // not completed: must not count
    const cancelled = await buy(valerie, 9);
    await orders.cancelOrder(db, staff, cancelled.order.id);
    void pending;

    const { customers, total } = await listCustomers(db);
    expect(total).toBe(1); // staff/admin excluded
    expect(customers[0]).toMatchObject({ email: "valerie@example.test", orders: 2, spent: 315, points_balance: 80 + 15 + 16 });
    expect(customers[0].last_order).toBeTruthy();
  });

  it("searches name, email and phone, treats % and _ literally, sorts and paginates", async () => {
    const mk = (n: string, phone?: string) => signup(db, { name: n, email: `${n.toLowerCase().replace(/\W/g, "")}@x.test`, password: "longenough-password", phone });
    const big = await mk("Zed Big", "0999 111");
    await mk("Amy Small");
    await mk("100% Fan");
    const o = await buy({ id: big.user.id, role: "customer" }, 13, 2); // 420
    await orders.setStatus(db, staff, o.order.id, "completed");

    expect((await listCustomers(db, { search: "zed" })).customers.map((c) => c.name)).toEqual(["Zed Big"]);
    expect((await listCustomers(db, { search: "0999" })).customers.map((c) => c.name)).toEqual(["Zed Big"]);
    expect((await listCustomers(db, { search: "amysmall@x" })).total).toBe(1);
    expect((await listCustomers(db, { search: "%" })).customers.map((c) => c.name)).toEqual(["100% Fan"]); // not a wildcard
    expect((await listCustomers(db, { search: "no-such-person" })).total).toBe(0);

    expect((await listCustomers(db, { sort: "spent" })).customers[0].name).toBe("Zed Big");
    expect((await listCustomers(db, { sort: "name" })).customers.map((c) => c.name)).toEqual(["100% Fan", "Amy Small", "Valerie Cruz", "Zed Big"]);
    const page2 = await listCustomers(db, { sort: "name", limit: 2, offset: 2 });
    expect(page2.total).toBe(4);
    expect(page2.customers.map((c) => c.name)).toEqual(["Valerie Cruz", "Zed Big"]);
  });
});

describe("customer detail and admin tools", () => {
  it("returns order history and the points ledger", async () => {
    const o = await buy(valerie);
    await orders.setStatus(db, staff, o.order.id, "completed");
    const d = await getCustomer(db, valerie.id);
    expect(d.stats).toMatchObject({ orders: 1, spent: 150 });
    expect(d.orders[0]).toMatchObject({ order_number: o.order.order_number, status: "completed" });
    expect(d.loyalty.map((l) => l.type)).toEqual(["earn", "adjust"]);
    await expect(getCustomer(db, staff.id)).rejects.toThrow(/not found/); // staff rows are not customers
  });

  it("adjusts points with a required reason and an audit row; never below zero", async () => {
    expect(await adjustPoints(db, adminId, valerie.id, 25, "Goodwill after a late order")).toBe(105);
    expect(await adjustPoints(db, adminId, valerie.id, -5, "Correction")).toBe(100);
    const [last] = (await getCustomer(db, valerie.id)).loyalty;
    expect(last).toMatchObject({ type: "adjust", points: -5, balance_after: 100 });
    expect(last.note).toContain("Ana Admin");
    await expect(adjustPoints(db, adminId, valerie.id, 5, "  ")).rejects.toThrow(/reason/);
    await expect(adjustPoints(db, adminId, valerie.id, 0, "x")).rejects.toThrow(/whole number/);
    await expect(adjustPoints(db, adminId, valerie.id, 1.5, "x")).rejects.toThrow(/whole number/);
    await expect(adjustPoints(db, adminId, valerie.id, -101, "x")).rejects.toThrow(/below zero/);
    await expect(adjustPoints(db, adminId, staff.id, 5, "x")).rejects.toThrow(/not found/);
  });

  it("saves notes and can block a customer, which signs them out", async () => {
    await updateNotes(db, valerie.id, "  Allergic to nuts  ");
    expect((await getCustomer(db, valerie.id)).customer.staff_notes).toBe("Allergic to nuts");
    await updateNotes(db, valerie.id, "");
    expect((await getCustomer(db, valerie.id)).customer.staff_notes).toBeNull();

    const { token } = await login(db, "valerie@example.test", "kapeople123");
    await setCustomerActive(db, valerie.id, false);
    expect(await userFromToken(db, token)).toBeNull();
    await expect(login(db, "valerie@example.test", "kapeople123")).rejects.toThrow(/deactivated/);
    expect((await listCustomers(db)).customers[0].active).toBe(false);
    await setCustomerActive(db, valerie.id, true);
    await expect(login(db, "valerie@example.test", "kapeople123")).resolves.toBeTruthy();
    await expect(setCustomerActive(db, staff.id, false)).rejects.toThrow(/not found/); // can't use this on staff
  });
});

describe("CSV export", () => {
  it("quotes fields and neutralises spreadsheet formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('Smith, "Jo"')).toBe('"Smith, ""Jo"""');
    expect(csvField("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvField("+1 555")).toBe("'+1 555");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField(null)).toBe("");
    expect(csvField(42)).toBe("42");
  });

  it("exports a header and one row per customer", async () => {
    await signup(db, { name: "=1+1", email: "evil@x.test", password: "longenough-password" });
    const lines = (await customersCsv(db)).trim().split("\r\n");
    expect(lines[0]).toBe("Name,Email,Phone,Joined,Completed orders,Total spent,Points,Last order,Active");
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.includes("evil@x.test"))!.startsWith("'=1+1,")).toBe(true);
    expect(lines.some((l) => l.includes("staff@kapeople.test"))).toBe(false);
  });
});
