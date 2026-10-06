-- Web Push: one row per browser/device subscription.
create table if not exists push_subscriptions (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failures int not null default 0,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- Notifications are pushed once; existing history is marked as already pushed (runs once).
alter table notifications add column if not exists pushed boolean not null default false;
update notifications set pushed = true;
