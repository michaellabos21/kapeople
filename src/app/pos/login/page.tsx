import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { AuthForm } from "@/components/AuthForm";

export default async function StaffLogin() {
  const user = await currentUser();
  if (user && user.role !== "customer") redirect(user.role === "admin" ? "/admin" : "/pos");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand">Kapeople</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Staff sign in</h1>
      <AuthForm mode="staff" demo={process.env.NODE_ENV !== "production" ? "staff@kapeople.test or admin@kapeople.test" : undefined} />
    </main>
  );
}
