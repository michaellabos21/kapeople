import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { CustomerShell } from "@/components/CustomerShell";

export const dynamic = "force-dynamic";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role !== "customer") redirect("/app/login");
  return <CustomerShell name={user.name}>{children}</CustomerShell>;
}
