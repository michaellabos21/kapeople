-- Promo codes can be limited per customer; orders remember which promo code they used.
alter table promotions add column if not exists max_uses_per_customer int;
alter table orders add column if not exists promo_code text;
create index if not exists orders_promo_idx on orders (customer_id, promo_code);
-- The welcome offer is once per customer (runs once; later edits by an admin are not overwritten).
update promotions set max_uses_per_customer = 1 where upper(code) = 'WELCOME10' and max_uses_per_customer is null;

-- Generic short-lived event log used for IP-based throttling (signup, failed logins).
create table if not exists rate_events (
  id serial primary key,
  bucket text not null,
  key text not null,
  created_at timestamptz not null default now()
);
create index if not exists rate_events_idx on rate_events (bucket, key, created_at);
