"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { useCart } from "@/lib/client/cart";
import { Spinner, useToast } from "@/components/ui";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import type { MenuProduct } from "@/lib/services/catalog";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const cart = useCart();
  const toast = useToast();
  const [product, setProduct] = useState<MenuProduct | null | undefined>(undefined);

  useEffect(() => {
    api<{ products: MenuProduct[] }>("/api/menu").then((m) => setProduct(m.products.find((p) => p.id === Number(id)) ?? null));
  }, [id]);

  if (product === undefined) return <Spinner />;
  if (!product) return <p className="py-10 text-center text-muted">We couldn&apos;t find that item. <Link href="/app/menu" className="font-semibold text-brand">Back to menu</Link></p>;

  return (
    <div className="space-y-5">
      <Link href="/app/menu" className="text-sm font-semibold text-muted">← Menu</Link>
      <div className="grid place-items-center rounded-3xl bg-brand-soft py-10 text-7xl">{product.emoji}</div>
      <div>
        <h1 className="font-display text-3xl font-bold">{product.name}</h1>
        <p className="mt-1 text-muted">{product.description}</p>
      </div>
      {product.sold_out ? (
        <p className="rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">Sorry, this is sold out right now.</p>
      ) : (
        <ProductConfigurator
          product={product}
          onSubmit={(line) => {
            cart.add(line);
            toast(`${line.name} added to your cart`, "ok");
            router.push("/app/menu");
          }}
        />
      )}
    </div>
  );
}
