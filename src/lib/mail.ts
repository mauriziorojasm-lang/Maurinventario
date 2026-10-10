import "server-only";

/**
 * Envío de correos transaccionales (invitaciones) con Resend.
 * Sin RESEND_API_KEY y MAIL_FROM no se envía nada: la pantalla muestra el
 * enlace para copiarlo. La verificación de email y la recuperación de
 * contraseña las envía Supabase Auth con su propio SMTP.
 */
export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY?.trim() && !!process.env.MAIL_FROM?.trim();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendMail(to: string, subject: string, text: string, link?: { href: string; label: string }): Promise<boolean> {
  if (!mailConfigured()) return false;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1b">
<p>${esc(text).replace(/\n/g, "<br>")}</p>
${link ? `<p><a href="${esc(link.href)}" style="display:inline-block;background:#007782;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">${esc(link.label)}</a></p><p style="font-size:13px;color:#666">Si el botón no funciona, copia este enlace: ${esc(link.href)}</p>` : ""}
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM!.trim(), to: [to], subject, text: link ? `${text}\n\n${link.href}` : text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
