import { describe, it, expect } from "vitest";
import { dryRunImport, MAX_IMPORT_ROWS } from "../src/menu/import";

const row = (o: Record<string, unknown> = {}) => ({ dish: "Semo & Egusi", category: "Soups & Swallow", "price in ₦": 3500, portion: "Regular", extras: null, ...o });

describe("dryRunImport", () => {
  it("accepts a clean row; price becomes kobo", () => {
    const r = dryRunImport([row()]);
    expect(r.ok).toBe(true);
    expect(r.items[0]!.priceKobo).toBe(350000n);
  });
  it("the owner's real template (3 dishes, no prices): ok, 0 publishable, 3 drafts, 3 warnings", () => {
    const r = dryRunImport([
      { dish: "Semo & Egusi", category: "Soups & Swallow", "price in ₦": null, portion: null, extras: null },
      { dish: "Party Jollof Rice & Grilled Chicken", category: "Rice Meals", "price in ₦": null, portion: null, extras: null },
      { dish: "Peppered Meat", category: "Sides / Proteins", "price in ₦": null, portion: null, extras: null },
    ]);
    expect(r.ok).toBe(true);
    expect(r.counts).toMatchObject({ rows: 3, valid: 3, publishable: 0, draftOnly: 3, warnings: 3, errors: 0 });
  });
  it("empty file is an error", () => expect(dryRunImport([]).ok).toBe(false));
  it("over the row cap is an error", () => expect(dryRunImport(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row({ dish: `D${i}` }))).ok).toBe(false));
  it("exactly the cap is allowed", () => expect(dryRunImport(Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => row({ dish: `D${i}` }))).ok).toBe(true));
  it("missing column", () => {
    const r = dryRunImport([{ dish: "A", category: "B" }]);
    expect(r.ok).toBe(false); expect(r.issues[0]!.message).toContain("Missing columns");
  });
  it("duplicate dish in same category (case/space-insensitive) errors; same dish in other category is fine", () => {
    expect(dryRunImport([row(), row({ dish: "  semo &  egusi " })]).ok).toBe(false);
    expect(dryRunImport([row(), row({ category: "Other" })]).ok).toBe(true);
  });
  it.each(["abc", "-5", "0", "1.999"])("bad price %j errors", (p) => expect(dryRunImport([row({ "price in ₦": p })]).ok).toBe(false));
  it("formula injection in dish name is blocked", () => expect(dryRunImport([row({ dish: "=HYPERLINK(\"x\")" })]).ok).toBe(false));
  it("empty dish / category error", () => {
    expect(dryRunImport([row({ dish: "" })]).ok).toBe(false);
    expect(dryRunImport([row({ category: " " })]).ok).toBe(false);
  });
  it("extras parse; malformed extras error", () => {
    const ok = dryRunImport([row({ extras: "Extra beef:1,500; Plantain:500" })]);
    expect(ok.items[0]!.extras).toEqual([{ name: "Extra beef", priceKobo: 150000n }, { name: "Plantain", priceKobo: 50000n }]);
    expect(dryRunImport([row({ extras: "Plantain" })]).ok).toBe(false);
    expect(dryRunImport([row({ extras: "Plantain:abc" })]).ok).toBe(false);
  });
  it("is deterministic/idempotent: same input gives same keys", () => {
    expect(dryRunImport([row()]).items[0]!.key).toBe(dryRunImport([row()]).items[0]!.key);
  });
  it("draft price is null, never 0n (the database rejects 0)", () => {
    const r = dryRunImport([row({ "price in ₦": null })]);
    expect(r.items[0]!.priceKobo).toBeNull();
  });
  it("reports real spreadsheet row numbers (header is row 1)", () => {
    const r = dryRunImport([row(), row({ dish: "" })]);
    expect(r.issues.find((i) => i.level === "error")!.row).toBe(3);
    expect(dryRunImport([{ ...row({ dish: "" }), __row: 9 }]).issues[0]!.row).toBe(9);
  });
  it("accepts the alternate header spelling (name, price_ngn, portion_label)", () => {
    const r = dryRunImport([{ name: "Moi Moi", category: "Sides", price_ngn: "1,200", portion_label: "Large" }]);
    expect(r.ok).toBe(true);
    expect(r.items[0]).toMatchObject({ name: "Moi Moi", priceKobo: 120000n, portion_label: "Large" });
  });
  it("status: unknown rejected; published needs a price; never auto-published", () => {
    expect(dryRunImport([row({ status: "banana" })]).ok).toBe(false);
    expect(dryRunImport([row({ status: "published", "price in ₦": null })]).ok).toBe(false);
    expect(dryRunImport([row({ status: "published" })]).items[0]!.status).toBe("published");
    expect(dryRunImport([row()]).items[0]!.status).toBe("draft");
  });
  it("available/featured accept yes/no/true/false; garbage rejected", () => {
    const r = dryRunImport([row({ available: "No", featured: "YES" })]);
    expect(r.items[0]).toMatchObject({ is_available: false, is_featured: true });
    expect(dryRunImport([row({ available: "maybe" })]).ok).toBe(false);
  });
  it("sort_order must be a whole number", () => {
    expect(dryRunImport([row({ sort_order: "3" })]).items[0]!.sort_order).toBe(3);
    expect(dryRunImport([row({ sort_order: "abc" })]).ok).toBe(false);
    expect(dryRunImport([row({ sort_order: "-1" })]).ok).toBe(false);
  });
  it("length limits match the database (name 80, category 60, description 500)", () => {
    expect(dryRunImport([row({ dish: "x".repeat(81) })]).ok).toBe(false);
    expect(dryRunImport([row({ dish: "x".repeat(80) })]).ok).toBe(true);
    expect(dryRunImport([row({ category: "c".repeat(61) })]).ok).toBe(false);
    expect(dryRunImport([row({ description: "d".repeat(501) })]).ok).toBe(false);
  });
  it("allergens are trimmed and de-duplicated; duplicate SKUs rejected", () => {
    expect(dryRunImport([row({ allergens: " Nuts, fish ,nuts," })]).items[0]!.allergens).toEqual(["Nuts", "fish"]);
    expect(dryRunImport([row({ sku: "A1" }), row({ dish: "Other", sku: "a1" })]).ok).toBe(false);
  });
  it("blank price column missing entirely gives ONE clear error, not one per row", () => {
    const r = dryRunImport([{ dish: "A", category: "B" }, { dish: "C", category: "B" }]);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]!.message).toContain("price");
  });
});
