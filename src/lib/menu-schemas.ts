import { z } from "zod";

export const ProductBody = z.object({
  name: z.string().max(120),
  categoryId: z.number().int(),
  emoji: z.string().max(16).default("🍽️"),
  description: z.string().max(500).default(""),
  basePrice: z.number(),
  available: z.boolean().default(true),
  variants: z
    .array(z.object({ id: z.number().int().optional(), name: z.string().max(60), priceDelta: z.number(), recipeMultiplier: z.number(), isDefault: z.boolean() }))
    .max(12)
    .default([]),
  addonIds: z.array(z.number().int()).max(40).default([]),
  recipe: z.array(z.object({ ingredientId: z.number().int(), qty: z.number(), scales: z.boolean() })).max(40).default([]),
});

export const AddonBody = z.object({
  name: z.string().max(80),
  price: z.number(),
  available: z.boolean().default(true),
  replacesIngredientId: z.number().int().nullable().default(null),
  replacementIngredientId: z.number().int().nullable().default(null),
  extras: z.array(z.object({ ingredientId: z.number().int(), qty: z.number() })).max(20).default([]),
});
