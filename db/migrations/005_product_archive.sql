-- Products that have been sold can't be deleted (order history refers to them); they are hidden instead.
alter table products add column if not exists archived boolean not null default false;
