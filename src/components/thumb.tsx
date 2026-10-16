/**
 * Miniatura de producto: la foto del anuncio o del producto. Si no hay
 * foto, un hueco neutro con el símbolo (nunca una imagen rota).
 */
import { clsx } from "./ui";

export function ProductThumb({ src, alt, size = 56, className, rounded = 10 }: { src: string | null | undefined; alt: string; size?: number; className?: string; rounded?: number }) {
  const box = { width: size, height: size, borderRadius: rounded };
  if (!src) {
    return (
      <span aria-hidden className={clsx("flex shrink-0 items-center justify-center border border-line bg-surface-2", className)} style={box}>
        <svg viewBox="0 0 96 96" width={Math.round(size * 0.34)} height={Math.round(size * 0.34)}>
          <path fill="var(--line-strong)" d="M0 0H36V48H0ZM44 0H72A24 24 0 0 1 72 48H44ZM0 56H36V96H0Z" />
          <path fill="var(--line-strong)" d="M44 56H68L96 96H72Z" />
        </svg>
      </span>
    );
  }
  return (
    // Fotos privadas con enlace temporal firmado: no pasan por el optimizador de imágenes
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={clsx("shrink-0 border border-line bg-surface-2 object-cover", className)} style={box} />
  );
}
