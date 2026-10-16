import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { loadPrefs } from "@/lib/user-prefs";
import { TablesEditor } from "./tables-editor";

export const metadata: Metadata = { title: "Tablas" };

export default async function TablesSettings() {
  await requirePerm("costes");
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
