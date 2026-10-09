"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, Copy, Download, ExternalLink, Share2, Sparkles } from "lucide-react";
import { FadeImg, type GalleryPhotoView } from "@/components/photo-gallery";
import { Badge, Button, Field, Input, Notice, Select, Textarea, clsx } from "@/components/ui";
import { money } from "@/lib/format";
import { freshCopy } from "@/lib/image";
import { setPhotosUsed } from "../../photo-actions";
import { generateListingText, saveListing, setListingStatus, type ListingPlatform } from "../../../anuncios/actions";
import { CONDITIONS, TONES, type Tone } from "../../../descripciones/options";

export type ListingDraft = {
  platform: ListingPlatform;
  status: "borrador" | "publicado" | "retirado";
  title: string | null;
  description: string | null;
  price: number | null;
  url: string | null;
  published_at: string | null;
  removed_at: string | null;
};

export type PriceHistory = {
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  avg_days: number | null;
  by_platform: Record<string, { count: number; avg: number }>;
  recent: { date: string; price: number; platform: string }[];
  avg_cost: number | null;
};

const PLATFORM_NAME: Record<ListingPlatform, string> = { vinted: "Vinted", wallapop: "Wallapop" };

function Step({ n, title, children, aside }: { n: number; title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-md)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5">
          <span className="display flex h-7 w-7 items-center justify-center rounded-full bg-ink text-[16px] text-paper">{n}</span>
          <span className="display text-[20px] uppercase">{title}</span>
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function ListingStudio({
  productId,
  name,
  stock,
  avgCost,
  normalPrice,
  photos,
  listings,
  history,
  aiReady,
}: {
  productId: string;
  name: string;
  stock: number;
  avgCost: number | null;
  normalPrice: number | null;
  photos: GalleryPhotoView[];
  listings: Record<ListingPlatform, ListingDraft | null>;
  history: PriceHistory | null;
  aiReady: boolean;
}) {
  const [platform, setPlatform] = useState<ListingPlatform>("vinted");
  const cost = history?.avg_cost ?? avgCost;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        {stock === 0 && <Notice tone="warn">Este producto no tiene stock ahora mismo. Puedes preparar el anuncio igualmente.</Notice>}
        <PhotosStep productId={productId} name={name} photos={photos} />
        <TextStep
          key={platform}
          productId={productId}
          name={name}
          platform={platform}
          onPlatform={setPlatform}
          listings={listings}
          normalPrice={normalPrice}
          aiReady={aiReady}
          cost={cost}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <PriceHelp history={history} cost={cost} normalPrice={normalPrice} stock={stock} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// 1 · Fotos: elegir, guardar en el móvil y marcar dónde se han usado
// ---------------------------------------------------------------------
function PhotosStep({ productId, name, photos }: { productId: string; name: string; photos: GalleryPhotoView[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(photos.map((p) => p.id)));
  const [files, setFiles] = useState<File[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [askUsed, setAskUsed] = useState(false);
  const [, startTransition] = useTransition();

  const chosen = photos.filter((p) => selected.has(p.id));
  const slug = useMemo(
    () =>
      name
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase()
        .slice(0, 40) || "foto",
    [name],
  );

  function toggle(id: string) {
    setFiles(null);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function pick(ids: string[]) {
    setFiles(null);
    setSelected(new Set(ids));
  }

  /** Paso A: crea copias nuevas (JPG sin datos internos, con nombre y fecha nuevos). */
  async function prepare() {
    setError(null);
    setMessage(null);
    const out: File[] = [];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    for (let i = 0; i < chosen.length; i++) {
      setBusy(`Preparando ${i + 1} de ${chosen.length}…`);
      try {
        out.push(await freshCopy(chosen[i].url, `${slug}-${stamp}-${i + 1}.jpg`));
      } catch {
        setBusy(null);
        setError("No se ha podido preparar alguna foto. Recarga la página y vuelve a intentarlo.");
        return;
      }
    }
    setBusy(null);
    setFiles(out);
  }

  /** Paso B: compartir (iPhone: «Guardar imágenes») o descargar (ordenador). */
  async function save() {
    if (!files) return;
    setError(null);
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files })) {
      try {
        await nav.share({ files });
        setAskUsed(true);
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
      }
    }
    for (const f of files) {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    setMessage(`${files.length} ${files.length === 1 ? "foto descargada" : "fotos descargadas"}.`);
    setAskUsed(true);
  }

  function markUsed(p: ListingPlatform) {
    startTransition(async () => {
      const r = await setPhotosUsed(
        chosen.map((c) => c.id),
        p,
        true,
      );
      if (!r.ok) setError(r.error);
      else setMessage(r.message ?? null);
      setAskUsed(false);
      router.refresh();
    });
  }

  if (photos.length === 0) {
    return (
      <Step n={1} title="Fotos">
        <p className="text-sm text-muted">Este producto aún no tiene fotos.</p>
        <Link href={`/productos/${productId}`} className="mt-2 inline-block text-sm font-semibold text-brand-ink hover:underline">
          Subir fotos en la ficha del producto
        </Link>
      </Step>
    );
  }

  const unusedVinted = photos.filter((p) => !p.usedOn.includes("vinted")).map((p) => p.id);
  return (
    <Step
      n={1}
      title="Fotos"
      aside={
        <div className="flex flex-wrap gap-1.5 text-[12.5px]">
          <button type="button" className="press rounded-full border border-line-strong px-2.5 py-1 font-semibold" onClick={() => pick(photos.map((p) => p.id))}>
            Todas
          </button>
          <button type="button" className="press rounded-full border border-line-strong px-2.5 py-1 font-semibold" onClick={() => pick([])}>
            Ninguna
          </button>
          {unusedVinted.length > 0 && unusedVinted.length < photos.length && (
            <button type="button" className="press rounded-full border border-line-strong px-2.5 py-1 font-semibold" onClick={() => pick(unusedVinted)}>
              Sin usar en Vinted ({unusedVinted.length})
            </button>
          )}
        </div>
      }
    >
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {photos.map((p, i) => {
          const on = selected.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-pressed={on}
                aria-label={`Foto ${i + 1}${on ? ", elegida" : ""}`}
                className={clsx(
                  "relative block aspect-square w-full overflow-hidden rounded-[10px] border-2 transition-[border-color,transform] duration-200 active:scale-[0.97]",
                  on ? "border-brand" : "border-transparent",
                )}
              >
                <FadeImg src={p.url} alt="" className={clsx("h-full w-full object-cover transition-opacity duration-200", on ? "opacity-100" : "opacity-45")} />
                <span
                  className={clsx(
                    "absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                    on ? "border-brand bg-brand text-on-brand" : "border-white/90 bg-black/30",
                  )}
                >
                  {on && <Check size={14} strokeWidth={3} />}
                </span>
                {p.usedOn.length > 0 && (
                  <span className="absolute bottom-1 left-1 flex flex-wrap gap-0.5">
                    {p.usedOn.map((u) => (
                      <span key={u} className="rounded-full bg-black/65 px-1.5 py-0.5 text-[9.5px] font-bold text-white">
                        {u === "vinted" ? "Vinted" : "Wallapop"}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!files ? (
          <Button variant="primary" onClick={prepare} disabled={!chosen.length || !!busy}>
            <Download size={16} strokeWidth={2.5} />
            {busy ?? `Preparar ${chosen.length} ${chosen.length === 1 ? "foto" : "fotos"}`}
          </Button>
        ) : (
          <Button variant="primary" onClick={save}>
            <Share2 size={16} strokeWidth={2.5} />
            Guardar {files.length} en el móvil
          </Button>
        )}
        <span className="text-[12.5px] text-muted">Se crean copias nuevas en JPG, sin fecha, móvil ni ubicación dentro.</span>
      </div>
      {files && <p className="mt-2 text-[12.5px] text-muted">En el iPhone, en la hoja que se abre, toca «Guardar imágenes».</p>}

      {askUsed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] bg-ink/5 p-3 text-sm animate-fade">
          <span className="font-semibold">¿Dónde vas a usar estas fotos?</span>
          <Button size="sm" onClick={() => markUsed("vinted")}>
            Vinted
          </Button>
          <Button size="sm" onClick={() => markUsed("wallapop")}>
            Wallapop
          </Button>
          <button type="button" className="text-[13px] text-muted underline" onClick={() => setAskUsed(false)}>
            Ahora no
          </button>
        </div>
      )}
      {message && (
        <Notice tone="good" className="mt-3">
          {message}
        </Notice>
      )}
      {error && (
        <Notice tone="bad" className="mt-3">
          {error}
        </Notice>
      )}
      <p className="mt-3 text-[12px] text-faint">
        Las fotos marcadas como usadas en Vinted llevan la etiqueta «Vinted». Vinted puede detectar fotos repetidas aunque sean copias nuevas: si te las bloquea, usa
        fotos sin estrenar.
      </p>
    </Step>
  );
}

// ---------------------------------------------------------------------
// 2 · Texto, precio y estado del anuncio en cada plataforma
// ---------------------------------------------------------------------
function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      disabled={!text.trim()}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <Check size={15} strokeWidth={3} className="text-good" /> : <Copy size={15} />}
      {done ? "Copiado" : label}
    </Button>
  );
}

function StatusBadge({ l }: { l: ListingDraft | null }) {
  if (!l || l.status === "borrador") return <Badge tone="neutral">Sin publicar</Badge>;
  if (l.status === "publicado") return <Badge tone="good">Publicado</Badge>;
  return <Badge tone="warn">Retirado</Badge>;
}

function TextStep({
  productId,
  name,
  platform,
  onPlatform,
  listings,
  normalPrice,
  aiReady,
  cost,
}: {
  productId: string;
  name: string;
  platform: ListingPlatform;
  onPlatform: (p: ListingPlatform) => void;
  listings: Record<ListingPlatform, ListingDraft | null>;
  normalPrice: number | null;
  aiReady: boolean;
  cost: number | null;
}) {
  const router = useRouter();
  const l = listings[platform];
  const other: ListingPlatform = platform === "vinted" ? "wallapop" : "vinted";
  const o = listings[other];
  const [title, setTitle] = useState(l?.title ?? "");
  const [text, setText] = useState(l?.description ?? "");
  const [price, setPrice] = useState(l?.price != null ? String(l.price).replace(".", ",") : normalPrice != null ? String(normalPrice).replace(".", ",") : "");
  const [url, setUrl] = useState(l?.url ?? "");
  const [tone, setTone] = useState<Tone>("natural");
  const [condition, setCondition] = useState<string>("Nuevo, sin usar");
  const [features, setFeatures] = useState("");
  const [defects, setDefects] = useState("");
  const [hashtags, setHashtags] = useState(platform === "vinted");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [generating, setGenerating] = useState(false);

  const priceNum = price.trim() ? Number(price.replace(/\./g, "").replace(",", ".")) : null;
  const priceValid = priceNum === null || (Number.isFinite(priceNum) && priceNum >= 0);
  const dirty = title !== (l?.title ?? "") || text !== (l?.description ?? "") || url !== (l?.url ?? "") || (priceNum ?? null) !== (l?.price ?? null);

  function payload() {
    return { productId, platform, title, description: text, price: priceValid ? priceNum : null, url };
  }
  function save(then?: () => Promise<void>) {
    setError(null);
    setMessage(null);
    if (!priceValid) return setError("El precio no es válido.");
    startTransition(async () => {
      const r = await saveListing(payload());
      if (!r.ok) return setError(r.error);
      if (then) await then();
      else setMessage("Guardado.");
      router.refresh();
    });
  }
  function status(s: "publicado" | "retirado" | "borrador") {
    save(async () => {
      const r = await setListingStatus(productId, platform, s);
      if (!r.ok) setError(r.error);
      else setMessage(r.message ?? null);
    });
  }
  async function generate() {
    setError(null);
    setMessage(null);
    setGenerating(true);
    const r = await generateListingText({ productId, platform, tone, condition, features, defects, price: priceValid && priceNum ? String(priceNum) : "", hashtags });
    setGenerating(false);
    if (!r.ok || !r.data) return setError(r.ok ? "No se ha podido generar." : r.error);
    setTitle(r.data.title);
    setText(r.data.text);
    setMessage("Texto generado. Revísalo y pulsa «Guardar».");
  }

  return (
    <Step
      n={2}
      title="Texto y publicación"
      aside={
        <div role="tablist" className="flex rounded-full border border-line-strong bg-surface p-0.5 text-[13px] font-semibold">
          {(["vinted", "wallapop"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={platform === p}
              onClick={() => onPlatform(p)}
              className={clsx("press flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors", platform === p ? "bg-ink text-paper" : "text-ink-soft")}
            >
              {PLATFORM_NAME[p]}
              {listings[p]?.status === "publicado" && <span className="h-1.5 w-1.5 rounded-full bg-good" aria-label="publicado" />}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge l={l} />
        {l?.status === "publicado" && l.published_at && <span className="text-[12.5px] text-muted">desde el {new Date(l.published_at).toLocaleDateString("es-ES")}</span>}
        {l?.url && (
          <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-ink hover:underline">
            Abrir anuncio <ExternalLink size={13} />
          </a>
        )}
      </div>

      {aiReady && (
        <details className="mb-3 rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3 [&_summary::-webkit-details-marker]:hidden" open={!text}>
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
            <Sparkles size={16} className="text-brand" />
            Escribir con el generador
          </summary>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <Field label="Estado">
              <Select value={condition} onChange={(e) => setCondition(e.target.value)}>
                {CONDITIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tono">
              <Select value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                {Object.entries(TONES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Qué destacar" className="sm:col-span-2">
              <Input value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="Ej.: con caja, precintado, poco uso" />
            </Field>
            <Field label="Defectos (si los hay)" className="sm:col-span-2">
              <Input value={defects} onChange={(e) => setDefects(e.target.value)} placeholder="Déjalo vacío si no tiene" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={hashtags} onChange={(e) => setHashtags(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Añadir hashtags
            </label>
          </div>
          <Button variant="primary" size="sm" className="mt-3" onClick={generate} disabled={generating}>
            <Sparkles size={15} />
            {generating ? "Escribiendo…" : `Generar para ${PLATFORM_NAME[platform]}`}
          </Button>
        </details>
      )}

      <div className="flex flex-col gap-3">
        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={name} maxLength={200} />
        </Field>
        <Field label="Descripción">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-44" />
        </Field>
        {!text && o?.description && (
          <button
            type="button"
            className="-mt-1 self-start text-[13px] font-semibold text-brand-ink hover:underline"
            onClick={() => {
              setTitle(o.title ?? "");
              setText(o.description ?? "");
            }}
          >
            Usar el texto de {PLATFORM_NAME[other]}
          </button>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Precio (€)" error={!priceValid ? "Precio no válido" : undefined} hint={cost !== null && priceNum ? `Ganarías ${money(priceNum - cost)} por unidad` : undefined}>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="num" placeholder="0,00" />
          </Field>
          <Field label="Enlace del anuncio (opcional)" hint="Compartir → Copiar enlace, en la app.">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" placeholder="https://…" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <CopyButton text={title} label="Copiar título" />
          <CopyButton text={text} label="Copiar texto" />
          <CopyButton text={priceNum !== null && priceValid ? String(priceNum).replace(".", ",") : ""} label="Copiar precio" />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button onClick={() => save()} disabled={pending || !dirty}>
            {pending ? "Guardando…" : dirty ? "Guardar" : "Guardado"}
          </Button>
          {l?.status !== "publicado" ? (
            <Button variant="primary" onClick={() => status("publicado")} disabled={pending}>
              <Check size={16} strokeWidth={2.75} />
              Ya está publicado en {PLATFORM_NAME[platform]}
            </Button>
          ) : (
            <Button variant="danger" onClick={() => status("retirado")} disabled={pending}>
              Lo he quitado de {PLATFORM_NAME[platform]}
            </Button>
          )}
        </div>
        {message && <Notice tone="good">{message}</Notice>}
        {error && <Notice tone="bad">{error}</Notice>}
      </div>
    </Step>
  );
}

// ---------------------------------------------------------------------
// 3 · Ayuda con el precio (solo datos reales)
// ---------------------------------------------------------------------
function PriceHelp({ history, cost, normalPrice, stock }: { history: PriceHistory | null; cost: number | null; normalPrice: number | null; stock: number }) {
  const h = history;
  const has = !!h && h.count > 0;
  const margins = [20, 30, 50];
  return (
    <Step n={3} title="Precio">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-[12px] text-muted">Te cuesta (coste medio)</dt>
          <dd className="display num text-[24px] leading-tight">{cost !== null ? money(cost, { precise: true }) : "—"}</dd>
        </div>
        <div>
          <dt className="text-[12px] text-muted">En stock</dt>
          <dd className="display num text-[24px] leading-tight">{stock}</dd>
        </div>
        {has && (
          <>
            <div>
              <dt className="text-[12px] text-muted">Lo has vendido de media a</dt>
              <dd className="display num text-[24px] leading-tight text-brand-ink">{money(h!.avg)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Entre</dt>
              <dd className="num text-[15px] font-semibold leading-tight">
                {money(h!.min)} y {money(h!.max)}
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Ventas</dt>
              <dd className="num font-semibold">{h!.count}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-muted">Tarda en venderse</dt>
              <dd className="num font-semibold">{h!.avg_days !== null ? `${h!.avg_days} días de media` : "—"}</dd>
            </div>
          </>
        )}
      </dl>

      {has && Object.keys(h!.by_platform).length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">Por plataforma</p>
          <ul className="flex flex-wrap gap-1.5 text-[13px]">
            {Object.entries(h!.by_platform).map(([p, v]) => (
              <li key={p} className="num rounded-full bg-ink/5 px-2.5 py-1">
                {p}: <strong>{money(v.avg)}</strong> <span className="text-muted">({v.count})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {has && h!.recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">Últimas ventas</p>
          <ul className="divide-y divide-line text-[13px]">
            {h!.recent.map((r, i) => (
              <li key={i} className="num flex justify-between py-1.5">
                <span className="text-muted">
                  {r.date.split("-").reverse().join("/")} · {r.platform}
                </span>
                <span className="font-semibold">{money(r.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!has && <p className="mt-3 text-[13px] text-muted">Todavía no has vendido este producto, así que no hay precios de referencia. Abajo tienes lo que ganarías a cada precio.</p>}

      {cost !== null && cost > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted">Para ganar…</p>
          <ul className="grid grid-cols-3 gap-1.5 text-center">
            {margins.map((m) => (
              <li key={m} className="rounded-[var(--radius-sm)] border border-line px-2 py-2">
                <p className="text-[12px] text-muted">un {m} %</p>
                <p className="num font-semibold">{money(cost * (1 + m / 100))}</p>
              </li>
            ))}
          </ul>
          {normalPrice !== null && <p className="mt-2 text-[12.5px] text-muted">Precio normal en la ficha: {money(normalPrice)}.</p>}
        </div>
      )}
    </Step>
  );
}
