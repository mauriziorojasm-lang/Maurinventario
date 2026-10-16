import { redirect } from "next/navigation";

/** El panel de la plataforma se ha movido al panel de administración, separado de la app. */
export default function OldPlatformPage() {
  redirect("/admin");
}
