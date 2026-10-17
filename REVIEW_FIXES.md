# What was fixed in review (2026-10-17)

Blocking: tests failed (migration 0002 ran before the orders table existed); typecheck failed (11 errors in tests/sql.test.ts);
menu dry-run crashed on the real spreadsheet (column off-by-one); app could not build (`layout,tsx` and `,env.example` typos,
no globals.css, no page, no next/postcss config, tsconfig had no jsx); `scripts/a` was an empty stray file.

Security: audit_logs readable by everyone; profiles readable by everyone; business_settings (bank details) readable by everyone;
menu_item_versions had no row level security; items in unpublished categories were visible; audit_logs could be truncated.

Money and policy: price ceiling was 10x the database limit; draft items imported with price 0 (database rejects 0);
formatNaira used floating point; "we cancel" refund could exceed what was owed or not add up; failed-delivery 15 minute wait
was counted from order time instead of the first failed call; division by zero on a zero-value order.

Importer: row numbers were off by one; empty/invalid status, yes/no flags and sort order were silently accepted; no length limits;
errors said "Missing columns" for unrelated problems.

Other: next 14.2.3 upgraded to 14.2.35; Supabase server client could not set cookies; .gitignore ignored .env.example.
