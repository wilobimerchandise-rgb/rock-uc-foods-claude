# ROCK UC FOODS

Next.js (App Router) + TypeScript + Tailwind + Supabase. Money is integer kobo (bigint) only.
Policy wording lives in `src/policy/content.ts` (bump `POLICY_VERSION` on any change).

## Run it
```bash
npm install
cp .env.example .env.local     # then fill in your Supabase values (never commit .env.local)
npm run typecheck              # must be clean
npm test                       # unit tests + the SQL migrations run in an in-memory Postgres (PGlite)
npm run menu:dryrun -- path/to/ROCK_UC_FOODS_Menu_Template.xlsx   # validates a menu file, saves nothing
npm run dev                    # http://localhost:3000
```

## Database
Apply `supabase/migrations/` in this order: `0001_menu_core`, `0002_orders_core`, `0003_audit_and_settings`, `0004_policy_acceptance`.
Row level security is on for every table. Visitors can read only published menu items and settings flagged `is_public`.
All writes go through server code using the service role after checking the signed-in user's role.

## Notes
- `next build` downloads Google Fonts, so it needs internet access.
- Open owner questions are in section 17.8 of the playbook.
