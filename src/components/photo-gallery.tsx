"use client";
/**
 * Galería de fotos de un producto: carrusel (deslizar) o cuadrícula, con
 * visor a pantalla completa. Para el administrador: añadir varias fotos,
 * elegir portada, ordenar y borrar.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, GalleryHorizontal, ImagePlus, LayoutGrid, Star, Trash2, X } from "lucide-react";
import { deleteProductPhoto, reorderProductPhotos } from "@/app/(app)/productos/photo-actions";
import { createMissingThumb, uploadProductPhotos, type UploadProgress } from "./photo-upload";
import { Notice, clsx } from "./ui";

export type GalleryPhotoView = {
  id: string;
  url: string;
  thumb: string;
  path: string;
  needsThumb: boolean;
  width: number | null;
  height: number | null;
  usedOn: ("vinted" | "wallapop")[];
};

type View = "carrusel" | "cuadricula";
const VIEW_KEY = "mi:galeria:vista";

/** Imagen que aparece suavemente al cargar (sin saltos). */
export function FadeImg({ src, alt, className, eager }: { src: string; alt: string; className?: string; eager?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0 && !loaded) setLoaded(true);
      }}
      src={src}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      className={clsx("transition-[opacity,transform] duration-300 ease-out", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}

function UsedBadges({ on }: { on: ("vinted" | "wallapop")[] }) {
  if (!on.length) return null;
  return (
    <span className="pointer-events-none absolute left-1.5 top-1.5 flex gap-1">
      {on.includes("vinted") && <span className="rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">Vinted</span>}
      {on.includes("wallapop") && <span className="rounded-full bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur">Wallapop</span>}
    </span>
  );
}

export function PhotoGallery({
  productId,
  name,
  photos,
  editable,
  showUsed = false,
}: {
  productId: string;
  name: string;
  photos: GalleryPhotoView[];
  editable: boolean;
  showUsed?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("carrusel");
  const [order, setOrder] = useState(photos);
  const [viewer, setViewer] = useState<number | null>(null);
  const [uploading, setUploading] = useState<{ previews: string[]; progress: UploadProgress } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // La lista viene del servidor; se sincroniza cuando cambia
  const [lastPhotos, setLastPhotos] = useState(photos);
  if (lastPhotos !== photos) {
    setLastPhotos(photos);
    setOrder(photos);
  }

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preferencia guardada en este dispositivo
      if (v === "carrusel" || v === "cuadricula") setView(v);
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  // Fotos antiguas sin miniatura: el administrador se la crea al verlas (una vez)
  useEffect(() => {
    if (!editable) return;
    const missing = photos.filter((p) => p.needsThumb);
    if (!missing.length) return;
    let cancelled = false;
    (async () => {
      for (const p of missing) {
        if (cancelled) return;
        await createMissingThumb(p.url, p.path).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editable, photos]);

  function changeView(v: View) {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* sin almacenamiento */
    }
  }

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    setErrors([]);
    setMessage(null);
    const previews = files.map((f) => URL.createObjectURL(f));
    setUploading({ previews, progress: { done: 0, total: files.length, failed: [] } });
    const r = await uploadProductPhotos(productId, files, (p) => setUploading((u) => (u ? { ...u, progress: { ...p } } : u)));
    previews.forEach((p) => URL.revokeObjectURL(p));
    setUploading(null);
    setErrors(r.errors);
    if (r.saved) setMessage(r.saved === 1 ? "Foto guardada." : `${r.saved} fotos guardadas.`);
    startTransition(() => router.refresh());
  }

  function move(id: string, to: number) {
    const from = order.findIndex((p) => p.id === id);
    if (from < 0 || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    setOrder(next);
    startTransition(async () => {
      const r = await reorderProductPhotos(productId, next.map((p) => p.id));
      if (!r.ok) {
        setErrors([r.error]);
        router.refresh();
      }
    });
  }

  function remove(id: string) {
    setOrder((o) => o.filter((p) => p.id !== id));
    startTransition(async () => {
      const r = await deleteProductPhoto(id);
      if (!r.ok) {
        setErrors([r.error]);
        router.refresh();
      }
    });
  }

  const count = order.length;
  const addButton = editable && (
    <label
      className={clsx(
        "press inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-[13px] font-semibold text-on-brand shadow-[var(--shadow-card)]",
        uploading && "pointer-events-none opacity-60",
      )}
    >
      <ImagePlus size={16} strokeWidth={2.5} />
      {count ? "Añadir fotos" : "Subir fotos"}
      <input type="file" accept="image/*,.heic,.heif" multiple className="sr-only" disabled={!!uploading} onChange={(e) => (onFiles(e.target.files), (e.target.value = ""))} />
    </label>
  );

  return (
    <section aria-label="Fotos" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="display text-[19px] uppercase">Fotos</h2>
          {count > 0 && <span className="num text-[13px] text-muted">{count}</span>}
        </div>
        <div className="flex items-center gap-2">
          {count > 1 && (
            <div role="radiogroup" aria-label="Vista" className="flex rounded-full border border-line-strong bg-surface p-0.5">
              {(
                [
                  ["carrusel", GalleryHorizontal, "Carrusel"],
                  ["cuadricula", LayoutGrid, "Cuadrícula"],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  aria-label={label}
                  title={label}
                  onClick={() => changeView(v)}
                  className={clsx("press flex h-8 w-9 items-center justify-center rounded-full transition-colors", view === v ? "bg-ink text-paper" : "text-muted hover:text-ink")}
                >
                  <Icon size={17} strokeWidth={2.25} />
                </button>
              ))}
            </div>
          )}
          {addButton}
        </div>
      </div>

      {uploading && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-line bg-surface p-3" aria-live="polite">
          <p className="text-[13px] font-semibold">
            Subiendo {Math.min(uploading.progress.done + 1, uploading.progress.total)} de {uploading.progress.total}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/8">
            <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${(uploading.progress.done / uploading.progress.total) * 100}%` }} />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {uploading.previews.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={p} alt="" className={clsx("h-14 w-14 shrink-0 rounded-[8px] object-cover", i < uploading.progress.done ? "opacity-100" : "opacity-40")} />
            ))}
          </div>
        </div>
      )}
      {message && !uploading && <Notice tone="good">{message}</Notice>}
      {errors.length > 0 && (
        <Notice tone="bad" title="Alguna foto no se ha podido guardar">
          <ul className="list-disc pl-4">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </Notice>
      )}

      {count === 0 && !uploading ? (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[var(--radius-md)] border border-dashed border-line-strong bg-surface-2 text-sm text-muted">
          <ImagePlus size={28} className="text-faint" />
          Sin fotos
          {editable && <span className="max-w-[28ch] text-center text-[12.5px]">Puedes elegir varias a la vez. Las del iPhone (HEIC) se convierten solas.</span>}
        </div>
      ) : view === "carrusel" || count === 1 ? (
        <Carousel photos={order} name={name} onOpen={setViewer} showUsed={showUsed} />
      ) : (
        <Grid photos={order} name={name} editable={editable} showUsed={showUsed} onOpen={setViewer} onMove={move} onRemove={remove} />
      )}

      {editable && count > 1 && view === "carrusel" && <p className="text-[12px] text-faint">Para ordenar, elegir portada o borrar, cambia a la vista de cuadrícula.</p>}
      {editable && count === 1 && (
        <div className="flex justify-end">
          <DeleteButton onConfirm={() => remove(order[0].id)} />
        </div>
      )}

      {viewer !== null && <Lightbox photos={order} start={viewer} name={name} onClose={() => setViewer(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------------
// Carrusel: deslizar con el dedo, flechas en ordenador y miniaturas
// ---------------------------------------------------------------------
function Carousel({ photos, name, onOpen, showUsed }: { photos: GalleryPhotoView[]; name: string; onOpen: (i: number) => void; showUsed: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    setIndex((prev) => (prev === i ? prev : i));
  }, []);

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="group relative overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-2">
        <div
          ref={track}
          onScroll={onScroll}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth"
          tabIndex={0}
          aria-roledescription="carrusel"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(index + 1);
            if (e.key === "ArrowLeft") go(index - 1);
          }}
        >
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(i)}
              className="relative aspect-square w-full shrink-0 snap-center snap-always"
              aria-label={`Ver foto ${i + 1} de ${photos.length} en grande`}
            >
              <FadeImg src={p.url} alt={`${name} · foto ${i + 1}`} eager={i < 2} className="h-full w-full object-contain" />
              {showUsed && <UsedBadges on={p.usedOn} />}
            </button>
          ))}
        </div>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 disabled:!opacity-0 sm:flex"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === photos.length - 1}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 disabled:!opacity-0 sm:flex"
            >
              <ChevronRight size={20} />
            </button>
            <span className="num pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11.5px] font-semibold text-white backdrop-blur">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </div>
      {photos.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Ir a la foto ${i + 1}`}
              aria-current={i === index}
              className={clsx(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-[8px] border-2 transition-[border-color,opacity] duration-200",
                i === index ? "border-brand opacity-100" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              <FadeImg src={p.thumb} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Cuadrícula (con controles para ordenar, portada y borrar)
// ---------------------------------------------------------------------
function Grid({
  photos,
  name,
  editable,
  showUsed,
  onOpen,
  onMove,
  onRemove,
}: {
  photos: GalleryPhotoView[];
  name: string;
  editable: boolean;
  showUsed: boolean;
  onOpen: (i: number) => void;
  onMove: (id: string, to: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1.5">
      {photos.map((p, i) => (
        <li key={p.id} className="group relative aspect-square animate-fade overflow-hidden rounded-[10px] border border-line bg-surface-2">
          <button type="button" onClick={() => onOpen(i)} className="block h-full w-full" aria-label={`Ver foto ${i + 1} en grande`}>
            <FadeImg src={p.thumb} alt={`${name} · foto ${i + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          </button>
          {showUsed && <UsedBadges on={p.usedOn} />}
          {i === 0 && (
            <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-on-brand">Portada</span>
          )}
          {editable && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1 pt-4">
              <div className="flex gap-0.5">
                <TileButton label="Mover a la izquierda" disabled={i === 0} onClick={() => onMove(p.id, i - 1)}>
                  <ChevronLeft size={16} />
                </TileButton>
                <TileButton label="Mover a la derecha" disabled={i === photos.length - 1} onClick={() => onMove(p.id, i + 1)}>
                  <ChevronRight size={16} />
                </TileButton>
              </div>
              <div className="flex gap-0.5">
                {i > 0 && (
                  <TileButton label="Usar como portada" onClick={() => onMove(p.id, 0)}>
                    <Star size={15} />
                  </TileButton>
                )}
                <DeleteButton compact onConfirm={() => onRemove(p.id)} />
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function TileButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="press relative flex h-8 w-8 items-center justify-center rounded-full text-white after:absolute after:-inset-1.5 after:content-[''] hover:bg-white/20 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Borrar con doble toque (el primero pide confirmación durante 3 s). */
function DeleteButton({ onConfirm, compact }: { onConfirm: () => void; compact?: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      aria-label={armed ? "Pulsa otra vez para borrar" : "Borrar foto"}
      title={armed ? "Pulsa otra vez para borrar" : "Borrar foto"}
      className={clsx(
        "press flex h-8 items-center justify-center gap-1 rounded-full text-[12px] font-semibold transition-colors",
        armed ? "bg-danger px-2.5 text-white" : compact ? "w-8 text-white hover:bg-white/20" : "border border-line-strong px-3 text-danger",
      )}
    >
      <Trash2 size={15} />
      {(armed || !compact) && (armed ? "¿Borrar?" : "Borrar foto")}
    </button>
  );
}

// ---------------------------------------------------------------------
// Visor a pantalla completa
// ---------------------------------------------------------------------
function Lightbox({ photos, start, name, onClose }: { photos: GalleryPhotoView[]; start: number; name: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);
  const [closing, setClosing] = useState(false);
  // Se cierra con un fundido corto (sin movimiento si el sistema lo pide)
  function close() {
    if (closing) return;
    setClosing(true);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(onClose, reduce ? 0 : 180);
  }

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const el = track.current;
    if (el) el.scrollTo({ left: start * el.clientWidth, behavior: "instant" as ScrollBehavior });
  }, [start]);

  function go(i: number) {
    const el = track.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        if (e.key === "ArrowLeft") go(index - 1);
      }}
      className="mi-lightbox m-0 h-[100dvh] max-h-none w-screen max-w-none bg-black p-0 text-white"
      aria-label={`Fotos de ${name}`}
    >
      <div className={clsx("relative flex h-full w-full flex-col transition-[opacity,transform] duration-200 ease-out", closing ? "scale-[0.98] opacity-0" : "animate-fade")}>
        <div
          ref={track}
          onScroll={() => {
            const el = track.current;
            if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
          }}
          className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-contain"
        >
          {photos.map((p, i) => (
            <div key={p.id} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center p-2 sm:p-8" onClick={(e) => e.target === e.currentTarget && close()}>
              <FadeImg src={p.url} alt={`${name} · foto ${i + 1}`} eager={Math.abs(i - start) < 2} className="max-h-full max-w-full select-none object-contain" />
            </div>
          ))}
        </div>
        <div className="safe-top pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-3">
          <span className="num rounded-full bg-white/10 px-2.5 py-1 text-[13px] font-semibold backdrop-blur">
            {index + 1} / {photos.length}
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="press pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20"
          >
            <X size={22} />
          </button>
        </div>
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-0 sm:flex"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === photos.length - 1}
              aria-label="Foto siguiente"
              className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/20 disabled:opacity-0 sm:flex"
            >
              <ChevronRight size={24} />
            </button>
            <div className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1.5 p-4">
              {photos.map((p, i) => (
                <span key={p.id} className={clsx("h-1.5 rounded-full transition-all duration-300", i === index ? "w-5 bg-white" : "w-1.5 bg-white/40")} />
              ))}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
