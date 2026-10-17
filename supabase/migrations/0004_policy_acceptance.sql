-- 0004_policy_acceptance.sql
-- Records that a shopper ticked the Refund & Cancellation Policy before paying. Append-only.
-- Requires an orders(id uuid) table (created in 0002_orders_core.sql).

create table order_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete restrict,
  policy_version text not null check (char_length(policy_version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  unique (order_id, policy_version)
);

alter table order_policy_acceptances enable row level security;
-- No public policies: only the server (service role) inserts and reads.

create or replace function forbid_change() returns trigger language plpgsql as $$
begin raise exception 'append-only table'; end $$;

create trigger order_policy_acceptances_ro before update or delete on order_policy_acceptances
  for each row execute function forbid_change();
