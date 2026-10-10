"use client";
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Field, Panel, Select, clsx } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { DEFAULT_PREFS, GRANULARITIES, PERIODS, WIDGETS, WIDGET_BY_ID, type Prefs, type WidgetGroup, type WidgetItem, type WidgetSize } from "@/lib/preferences";
import { resetPreferences, savePreferences } from "../actions";
import { SaveBar, Toggle } from "../settings-ui";

type D = Prefs["dashboard"];
const SIZE_LABEL: Record<WidgetSize, string> = { "1x1": "Pequeño", "2x1": "Ancho", "2x2": "Grande" };
const PREVIEW: Record<WidgetSize, string> = { "1x1": "col-span-1 h-14", "2x1": "col-span-2 h-14", "2x2": "col-span-2 row-span-2 h-[7.75rem]" };
const GROUPS: WidgetGroup[] = ["Indicadores", "Análisis comercial", "Inventario y actividad"];

export function DashboardEditor({ initial, platforms }: { initial: D; platforms: { id: string; name: string }[] }) {
  const [saved, setSaved] = useState<D>(initial);
  const [d, setD] = useState<D>(initial);
  const { run, pending, error, message } = useServerAction(savePreferences<"dashboard">);
  const dirty = useMemo(() => JSON.stringify(d) !== JSON.stringify(saved), [d, saved]);
  const inPanel = new Set(d.widgets.map((w) => w.id));
  const setWidgets = (widgets: WidgetItem[]) => setD((x) => ({ ...x, widgets }));

  function move(i: number, to: number) {
    if (to < 0 || to >= d.widgets.length) return;
    const next = [...d.widgets];
    const [it] = next.splice(i, 1);
    next.splice(to, 0, it);
    setWidgets(next);
  }

  async function save() {
    const r = await run("dashboard", { ...d });
    if (r.ok) setSaved(d);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Vista previa */}
        <Panel title="Vista previa" description="Así se ordenan los widgets en el inicio (en el móvil, 2 columnas; en el ordenador, 4).">
          {d.widgets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">El panel está vacío. Añade widgets desde el catálogo.</p>
          ) : (
            <ol className="grid grid-flow-row-dense grid-cols-4 gap-2" aria-label="Vista previa del panel">
              {d.widgets.map((w) => (
                <li
                  key={w.id}
                  className={clsx(
                    "flex items-start overflow-hidden rounded-[10px] border border-brand/30 bg-brand-soft p-2 text-[11.5px] font-semibold leading-tight text-brand-ink",
                    PREVIEW[w.size],
                  )}
                >
                  {WIDGET_BY_ID.get(w.id)?.title}
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* Widgets añadidos */}
        <Panel title={`En tu panel (${d.widgets.length})`} description="Cambia el tamaño, el orden o quítalos." padded={false}>
          {d.widgets.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted">Ninguno.</p>
          ) : (
            <ul className="divide-y divide-line">
              {d.widgets.map((w, i) => {
                const def = WIDGET_BY_ID.get(w.id)!;
                return (
                  <li key={w.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1 text-sm font-semibold">{def.title}</span>
                    <div role="radiogroup" aria-label={`Tamaño de ${def.title}`} className="flex rounded-full border border-line-strong p-0.5">
                      {def.sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={w.size === s}
                          onClick={() => setWidgets(d.widgets.map((x) => (x.id === w.id ? { ...x, size: s } : x)))}
                          className={clsx("min-h-9 rounded-full px-2.5 text-[12.5px] font-semibold", w.size === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink")}
                        >
                          {SIZE_LABEL[s]}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <IconBtn label={`Subir ${def.title}`} onClick={() => move(i, i - 1)} disabled={i === 0}>
                        <ArrowUp size={17} />
                      </IconBtn>
                      <IconBtn label={`Bajar ${def.title}`} onClick={() => move(i, i + 1)} disabled={i === d.widgets.length - 1}>
                        <ArrowDown size={17} />
                      </IconBtn>
                      <IconBtn label={`Quitar ${def.title}`} onClick={() => setWidgets(d.widgets.filter((x) => x.id !== w.id))} danger>
                        <Trash2 size={17} />
                      </IconBtn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* Catálogo */}
      <Panel title="Catálogo de widgets" description="Cada widget muestra datos reales de la app. Los que no se pueden calcular explican por qué.">
        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <section key={g} aria-label={g}>
              <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.1em] text-muted">{g}</h3>
              <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {WIDGETS.filter((w) => w.group === g).map((w) => {
                  const added = inPanel.has(w.id);
                  return (
                    <li key={w.id} className={clsx("flex flex-col gap-2 rounded-[var(--radius-sm)] border p-3", added ? "border-brand/40 bg-brand-soft/40" : "border-line", w.unavailable && "opacity-75")}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[15px] font-semibold">{w.title}</span>
                        {added && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11.5px] font-bold text-on-brand">
                            <Check size={12} strokeWidth={3} /> Añadido
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-muted">{w.unavailable ?? w.description}</p>
                      <p className="text-[12px] text-faint">Tamaños: {w.sizes.map((s) => SIZE_LABEL[s].toLowerCase()).join(", ")}</p>
                      <div className="mt-auto">
                        {w.unavailable ? (
                          <span className="text-[12.5px] font-semibold text-muted">No disponible</span>
                        ) : added ? (
                          <Button size="sm" onClick={() => setWidgets(d.widgets.filter((x) => x.id !== w.id))}>
                            <Trash2 size={15} /> Quitar
                          </Button>
                        ) : (
                          <Button size="sm" variant="primary" onClick={() => setWidgets([...d.widgets, { id: w.id, size: w.sizes[0] }])}>
                            <Plus size={15} strokeWidth={2.75} /> Añadir
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Panel>

      {/* Análisis */}
      <Panel title="Análisis" description="Valores con los que se abre el panel. Desde el inicio puedes cambiar el periodo y la plataforma en cualquier momento.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Periodo predeterminado">
            <Select value={d.period} onChange={(e) => setD({ ...d, period: e.target.value as D["period"] })}>
              {Object.entries(PERIODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Evolución de las ventas">
            <Select value={d.granularity} onChange={(e) => setD({ ...d, granularity: e.target.value as D["granularity"] })}>
              {Object.entries(GRANULARITIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plataforma">
            <Select value={d.platformId ?? ""} onChange={(e) => setD({ ...d, platformId: e.target.value || null })}>
              <option value="">Todas</option>
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-2 border-t border-line">
          <Toggle
            checked={d.compare}
            onChange={(v) => setD({ ...d, compare: v })}
            label="Comparar con el periodo anterior"
            description="Muestra la variación en % frente al mismo tramo del periodo anterior (por ejemplo, del 1 al 10 de este mes frente al 1 al 10 del mes pasado)."
          />
        </div>
      </Panel>

      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={save}
        onDiscard={() => setD(saved)}
        error={error}
        message={message}
        reset={{
          label: "Distribución inicial",
          description: "El panel vuelve a los widgets, tamaños y orden iniciales. No se borra ningún dato.",
          action: () => resetPreferences("dashboard"),
          onDone: () => {
            setD(DEFAULT_PREFS.dashboard);
            setSaved(DEFAULT_PREFS.dashboard);
          },
        }}
      />
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "press flex h-11 w-11 items-center justify-center rounded-full border border-line-strong disabled:opacity-30 md:h-9 md:w-9",
        danger ? "text-danger hover:bg-danger-soft" : "text-ink-soft hover:bg-ink/6",
      )}
    >
      {children}
    </button>
  );
}
