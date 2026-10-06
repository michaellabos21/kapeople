export interface Ingredient { id: number; name: string; unit: string }
export interface Category { id: number; name: string; sort: number }
export interface Addon {
  id: number; name: string; price: number; available: boolean;
  replaces_ingredient_id: number | null; replacement_ingredient_id: number | null;
  extras: { ingredient_id: number; qty: number }[];
}
export interface Variant { id: number; name: string; price_delta: number; recipe_multiplier: number; is_default: boolean }
export interface AdminProduct {
  id: number; category_id: number; name: string; description: string; base_price: number; emoji: string;
  available: boolean; archived: boolean; has_orders: boolean;
  variants: Variant[]; addon_ids: number[];
  recipe: { ingredient_id: number; qty: number; scales: boolean }[];
}
export interface MenuAdminData { categories: Category[]; products: AdminProduct[]; addons: Addon[]; ingredients: Ingredient[] }
