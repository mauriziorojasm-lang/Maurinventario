import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { loadPrefs } from "@/lib/user-prefs";
import { TablesEditor } from "./tables-editor";

export const metadata: Metadata = { title: "Tablas" };

export default async function TablesSettings() {
  await requireAdmin();
  const prefs = await loadPrefs();
  return (
    <>
      <PageHeader
        title="Tablas"
        back={{ href: "/configuracion", label: "Ajustes" }}
        description="Columnas, orden y filas por página de las tablas de Ventas y Productos (en el ordenador). Ocultar una columna no borra ningún dato."
      />
      <TablesEditor initial={prefs.tables} />
    </>
  );
}
