import type { Metadata, Viewport } from "next";
import "@fontsource-variable/public-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MaurInventario", template: "%s · MaurInventario" },
  description: "Inventario, ventas, compras y rentabilidad.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#18202b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
