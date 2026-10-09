import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Empty, Notice, PageHeader, Tabs, clsx } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { first, type SearchParams } from "@/lib/filters";
import { signedPhotoUrls } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { ProductThumb } from "../productos/product-cards";
import { RemovedButton } from "./listing-buttons";

export const metadata: Metadata = { title: "Anuncios" };

type Status = "borrador" | "publicado" | "retirado";
type Row = {
  id: string;
  name: string;
  stock: number;
  photo: string | null;
  vinted: Status | null;
  wallapop: Status | null;
};

const VIEWS = {
  "sin-anunciar": "Sin anunciar",
  "por-retirar": "Por quitar",
  publicados: "Publicados",
  todos: "Todo con stock",
} as const;
type ViewKey = keyof typeof VIEWS;

export default async function ListingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: inv }, { data: listings }] = await Promise.all([
    supabase.from("v_product_inventory").select("product_id, product_name, photo_path, stock").order("product_name").limit(2000),
    supabase.from("listings").select("product_id, platform, status"),
  ]);

  const st = new Map<string, { vinted: Status | null; wallapop: Status | null }>();
  for (const l of listings ?? []) {
    const cur = st.get(l.product_id) ?? { vinted: null, wallapop: null };
    cur[l.platform as "vinted" | "wallapop"] = l.status as Status;
    st.set(l.product_id, cur);
  }
  const rows: Row[] = (inv ?? []).map((p) => ({
    id: p.product_id,
    name: p.product_name,
    stock: Number(p.stock ?? 0),
    photo: p.photo_path,
    vinted: st.get(p.product_id)?.vinted ?? null,
    wallapop: st.get(p.product_id)?.wallapop ?? null,
  }));
  const published = (r: Row) => r.vinted === "publicado" || r.wallapop === "publicado";
  const groups: Record<ViewKey, Row[]> = {
    "sin-anunciar": rows.filter((r) => r.stock > 0 && !published(r)),
    "por-retirar": rows.filter((r) => r.stock === 0 && published(r)),
    publicados: rows.filter((r) => published(r)),
    todos: rows.filter((r) => r.stock > 0),
  };
  const requested = first(sp.ver) as ViewKey | undefined;
  const view: ViewKey = requested && requested in VIEWS ? requested : groups["por-retirar"].length ? "por-retirar" : "sin-anunciar";
  const list = groups[view];
  const photos = await signedPhotoUrls(list.map((r) => r.photo));

  return (
    <>
      <PageHeader
        title="Anuncios"
        description="Qué tienes anunciado en Vinted y Wallapop. La app no publica por ti (las plataformas no lo permiten), pero te lo deja preparado y lleva la cuenta."
      />
      {groups["por-retirar"].length > 0 && view !== "por-retirar" && (
        <Notice tone="warn" className="mb-4">
          Tienes {groups["por-retirar"].length} {groups["por-retirar"].length === 1 ? "anuncio" : "anuncios"} de productos sin stock.{" "}
          <Link href="/anuncios?ver=por-retirar" className="font-semibold underline">
            Quítalos
          </Link>{" "}
          para no vender algo que ya no tienes.
        </Notice>
      )}
      <Tabs
        current={view}
        items={(Object.keys(VIEWS) as ViewKey[]).map((k) => ({ key: k, label: `${VIEWS[k]} (${groups[k].length})`, href: `/anuncios?ver=${k}` }))}
      />
      {list.length === 0 ? (
        <Empty title={view === "por-retirar" ? "Nada que quitar" : view === "sin-anunciar" ? "Todo lo que tienes en stock está anunciado" : "Nada por aquí"} />
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface shadow-[var(--shadow-card)]">
          {list.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 border-b border-line px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center">
              <Link href={`/productos/${r.id}/anuncio`} className="group flex min-w-0 flex-1 items-center gap-3">
                <ProductThumb url={r.photo ? photos.get(r.photo) : undefined} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold group-hover:text-brand-ink">{r.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                    <span className={clsx("num", r.stock === 0 ? "font-semibold text-danger" : "text-muted")}>{r.stock === 0 ? "Sin stock" : `${r.stock} en stock`}</span>
                    <Chip name="Vinted" s={r.vinted} />
                    <Chip name="Wallapop" s={r.wallapop} />
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
              {view === "por-retirar" && (
                <div className="flex flex-wrap gap-1.5 pl-[60px] sm:pl-0">
                  {r.vinted === "publicado" && <RemovedButton productId={r.id} platform="vinted" />}
                  {r.wallapop === "publicado" && <RemovedButton productId={r.id} platform="wallapop" />}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Chip({ name, s }: { name: string; s: Status | null }) {
  const on = s === "publicado";
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 font-semibold",
        on ? "bg-good-soft text-good-ink" : s === "borrador" ? "bg-info-soft text-info" : "bg-ink/6 text-faint line-through decoration-1",
      )}
    >
      {name}
      {s === "borrador" && " · borrador"}
    </span>
  );
}
