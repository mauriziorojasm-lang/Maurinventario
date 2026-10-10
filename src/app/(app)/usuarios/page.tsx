import { redirect } from "next/navigation";

/** Los usuarios ahora se gestionan por organización en Equipo. */
export default function UsersPage() {
  redirect("/equipo");
}
