-- 0001_menu_core.sql
-- Profiles and editable menu. Money is bigint kobo only.
-- Run order: 0001 menu, 0002 orders, 0003 audit and settings, 0004 policy acceptance.

create type user_role as enum ('owner', 'staff', 'developer');

create table profiles (
  id uuid primary key,
  role user_role not null default 'staff',
  is_active boolean not null default true,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order int not null default 0,
  is_visible boolean not null default true,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
-- Archived categories free their name.
create unique index menu_categories_name_uq on menu_categories (lower(btrim(name))) where status <> 'archived';

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  category_id uuid not null references menu_categories(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- NULL when archived, so the unique index below ignores archived rows and frees the name.
  active_name text generated always as (case when status <> 'archived' then lower(btrim(name)) else null end) stored,
  description text check (char_length(description) <= 500),
  price_kobo bigint check (price_kobo is null or (price_kobo > 0 and price_kobo <= 10000000000)),
  portion text,
  allergens text[] not null default '{}',
  image_path text,
  image_alt text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_available boolean not null default true,
  sold_out_until timestamptz,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  version int not null default 1,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  constraint published_needs_price check (status <> 'published' or price_kobo is not null)
);
create unique index menu_items_cat_name_uq on menu_items (category_id, active_name);

create table menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references menu_items(id) on delete cascade,
  name text not null,
  min_select int not null default 0,
  max_select int not null default 1,
  check (max_select >= min_select)
);

create table menu_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references menu_option_groups(id) on delete cascade,
  name text not null,
  price_delta_kobo bigint not null default 0 check (price_delta_kobo >= 0),
  is_available boolean not null default true,
  sort_order int not null default 0
);

create table menu_item_versions (
  id bigint generated always as identity primary key,
  item_id uuid not null references menu_items(id) on delete restrict,
  version int not null,
  snapshot jsonb not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  unique (item_id, version)
);

-- Optimistic locking: an update must present the current version; the trigger bumps it.
create or replace function bump_version() returns trigger language plpgsql as $$
begin
  if new.version is distinct from old.version then
    raise exception 'stale version' using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create trigger menu_categories_ver before update on menu_categories for each row execute function bump_version();
create trigger menu_items_ver before update on menu_items for each row execute function bump_version();

-- Row level security. EVERY table is enabled; tables without a policy are server-only (service role).
alter table profiles enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table menu_option_groups enable row level security;
alter table menu_options enable row level security;
alter table menu_item_versions enable row level security;

-- A signed-in user can read only their own profile.
create policy profiles_self_read on profiles for select using (id = auth.uid());

-- Public (anon) may read published, visible, available menu only.
create policy menu_categories_public_read on menu_categories for select
  using (is_visible = true and status = 'published');
create policy menu_items_public_read on menu_items for select
  using (status = 'published' and is_available = true and
         exists (select 1 from menu_categories c where c.id = category_id and c.is_visible = true and c.status = 'published'));
