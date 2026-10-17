import { type Kobo, parseNairaToKobo } from "../lib/money";

export const MAX_IMPORT_ROWS = 500;

// Limits mirror the database checks in supabase/migrations/0001_menu_core.sql
const LIMITS = { name: 80, category: 60, description: 500, sku: 40, allergen: 40 } as const;

/**
 * One spreadsheet/CSV row keyed by header text. Accepted headers (either spelling works):
 * dish | name, category, "price in ₦" | price_ngn, portion | portion_label, extras,
 * sku, description, allergens, status, available, featured, sort_order.
 * `__row` is the real spreadsheet row number (set by the reader) so error messages point at the right line.
 */
export interface RawRow { [header: string]: unknown; __row?: number }
export type ImportRow = RawRow;

export type ItemStatus = "draft" | "published" | "archived";

export interface ParsedItem {
  key: string;
  category: string;
  name: string;
  description: string;
  priceKobo: Kobo | null; // null = no price yet (draft only). Never 0n: the database rejects 0.
  portion_label: string;
  allergens: string[];
  status: ItemStatus;
  is_available: boolean;
  is_featured: boolean;
  sort_order: number;
  extras: { name: string; priceKobo: Kobo }[];
}

export interface RowIssue { row: number; level: "error" | "warning"; message: string }

