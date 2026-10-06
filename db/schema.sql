-- Kapeople POS + Customer App — central schema (plain PostgreSQL, Supabase-compatible).
-- Money: numeric(12,2) pesos. Quantities: numeric(12,3).

create table branches (
  id serial primary key,
  name text not null
);

create table users (
  id serial primary key,
  role text not null check (role in ('customer','employee','admin')),
  name text not null,
  email text not null unique,
  phone text,
  password_hash text not null,
  branch_id int references branches(id),
  points_balance int not null default 0,   -- denormalised; audited by loyalty_transactions
  created_at timestamptz not null default now()
);

create table sessions (
  token text primary key,
  user_id int not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table categories (
  id serial primary key,
  name text not null,
  sort int not null default 0
);

create table products (
  id serial primary key,
  category_id int not null references categories(id),
  name text not null,
  description text not null default '',
  base_price numeric(12,2) not null check (base_price >= 0),
  emoji text not null default '☕',
  available boolean not null default true,   -- manual on/off switch
  sort int not null default 0
);

-- Variants = sizes. recipe_multiplier scales the product recipe.
create table product_variants (
  id serial primary key,
  product_id int not null references products(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  recipe_multiplier numeric(6,3) not null default 1,
  is_default boolean not null default false,
  sort int not null default 0
);

create table ingredients (
  id serial primary key,
  name text not null unique,
  unit text not null,
  current_qty numeric(12,3) not null default 0,
  low_stock_threshold numeric(12,3) not null default 0
);

create table addons (
  id serial primary key,
  name text not null,
  price numeric(12,2) not null default 0,
  -- Substitution add-ons (e.g. oat milk): usage of replaces_ingredient_id moves to replacement_ingredient_id.
  replaces_ingredient_id int references ingredients(id),
  replacement_ingredient_id int references ingredients(id),
  available boolean not null default true
);

create table product_addons (
  product_id int not null references products(id) on delete cascade,
  addon_id int not null references addons(id) on delete cascade,
  primary key (product_id, addon_id)
);

create table recipe_items (
  product_id int not null references products(id) on delete cascade,
  ingredient_id int not null references ingredients(id),
  qty numeric(12,4) not null check (qty > 0),
  scales boolean not null default true,   -- false for e.g. cups: does not scale with size
  primary key (product_id, ingredient_id)
);

create table addon_recipe_items (
  addon_id int not null references addons(id) on delete cascade,
  ingredient_id int not null references ingredients(id),
  qty numeric(12,4) not null check (qty > 0),
  primary key (addon_id, ingredient_id)
);

create table promotions (
  id serial primary key,
  code text unique,
  title text not null,
  description text not null default '',
  kind text not null check (kind in ('percent','amount')),
  value numeric(12,2) not null,
  min_spend numeric(12,2) not null default 0,
  active boolean not null default true
);

create table rewards (
  id serial primary key,
  name text not null,
  points_cost int not null check (points_cost > 0),
  discount_amount numeric(12,2) not null check (discount_amount > 0),
  active boolean not null default true
);

create table orders (
  id serial primary key,
  order_number int not null unique,   -- gapless; assigned under an advisory lock in createOrder
  branch_id int not null references branches(id),
  customer_id int references users(id),
  created_by int references users(id),
  source text not null check (source in ('app','pos')),
  status text not null default 'new'
    check (status in ('new','accepted','preparing','ready','completed','cancelled','refunded')),
  payment_method text not null check (payment_method in ('cash','gcash','card')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),
  subtotal numeric(12,2) not null,
  discount numeric(12,2) not null default 0,       -- promo / manual discount
  discount_label text,
  reward_discount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  points_redeemed int not null default 0,
  points_earned int not null default 0,
  ingredient_usage jsonb not null default '{}',     -- {ingredientId: qty}, frozen at order time
  inventory_deducted boolean not null default false,
  notes text,
  cancel_reason text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz
);
create index orders_status_idx on orders(status);
create index orders_customer_idx on orders(customer_id);
create index orders_created_idx on orders(created_at);

create table order_items (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  product_id int not null references products(id),
  name text not null,
  variant_name text,
  addons jsonb not null default '[]',               -- [{id,name,price}]
  unit_price numeric(12,2) not null,
  qty int not null check (qty > 0),
  line_total numeric(12,2) not null,
  notes text
);

create table payments (
  id serial primary key,
  order_id int not null references orders(id) on delete cascade,
  kind text not null check (kind in ('payment','refund')),
  method text not null,
  amount numeric(12,2) not null,
  tendered numeric(12,2),
  change_given numeric(12,2),
  reference text,
  created_by int references users(id),
  created_at timestamptz not null default now()
);

create table stock_movements (
  id serial primary key,
  ingredient_id int not null references ingredients(id),
  type text not null check (type in ('stock_in','stock_out','adjustment','waste','sale','refund_return')),
  qty_change numeric(12,3) not null,
  balance_after numeric(12,3) not null,
  note text,
  order_id int references orders(id),
  created_by int references users(id),
  created_at timestamptz not null default now()
);

create table loyalty_transactions (
  id serial primary key,
  customer_id int not null references users(id),
  order_id int references orders(id),
  type text not null check (type in ('earn','redeem','redeem_return','reverse','adjust')),
  points int not null,
  balance_after int not null,
  note text,
  created_at timestamptz not null default now()
);
create index loyalty_customer_idx on loyalty_transactions(customer_id);

create table notifications (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  title text not null,
  body text not null default '',
  order_id int references orders(id),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, read);
