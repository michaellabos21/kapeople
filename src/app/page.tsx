import Link from "next/link";

const entries = [
  { href: "/app", title: "Customer app", body: "Browse the menu, order ahead, earn points.", emoji: "📱" },
  { href: "/pos", title: "POS", body: "Take sales, run the order queue, manage stock.", emoji: "🧾" },
  { href: "/admin", title: "Admin dashboard", body: "Sales, best sellers, low stock, customers.", emoji: "📊" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand">Kapeople</p>
      <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">Order, prepare, pick up — one system.</h1>
      <p className="mt-3 max-w-xl text-muted">
        The customer app and the POS share one backend, so an order placed on a phone shows up at the counter, updates
        inventory, and earns loyalty points without anyone re-typing it.
      </p>
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {entries.map((e) => (
          <Link key={e.href} href={e.href} className="card p-5 transition hover:-translate-y-0.5 hover:border-brand">
            <div className="text-3xl">{e.emoji}</div>
            <h2 className="mt-3 font-semibold">{e.title}</h2>
            <p className="mt-1 text-sm text-muted">{e.body}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
