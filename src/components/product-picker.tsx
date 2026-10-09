"use client";
/**
 * Buscador de productos/variantes. Si no existe y el usuario es admin,
 * permite crearlo en el momento (sin stock: el stock solo entra con
 * compras o ajustes autorizados).
 */
import { useEffect, useId, useRef, useState } from "react";
import { quickCreateProduct, searchVariants } from "@/app/(app)/ventas/actions";
import type { SellableVariant } from "@/lib/types";
import { variantDisplay } from "@/lib/types";
import { money } from "@/lib/format";
import { Button, Field, Input, Notice, clsx } from "./ui";
import { Modal } from "./ui-client";
import { ProductThumb } from "@/app/(app)/productos/product-cards";

export function ProductPicker({
  onSelect,
  onlyInStock = false,
  allowCreate = false,
  placeholder = "Busca por nombre, marca o SKU",
  autoFocus,
}: {
  onSelect: (v: SellableVariant) => void;
  onlyInStock?: boolean;
  allowCreate?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SellableVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const listId = useId();
  const reqId = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = null;
    setOpen(true);
  };

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const res = await searchVariants(term, onlyInStock);
      if (id !== reqId.current) return;
      setLoading(false);
      if (res.ok) {
        setResults(res.data ?? []);
        setError(null);
      } else setError(res.error);
      setActive(0);
    }, 220);
    return () => clearTimeout(t);
  }, [q, onlyInStock]);

  function choose(v: SellableVariant) {
    onSelect(v);
    setQ("");
    setResults([]);
    setLoading(false);
    setOpen(false);
  }

  const showList = open && q.trim().length >= 2;

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          keepOpen();
          if (e.target.value.trim().length >= 2) setLoading(true);
        }}
        onFocus={keepOpen}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!showList || !results.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(results[active]);
          }
        }}
      />
      {showList && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-[min(24rem,55dvh)] w-full animate-rise overflow-y-auto rounded-[var(--radius-md)] border border-line-strong bg-surface shadow-[var(--shadow-pop)]"
        >
          {loading && <p className="px-3 py-2.5 text-sm text-muted">Buscando…</p>}
          {!loading && error && <p className="px-3 py-2.5 text-sm text-danger">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2.5 text-sm">
              <p className="text-muted">
                No hay ningún producto con «{q.trim()}»{onlyInStock ? " con stock" : ""}.
              </p>
              {allowCreate && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setCreating(true);
                    setOpen(false);
                  }}
                >
                  Crear producto «{q.trim()}»
                </Button>
              )}
            </div>
          )}
          {!loading &&
            results.map((v, i) => (
              <button
                key={v.variant_id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(v)}
                onMouseEnter={() => setActive(i)}
                className={clsx("flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors", i === active && "bg-brand-soft/60")}
              >
                <ProductThumb url={v.photo_url ?? undefined} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{variantDisplay(v.product_name, v.variant_name, v.variant_count)}</span>
                  <span className="block truncate text-xs text-muted">
                    {[v.brand_name, v.category_name, v.sku].filter(Boolean).join(", ") || "Sin marca ni categoría"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs">
                  <span className={clsx("num block font-semibold", v.stock <= 0 && "text-muted")}>{v.stock > 0 ? `${v.stock} en stock` : "Sin stock"}</span>
                  {v.normal_sale_price !== null && <span className="num block text-muted">{money(v.normal_sale_price)}</span>}
                </span>
              </button>
            ))}
        </div>
      )}
      {allowCreate && (
        <QuickCreate
          key={creating ? `abierto-${q}` : "cerrado"}
          open={creating}
          initialName={q.trim()}
          onClose={() => setCreating(false)}
          onCreated={async (name) => {
            setCreating(false);
            const res = await searchVariants(name, false);
            const found = res.ok ? (res.data ?? []).find((v) => v.product_name.toLowerCase() === name.toLowerCase()) : undefined;
            if (found) choose(found);
          }}
        />
      )}
    </div>
  );
}

function QuickCreate({
  open,
  initialName,
  onClose,
  onCreated,
}: {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [variants, setVariants] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear producto"
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={pending || !name.trim()}
            onClick={async () => {
              setPending(true);
              const res = await quickCreateProduct({
                name: name.trim(),
                brand_name: brand.trim() || undefined,
                category_name: category.trim() || undefined,
                normal_sale_price: price.trim() || undefined,
                variants: variants
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
                  .map((v) => ({ name: v })),
              });
              setPending(false);
              if (!res.ok) setError(res.error);
              else onCreated(name.trim());
            }}
          >
            {pending ? "Creando…" : "Crear producto"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" required className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="Marca">
          <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </Field>
        <Field label="Categoría">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="Precio normal de venta (€)">
          <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Variantes" hint="Separadas por comas, por ejemplo: Negro, Blanco. Déjalo vacío si no tiene.">
          <Input value={variants} onChange={(e) => setVariants(e.target.value)} />
        </Field>
      </div>
      <Notice tone="info" className="mt-4">
        El producto se crea sin stock. Las unidades solo entran al recibir una compra o con un ajuste autorizado.
      </Notice>
      {error && (
        <Notice tone="bad" className="mt-3">
          {error}
        </Notice>
      )}
    </Modal>
  );
}
