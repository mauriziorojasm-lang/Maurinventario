import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, parseAppearanceCookie } from "@/lib/preferences";
import "@fontsource-variable/public-sans";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MaurInventario", template: "%s · MaurInventario" },
  description: "Inventario, ventas, compras y rentabilidad.",
  robots: { index: false, follow: false },
  // Instalada desde Safari («Añadir a pantalla de inicio») se abre como una app
  applicationName: "MaurInventario",
  appleWebApp: { capable: true, title: "MaurInventario", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#121110" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0a09" },
  ],
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Aspecto elegido por el usuario (se guarda también en una cookie para pintar ya con él)
  const a = parseAppearanceCookie((await cookies()).get(APPEARANCE_COOKIE)?.value);
  return (
    <html
      lang="es"
      className="h-full antialiased"
      data-mode={a.mode === "auto" ? undefined : a.mode}
      data-palette={a.palette === "vinted" ? undefined : a.palette}
      data-motion={a.reduceMotion ? "reduce" : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
