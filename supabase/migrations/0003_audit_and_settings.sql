-- 0003_audit_and_settings.sql
-- Append-only audit log and business settings.

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  actor_role user_role,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip_hash text,
  created_at timestamptz not null default now()
);

revoke update, delete, truncate on table audit_logs from authenticated, anon, service_role;

create or replace function forbid_audit_change() returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only. Updates, deletes and truncates are forbidden.' using errcode = '42501';
end $$;

create trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function forbid_audit_change();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function forbid_audit_change();

alter table audit_logs enable row level security;
-- Only an active owner can read the audit log. Everyone else (including anon) sees nothing.
create policy audit_logs_owner_read on audit_logs for select using (
  exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'owner' and p.is_active)
);

-- Settings may hold private values (bank account for invoices, alert emails). Only rows flagged public are visible to visitors.
create table business_settings (
  key text primary key,
  value jsonb not null,
  is_public boolean not null default false,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

alter table business_settings enable row level security;
create policy business_settings_public_read on business_settings for select using (is_public = true);
