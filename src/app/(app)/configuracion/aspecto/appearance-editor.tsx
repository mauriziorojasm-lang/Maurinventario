"use client";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Panel, clsx } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { DEFAULT_PREFS, MODES, PALETTES, type Palette, type Prefs } from "@/lib/preferences";
import { resetPreferences, savePreferences } from "../actions";
import { SaveBar, Toggle } from "../settings-ui";

type A = Prefs["appearance"];

/** Aplica el aspecto a la página al momento (vista previa real). */
function apply(a: A) {
  const el = document.documentElement;
  const set = (k: string, v?: string) => (v ? el.setAttribute(k, v) : el.removeAttribute(k));
  set("data-mode", a.mode === "auto" ? undefined : a.mode);
  set("data-palette", a.palette === "vinted" ? undefined : a.palette);
  set("data-motion", a.reduceMotion ? "reduce" : undefined);
}

const MODE_ICON = { auto: Monitor, light: Sun, dark: Moon } as const;

export function AppearanceEditor({ initial }: { initial: A }) {
  const [saved, setSaved] = useState<A>(initial);
  const [a, setA] = useState<A>(initial);
  const { run, pending, error, message } = useServerAction(savePreferences<"appearance">);
  const dirty = useMemo(() => JSON.stringify(a) !== JSON.stringify(saved), [a, saved]);

  useEffect(() => apply(a), [a]);
  // Al salir sin guardar, se vuelve a lo guardado
  useEffect(() => () => apply(saved), [saved]);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Modo" description="Automático sigue al iPhone, iPad u ordenador (claro de día, oscuro de noche si lo tienes así).">
          <div role="radiogroup" aria-label="Modo de color" className="grid grid-cols-3 gap-2">
            {(Object.keys(MODES) as A["mode"][]).map((m) => {
              const Icon = MODE_ICON[m];
              const on = a.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setA({ ...a, mode: m })}
                  className={clsx(
                    "press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border-2 p-2 text-center text-[13px] font-semibold",
                    on ? "border-brand bg-brand-soft text-brand-ink" : "border-line hover:border-ink/30",
                  )}
                >
                  <Icon size={22} strokeWidth={2.25} />
                  {m === "auto" ? "Automático" : MODES[m]}
                </button>
              );
            })}
          </div>
        </Panel>
        <Panel title="Tema de color" description="Cambia el color de botones, menús, gráficos e indicadores. Los colores de estado (verde bien, rojo error) no cambian.">
          <div role="radiogroup" aria-label="Tema de color" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(Object.keys(PALETTES) as Palette[]).map((p) => {
              const on = a.palette === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setA({ ...a, palette: p })}
                  className={clsx(
                    "press flex min-h-12 items-center gap-2.5 rounded-[var(--radius-sm)] border-2 px-3 text-left text-[13.5px] font-semibold",
                    on ? "border-ink" : "border-line hover:border-ink/30",
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: PALETTES[p].swatch }}>
                    {on && <Check size={14} strokeWidth={3} />}
                  </span>
                  {PALETTES[p].label}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Accesibilidad">
          <Toggle
            checked={a.reduceMotion}
            onChange={(v) => setA({ ...a, reduceMotion: v })}
            label="Reducir animaciones"
            description="Quita las animaciones de cifras, ventanas y cargas. Si tu dispositivo ya lo pide, se respeta siempre."
          />
          <p className="border-t border-line pt-3 text-[13px] text-muted">
            La letra es la de siempre. Todos los botones se pueden usar con teclado (Tab) y muestran un contorno al seleccionarlos.
          </p>
        </Panel>
        <Panel title="Vista previa">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="sm" type="button">
                Botón principal
              </Button>
              <Button size="sm" type="button">
                Secundario
              </Button>
              <Badge tone="good">Enviado</Badge>
              <Badge tone="warn">Pendiente</Badge>
              <span className="lot-tag">Pedido #7</span>
            </div>
            <div className="rounded-[var(--radius-sm)] border border-line bg-surface-2 p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Ingresos</p>
              <p className="display num text-[28px]">1.234,50 €</p>
              <p className="text-[12.5px] font-semibold text-good">+12,4 % vs mes anterior</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/6">
                <div className="h-full w-2/3 rounded-full bg-brand" />
              </div>
            </div>
            <p className="text-[12px] text-faint">Ejemplo ilustrativo del estilo, no son datos tuyos.</p>
          </div>
        </Panel>
      </div>
      <SaveBar
        dirty={dirty}
        pending={pending}
        onSave={async () => {
          const r = await run("appearance", { ...a });
          if (r.ok) setSaved(a);
        }}
        onDiscard={() => setA(saved)}
        error={error}
        message={message}
        reset={{
          label: "Aspecto inicial",
          description: "Vuelve a Automático, Verde Vinted y animaciones normales.",
          action: () => resetPreferences("appearance"),
          onDone: () => {
            setA(DEFAULT_PREFS.appearance);
            setSaved(DEFAULT_PREFS.appearance);
          },
        }}
      />
    </div>
  );
}
