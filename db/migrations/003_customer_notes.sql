-- Internal notes about a customer (visible to admins only).
alter table users add column if not exists staff_notes text;
