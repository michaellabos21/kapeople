/**
 * Import customers from a sign-up sheet (tab-separated: timestamp, name, email, phone, handle, consent, id).
 *
 *   DATABASE_URL=... npx tsx scripts/import-customers.ts sheet.tsv           # dry run (default)
 *   DATABASE_URL=... npx tsx scripts/import-customers.ts sheet.tsv --apply   # write to the database
 *
 * Keep the data file out of the repository: it contains personal information.
 */
import fs from "node:fs";
import { createDb } from "../src/lib/db";
import { importCustomers, parseSignupSheet } from "../src/lib/services/customers";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: npx tsx scripts/import-customers.ts <sheet.tsv> [--apply]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Refusing to guess which database to write to.");
  process.exit(1);
}

(async () => {
  const apply = flags.includes("--apply");
  const { rows, skipped } = parseSignupSheet(fs.readFileSync(file, "utf8"));
  const db = await createDb();
  const { created, existing } = await importCustomers(db, rows, { apply });
  console.log(`${apply ? "IMPORTED" : "DRY RUN (nothing written)"}`);
  console.log(`  ${apply ? "created" : "would create"}: ${created.length}`);
  console.log(`  already in the database (left untouched): ${existing.length}`);
  console.log(`  skipped rows: ${skipped.length}`);
  for (const s of skipped) console.log(`    line ${s.line}: ${s.name} — ${s.reason}`);
  await db.close();
})().catch((e) => {
  console.error("Failed:", e.message);
  process.exit(1);
});
