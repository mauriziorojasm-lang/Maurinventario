import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { notFound } from "next/navigation";
import { Badge, Empty, LinkButton, Figures, LotTag, Notice, PageHeader, Panel, StockBadge, Table, Td, Th, Tr } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EXIT_REASONS, MOVEMENT_TYPES, date, money, units } from "@/lib/format";
import { loadCatalogOptions } from "@/lib/options";
import { PhotoGallery } from "@/components/photo-gallery";
import { loadProductPhotos } from "@/lib/product-photos";
import { must } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import type { SellableVariant } from "@/lib/types";
import { DeleteProductButton, EditProductButton, VariantEditor } from "./product-editors";

export const metadata: Metadata = { title: "Producto" };

type VariantInv = {
  variant_id: string;
  variant_name: string;
  is_default: boolean;
  sku: string | null;
  stock: number;
  stock_value: number;
  weighted_avg_cost: number | null;
  normal_sale_price: number | null;
  avg_sale_price: number | null;
  units_sold: number;
  potential_value: number | null;
  potential_profit: number | null;
  potential_is_estimated: boolean;
};

export default async function ProductDetail({ params, searchParams }: PageProps<"/productos/[id]">) {
  const user = await requireUser();
  // Vista completa (lotes, costes, movimientos) con «costes»; editar con «productos»
  const isAdmin = can(user, "costes");
  const canEdit = can(user, "catalogo");
  const canListing = can(user, "anuncios");
  const { id } = await params;
  const supabase = await createClient();
  // Todo a la vez: ficha, fotos y, según el rol, variantes, lotes y movimientos
  const [productRes, photos, sp, sellerVariants, sellerOpts, adminData] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, description, photo_path, normal_sale_price, legacy_code, notes, source_ref, deleted_at, brands(name), categories(name)")
      .eq("id", id)
      .maybeSingle(),
    loadProductPhotos(id),
    searchParams,
    isAdmin ? null : supabase.rpc("search_sellable_variants", { p_query: null, p_only_in_stock: false, p_limit: 200, p_product_id: id }),
    !isAdmin && canEdit ? loadCatalogOptions() : null,
    isAdmin
      ? Promise.all([
          supabase.from("v_variant_inventory").select("*").eq("product_id", id).order("is_default", { ascending: false }).order("variant_name"),
          supabase.from("v_lots").select("*").eq("product_id", id).order("received_at", { ascending: false }),
          supabase.from("v_movements").select("*").eq("product_id", id).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(200),
          loadCatalogOptions(),
          supabase.from("v_product_inventory").select("avg_sale_price, weighted_avg_cost, potential_is_estimated").eq("product_id", id).maybeSingle(),
        ])
      : null,
  ]);
  const product = must(productRes, "el producto");
  if (!product || product.deleted_at) notFound();
  const p = product as unknown as {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    photo_path: string | null;
    normal_sale_price: number | null;
    legacy_code: string | null;
    notes: string | null;
    source_ref: string | null;
    brands: { name: string } | null;
    categories: { name: string } | null;
  };

  const editButton = (brands: { id: string; name: string }[], categories: { id: string; name: string }[]) => (
    <EditProductButton
      brands={brands}
      categories={categories}
      initial={{
        id: p.id,
        name: p.name,
        brand_name: p.brands?.name ?? "",
        category_name: p.categories?.name ?? "",
        sku: p.sku ?? "",
        description: p.description ?? "",
        normal_sale_price: p.normal_sale_price !== null ? String(p.normal_sale_price) : "",
        notes: p.notes ?? "",
      }}
    />
  );
  const listingButton = canListing && (
    <LinkButton href={`/productos/${p.id}/anuncio`} variant="primary">
      <Megaphone size={17} strokeWidth={2.5} />
      Preparar anuncio
    </LinkButton>
  );

  const info = (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted">Marca</dt>
      <dd>{p.brands?.name ?? <Badge tone="warn">Pendiente</Badge>}</dd>
      <dt className="text-muted">Categoría</dt>
      <dd>{p.categories?.name ?? <Badge tone="warn">Pendiente</Badge>}</dd>
      <dt className="text-muted">SKU</dt>
      <dd>{p.sku ?? <span className="text-muted">Sin SKU</span>}</dd>
      <dt className="text-muted">Precio normal</dt>
      <dd className="num">{p.normal_sale_price !== null ? money(p.normal_sale_price) : <span className="text-muted">Sin definir</span>}</dd>
      {isAdmin && p.legacy_code && (
        <>
          <dt className="text-muted">ID en el Excel</dt>
          <dd>{p.legacy_code}</dd>
        </>
      )}
    </dl>
  );

  const photoBlock = (
    <>
      {sp.fotos === "error" && (
        <Notice tone="warn">El producto se ha creado, pero alguna foto no se ha podido subir. Vuelve a intentarlo aquí abajo.</Notice>
      )}
      <PhotoGallery productId={p.id} name={p.name} photos={photos} editable={canEdit} />
    </>
  );

  if (!isAdmin || !adminData) {
    const vs = (sellerVariants ? must(sellerVariants, "las variantes") ?? [] : []) as SellableVariant[];
    return (
      <>
        <PageHeader
          title={p.name}
          back={{ href: "/productos", label: "Productos" }}
          actions={
            (listingButton || (canEdit && sellerOpts)) && (
              <>
                {listingButton}
                {canEdit && sellerOpts && editButton(sellerOpts.brands, sellerOpts.categories)}
              </>
            )
          }
        />
        <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
          <div className="flex flex-col gap-4">
            {photoBlock}
            <Panel>{info}</Panel>
          </div>
          <div className="flex flex-col gap-5">
            {p.description && <Panel title="Descripción"><p className="whitespace-pre-line text-sm">{p.description}</p></Panel>}
            <Panel title="Variantes y stock" padded={false}>
              <Table>
                <thead>
                  <tr>
                    <Th>Variante</Th>
                    <Th>SKU</Th>
                    <Th num>Stock</Th>
                    <Th num>Precio</Th>
                  </tr>
                </thead>
                <tbody>
                  {vs.map((v) => (
                    <Tr key={v.variant_id}>
                      <Td>{v.variant_name}</Td>
                      <Td>{v.sku ?? "—"}</Td>
                      <Td num>
                        <StockBadge stock={v.stock} />
                      </Td>
                      <Td num>{money(v.normal_sale_price)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Panel>
          </div>
        </div>
      </>
    );
  }

  const [variantsRes, lotsRes, movementsRes, opts, invRes] = adminData;
  const variants = must(variantsRes, "las variantes");
  const lots = must(lotsRes, "los lotes");
  const movements = must(movementsRes, "los movimientos");
  const inv = invRes.data;
  const vs = (variants ?? []) as VariantInv[];
  const totals = vs.reduce(
    (a, v) => ({
      stock: a.stock + v.stock,
      value: a.value + Number(v.stock_value),
      sold: a.sold + v.units_sold,
      potential: a.potential + Number(v.potential_value ?? 0),
      profit: a.profit + Number(v.potential_profit ?? 0),
    }),
    { stock: 0, value: 0, sold: 0, potential: 0, profit: 0 },
  );
  const single = vs.length === 1;

  return (
    <>
      <PageHeader
        title={p.name}
        back={{ href: "/productos", label: "Productos" }}
        description={p.source_ref ? `Importado del Excel (${p.source_ref}).` : undefined}
        actions={
          <>
            {listingButton}
            {canEdit && editButton(opts.brands, opts.categories)}
            {canEdit && totals.stock === 0 && <DeleteProductButton id={p.id} name={p.name} />}
          </>
        }
      />
      <Figures
        className="mb-5"
        items={[
          { label: "Stock", value: totals.stock > 0 ? units(totals.stock) : "Sin stock" },
          { label: "Coste medio ponderado", value: money(inv?.weighted_avg_cost, { precise: true }) },
          { label: "Precio medio de venta", value: money(inv?.avg_sale_price) },
          { label: "Unidades vendidas", value: units(totals.sold) },
          { label: "Valor del almacén", value: money(totals.value) },
          { label: "Valor potencial", value: money(totals.potential), note: inv?.potential_is_estimated ? "con el precio medio de venta" : undefined },
          { label: "Beneficio potencial", value: money(totals.profit), tone: "good" },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="flex flex-col gap-4">
          {photoBlock}
          <Panel>{info}</Panel>
          {p.description && (
            <Panel title="Descripción">
              <p className="whitespace-pre-line text-sm">{p.description}</p>
            </Panel>
          )}
          {p.notes && (
            <Panel title="Notas internas">
              <p className="whitespace-pre-line text-sm">{p.notes}</p>
            </Panel>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Panel title="Variantes" padded={false} actions={canEdit ? <VariantEditor productId={p.id} /> : undefined}>
            <Table>
              <thead>
                <tr>
                  <Th>Variante</Th>
                  <Th>SKU</Th>
                  <Th num>Stock</Th>
                  <Th num>Coste medio</Th>
                  <Th num>Precio normal</Th>
                  <Th num>Vendidas</Th>
                  <Th num>Valor</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {vs.map((v) => (
                  <Tr key={v.variant_id}>
                    <Td className="font-semibold">{v.variant_name}</Td>
                    <Td>{v.sku ?? "—"}</Td>
                    <Td num>
                      <StockBadge stock={v.stock} />
                    </Td>
                    <Td num>{money(v.weighted_avg_cost, { precise: true })}</Td>
                    <Td num>{money(v.normal_sale_price)}</Td>
                    <Td num>{units(v.units_sold)}</Td>
                    <Td num>{money(v.stock_value)}</Td>
                    <Td>
                      {canEdit && (
                        <VariantEditor
                          productId={p.id}
                          variant={{ id: v.variant_id, name: v.variant_name, sku: v.sku, normal_sale_price: v.normal_sale_price, stock: v.stock, canDelete: !single && v.stock === 0 }}
                        />
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            {vs.some((v) => v.variant_name === "Sin especificar") && (
              <p className="border-t border-line px-3 py-2.5 text-[13px] text-muted">
                «Sin especificar» agrupa las unidades importadas del Excel, donde el color no se registraba en las compras. Las compras nuevas pueden ir ya a cada variante.
              </p>
            )}
          </Panel>

          <Panel title="Pedidos / lotes de procedencia" description="Cada entrada de mercancía con su coste real." padded={false}>
            {(lots ?? []).length === 0 ? (
              <Empty title="Aún no ha entrado ninguna unidad">Las unidades entran al recibir un pedido de compra.</Empty>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Lote</Th>
                    {!single && <Th>Variante</Th>}
                    <Th>Entrada</Th>
                    <Th num>Entraron</Th>
                    <Th num>Quedan</Th>
                    <Th num>Coste real</Th>
                    <Th num>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {(lots ?? []).map((l) => (
                    <Tr key={l.lot_id} muted={l.quantity_available === 0}>
                      <Td>
                        {l.purchase_order_id ? (
                          <Link href={`/compras/${l.purchase_order_id}`}>
                            <LotTag label={l.lot_label} origin={l.origin} />
                          </Link>
                        ) : (
                          <LotTag label={l.lot_label} origin={l.origin} />
                        )}
                      </Td>
                      {!single && <Td>{l.variant_name}</Td>}
                      <Td className="num">{date(l.received_at)}</Td>
                      <Td num>{l.quantity_initial}</Td>
                      <Td num>{l.quantity_available}</Td>
                      <Td num>{money(l.unit_cost, { precise: true })}</Td>
                      <Td num>{money(l.stock_value)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel title="Historial de stock" description="Entradas, ventas, devoluciones, salidas y ajustes, del más reciente al más antiguo." padded={false}>
            {(movements ?? []).length === 0 ? (
              <Empty title="Sin movimientos" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Fecha</Th>
                    <Th>Movimiento</Th>
                    <Th>Lote</Th>
                    <Th num>Unidades</Th>
                    <Th>Detalle</Th>
                  </tr>
                </thead>
                <tbody>
                  {(movements ?? []).map((m) => (
                    <Tr key={m.id}>
                      <Td className="num">{date(m.occurred_at)}</Td>
                      <Td>{MOVEMENT_TYPES[m.movement_type] ?? m.movement_type}</Td>
                      <Td>
                        <LotTag label={m.lot_label} />
                      </Td>
                      <Td num className={m.quantity > 0 ? "text-good" : "text-danger"}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </Td>
                      <Td>
                        {m.sale_id && (
                          <Link href={`/ventas/${m.sale_id}`} className="font-semibold text-brand-ink hover:underline">
                            {m.sale_number}
                          </Link>
                        )}
                        {m.sale_id && m.responsible_name && <span className="text-muted">, {m.responsible_name}</span>}
                        {m.purchase_order_id && (
                          <Link href={`/compras/${m.purchase_order_id}`} className="font-semibold text-brand-ink hover:underline">
                            Pedido #{m.purchase_order_number}
                          </Link>
                        )}
                        {m.exit_reason && <span>{EXIT_REASONS[m.exit_reason]}</span>}
                        {m.notes && <span className="block text-xs text-muted">{m.notes}</span>}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
          {(movements ?? []).length === 200 && <Notice tone="neutral">Se muestran los 200 movimientos más recientes.</Notice>}
        </div>
      </div>
    </>
  );
}
