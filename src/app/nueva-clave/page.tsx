import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth-layout";
import { requireSession } from "@/lib/auth";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function NewPasswordPage() {
  const user = await requireSession();
  return (
    <AuthLayout title="Nueva contraseña" subtitle={`Para ${user.email}.`}>
      <NewPasswordForm />
    </AuthLayout>
  );
}
