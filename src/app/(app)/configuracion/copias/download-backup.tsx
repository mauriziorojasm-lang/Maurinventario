"use client";
import { DatabaseBackup } from "lucide-react";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";

/** Descarga la copia mostrando el progreso y el resultado (o el error). */
export function DownloadBackup() {
  const [state, setState] = useState<{ status: "idle" | "working" | "ok" | "error"; text?: string }>({ status: "idle" });
  async function download() {
    setState({ status: "working" });
    try {
      const res = await fetch("/api/copia-seguridad", { cache: "no-store" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setState({ status: "error", text: j?.error ?? "No se ha podido crear la copia." });
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "copia-maurinventario.json";
      const json = JSON.parse(await blob.text()) as { recuentos: Record<string, number> };
      const total = Object.values(json.recuentos).reduce((a, b) => a + b, 0);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setState({ status: "ok", text: `Copia creada: ${name} · ${Object.keys(json.recuentos).length} tablas, ${total.toLocaleString("es-ES")} registros, ${(blob.size / 1024 / 1024).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB. Guárdala en un lugar seguro.` });
    } catch {
      setState({ status: "error", text: "No se ha podido conectar. Comprueba la conexión y vuelve a intentarlo." });
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" onClick={download} disabled={state.status === "working"}>
        <DatabaseBackup size={18} /> {state.status === "working" ? "Creando la copia…" : "Crear y descargar copia"}
      </Button>
      {state.status === "ok" && <Notice tone="good">{state.text}</Notice>}
      {state.status === "error" && <Notice tone="bad">{state.text}</Notice>}
    </div>
  );
}
