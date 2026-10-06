import { InstallPrompt } from "@/components/InstallPrompt";

// Wraps the whole customer app (sign-in included), so the hint reaches first-time visitors.
export default function CustomerAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
