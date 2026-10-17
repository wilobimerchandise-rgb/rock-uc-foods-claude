import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";

let db: PGlite;
const dir = new URL("../supabase/migrations/", import.meta.url);

// Supabase provides these roles and auth.uid() itself; a plain Postgres test database does not, so we stub them.
const SUPABASE_BOOTSTRAP = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
`;

async function fails(q: string): Promise<unknown> {
  try { await db.query(q); return undefined; } catch (e) { return e; }
}
async function one<T>(q: string): Promise<T> {
  const r = await db.query<T>(q);
  const row = r.rows[0];
  if (!row) throw new Error(`no row for: ${q}`);
  return row;
}
/** Run a query as a Supabase role (RLS applies), then switch back. */
async function asRole<T>(role: "anon" | "authenticated", sub: string | null, q: string): Promise<T[]> {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false);`);
  try { return (await db.query<T>(q)).rows; } finally { await db.exec("reset role;"); }
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_BOOTSTRAP);
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  expect(files).toEqual(["0001_menu_core.sql", "0002_orders_core.sql", "0003_audit_and_settings.sql", "0004_policy_acceptance.sql"]);
  for (const f of files) await db.exec(readFileSync(new URL(f, dir), "utf8")); // real migrations, in order, nothing stubbed
});

describe("menu schema", () => {
  it("draft without price is fine; publishing without price is blocked", async () => {
    const c = await one<{ id: string }>("insert into menu_categories(name) values ('Rice Meals') returning id");
    await db.query(`insert into menu_items(category_id, name) values ('${c.id}', 'Draft Item')`);
    expect(await fails("update menu_items set status='published' where name='Draft Item'")).toBeTruthy();
  });

  it.each(["0", "-1", "10000000001"])("rejects price_kobo %s", async (p) => {
    const c = await one<{ id: string }>("select id from menu_categories limit 1");
    expect(await fails(`insert into menu_items(category_id, name, price_kobo) values ('${c.id}', 'Bad ${p}', ${p})`)).toBeTruthy();
  });

  it("accepts the maximum price exactly (10,000,000,000 kobo = ₦100,000,000)", async () => {
    const c = await one<{ id: string }>("select id from menu_categories limit 1");
    await db.query(`insert into menu_items(category_id, name, price_kobo) values ('${c.id}', 'Max Price', 10000000000)`);
  });

  it("duplicate names in a category are blocked (case and spaces ignored); archiving frees the name", async () => {
    const c = await one<{ id: string }>("insert into menu_categories(name) values ('Dup Test') returning id");
    await db.query(`insert into menu_items(category_id, name) values ('${c.id}', 'Jollof')`);
    expect(await fails(`insert into menu_items(category_id, name) values ('${c.id}', '  JOLLOF ')`)).toBeTruthy();
    await db.query(`update menu_items set status='archived' where name='Jollof' and category_id='${c.id}'`);
    await db.query(`insert into menu_items(category_id, name) values ('${c.id}', 'Jollof')`); // name is free again
  });

  it("same dish name in a different category is fine", async () => {
    const c = await one<{ id: string }>("insert into menu_categories(name) values ('Other Cat') returning id");
    await db.query(`insert into menu_items(category_id, name) values ('${c.id}', 'Jollof')`);
  });

  it("duplicate category names are blocked; archiving a category frees the name", async () => {
    await db.query("insert into menu_categories(name) values ('Soups')");
    expect(await fails("insert into menu_categories(name) values (' soups ')")).toBeTruthy();
    await db.query("update menu_categories set status='archived' where name='Soups'");
    await db.query("insert into menu_categories(name) values ('Soups')");
  });

  it("optimistic locking: a stale version is rejected, the current version succeeds and bumps", async () => {
    const c = await one<{ id: string }>("select id from menu_categories limit 1");
    const r = await one<{ id: string; version: number }>(`insert into menu_items(category_id, name) values ('${c.id}', 'Lock Test') returning id, version`);
    await db.query(`update menu_items set portion='Large', version=${r.version} where id='${r.id}'`); // succeeds, version is now r.version+1
    expect(await fails(`update menu_items set portion='X', version=${r.version} where id='${r.id}'`)).toBeTruthy(); // stale now
    const after = await one<{ version: number }>(`select version from menu_items where id='${r.id}'`);
    expect(after.version).toBe(r.version + 1);
  });

  it("cannot hard-delete a category that has items", async () => {
    expect(await fails("delete from menu_categories")).toBeTruthy();
  });
});

