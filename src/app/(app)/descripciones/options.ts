/** Opciones del generador (compartidas entre la pantalla y el servidor). */

export const TONES = {
  profesional: { label: "Profesional", hint: "Cuidada, clara y comercial" },
  natural: { label: "Natural", hint: "Cercana, humana y directa" },
  informal: { label: "Informal", hint: "Desenfadada, sin sonar artificial" },
  premium: { label: "Premium", hint: "Calidad y diseño, sin exagerar" },
  tecnico: { label: "Técnico", hint: "Materiales y datos verificables" },
} as const;
export type Tone = keyof typeof TONES;

export const PLATFORMS = {
  wallapop: "Wallapop",
  vinted: "Vinted",
  ebay: "eBay",
  instagram: "Instagram",
  facebook: "Facebook Marketplace",
  milanuncios: "Milanuncios",
  otra: "Otra plataforma",
} as const;
export type PlatformKey = keyof typeof PLATFORMS;

export const LENGTHS = {
  corta: "Corta",
  media: "Media",
  detallada: "Detallada",
} as const;
export type Length = keyof typeof LENGTHS;

export const CONDITIONS = [
  "Nuevo con etiquetas",
  "Nuevo sin etiquetas",
  "Nuevo, sin usar",
  "Como nuevo",
  "Muy buen estado",
  "Buen estado",
  "Usado, con señales de uso",
  "Para piezas o reparar",
] as const;

/** Datos que el usuario puede completar o corregir para cada producto (no se guardan en la ficha). */
export type ProductDetails = {
  brand: string;
  model: string;
  category: string;
  variant: string;
  frameColor: string;
  lens: string;
  condition: string;
  features: string;
  defects: string;
  accessories: string;
  price: string;
  extra: string;
};

export const MAX_PRODUCTS = 5;
export const MAX_FIELD = 300;
export const MAX_LONG_FIELD = 800;
