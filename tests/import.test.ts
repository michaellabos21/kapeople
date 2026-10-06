import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import { login, samePhone, signup, userFromToken } from "../src/lib/services/auth";
import { getCustomer, importCustomers, listCustomers, parseSheetDate, parseSignupSheet } from "../src/lib/services/customers";

const SHEET = [
  ["9/19/2026 21:04:42", "zoeyin leong pulmones", "", "09857903348", "@xxyq.zi", "I agree", "51"],
  ["9/19/2026 21:07:37", "Jay-R Sausa", "SausaRomeoJr@Gmail.com", "09369372910", "@jayrsausa", "I agree", "52"],
  ["9/19/2026 22:40:32", "Krystelle ", "krystelleobanogon@gmail.com", "09652044797", "krstllrei", "I agree", "65"],
  ["9/19/2026 23:40:25", "keith paguntalan", "keithpaguntalan", "09474930958", "keith_paguntalan_", "", "71"],
  ["9/19/2026 23:46:11", "Von Christian Baconga", "vonbaconga@gmail.com", "09143598041", "N/A", "I agree", "77"],
  ["9/20/2026 0:48:14", "rogin emmanuel b. biclar", "emmanuelbiclar1@gmail.com", "09513209194", "rogin biclar", "I agree", "82"],
  ["9/19/2026 23:50:00", "Dupe Person", "jay-r-copy@gmail.com", "09000000000", "", "I agree", "99"],
  ["9/19/2026 23:50:01", "Dupe Again", "jay-r-copy@gmail.com", "09000000001", "", "I agree", "100"],
]
  .map((r) => r.join("\t"))
  .join("\n");

describe("parsing the sign-up sheet", () => {
  it("reads rows, lowercases/trims, and reports the ones that can't become accounts", () => {
    const { rows, skipped } = parseSignupSheet(SHEET);
    expect(rows.map((r) => r.email)).toEqual([
      "sausaromeojr@gmail.com", "krystelleobanogon@gmail.com", "vonbaconga@gmail.com", "emmanuelbiclar1@gmail.com", "jay-r-copy@gmail.com",
    ]);
    expect(rows[1].name).toBe("Krystelle"); // trailing space trimmed
    expect(rows[2].handle).toBe(""); // "N/A" is not a handle
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([
      [1, "no email address"], [4, 'invalid email "keithpaguntalan"'], [8, "duplicate email in the sheet"],
    ]);
  });

  it("treats sheet times as Philippine time (UTC+8)", () => {
    expect(parseSheetDate("9/19/2026 21:04:42")!.toISOString()).toBe("2026-09-19T13:04:42.000Z");
    expect(parseSheetDate("9/20/2026 0:48:14")!.toISOString()).toBe("2026-09-19T16:48:14.000Z");
    expect(parseSheetDate("19/9/2026 21:04:42")).toBeNull();
    expect(parseSheetDate("garbage")).toBeNull();
  });
});

describe("importing and claiming", () => {
  let db: Db;
  beforeEach(async () => {
    db = await createDb({ memory: true });
  });

  it("dry run writes nothing; apply creates passwordless customers and never touches existing emails", async () => {
    const { rows } = parseSignupSheet(SHEET);
    const dry = await importCustomers(db, rows, { apply: false });
    expect(dry.created).toHaveLength(5);
    expect((await listCustomers(db)).total).toBe(1); // only Valerie

    await signup(db, { name: "Already Here", email: "vonbaconga@gmail.com", password: "longenough-password" });
    const run = await importCustomers(db, rows, { apply: true });
    expect(run.created).toHaveLength(4);
    expect(run.existing).toEqual(["vonbaconga@gmail.com"]);
    expect((await importCustomers(db, rows, { apply: true })).created).toHaveLength(0); // re-running is safe

    const { customers } = await listCustomers(db, { search: "sausaromeo" });
    expect(customers[0]).toMatchObject({ name: "Jay-R Sausa", phone: "09369372910", not_activated: true, points_balance: 0 });
    expect(new Date(customers[0].created_at).toISOString()).toBe("2026-09-19T13:07:37.000Z");
    const d = await getCustomer(db, customers[0].id);
    expect(d.customer.staff_notes).toContain("row 52");
    expect(d.customer.staff_notes).toContain("Consent: I agree");
    expect(d.customer.staff_notes).toContain("@jayrsausa");
  });

  it("imported accounts cannot sign in with any password, and don't crash the login", async () => {
    await importCustomers(db, parseSignupSheet(SHEET).rows, { apply: true });
    for (const pw of ["", "!unclaimed", "anything-at-all", "kapeople123"]) {
      await expect(login(db, "sausaromeojr@gmail.com", pw)).rejects.toThrow(/Incorrect/);
    }
  });

  it("claiming needs the same email AND mobile number, then sets the password", async () => {
    await importCustomers(db, parseSignupSheet(SHEET).rows, { apply: true });
    const attempt = (phone?: string) => signup(db, { name: "Jay-R S.", email: "SausaRomeoJr@gmail.com", password: "my-new-password-1", phone });
    await expect(attempt()).rejects.toMatchObject({ code: "claim_phone", status: 409 });
    await expect(attempt("09111111111")).rejects.toMatchObject({ code: "claim_phone" });

    const claimed = await attempt("+63 936 937 2910"); // same number, different format
    expect(claimed.user.email).toBe("sausaromeojr@gmail.com");
    expect(await userFromToken(db, claimed.token)).not.toBeNull();
    expect((await login(db, "sausaromeojr@gmail.com", "my-new-password-1")).user.name).toBe("Jay-R S.");
    expect((await listCustomers(db, { search: "sausaromeo" })).customers[0].not_activated).toBe(false);

    // once claimed it's a normal account: a second signup can't take it over
    await expect(attempt("09369372910")).rejects.toThrow(/already exists/);
  });

  it("a normal account's email can't be claimed, and staff emails are never claimable", async () => {
    await expect(signup(db, { name: "X", email: "valerie@example.test", password: "longenough-password", phone: "0917 000 0001" })).rejects.toThrow(/already exists/);
    await expect(signup(db, { name: "X", email: "staff@kapeople.test", password: "longenough-password" })).rejects.toThrow(/already exists/);
  });
});

describe("samePhone", () => {
  it("matches Philippine formats and rejects short/empty values", () => {
    expect(samePhone("0917 000 0001", "+63 917 000 0001")).toBe(true);
    expect(samePhone("09170000001", "639170000001")).toBe(true);
    expect(samePhone("0917 000 0001", "0917 000 0002")).toBe(false);
    expect(samePhone("", "")).toBe(false);
    expect(samePhone(null, "09170000001")).toBe(false);
    expect(samePhone("12345", "12345")).toBe(false);
  });
});
