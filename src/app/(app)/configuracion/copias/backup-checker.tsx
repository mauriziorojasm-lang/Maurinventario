"use client";
import { useState } from "react";
import { Notice, Table, Td, Th, Tr } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { currentCounts } from "./actions";

type Check = { generated: string; by: string; counts: Record<string, number>; now: Record<string, number> };

/** Lee el archivo en el dispositivo, comprueba que es una copia válida y lo compara con los datos actuales. */
export function BackupChecker() {
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    setCheck(null);
    setError(null);
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) return setError("El archivo es demasiado grande para ser una copia de MaurInventario.");
    setBusy(true);
    try {
      let j: { formato?: string; version?: number; generado?: string; generado_por?: string; recuentos?: Record<string, number>; tablas?: Record<string, unknown[]> };
      try {
        j = JSON.parse(await f.text());
      } catch {
        return setError("Este archivo no es una copia válida (no se puede leer).");
      }
      if (j.formato !== "maurinventario-copia" || typeof j.version !== "number" || !j.tablas || !j.recuentos) {
        return setError("Este archivo no es una copia de seguridad de MaurInventario.");
      }
      if (j.version > 1) return setError("Esta copia es de una versión más nueva de la app.");
      // Los recuentos deben cuadrar con las filas que trae
      for (const [t, n] of Object.entries(j.recuentos)) {
        if (!Array.isArray(j.tablas[t]) || j.tablas[t].length !== n) return setError(`La copia está dañada: la tabla «${t}» no está completa.`);
      }
      const now = await currentCounts(`${f.name} (${j.generado ?? "sin fecha"})`);
      if (!now.ok) return setError(now.error);
      setCheck({ generated: j.generado ?? "", by: j.generado_por ?? "", counts: j.recuentos, now: now.data ?? {} });
    } finally {
      setBusy(false);
    }
  }

  const diffs = check ? Object.keys({ ...check.counts, ...check.now }).filter((t) => (check.counts[t] ?? 0) !== (check.now[t] ?? 0)) : [];
  return (
    <div className="flex flex-col gap-3">
      <input
        type="file"
        accept="application/json,.json"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-[var(--radius-sm)] file:border file:border-line-strong file:bg-surface file:px-3 file:font-semibold"
        aria-label="Archivo de copia de seguridad"
      />
      {busy && <p className="text-sm text-muted">Comprobando…</p>}
      {error && <Notice tone="bad">{error}</Notice>}
      {check && (
        <>
          <Notice tone={diffs.length ? "warn" : "good"} title="Copia válida y completa">
            Creada el {dateTime(check.generated)}
            {check.by ? ` por ${check.by}` : ""}.{" "}
            {diffs.length ? `${diffs.length} tablas tienen hoy un número de registros distinto (es normal si has trabajado después).` : "Coincide con los datos actuales."}
          </Notice>
          <div className="max-h-80 overflow-auto rounded-[var(--radius-sm)] border border-line">
            <Table>
              <thead>
                <tr>
                  <Th>Tabla</Th>
                  <Th num>En la copia</Th>
                  <Th num>Ahora</Th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(check.counts).map((t) => (
                  <Tr key={t}>
                    <Td>{t}</Td>
                    <Td num>{check.counts[t].toLocaleString("es-ES")}</Td>
                    <Td num className={(check.now[t] ?? 0) !== check.counts[t] ? "font-semibold text-warn" : undefined}>
                      {(check.now[t] ?? 0).toLocaleString("es-ES")}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