export interface DryRunResult {
  ok: boolean;
  items: ParsedItem[];
  issues: RowIssue[];
  counts: { rows: number; valid: number; errors: number; warnings: number; publishable: number; draftOnly: number };
}
export type DryRunReport = DryRunResult;

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
export const slugKey = (category: string, name: string) =>
  `${category}::${name}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9:]+/g, "-").replace(/^-+|-+$/g, "");
const looksLikeFormula = (s: string) => /^[=+\-@\t\r]/.test(s);

function pick(r: RawRow, ...keys: string[]): unknown {
  for (const k of keys) if (k in r && r[k] !== null && r[k] !== undefined && norm(r[k]) !== "") return r[k];
  return undefined;
}

function parseBool(v: unknown, dflt: boolean): boolean | null {
  const s = norm(v).toLowerCase();
  if (s === "") return dflt;
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null; // unrecognised
}

/** Extras cell format: "Extra beef:1500; Plantain:500". The LAST colon splits name from price. */
function parseExtras(cell: string, row: number, issues: RowIssue[]): { name: string; priceKobo: Kobo }[] {
  if (!cell) return [];
  const out: { name: string; priceKobo: Kobo }[] = [];
  for (const part of cell.split(";").map((p) => p.trim()).filter(Boolean)) {
    const idx = part.lastIndexOf(":");
    const name = idx > 0 ? part.slice(0, idx).trim() : "";
    const price = idx > 0 ? parseNairaToKobo(part.slice(idx + 1)) : null;
    if (!name || !price || !price.ok) {
      issues.push({ row, level: "error", message: `Extra "${part}" must look like "Name:1500"` });
      continue;
    }
    if (looksLikeFormula(name)) {
      issues.push({ row, level: "error", message: `Extra "${part}" starts with =, +, - or @ (spreadsheet formula risk)` });
      continue;
    }
    out.push({ name, priceKobo: price.kobo });
  }
  return out;
}

/** Pure, side-effect-free validation. Nothing is written until the owner confirms a clean dry run. */
export function dryRunImport(rows: RawRow[]): DryRunResult {
  const issues: RowIssue[] = [];
  const items: ParsedItem[] = [];
  const finish = (): DryRunResult => {
    const errors = issues.filter((x) => x.level === "error").length;
    const publishable = items.filter((i) => i.priceKobo !== null).length;
    return {
      ok: errors === 0, items, issues,
      counts: { rows: rows.length, valid: items.length, errors, warnings: issues.length - errors, publishable, draftOnly: items.length - publishable },
    };
  };

  if (rows.length === 0) { issues.push({ row: 0, level: "error", message: "The file has no menu rows" }); return finish(); }
  if (rows.length > MAX_IMPORT_ROWS) {
    issues.push({ row: 0, level: "error", message: `Too many rows (${rows.length}). Maximum is ${MAX_IMPORT_ROWS}` });
    return finish();
  }

  // Column check once for the whole file (a header must exist even if its cells are empty).
  const headers = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r)) headers.add(k);
  const missing: string[] = [];
  if (!headers.has("dish") && !headers.has("name")) missing.push("dish");
  if (!headers.has("category")) missing.push("category");
  if (!headers.has("price in ₦") && !headers.has("price_ngn")) missing.push("price in ₦");
  if (missing.length) {
    issues.push({ row: 0, level: "error", message: `Missing columns: ${missing.join(", ")}` });
    return finish();
  }

  const seenKeys = new Map<string, number>();
  const seenSkus = new Map<string, number>();

  rows.forEach((r, i) => {
    const row = typeof r.__row === "number" ? r.__row : i + 2; // spreadsheet row number (header is row 1)
    const before = issues.length;
    const err = (message: string) => issues.push({ row, level: "error", message });

    const name = norm(pick(r, "dish", "name"));
    const category = norm(r["category"]);
    const description = norm(r["description"]);
    const portion = norm(pick(r, "portion", "portion_label"));
    const sku = norm(r["sku"]);

    if (!name) err("Dish name is empty");
    if (!category) err("Category is empty");
    if (name.length > LIMITS.name) err(`Dish name is longer than ${LIMITS.name} characters`);
    if (category.length > LIMITS.category) err(`Category is longer than ${LIMITS.category} characters`);
    if (description.length > LIMITS.description) err(`Description is longer than ${LIMITS.description} characters`);
    if (sku.length > LIMITS.sku) err(`SKU is longer than ${LIMITS.sku} characters`);
    for (const [label, v] of [["dish", name], ["category", category], ["portion", portion], ["description", description], ["sku", sku]] as const) {
      if (looksLikeFormula(v)) err(`${label} starts with =, +, - or @ (spreadsheet formula risk)`);
    }

    // Price
    const priceCell = norm(pick(r, "price in ₦", "price_ngn"));
    let priceKobo: Kobo | null = null;
    if (priceCell === "") {
      issues.push({ row, level: "warning", message: "No price yet: will be saved as a draft and cannot be published" });
    } else {
      const p = parseNairaToKobo(priceCell);
      if (p.ok) priceKobo = p.kobo; else err(`Price: ${p.error}`);
    }

    // Status: import never publishes unless the file says so AND a price exists.
    const statusCell = norm(r["status"]).toLowerCase();
    let status: ItemStatus = "draft";
    if (statusCell !== "") {
      if (statusCell === "draft" || statusCell === "published" || statusCell === "archived") status = statusCell;
      else err(`Status "${statusCell}" must be draft, published or archived`);
    }
    if (status === "published" && priceKobo === null) err("Cannot publish an item that has no price");

    const available = parseBool(r["available"], true);
    if (available === null) err(`available "${norm(r["available"])}" must be true/false or yes/no`);
    const featured = parseBool(r["featured"], false);
    if (featured === null) err(`featured "${norm(r["featured"])}" must be true/false or yes/no`);

    let sort_order = 0;
    const sortCell = norm(r["sort_order"]);
    if (sortCell !== "") {
      if (/^\d{1,6}$/.test(sortCell)) sort_order = parseInt(sortCell, 10);
      else err(`sort_order "${sortCell}" must be a whole number 0 or more`);
    }

    const allergens: string[] = [];
    for (const a of norm(r["allergens"]).split(",").map((x) => x.trim()).filter(Boolean)) {
      if (a.length > LIMITS.allergen) err(`Allergen "${a.slice(0, 20)}..." is longer than ${LIMITS.allergen} characters`);
      else if (!allergens.some((x) => x.toLowerCase() === a.toLowerCase())) allergens.push(a);
    }

    const extras = parseExtras(norm(r["extras"]), row, issues);

    // Duplicates
    const key = name && category ? slugKey(category, name) : "";
    if (key) {
      const dup = seenKeys.get(key);
      if (dup !== undefined) err(`Duplicate of row ${dup} (same dish in same category)`);
      else seenKeys.set(key, row);
    }
    if (sku) {
      const dup = seenSkus.get(sku.toLowerCase());
      if (dup !== undefined) err(`SKU "${sku}" is already used on row ${dup}`);
      else seenSkus.set(sku.toLowerCase(), row);
    }

    const rowHasError = issues.slice(before).some((x) => x.level === "error");
    if (!rowHasError) {
      items.push({
        key: sku ? sku.toLowerCase() : key,
        category, name, description, priceKobo, portion_label: portion, allergens,
        status, is_available: available ?? true, is_featured: featured ?? false, sort_order, extras,
      });
    }
  });

  return finish();
}
