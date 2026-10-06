import { beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../src/lib/db";
import { changeOwnPassword, login, userFromToken } from "../src/lib/services/auth";
import { createStaff, listStaff, resetStaffPassword, setActive } from "../src/lib/services/staff";

let db: Db;
let adminId: number;
const PW = "kapeople123";
const NEW_PW = "a-brand-new-passphrase";

beforeEach(async () => {
  db = await createDb({ memory: true });
  adminId = (await db.query("select id from users where email='admin@kapeople.test'"))[0].id;
});

describe("staff management", () => {
  it("creates staff and admin accounts that can sign in", async () => {
    const barista = await createStaff(db, { name: "New Barista", email: "New@Cafe.test", role: "employee", password: NEW_PW });
    expect(barista.email).toBe("new@cafe.test");
    expect((await login(db, "new@cafe.test", NEW_PW)).user.role).toBe("employee");
    const admin2 = await createStaff(db, { name: "Second Admin", email: "boss@cafe.test", role: "admin", password: NEW_PW });
    expect((await login(db, "boss@cafe.test", NEW_PW)).user.id).toBe(admin2.id);
    expect((await listStaff(db)).map((u) => u.email)).toContain("boss@cafe.test");
  });

  it("rejects short passwords and duplicate emails", async () => {
    await expect(createStaff(db, { name: "X", email: "x@cafe.test", role: "employee", password: "short" })).rejects.toThrow(/at least 12/);
    await expect(createStaff(db, { name: "X", email: "admin@kapeople.test", role: "employee", password: NEW_PW })).rejects.toThrow(/already exists/);
  });

  it("deactivating signs the person out everywhere and blocks sign-in", async () => {
    const s = await createStaff(db, { name: "Temp", email: "temp@cafe.test", role: "employee", password: NEW_PW });
    const { token } = await login(db, "temp@cafe.test", NEW_PW);
    expect(await userFromToken(db, token)).not.toBeNull();
    await setActive(db, adminId, s.id, false);
    expect(await userFromToken(db, token)).toBeNull();
    await expect(login(db, "temp@cafe.test", NEW_PW)).rejects.toThrow(/deactivated/);
    await expect(login(db, "temp@cafe.test", "wrong-password-here")).rejects.toThrow(/Incorrect/); // no hint for wrong passwords
    await setActive(db, adminId, s.id, true);
    expect((await login(db, "temp@cafe.test", NEW_PW)).user.email).toBe("temp@cafe.test");
  });

  it("protects the last active admin and your own account", async () => {
    await expect(setActive(db, adminId, adminId, false)).rejects.toThrow(/own account/);
    const other = await createStaff(db, { name: "Other", email: "other@cafe.test", role: "admin", password: NEW_PW });
    await expect(setActive(db, other.id, adminId, false)).resolves.toBeUndefined(); // another admin remains (themself)
    await expect(setActive(db, adminId, other.id, false)).rejects.toThrow(/at least one active admin/);
  });

  it("does not let staff tools touch customers", async () => {
    const [c] = await db.query("select id from users where email='valerie@example.test'");
    await expect(setActive(db, adminId, c.id, false)).rejects.toThrow(/not found/);
    await expect(resetStaffPassword(db, c.id, NEW_PW)).rejects.toThrow(/not found/);
  });

  it("reset password signs the person out and the old password stops working", async () => {
    const s = await createStaff(db, { name: "Temp", email: "temp@cafe.test", role: "employee", password: NEW_PW });
    const { token } = await login(db, "temp@cafe.test", NEW_PW);
    await resetStaffPassword(db, s.id, "another-long-passphrase");
    expect(await userFromToken(db, token)).toBeNull();
    await expect(login(db, "temp@cafe.test", NEW_PW)).rejects.toThrow(/Incorrect/);
    await expect(login(db, "temp@cafe.test", "another-long-passphrase")).resolves.toBeTruthy();
  });
});

describe("account security", () => {
  it("locks sign-in for 15 minutes after 5 failures, and a correct password resets the counter", async () => {
    for (let i = 0; i < 4; i++) await expect(login(db, "staff@kapeople.test", "nope")).rejects.toThrow(/Incorrect/);
    await expect(login(db, "staff@kapeople.test", PW)).resolves.toBeTruthy(); // 4 failures: still allowed, resets
    for (let i = 0; i < 5; i++) await expect(login(db, "staff@kapeople.test", "nope")).rejects.toThrow(/Incorrect/);
    await expect(login(db, "staff@kapeople.test", PW)).rejects.toThrow(/Too many/); // locked even with the right password
    // unknown emails are throttled the same way (no account enumeration)
    for (let i = 0; i < 5; i++) await login(db, "ghost@cafe.test", "x").catch(() => {});
    await expect(login(db, "ghost@cafe.test", "x")).rejects.toThrow(/Too many/);
  });

  it("an admin reset lifts a lockout", async () => {
    const [s] = await db.query("select id from users where email='staff@kapeople.test'");
    for (let i = 0; i < 5; i++) await login(db, "staff@kapeople.test", "nope").catch(() => {});
    await resetStaffPassword(db, s.id, NEW_PW);
    await expect(login(db, "staff@kapeople.test", NEW_PW)).resolves.toBeTruthy();
  });

  it("changing your own password needs the current one and signs out other devices", async () => {
    const a = await login(db, "staff@kapeople.test", PW);
    const b = await login(db, "staff@kapeople.test", PW);
    await expect(changeOwnPassword(db, a.user.id, "wrong", NEW_PW, a.token)).rejects.toThrow(/current password/);
    await expect(changeOwnPassword(db, a.user.id, PW, "short", a.token)).rejects.toThrow(/at least 12/);
    await changeOwnPassword(db, a.user.id, PW, NEW_PW, a.token);
    expect(await userFromToken(db, a.token)).not.toBeNull();
    expect(await userFromToken(db, b.token)).toBeNull();
    await expect(login(db, "staff@kapeople.test", PW)).rejects.toThrow(/Incorrect/);
    await expect(login(db, "staff@kapeople.test", NEW_PW)).resolves.toBeTruthy();
  });
});
