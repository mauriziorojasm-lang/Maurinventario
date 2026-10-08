"use client";
import { useState } from "react";
import { money, monthLabel, units } from "@/lib/format";

type Point = { month: string; revenue: number; profit: number; orders: number; units: number };

/**
 * Ventas por mes (una sola serie: importe vendido).
 * Columnas finas que salen de la misma base, cifra solo en el último mes y
 * en el máximo, y el detalle de cada mes al pasar el ratón o tocar.
 */
export function MonthlyBars({ data }: { data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const W = 640;
  const H = 220;
  const pad = { l: 52, r: 12, t: 22, b: 28 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.55);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;
  const maxIdx = data.reduce((best, d, i) => (d.revenue > data[best].revenue ? i : best), 0);
  const last = data.length - 1;

  if (asTable) {
    return (
      <div>
        <div className="mb-2 flex justify-end">
          <button className="text-[13px] font-semibold text-ledger underline-offset-2 hover:underline" onClick={() => setAsTable(false)}>
            Ver gráfico
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[12.5px] text-muted">
              <th className="py-1.5 font-semibold">Mes</th>
              <th className="py-1.5 text-right font-semibold">Vendido</th>
              <th className="py-1.5 text-right font-semibold">Beneficio</th>
              <th className="py-1.5 text-right font-semibold">Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-line/70">
                <td className="py-1.5">{monthLabel(d.month)}</td>
                <td className="num py-1.5 text-right">{money(d.revenue)}</td>
                <td className="num py-1.5 text-right">{money(d.profit)}</td>
                <td className="num py-1.5 text-right">{units(d.orders)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <div className="mb-1 flex justify-end">
        <button className="text-[13px] font-semibold text-ledger underline-offset-2 hover:underline" onClick={() => setAsTable(true)}>
          Ver como tabla
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Importe vendido por mes en los últimos 12 meses" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e2e5e0" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#5b6573" className="num">
              {compactEur(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + band / 2;
          const yTop = y(d.revenue);
          const hgt = Math.max(0, pad.t + innerH - yTop);
          const r = Math.min(4, hgt);
          const showLabel = d.revenue > 0 && (i === last || i === maxIdx);
          return (
            <g key={d.month} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={innerH} fill="transparent" />
              {hgt > 0 && (
                <path
                  d={`M${x - barW / 2},${pad.t + innerH} V${yTop + r} Q${x - barW / 2},${yTop} ${x - barW / 2 + r},${yTop} H${x + barW / 2 - r} Q${x + barW / 2},${yTop} ${x + barW / 2},${yTop + r} V${pad.t + innerH} Z`}
                  fill={hover === null || hover === i ? "#1e6b52" : "#9cc3b4"}
                />
              )}
              {showLabel && (
                <text x={x} y={yTop - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#18202b" className="num">
                  {compactEur(d.revenue)}
                </text>
              )}
              <text x={x} y={H - 9} textAnchor="middle" fontSize={11} fill="#5b6573">
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
        <line x1={pad.l} x2={W - pad.r} y1={pad.t + innerH} y2={pad.t + innerH} stroke="#cdd2cb" strokeWidth={1} />
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-8 rounded-[var(--radius-sm)] border border-line bg-surface px-3 py-2 text-[13px] shadow-[0_8px_24px_-12px_rgba(24,32,43,0.35)]"
          style={{ left: `clamp(0px, calc(${((pad.l + band * hover! + band / 2) / W) * 100}% - 80px), calc(100% - 170px))` }}
        >
          <p className="font-semibold">{monthLabel(h.month)}</p>
          <p className="num">Vendido: {money(h.revenue)}</p>
          <p className="num">Beneficio: {money(h.profit)}</p>
          <p className="num text-muted">
            {units(h.orders)} pedidos, {units(h.units)} uds.
          </p>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  if (raw <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function compactEur(v: number) {
  if (v >= 1000) return `${(v / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mil €`;
  return `${Math.round(v)} €`;
}
