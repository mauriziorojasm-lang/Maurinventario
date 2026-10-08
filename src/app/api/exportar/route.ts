import ExcelJS from "exceljs";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { REPORT_FILTER_KEYS } from "@/lib/filters";
import { REPORTS, type Column, type ReportType } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Exporta un informe con los mismos filtros que la pantalla. Solo administradores. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || !user.active) return new NextResponse("No autorizado", { status: 403 });

  const sp = request.nextUrl.searchParams;
  const type = sp.get("tipo") as ReportType;
  const format = sp.get("formato") === "csv" ? "csv" : "xlsx";
  const report = REPORTS[type];
  if (!report) return new NextResponse("Informe desconocido", { status: 400 });

  const filters: Record<string, string> = {};
  for (const k of REPORT_FILTER_KEYS) {
    const v = sp.get(k);
    if (v) filters[k] = v;
  }

  const supabase = await createClient();
  const rows: Record<string, unknown>[] = [];
  const chunk = 1000;
  for (let from = 0; ; from += chunk) {
    const q =
      type === "salidas"
        ? supabase.from("v_stock_exits").select("*").eq("status", "activa").order("exit_date", { ascending: false }).range(from, from + chunk - 1)
        : supabase.rpc(report.rpc, { p_filters: filters }).range(from, from + chunk - 1);
    const { data, error } = await q;
    if (error) return new NextResponse(`No se ha podido exportar: ${error.message}`, { status: 500 });
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < chunk) break;
  }

  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
  const name = `maurinventario-${report.fileName}-${stamp}`;

  if (format === "csv") {
    const body = toCsv(report.columns, rows);
    return new NextResponse("﻿" + body, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "MaurInventario";
  const ws = wb.addWorksheet(report.title.slice(0, 31));
  ws.columns = report.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 2) }));
  for (const r of rows) {
    const out: Record<string, unknown> = {};
    for (const c of report.columns) out[c.key] = cellValue(c, r);
    ws.addRow(out);
  }
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  report.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.kind === "money") col.numFmt = '#,##0.00 "€"';
    if (c.kind === "money4") col.numFmt = '#,##0.0000 "€"';
    if (c.kind === "date") col.numFmt = "dd/mm/yyyy";
    if (c.kind === "pct") col.numFmt = '0.00 "%"';
  });
  if (Object.keys(filters).length) {
    const info = wb.addWorksheet("Filtros");
    info.addRow(["Filtro", "Valor"]);
    for (const [k, v] of Object.entries(filters)) info.addRow([k, v]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}

function cellValue(c: Column, r: Record<string, unknown>) {
  const v = c.value(r);
  if (v === null || v === undefined || v === "") return null;
  if (c.kind === "date") {
    const [y, m, d] = String(v).slice(0, 10).split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (c.kind === "int" || c.kind === "money" || c.kind === "money4" || c.kind === "pct") return Number(v);
  return String(v);
}

/** CSV con «;» y coma decimal, para que Excel en español lo abra bien. */
function toCsv(columns: Column[], rows: Record<string, unknown>[]) {
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.label)).join(";")];
  for (const r of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(r);
          if (v === null || v === undefined) return "";
          if (c.kind === "date") {
            const [y, m, d] = String(v).slice(0, 10).split("-");
            return `${d}/${m}/${y}`;
          }
          if (c.kind === "money" || c.kind === "money4" || c.kind === "pct") return String(Number(v)).replace(".", ",");
          return esc(String(v));
        })
        .join(";"),
    );
  }
  return lines.join("\r\n");
}
