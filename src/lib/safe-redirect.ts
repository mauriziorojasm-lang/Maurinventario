/**
 * Destino después de iniciar sesión: solo rutas de la propia app.
 * Evita que un enlace trucado (p. ej. «/login?next=/\evil.com») lleve a otra web.
 */
const ORIGIN = "https://app.local";

export function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return "/";
  }
  for (const v of [next, decoded]) {
    if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\") || /[\u0000-\u001f\u007f]/.test(v)) return "/";
  }
  try {
    return new URL(next, ORIGIN).origin === ORIGIN ? next : "/";
  } catch {
    return "/";
  }
}
