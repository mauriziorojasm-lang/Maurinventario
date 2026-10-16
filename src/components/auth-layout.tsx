import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./brand";

/** Retícula de módulos del símbolo, con una sola pieza en verde (recurso gráfico de la marca). */
export function ModulePattern({ className }: { className?: string }) {
  const cells: ReactNode[] = [];
  const u = 44;
  const g = 6;
  let k = 0;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 9; x++) {
      k++;
      const px = x * (u + g);
      const py = y * (u + g);
      const fill = k === 23 ? "#36C784" : "#1A211F";
      const t = k % 4;
      if (t === 1) cells.push(<path key={k} d={`M${px} ${py}H${px + u / 2}A${u / 2} ${u / 2} 0 0 1 ${px + u / 2} ${py + u}H${px}Z`} fill={fill} />);
      else if (t === 3) cells.push(<path key={k} d={`M${px} ${py}H${px + u * 0.45}L${px + u} ${py + u}H${px + u * 0.55}Z`} fill={fill} />);
      else cells.push(<rect key={k} x={px} y={py} width={u} height={u} fill={fill} />);
    }
  }
  return (
    <svg viewBox={`0 0 ${9 * (u + g) - g} ${5 * (u + g) - g}`} className={className} aria-hidden="true">
      {cells}
    </svg>
  );
}

/** Diseño común de entrar, registro, recuperación, bienvenida e invitaciones. */
export function AuthLayout({ title, subtitle, children, aside }: { title: string; subtitle?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(460px,560px)]">
      {/* Columna de marca (en el móvil, una cabecera compacta) */}
      <div className="relative flex flex-col justify-between gap-8 overflow-hidden bg-[#0B0F0E] px-6 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-[#F4F6F5] lg:px-12 lg:py-12">
        <Link href="/precios" aria-label="Resellap" className="relative w-fit">
          <Logo size={28} tone="white" />
        </Link>
        <div className="relative max-w-xl animate-rise">
          {aside ?? (
            <p className="font-[family-name:var(--font-display)] text-[30px] font-semibold leading-[1.08] tracking-[-0.025em] text-white sm:text-[40px] lg:text-[52px]">
              Sabes lo que tienes, lo que te costó <span className="text-[#36C784]">y lo que ganas.</span>
            </p>
          )}
          <p className="mt-4 hidden max-w-md text-[15px] leading-relaxed text-[#B4BDB9] sm:block">
            Resellap detecta tus ventas en el correo, te propone el producto y el transportista, y sigue el envío hasta que llega.
          </p>
        </div>
        <ModulePattern className="relative hidden w-full max-w-lg lg:block" />
      </div>
      <div className="flex items-start justify-center px-5 pb-12 pt-8 sm:px-6 lg:items-center lg:py-12">
        <div className="w-full max-w-sm animate-rise">
          <h1 className="display text-[30px] text-ink sm:text-[34px]">{title}</h1>
          {subtitle && <div className="mb-6 mt-1.5 text-[14.5px] text-muted">{subtitle}</div>}
          {!subtitle && <div className="mb-6" />}
          {children}
        </div>
      </div>
    </div>
  );
}
