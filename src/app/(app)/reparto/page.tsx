import type { Metadata } from "next";
import { FilterBar } from "@/components/filter-bar";
import { Empty, Figures, Notice, PageHeader, Panel, Table, Td, Th, Tr } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { filtersFrom, type SearchParams } from "@/lib/filters";
import { date, money } from "@/lib/format";
import { todayIso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { DeleteTransferButton, TransferButton } from "./transfer-form";

export const metadata: Metadata = { title: "Reparto entre socios" };

type Settlement = {
  total: number;
  partner_count: number;
  share: number;
  transfers_included: boolean;
  partners: { responsible_id: string; name: string; collected: number; paid: number; received: number; share: number; balance: number }[];
};

export default async function SettlementPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePerm("costes");
  const filters = filtersFrom(await searchParams);
  const supabase = await createClient();
  const [{ data, error }, { data: transfers }] = await Promise.all([
    supabase.rpc("report_partner_settlement", { p_filters: filters }),
    supabase
      .from("partner_transfers")
      .select("id, transfer_date, amount, notes, from:from_responsible_id(name), to:to_responsible_id(name)")
      .is("deleted_at", null)
      .order("transfer_date", { ascending: false }),
  ]);
  const s = data as Settlement | null;
  const partners = s?.partners ?? [];
  const debtor = partners.filter((p) => p.balance > 0.004).sort((a, b) => b.balance - a.balance)[0];
  const creditor = partners.filter((p) => p.balance < -0.004).sort((a, b) => a.balance - b.balance)[0];
  type T = { id: string; transfer_date: string; amount: number; notes: string | null; from: { name: string } | null; to: { name: string } | null };

  return (
    <>
      <PageHeader
        title="Reparto entre socios"
        description="El total vendido se reparte a partes iguales entre los socios. Cada uno ha cobrado sus propias ventas; aquí ves quién debe pagar a quién."
        actions={
          partners.length > 1 && (
            <TransferButton
              partners={partners.map((p) => ({ id: p.responsible_id, name: p.name }))}
              today={todayIso()}
              suggestion={debtor && creditor ? { from: debtor.responsible_id, to: creditor.responsible_id, amount: Math.min(debtor.balance, -creditor.balance) } : undefined}
            />
          )
        }
      />
      <FilterBar
        basePath="/reparto"
        values={filters}
        fields={[
          { type: "date", name: "from", label: "Desde" },
          { type: "date", name: "to", label: "Hasta" },
          { type: "number", name: "purchase_order_number", label: "Pedido/lote nº" },
        ]}
      />
      {error && <Notice tone="bad">{error.message}</Notice>}
      {s && s.partner_count === 0 && (
        <Notice tone="warn" className="mb-4">
          No hay ningún socio. Marca a los responsables que participan en el reparto desde Responsables.
        </Notice>
      )}
      {s && s.partner_count > 0 && (
        <>
          <Figures
            className="mb-4"
            items={[
              { label: "Total vendido", value: money(s.total) },
              { label: "Socios", value: s.partner_count },
              { label: "Corresponde a cada uno", value: money(s.share) },
            ]}
          />
          {debtor && creditor ? (
            <div className="mb-5 rounded-[var(--radius-md)] border border-good/30 bg-good-soft px-5 py-4">
              <p className="text-[19px] font-bold text-good-ink">
                {debtor.name} debe pagar <span className="num">{money(Math.min(debtor.balance, -creditor.balance))}</span> a {creditor.name}
              </p>
              <p className="mt-1 text-sm text-good-ink/80">Para que cada socio se quede con {money(s.share)}.</p>
            </div>
          ) : (
            <Notice tone="good" className="mb-5">
              El reparto está cuadrado: nadie debe nada.
            </Notice>
          )}
          {!s.transfers_included && (
            <Notice tone="info" className="mb-4">
              Filtrando por pedido no se tienen en cuenta los pagos entre socios (no están ligados a un pedido).
            </Notice>
          )}
          <Panel title="Detalle por socio" padded={false} className="mb-5">
            <Table>
              <thead>
                <tr>
                  <Th>Socio</Th>
                  <Th num>Ha cobrado (sus ventas)</Th>
                  <Th num>Ha pagado</Th>
                  <Th num>Ha recibido</Th>
                  <Th num>Le corresponde</Th>
                  <Th num>Diferencia</Th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <Tr key={p.responsible_id}>
                    <Td className="font-semibold">{p.name}</Td>
                    <Td num>{money(p.collected)}</Td>
                    <Td num>{money(p.paid)}</Td>
                    <Td num>{money(p.received)}</Td>
                    <Td num>{money(p.share)}</Td>
                    <Td num className={p.balance > 0.004 ? "text-danger" : p.balance < -0.004 ? "text-good" : undefined}>
                      {p.balance > 0.004 ? `debe ${money(p.balance)}` : p.balance < -0.004 ? `le deben ${money(-p.balance)}` : "cuadrado"}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
      <Panel title="Pagos entre socios" padded={false}>
        {(transfers ?? []).length === 0 ? (
          <Empty title="Aún no hay pagos registrados">Cuando un socio pague a otro, regístralo para que el reparto se actualice.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Paga</Th>
                <Th>Recibe</Th>
                <Th num>Importe</Th>
                <Th>Notas</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {((transfers ?? []) as unknown as T[]).map((t) => (
                <Tr key={t.id}>
                  <Td className="num">{date(t.transfer_date)}</Td>
                  <Td>{t.from?.name}</Td>
                  <Td>{t.to?.name}</Td>
                  <Td num>{money(t.amount)}</Td>
                  <Td>{t.notes ?? "—"}</Td>
                  <Td>
                    <DeleteTransferButton id={t.id} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
