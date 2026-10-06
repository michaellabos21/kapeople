-- Catalog seed (demo data). Users are created by src/lib/seed.ts so passwords get hashed.
insert into branches (id, name) values (1, 'Kapeople — Main Branch');

insert into categories (id, name, sort) values
  (1,'Coffee',1),(2,'Non-Coffee',2),(3,'Pastries',3),(4,'Meals',4);

insert into ingredients (id, name, unit, current_qty, low_stock_threshold) values
  (1,'Coffee Beans','kg',4.2,2),
  (2,'Fresh Milk','L',12,5),
  (3,'Oat Milk','L',6,2),
  (4,'Ice','kg',20,5),
  (5,'Condensed Milk','L',3,1),
  (6,'Matcha Powder','kg',0.8,0.3),
  (7,'Chocolate Syrup','L',2.5,1),
  (8,'Caramel Syrup','L',2,0.8),
  (9,'Cups','pcs',200,50),
  (10,'Croissants','pcs',18,6),
  (11,'Cookies','pcs',24,8),
  (12,'Banana Bread','slices',14,5),
  (13,'Sandwich Bread','pcs',20,8),
  (14,'Chicken Fillet','pcs',12,5),
  (15,'Tuna Mix','kg',1.5,0.5),
  (16,'Pasta','kg',3,1),
  (17,'Pesto Sauce','L',1.5,0.5);

insert into products (id, category_id, name, description, base_price, emoji, sort) values
  (1,1,'Iced Latte','Double espresso over cold milk and ice.',120,'🧊',1),
  (2,1,'Iced Spanish Latte','Espresso, milk and sweet condensed milk.',140,'🥛',2),
  (3,1,'Cappuccino','Espresso with steamed milk and thick foam.',110,'☕',3),
  (4,1,'Caramel Macchiato','Vanilla milk, espresso and caramel.',145,'🍮',4),
  (5,1,'Americano','Espresso with water. Bold and clean.',95,'🫖',5),
  (6,2,'Iced Matcha Latte','Ceremonial matcha with cold milk.',150,'🍵',1),
  (7,2,'Iced Chocolate','Rich chocolate with cold milk.',130,'🍫',2),
  (8,3,'Butter Croissant','Flaky, buttery, baked this morning.',95,'🥐',1),
  (9,3,'Chocolate Chip Cookie','Soft-baked with dark chocolate chunks.',75,'🍪',2),
  (10,3,'Banana Bread','Moist banana loaf, sliced thick.',85,'🍞',3),
  (11,4,'Chicken Sandwich','Crispy chicken, lettuce and house mayo.',185,'🥪',1),
  (12,4,'Tuna Melt','Toasted tuna and melted cheese.',165,'🧀',2),
  (13,4,'Pesto Pasta','Basil pesto pasta, parmesan on top.',210,'🍝',3);

-- Sizes for drinks 1-7 (price_delta relative to base_price = Tall)
insert into product_variants (product_id, name, price_delta, recipe_multiplier, is_default, sort) values
  (1,'Tall',0,0.8,false,1),(1,'Grande',20,1,true,2),(1,'Venti',40,1.25,false,3),
  (2,'Tall',0,0.8,false,1),(2,'Grande',10,1,true,2),(2,'Venti',25,1.25,false,3),
  (3,'Tall',0,0.8,false,1),(3,'Grande',20,1,true,2),
  (4,'Tall',0,0.8,false,1),(4,'Grande',20,1,true,2),(4,'Venti',40,1.25,false,3),
  (5,'Tall',0,0.8,false,1),(5,'Grande',15,1,true,2),(5,'Venti',30,1.25,false,3),
  (6,'Tall',0,0.8,false,1),(6,'Grande',20,1,true,2),(6,'Venti',40,1.25,false,3),
  (7,'Tall',0,0.8,false,1),(7,'Grande',20,1,true,2),(7,'Venti',40,1.25,false,3);

-- Recipes are for a Grande (multiplier 1). scales=false means qty does not change with size.
insert into recipe_items (product_id, ingredient_id, qty, scales) values
  (1,1,0.018,true),(1,2,0.2,true),(1,4,0.15,true),(1,9,1,false),
  (2,1,0.018,true),(2,2,0.15,true),(2,5,0.04,true),(2,4,0.15,true),(2,9,1,false),
  (3,1,0.018,true),(3,2,0.2,true),(3,9,1,false),
  (4,1,0.018,true),(4,2,0.2,true),(4,8,0.03,true),(4,4,0.15,true),(4,9,1,false),
  (5,1,0.018,true),(5,4,0.15,true),(5,9,1,false),
  (6,6,0.01,true),(6,2,0.2,true),(6,4,0.15,true),(6,9,1,false),
  (7,7,0.04,true),(7,2,0.2,true),(7,4,0.15,true),(7,9,1,false),
  (8,10,1,false),
  (9,11,1,false),
  (10,12,1,false),
  (11,13,2,false),(11,14,1,false),
  (12,13,2,false),(12,15,0.08,false),
  (13,16,0.15,false),(13,17,0.05,false);

insert into addons (id, name, price, replaces_ingredient_id, replacement_ingredient_id) values
  (1,'Oat Milk',30,2,3),
  (2,'Extra Shot',25,null,null),
  (3,'Caramel Drizzle',15,null,null),
  (4,'Whipped Cream',20,null,null);

insert into addon_recipe_items (addon_id, ingredient_id, qty) values
  (2,1,0.009),
  (3,8,0.015);

insert into product_addons (product_id, addon_id) values
  (1,1),(1,2),(1,3),
  (2,1),(2,2),(2,3),
  (3,1),(3,2),
  (4,1),(4,2),(4,3),(4,4),
  (5,2),
  (6,1),(6,2),(6,4),
  (7,1),(7,4);

insert into promotions (code, title, description, kind, value, min_spend) values
  ('WELCOME10','Welcome treat','10% off your order of ₱150 or more.','percent',10,150),
  ('PASTRY30','₱30 off ₱300+','Treat the whole table. ₱30 off orders of ₱300 or more.','amount',30,300);

insert into rewards (name, points_cost, discount_amount) values
  ('₱50 off your order', 100, 50);

select setval('branches_id_seq',(select max(id) from branches));
select setval('categories_id_seq',(select max(id) from categories));
select setval('ingredients_id_seq',(select max(id) from ingredients));
select setval('products_id_seq',(select max(id) from products));
select setval('addons_id_seq',(select max(id) from addons));
