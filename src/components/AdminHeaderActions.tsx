"use client";
import { ToastProvider } from "./ui";
import { ChangePasswordButton } from "./ChangePasswordModal";

export function AdminHeaderActions() {
  return (
    <ToastProvider>
      <ChangePasswordButton />
    </ToastProvider>
  );
}
