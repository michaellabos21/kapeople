import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role !== "admin") redirect("/pos/login");
  return (
    <div className="min-h-dvh">
      <header className="flex items-center gap-4 border-b border-line bg-card px-5 py-3">
        <span className="font-display text-lg font-bold">Kapeople <span className="text-sm font-semibold text-brand">Admin</span></span>
        <span className="flex-1" />
        <Link href="/pos" className="text-sm font-semibold text-brand">Open POS</Link>
        <span className="text-sm text-muted">{user.name}</span>
        <SignOutButton to="/pos/login" />
      </header>
      <main className="mx-auto max-w-6xl p-5">{children}</main>
    </div>
  );
}
