/** Esqueletos mientras carga una pantalla (aparecen al instante al tocar un enlace). */
import { clsx } from "./ui";

function Bar({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-[8px]", className)} />;
}

export function ListSkeleton({ rows = 8, filters = true }: { rows?: number; filters?: boolean }) {
  return (
    <div aria-busy aria-label="Cargando" className="animate-fade">
      <Bar className="mb-2 h-9 w-48" />
      <Bar className="mb-5 h-4 w-72 max-w-full" />
      {filters && <Bar className="mb-4 h-11 w-full md:h-[66px]" />}
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <Bar className="h-10 w-10 shrink-0" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Bar className="h-3.5" />
              <Bar className="h-3 w-1/2" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy aria-label="Cargando" className="animate-fade">
      <Bar className="mb-2 h-4 w-24" />
      <Bar className="mb-6 h-9 w-72 max-w-full" />
      <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <Bar className="aspect-square w-full rounded-[var(--radius-md)]" />
        <div className="flex flex-col gap-4">
          <Bar className="h-28 w-full rounded-[var(--radius-md)]" />
          <Bar className="h-52 w-full rounded-[var(--radius-md)]" />
        </div>
      </div>
    </div>
  );
}
