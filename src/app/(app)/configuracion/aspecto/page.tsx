import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { loadPrefs } from "@/lib/user-prefs";
import { AppearanceEditor } from "./appearance-editor";

export const metadata: Metadata = { title: "Personalizar aspecto" };

export default async function AppearanceSettings() {
  await requireUser();
  const prefs = await loadPrefs();
  return (
    <>
      <PageHeader title="Personalizar aspecto" back={{ href: "/configuracion", label: "Ajustes" }} description="Los cambios se ven al momento; pulsa «Guardar cambios» para conservarlos en todos tus dispositivos." />
      <AppearanceEditor initial={prefs.appearance} />
    </>
  );
}
