import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { BootSplash } from "@/components/boot-splash";
import { APPEARANCE_COOKIE, parseAppearanceCookie } from "@/lib/preferences";
import { SITE_URL } from "@/lib/site";
import "@fontsource-variable/inter";
import "@fontsource-variable/instrument-sans";
import "./globals.css";

const DESCRIPTION = "Inventario, ventas detectadas, envíos y beneficio real para quien revende en Vinted, Wallapop y más.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Resellap", template: "%s · Resellap" },
  description: DESCRIPTION,
  robots: { index: false, follow: false },
  // Instalada desde Safari («Añadir a pantalla de inicio») se abre como una app
  applicationName: "Resellap",
  appleWebApp: { capable: true, title: "Resellap", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-icon-180.png", sizes: "180x180" }] },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: "Resellap",
    title: "Resellap",
    description: DESCRIPTION,
    locale: "es_ES",
    images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: "Resellap" }],
  },
  twitter: { card: "summary_large_image", title: "Resellap", description: DESCRIPTION, images: ["/brand/og.png"] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f0e" },
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
      data-motion={a.reduceMotion ? "reduce" : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <BootSplash />
        {children}
      </body>
    </html>
  );
}
