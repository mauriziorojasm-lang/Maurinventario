import type { Metadata } from "next";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Badge, Empty, Notice, PageHeader, Panel, Tabs, clsx } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { CENTRAL_ACCOUNT, googleCredentials } from "@/lib/email/gmail";
import { first, type SearchParams } from "@/lib/filters";
import { dateTime, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AccountRow, ConnectionButtons, DefaultResponsible, IncidentActions, UndoButton } from "./email-actions";

export const metadata: Metadata = { title: "Ventas por correo" };
export const maxDuration = 60;

type Status = {
  email: string | null;
  status: "desconectado" | "conectado" | "error_autorizacion" | "error";
  connected: boolean;
  last_error: string | null;
  last_sync_at: string | null;
  last_success_at: string | null;
  last_summary: { new_emails?: number; sales?: number; detected?: number; labels?: number; review?: number; waiting?: number; errors?: number } | null;
  connected_at: string | null;
  default_responsible_id: string | null;
  cron_active: boolean;
};

export type EmailRowView = {
  id: string;
  received_at: string;
  platform: "vinted" | "wallapop" | null;
  kind: string;
  status: string;
  parsed: Record<string, unknown>;
  sale_id: string | null;
  review_reason: string | null;
  candidates: { variant_id?: string; sale_id?: string; label: string }[] | null;
  last_error: string | null;
  attempts: number;
};

const KIND: Record<string, string> = {
  vinted_venta: "Venta Vinted",
  vinted_etiqueta: "Etiqueta Vinted",
  wallapop_venta: "Venta Wallapop",
  wallapop_aviso: "Aviso Wallapop (se ignora)",
  otro: "Otro correo",
};

const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }> = {
  procesado: { label: "Hecho", tone: "good" },
  detectada: { label: "Por confirmar", tone: "info" },
  duplicado: { label: "Duplicado (ya estaba apuntada)", tone: "neutral" },
  pendiente: { label: "En cola", tone: "info" },
  esperando: { label: "Esperando la venta", tone: "info" },
  revision: { label: "Revisar", tone: "warn" },
  error: { label: "Error (se reintenta)", tone: "bad" },
  ignorado: { label: "Ignorado", tone: "neutral" },
};

