import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { PosShell } from "@/components/PosShell";

export const dynamic = "force-dynamic";

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user || user.role === "customer") redirect("/pos/login");
  return <PosShell name={user.name} role={user.role}>{children}</PosShell>;
}