describe("orders", () => {
  it("public_token is random, 64 hex chars, unique per order, and differs from the id", async () => {
    const a = await one<{ id: string; public_token: string }>("insert into orders(food_kobo) values (1000) returning id, public_token");
    const b = await one<{ public_token: string }>("insert into orders(food_kobo) values (1000) returning public_token");
    expect(a.public_token).toMatch(/^[0-9a-f]{64}$/);
    expect(a.public_token).not.toBe(b.public_token);
    expect(a.public_token).not.toContain(a.id.replace(/-/g, ""));
  });
  it("rejects negative money, bulk without an event date, and bad statuses", async () => {
    expect(await fails("insert into orders(food_kobo) values (-1)")).toBeTruthy();
    expect(await fails("insert into orders(food_kobo, order_class) values (1000, 'bulk')")).toBeTruthy();
    expect(await fails("insert into orders(food_kobo, order_status) values (1000, 'shipped')")).toBeTruthy();
    await db.query("insert into orders(food_kobo, order_class, event_at) values (1000, 'bulk', now() + interval '3 days')");
  });
  it("delivery fee may be null (not yet confirmed) but never negative", async () => {
    await db.query("insert into orders(food_kobo, delivery_fee_kobo) values (1000, null)");
    expect(await fails("insert into orders(food_kobo, delivery_fee_kobo) values (1000, -5)")).toBeTruthy();
  });
});

describe("policy acceptance", () => {
  it("one acceptance per order+version; duplicates, updates and deletes are all blocked", async () => {
    const o = await one<{ id: string }>("insert into orders(food_kobo) values (1000) returning id");
    await db.query(`insert into order_policy_acceptances(order_id, policy_version) values ('${o.id}', 'v1')`);
    expect(await fails(`insert into order_policy_acceptances(order_id, policy_version) values ('${o.id}', 'v1')`)).toBeTruthy();
    expect(await fails("update order_policy_acceptances set policy_version='v2'")).toBeTruthy();
    expect(await fails("delete from order_policy_acceptances")).toBeTruthy();
  });
});

describe("audit log and settings", () => {
  it("audit_logs is append-only: update, delete and truncate are all refused", async () => {
    await db.query("insert into audit_logs(action, entity) values ('menu.update', 'menu_items')");
    expect(await fails("update audit_logs set action='x'")).toBeTruthy();
    expect(await fails("delete from audit_logs")).toBeTruthy();
    expect(await fails("truncate audit_logs")).toBeTruthy();
  });
});

describe("row level security (what visitors can see)", () => {
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const staffId = "22222222-2222-2222-2222-222222222222";

  beforeAll(async () => {
    await db.query(`insert into profiles(id, role, full_name) values ('${ownerId}', 'owner', 'Owner'), ('${staffId}', 'staff', 'Staff')`);
    const c = await one<{ id: string }>("insert into menu_categories(name, status) values ('Public Cat', 'published') returning id");
    const hidden = await one<{ id: string }>("insert into menu_categories(name, status) values ('Hidden Cat', 'draft') returning id");
    await db.query(`insert into menu_items(category_id, name, price_kobo, status) values ('${c.id}', 'Visible Dish', 150000, 'published')`);
    await db.query(`insert into menu_items(category_id, name, price_kobo, status) values ('${c.id}', 'Draft Dish', 150000, 'draft')`);
    await db.query(`insert into menu_items(category_id, name, price_kobo, status) values ('${hidden.id}', 'In Hidden Cat', 150000, 'published')`);
    await db.query(`insert into menu_items(category_id, name, price_kobo, status, is_available) values ('${c.id}', 'Sold Out Dish', 150000, 'published', false)`);
    const item = await one<{ id: string }>("select id from menu_items where name='Visible Dish'");
    await db.query(`insert into menu_item_versions(item_id, version, snapshot) values ('${item.id}', 1, '{}')`);
    await db.query("insert into business_settings(key, value, is_public) values ('site_tagline', '\"Taste the Luxury\"', true), ('bank_account', '{\"number\":\"private\"}', false)");
  });

  it("visitors see only published, available dishes in published categories", async () => {
    const rows = await asRole<{ name: string }>("anon", null, "select name from menu_items order by name");
    expect(rows.map((r) => r.name)).toEqual(["Visible Dish"]);
  });
  it("visitors cannot read profiles, audit logs or menu version history", async () => {
    expect(await asRole("anon", null, "select * from profiles")).toHaveLength(0);
    expect(await asRole("anon", null, "select * from audit_logs")).toHaveLength(0);
    expect(await asRole("anon", null, "select * from menu_item_versions")).toHaveLength(0);
    expect(await asRole("anon", null, "select * from orders")).toHaveLength(0);
    expect(await asRole("anon", null, "select * from order_policy_acceptances")).toHaveLength(0);
  });
  it("visitors see only public settings (never the bank account)", async () => {
    const rows = await asRole<{ key: string }>("anon", null, "select key from business_settings");
    expect(rows.map((r) => r.key)).toEqual(["site_tagline"]);
  });
  it("a signed-in user reads only their own profile", async () => {
    const rows = await asRole<{ id: string }>("authenticated", staffId, "select id from profiles");
    expect(rows.map((r) => r.id)).toEqual([staffId]);
  });
  it("only an active owner can read the audit log; staff cannot", async () => {
    expect((await asRole("authenticated", ownerId, "select * from audit_logs")).length).toBeGreaterThan(0);
    expect(await asRole("authenticated", staffId, "select * from audit_logs")).toHaveLength(0);
  });
  it("a deactivated owner loses audit access", async () => {
    await db.query(`update profiles set is_active=false where id='${ownerId}'`);
    expect(await asRole("authenticated", ownerId, "select * from audit_logs")).toHaveLength(0);
    await db.query(`update profiles set is_active=true where id='${ownerId}'`);
  });
});
