-- 0002_orders_core.sql
-- Minimal orders table so later migrations can reference it. The ordering phase extends it (items, payments, invoices).
-- public_token is the ONLY thing a guest uses to open their order: random, never the sequential ID or the human ref.

create table orders (
  id uuid primary key default gen_random_uuid(),
  public_token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  ref text unique,
  order_class text not null default 'fresh' check (order_class in ('fresh', 'bulk')),
  order_status text not null default 'pending'
    check (order_status in ('pending', 'confirmed', 'cooking', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'expired')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'deposit_paid', 'paid_in_full', 'refund_pending', 'refunded')),
  food_kobo bigint not null check (food_kobo >= 0),
  delivery_fee_kobo bigint check (delivery_fee_kobo is null or delivery_fee_kobo >= 0), -- null until staff confirm
  event_at timestamptz,
  cooking_started_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bulk_needs_event_date check (order_class <> 'bulk' or event_at is not null)
);

-- Server-only for now: no public policy. Guests are served by server code that looks up public_token.
alter table orders enable row level security;
