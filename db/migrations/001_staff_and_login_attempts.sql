-- Idempotent upgrades applied on every start (safe to re-run). Keeps existing databases in step with the app.

-- Staff can be deactivated without deleting their history.
alter table users add column if not exists active boolean not null default true;

-- Failed-login tracking for temporary lockouts (works across serverless instances).
create table if not exists login_attempts (
  id serial primary key,
  email text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_email_idx on login_attempts (email, created_at);
