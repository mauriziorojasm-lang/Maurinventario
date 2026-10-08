import Link from "next/link";
import { Badge, LotTag, clsx } from "@/components/ui";
import { date, money } from "@/lib/format";
import { SaleCheckbox, SelectAllCheckbox } from "./bulk-shipping";

export type CardSale = {
  id: string;
  number: string;
  date: string;
  total: number;
  profit?: number | null;
  platform: string;
  responsible?: string;
  shipping: "pendiente" | "enviado" | null;
  lines: { text: string; quantity: number; lot?: string | null; returned?: number }[];
};

function ShipBadge({ s }: { s: CardSale["shipping"] }) {
  if (!s) return <span className="text-xs text-muted">En mano</span>;
  return s === "enviado" ? <Badge tone="good">Enviado</Badge> : <Badge tone="warn">Pendiente</Badge>;
}

/**
 * Ventas en tarjetas para el móvil: toda la venta de un vistazo, sin
 * deslizar a los lados. Toda la tarjeta abre la venta; la casilla sirve
 * para marcar varias como enviadas.
 */
export function SaleCards({ sales }: { sales: CardSale[] }) {
  const selectable = sales.filter((s) => s.shipping).map((s) => ({ id: s.id, status: s.shipping }));
  return (
    <div className="md:hidden">
      {selectable.length > 0 && (
        <label className="mb-2 flex items-center gap-2.5 px-1 text-[13px] text-muted">
          <SelectAllCheckbox sales={selectable} />
          Seleccionar todas las que llevan envío
        </label>
      )}
      <ul className="stagger flex flex-col gap-2.5">
        {sales.map((s) => (
          <li
            key={s.id}
            className="press relative rounded-[var(--radius-md)] border border-line bg-surface p-3.5 shadow-[var(--shadow-card)] active:border-brand/60"
          >
            <div className="flex items-start gap-3">
              {s.shipping && (
                <span className="relative z-10 -m-2 p-2">
                  <SaleCheckbox saleId={s.id} status={s.shipping} label={`la venta ${s.number}`} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`/ventas/${s.id}`} className="font-bold text-ink after:absolute after:inset-0 after:content-['']">
                    {s.number}
                    <span className="num ml-2 text-[12.5px] font-normal text-muted">{date(s.date)}</span>
                  </Link>
                  <span className="display num text-[22px]">{money(s.total)}</span>
                </div>
                <ul className="mt-1.5 flex flex-col gap-1 text-[14px]">
                  {s.lines.map((l, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0">
                        <span className="num font-semibold">{l.quantity}</span> × {l.text}
                      </span>
                      {l.lot !== undefined && <LotTag label={l.lot} />}
                      {!!l.returned && <span className="text-xs font-semibold text-danger">−{l.returned} dev.</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
                  <span className="min-w-0 truncate">{[s.platform, s.responsible].filter(Boolean).join(" · ")}</span>
                  <span className="flex items-center gap-2">
                    {s.profit !== undefined && s.profit !== null && (
                      <span className={clsx("num font-semibold", s.profit < 0 ? "text-danger" : "text-good")}>
                        {s.profit > 0 ? "+" : ""}
                        {money(s.profit)}
                      </span>
                    )}
                    <ShipBadge s={s.shipping} />
                  </span>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