export default async function EmailSalesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePerm("correo");
  const sp = await searchParams;
  const view = first(sp.ver) === "historial" ? "historial" : first(sp.ver) === "cuentas" ? "cuentas" : "incidencias";
  const supabase = await createClient();

  const [{ data: st }, { data: open }, { data: history }, { data: accounts }, { data: resps }, { data: mobiles }] = await Promise.all([
    supabase.rpc("email_integration_status"),
    supabase
      .from("email_messages")
      .select("id, received_at, platform, kind, status, parsed, sale_id, review_reason, candidates, last_error, attempts")
      .in("status", ["revision", "error", "esperando", "pendiente"])
      .order("received_at", { ascending: false })
      .limit(200),
    view === "historial"
      ? supabase
          .from("email_messages")
          .select("id, received_at, platform, kind, status, parsed, sale_id, review_reason, candidates, last_error, attempts")
          .neq("kind", "otro")
          .order("received_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    supabase.from("email_accounts").select("id, platform, handle, responsible_id, mobile_device_id, created_at").order("platform").order("handle"),
    supabase.from("responsibles").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("mobile_devices").select("id, number, name").eq("active", true).order("number"),
  ]);
  const s = st as Status | null;
  const incidents = (open ?? []) as EmailRowView[];
  const hist = (history ?? []) as EmailRowView[];

  const saleIds = [...new Set([...incidents, ...hist].map((e) => e.sale_id).filter((x): x is string => !!x))];
  const { data: sales } = saleIds.length ? await supabase.from("sales").select("id, sale_number").in("id", saleIds) : { data: [] };
  const saleNumber = new Map((sales ?? []).map((x) => [x.id as string, x.sale_number as string]));

  const needsPerson = incidents.filter((e) => e.status === "revision").length;
  const credentials = !!googleCredentials();
  const okMsg = first(sp.ok);
  const errMsg = first(sp.error);
  const unassigned = (accounts ?? []).filter((a) => !a.responsible_id).length;

  return (
    <>
      <PageHeader
        title="Ventas por correo"
        description={`Lee los correos de Vinted y Wallapop que llegan a ${CENTRAL_ACCOUNT ?? "tu Gmail"} y registra las ventas solo. Nunca duplica ventas: lo dudoso queda aquí para que lo revises.`}
      />
      {okMsg === "conectado" && (
        <Notice tone="good" className="mb-4" title="Gmail conectado">
          Desde ahora se revisa el correo cada 5 minutos. Solo se leen los correos que lleguen a partir de este momento.
        </Notice>
      )}
      {errMsg && (
        <Notice tone="bad" className="mb-4" title="No se ha podido conectar">
          {errMsg}
        </Notice>
      )}

      <ConnectionPanel s={s} credentials={credentials} defaultResponsible={s?.default_responsible_id ?? null} responsibles={resps ?? []} />

      <div className="mt-6">
        <Tabs
          current={view}
          items={[
            { key: "incidencias", label: needsPerson ? `Revisar (${needsPerson})` : "Revisar", href: "/correos" },
            { key: "historial", label: "Historial", href: "/correos?ver=historial" },
            { key: "cuentas", label: unassigned ? `Cuentas (${unassigned})` : "Cuentas", href: "/correos?ver=cuentas" },
          ]}
        />
      </div>

      {view === "incidencias" && (
        <Panel padded={false}>
          {incidents.length === 0 ? (
            <Empty title="Nada que revisar">Todo lo que ha llegado se ha registrado bien.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {incidents.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-start lg:justify-between">
                  <EmailSummary e={e} saleNumber={e.sale_id ? saleNumber.get(e.sale_id) : undefined} />
                  <div className="shrink-0 lg:max-w-[46%]">
                    <IncidentActions email={e} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {view === "historial" && (
        <Panel padded={false}>
          {hist.length === 0 ? (
            <Empty title="Todavía no ha llegado ningún correo de venta" />
          ) : (
            <ul className="divide-y divide-line">
              {hist.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <EmailSummary e={e} saleNumber={e.sale_id ? saleNumber.get(e.sale_id) : undefined} compact />
                    {(e.kind === "vinted_venta" || e.kind === "wallapop_venta") && (e.status === "duplicado" || e.status === "ignorado") && <UndoButton id={e.id} />}
                    {e.status === "detectada" && (
                      <Link href="/detectadas" className="shrink-0 text-[13px] font-semibold text-brand-ink hover:underline">
                        Ir a confirmarla
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
            Se muestran los 100 últimos. Del correo solo se guardan los datos de la venta; los correos que no son de Vinted ni Wallapop no se guardan.
          </p>
        </Panel>
      )}

      {view === "cuentas" && (
        <Panel
          title="Cuentas de Vinted y Wallapop"
          description="Cada correo empieza con «Hola, usuario». Asigna a cada usuario su responsable y su móvil; si no, la venta se apunta al responsable por defecto."
          padded={false}
        >
          {(accounts ?? []).length === 0 ? (
            <Empty title="Aún no ha llegado ningún correo">Las cuentas aparecerán aquí solas con el primer correo de cada una.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {(accounts ?? []).map((a) => (
                <AccountRow key={a.id} account={a} responsibles={resps ?? []} mobiles={mobiles ?? []} />
              ))}
            </ul>
          )}
        </Panel>
      )}
    </>
  );
}

function ConnectionPanel({
  s,
  credentials,
  defaultResponsible,
  responsibles,
}: {
  s: Status | null;
  credentials: boolean;
  defaultResponsible: string | null;
  responsibles: { id: string; name: string }[];
}) {
  const status = s?.status ?? "desconectado";
  const tone = status === "conectado" ? "good" : status === "desconectado" ? "neutral" : "bad";
  const label = { conectado: "Conectado", desconectado: "Sin conectar", error_autorizacion: "Permiso caducado", error: "Error en la última revisión" }[status];
  const sum = s?.last_summary;
  return (
    <Panel padded={false}>
      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]",
                tone === "good" ? "bg-good text-on-good" : tone === "bad" ? "bg-danger text-white" : "bg-ink/8 text-ink-soft",
              )}
            >
              <Mail size={24} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2">
                <span className="display text-[22px] uppercase leading-none">Gmail</span>
                <Badge tone={tone}>{label}</Badge>
              </p>
              <p className="mt-1 truncate text-sm text-muted">{s?.email ?? CENTRAL_ACCOUNT ?? "Gmail de tu negocio"}</p>
            </div>
          </div>
          {!credentials && (
            <Notice tone="warn" title="Falta un paso en Vercel">
              Añade GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (los da Google Cloud) y vuelve a desplegar. Está explicado paso a paso en la guía «Ventas por correo» del
              repositorio.
            </Notice>
          )}
          {status === "error_autorizacion" && (
            <Notice tone="bad" title="Google ha retirado el permiso">
              {s?.last_error} Pulsa «Volver a conectar». No se pierde nada: los correos que hayan llegado mientras tanto se leerán al reconectar.
            </Notice>
          )}
          {status === "error" && s?.last_error && (
            <Notice tone="bad" title="La última revisión falló">
              {s.last_error} Se volverá a intentar sola en unos minutos.
            </Notice>
          )}
          {s?.connected && !s.cron_active && (
            <Notice tone="warn">La revisión automática no está activa en Supabase. Mientras tanto, usa «Revisar ahora».</Notice>
          )}
          <ConnectionButtons connected={!!s?.connected} credentials={credentials} status={status} />
        </div>

        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
            <dt className="text-muted">Revisión automática</dt>
            <dd>{s?.connected ? (s.cron_active ? "Cada 5 minutos" : "Desactivada") : "—"}</dd>
            <dt className="text-muted">Última revisión</dt>
            <dd className="num">{s?.last_sync_at ? dateTime(s.last_sync_at) : "Nunca"}</dd>
            <dt className="text-muted">Última correcta</dt>
            <dd className="num">{s?.last_success_at ? dateTime(s.last_success_at) : "—"}</dd>
            <dt className="text-muted">Lee correos desde</dt>
            <dd className="num">{s?.connected_at ? dateTime(s.connected_at) : "—"}</dd>
            {sum && (
              <>
                <dt className="text-muted">Último resultado</dt>
                <dd className="num">
                  {sum.new_emails ?? 0} nuevos · {sum.detected ?? 0} ventas detectadas · {sum.labels ?? 0} etiquetas
                  {sum.review ? ` · ${sum.review} a revisar` : ""}
                  {sum.errors ? ` · ${sum.errors} errores` : ""}
                </dd>
              </>
            )}
          </dl>
          <DefaultResponsible value={defaultResponsible} responsibles={responsibles} />
        </div>
      </div>
    </Panel>
  );
}

function EmailSummary({ e, saleNumber, compact }: { e: EmailRowView; saleNumber?: string; compact?: boolean }) {
  const st = STATUS[e.status] ?? { label: e.status, tone: "neutral" as const };
  const p = e.parsed as {
    product?: string;
    price?: number;
    buyer?: string;
    tracking_number?: string;
    transaction_id?: string;
    total?: number;
    shipping?: number;
    account?: string;
  };
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={st.tone}>{st.label}</Badge>
        <span className="text-[13px] font-semibold text-ink-soft">{KIND[e.kind] ?? e.kind}</span>
        <span className="num text-xs text-faint">{dateTime(e.received_at)}</span>
      </p>
      {(p.product || p.price) && (
        <p className="mt-1 font-semibold text-ink">
          {p.product ?? "Artículo sin nombre"}
          {typeof p.price === "number" && <span className="num ml-2 text-brand-ink">{money(p.price)}</span>}
        </p>
      )}
      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
        {p.buyer && <span>Comprador: {p.buyer}</span>}
        {p.account && <span>Cuenta: {p.account}</span>}
        {typeof p.shipping === "number" && <span className="num">Envío {money(p.shipping)}</span>}
        {typeof p.total === "number" && <span className="num">Total {money(p.total)}</span>}
        {p.tracking_number && <span className="num">Seguimiento {p.tracking_number}</span>}
        {p.transaction_id && <span className="num">Transacción {p.transaction_id}</span>}
        {e.sale_id && (
          <Link href={`/ventas/${e.sale_id}`} className="font-semibold text-brand-ink hover:underline">
            Ver venta {saleNumber ?? ""}
          </Link>
        )}
      </p>
      {!compact && e.review_reason && <p className="mt-1.5 text-sm text-ink-soft">{e.review_reason}</p>}
      {compact && e.status !== "procesado" && e.review_reason && <p className="mt-1 text-[13px] text-muted">{e.review_reason}</p>}
      {e.status === "error" && e.last_error && (
        <p className="mt-1 text-[13px] text-danger">
          Intento {e.attempts}: {e.last_error}
        </p>
      )}
    </div>
  );
}
