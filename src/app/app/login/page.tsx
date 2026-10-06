import { currentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";

export default async function CustomerLogin() {
  const user = await currentUser();
  if (user?.role === "customer") redirect("/app");
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand">Kapeople</p>
      <h1 className="font-display mt-1 text-3xl font-bold">Your coffee, ready when you are.</h1>
      <AuthForm mode="customer" demo={process.env.NODE_ENV !== "production" ? "valerie@example.test" : undefined} />
    </main>
  );
}
