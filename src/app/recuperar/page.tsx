import type { Metadata } from "next";
import Link from "next/link";
import { AuthLayout } from "@/components/auth-layout";
import { RecoverForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace para elegir una nueva.">
      <RecoverForm />
      <p className="mt-6 text-sm">
        <Link href="/login" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
          Volver a entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
