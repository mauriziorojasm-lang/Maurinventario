import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    // Subida de fotos y etiquetas a través de acciones del servidor
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
