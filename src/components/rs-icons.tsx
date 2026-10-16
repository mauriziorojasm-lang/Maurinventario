/**
 * Iconos de Resellap. Mismo lenguaje que el símbolo: formas rectas, esquinas
 * limpias, una sola línea de 1,75 sobre la retícula de 24. Los del manual de
 * marca (stock, venta, compra, plataforma, ajustes…) son los originales; los
 * que faltan se derivan de ellos con las mismas reglas.
 */
import type { ComponentType } from "react";

export type RsIconProps = { size?: number; strokeWidth?: number; className?: string };
export type RsIcon = ComponentType<RsIconProps>;

const PATHS = {
  // Del manual de marca
  inicio: "M4 10.5 12 4l8 6.5V20H4zM9.5 20v-5.5h5V20",
  inventario: "M3.9 4h16.2v6.6H3.9zM3.9 13.4h16.2V20H3.9zM9.5 7.3h5M9.5 16.7h5",
  ventas: "M12 15V4.5M8 8.5l4-4 4 4M4 14v6h16v-6",
  compras: "M12 4v10.5M8 10.5l4 4 4-4M4 14v6h16v-6",
  informes: "M4 20h16M7 16.5V12M12 16.5V8M17 16.5V5",
  // Derivados con la misma lógica
  detectadas: "M3.9 3.9h16.2v16.2H3.9zM8 12.4l2.7 2.7L16 9.6",
  envios: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM4 7.5 12 12l8-4.5M12 12v9",
  seguimiento: "M12 21s-6.2-5.3-6.2-10.3a6.2 6.2 0 0 1 12.4 0C18.2 15.7 12 21 12 21zM12 13.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z",
} as const;

export type RsIconName = keyof typeof PATHS;

function make(name: RsIconName): RsIcon {
  const d = PATHS[name];
  const Icon = ({ size = 24, strokeWidth = 1.75, className }: RsIconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
  Icon.displayName = `RsIcon(${name})`;
  return Icon;
}

export const IconInicio = make("inicio");
export const IconInventario = make("inventario");
export const IconVentas = make("ventas");
export const IconDetectadas = make("detectadas");
export const IconEnvios = make("envios");
export const IconSeguimiento = make("seguimiento");
export const IconInformes = make("informes");
export const IconCompras = make("compras");
