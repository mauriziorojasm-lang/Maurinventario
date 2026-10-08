"use client";
/**
 * Botón «Ver etiqueta»: abre la etiqueta de envío dentro de la app, en una
 * ventana encima de la página, sin salir de MaurInventario. El enlace ya
 * viene preparado del servidor, así que se abre al instante.
 */
import { useState } from "react";
import { Button, buttonClass } from "./ui";
import { Modal } from "./ui-client";

export function labelFileName(path: string) {
  return (path.split("/").pop() ?? path).replace(/^\d+-/, "");
}

export function LabelButton({
  url,
  path,
  title,
  size = "md",
  variant = "secondary",
}: {
  url: string | null | undefined;
  path: string;
  title?: string;
  size?: "sm" | "md";
  variant?: "secondary" | "primary";
}) {
  const [open, setOpen] = useState(false);
  const isPdf = /\.pdf$/i.test(path);
  if (!url) {
    return <span className="text-xs text-danger">No se puede abrir la etiqueta. Recarga la página.</span>;
  }
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        Ver etiqueta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={title ?? "Etiqueta de envío"}
        footer={
          <>
            <a className={buttonClass("secondary")} href={url} target="_blank" rel="noopener noreferrer">
              Abrir aparte
            </a>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Cerrar
            </Button>
          </>
        }
      >
        {isPdf ? (
          <iframe src={url} title="Etiqueta de envío" className="h-[70vh] w-full rounded border border-line bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- enlace temporal de Supabase, no se optimiza
          <img src={url} alt="Etiqueta de envío" className="mx-auto max-h-[70vh] w-auto rounded border border-line bg-white object-contain" />
        )}
        <p className="mt-2 text-xs text-muted">{labelFileName(path)}</p>
      </Modal>
    </>
  );
}
