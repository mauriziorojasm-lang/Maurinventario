import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadSaleOptions } from "@/lib/options";
import { loadPrefs } from "@/lib/user-prefs";
import { SalesPrefsEditor } from "./sales-prefs-editor";

export const metadata: Metadata = { title: "Ventas e inventario" };

export default async function SalesSettings() {
  const user = await requireUser();
  const [prefs, opts] = await Promise.all([loadPrefs(), loadSaleOptions()]);
  return (
    <>
      <PageHeader title="Ventas e inventario" back={{ href: "/configuracion", label: "Ajustes" }} description="Valores que se rellenan solos para ir más rápido. Siempre los puedes cambiar en cada venta." />
      <SalesPrefsEditor initial={prefs.sales} platforms={opts.platforms.map((p) => ({ id: p.id, name: p.name }))} admin={user.role === "admin"} />
    </>
  );
}
