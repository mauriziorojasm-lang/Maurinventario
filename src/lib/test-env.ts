/**
 * Variables que SOLO se usan en las pruebas automáticas (servicios
 * simulados de Gmail, Google y Gemini). En la web real (Vercel producción)
 * se ignoran siempre, aunque alguien las añadiera por error.
 */
export function testOnlyEnv(name: string): string | undefined {
  if (process.env.VERCEL_ENV === "production") return undefined;
  return process.env[name]?.trim() || undefined;
}
