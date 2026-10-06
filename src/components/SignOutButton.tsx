"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client/api";

export function SignOutButton({ to }: { to: string }) {
  const router = useRouter();
  return (
    <button
      className="text-sm font-semibold text-muted hover:text-ink"
      onClick={async () => {
        await api("/api/auth/logout", {});
        router.replace(to);
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
