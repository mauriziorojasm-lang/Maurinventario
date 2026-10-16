import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Empty, Figures, LotTag, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { EXIT_REASONS, date, money, todayIso, units } from "@/lib/format";
import { loadSaleOptions } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { variantDisplay } from "@/lib/types";
import { ExitReasonEditor, NewAdjustmentButton, NewExitButton, VoidExitButton } from "./stock-forms";

export const metadata: Metadata = { title: "Salidas y ajustes" };

export default async function ExitsPage() {
  await requirePerm("stock");
  const supabase = await createClient();
  const [{ data: exits }, { data: adjustments }, opts] = await Promise.all([
    supabase.from("v_stock_exits").select("*").order("exit_date", { ascending: false }).limit(300),
    supabase
      .from("stock_adjustments")
      .select("id, adjustment_date, direction, quantity, reason, lot_id, product_variants(name, product_id, products(name)), profiles:created_by(email)")
      .order("created_at", { ascending: false })
      .limit(200),
    loadSaleOptions(),
  ]);
  const active = (exits ?? []).filter((e) => e.status === "activa");
  const loss = active.reduce((a, e) => a + Number(e.cost_amount), 0);
  const pending = active.filter((e) => e.reason === "pendiente").length;
  type Adj = { id: string; adjustment_date: string; direction: string; quantity: number; reason: string; product_variants: { name: string; product_id: string; products: { name: string } | null } | null; profiles: { email: string } | null };

  return (
    <>
      <PageHeader
        title="Salidas sin venta y ajustes"
        description="Regalos, pérdidas y correcciones de stock. Nada se borra: cada cambio queda registrado como movimiento."
        actions={
          <>
            <NewAdjustmentButton today={todayIso()} />
            <NewExitButton responsibles={opts.responsibles} today={todayIso()} />
          </>
        }
      />
      <Figures
        className="mb-5"
        items={[
          { label: "Salidas sin venta", value: units(active.reduce((a, e) => a + e.quantity, 0)), note: "unidades" },
          { label: "Coste perdido", value: money(loss), tone: loss > 0 ? "bad" : "default" },
          { label: "Con motivo pendiente", value: units(pending), tone: pending > 0 ? "bad" : "default" },
        ]}
      />
      <Panel title="Salidas sin venta" padded={false} className="mb-5">
        {(exits ?? []).length === 0 ? (
          <Empty title="No hay salidas sin venta" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Producto</Th>
                <Th>Lote</Th>
                <Th num>Uds.</Th>
                <Th num>Coste</Th>
                <Th>Motivo</Th>
                <Th>Responsable</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(exits ?? []).map((e) => (
                <Tr key={e.id} muted={e.status !== "activa"}>
                  <Td className="num">{date(e.exit_date)}</Td>
                  <Td>
                    <Link href={`/productos/${e.product_id}`} className="hover:underline">
                      {variantDisplay(e.product_name, e.variant_name)}
                    </Link>
                    {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
                    {e.source_ref && <span className="block text-xs text-faint">Excel: {e.source_ref}</span>}
                  </Td>
                  <Td>
                    <LotTag label={e.lot_label} />
                  </Td>
                  <Td num>{e.quantity}</Td>
                  <Td num>{money(e.cost_amount)}</Td>
                  <Td>{e.status === "activa" ? <ExitReasonEditor id={e.id} reason={e.reason} /> : <Badge>Anulada</Badge>}</Td>
                  <Td>{e.responsible_name ?? "—"}</Td>
                  <Td>{e.status === "activa" && <VoidExitButton id={e.id} />}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        {pending > 0 && <p className="border-t border-line px-3 py-2.5 text-[13px] text-muted">Elige el motivo de las que están como «{EXIT_REASONS.pendiente}» y pulsa Guardar.</p>}
      </Panel>
      <Panel title="Ajustes de stock" padded={false}>
        {(adjustments ?? []).length === 0 ? (
          <Empty title="No hay ajustes" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Producto</Th>
                <Th>Tipo</Th>
                <Th num>Uds.</Th>
                <Th>Motivo</Th>
                <Th>Usuario</Th>
              </tr>
            </thead>
            <tbody>
              {((adjustments ?? []) as unknown as Adj[]).map((a) => (
                <Tr key={a.id}>
                  <Td className="num">{date(a.adjustment_date)}</Td>
                  <Td>{variantDisplay(a.product_variants?.products?.name ?? "", a.product_variants?.name)}</Td>
                  <Td>{a.direction === "entrada" ? <Badge tone="good">Entrada</Badge> : <Badge tone="bad">Salida</Badge>}</Td>
                  <Td num>{a.quantity}</Td>
                  <Td>{a.reason}</Td>
                  <Td>{a.profiles?.email ?? "—"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
