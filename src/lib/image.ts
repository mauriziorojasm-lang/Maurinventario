/**
 * Preparación de fotos en el propio dispositivo (navegador).
 *
 * Las fotos del iPhone vienen en HEIC y pesan mucho. Antes de subirlas se
 * redibujan en un lienzo y se guardan como JPG:
 *   · formato que acepta todo el mundo (también Vinted y Wallapop),
 *   · tamaño razonable (lado mayor 2000 px, ~300-600 KB),
 *   · SIN datos internos (fecha, modelo de móvil, ubicación GPS…),
 *     porque el lienzo no copia los metadatos del archivo original.
 */

export const MAX_SIDE = 2000;
const QUALITY = 0.86;

export type PreparedImage = { blob: Blob; width: number; height: number };

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  // 1) Lo más rápido: createImageBitmap (respeta la orientación de la foto)
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* algunos navegadores no lo admiten para HEIC: se prueba con <img> */
    }
  }
  // 2) Con una imagen normal (Safari abre HEIC así)
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("UNREADABLE");
  }
}

/** Convierte cualquier foto que el navegador sepa abrir en un JPG limpio y ligero. */
export async function prepareImage(file: Blob, maxSide = MAX_SIDE): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith("image/") && !/\.(heic|heif)$/i.test((file as File).name ?? "")) {
    throw new Error("Ese archivo no es una foto.");
  }
  let d;
  try {
    d = await decode(file);
  } catch {
    throw new Error(
      "Este navegador no puede abrir esa foto (suele pasar con fotos HEIC fuera del iPhone). Prueba desde el iPhone o el iPad, o guarda la foto como JPG.",
    );
  }
  const scale = Math.min(1, maxSide / Math.max(d.width, d.height));
  const w = Math.max(1, Math.round(d.width * scale));
  const h = Math.max(1, Math.round(d.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se ha podido preparar la foto.");
  ctx.fillStyle = "#ffffff"; // las PNG con transparencia quedan con fondo blanco
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(d.source, 0, 0, w, h);
  d.close();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
  canvas.width = canvas.height = 0; // libera memoria en el iPhone
  if (!blob) throw new Error("No se ha podido preparar la foto.");
  return { blob, width: w, height: h };
}

/** Copia nueva de una foto ya guardada (JPG recién creado, sin datos internos), lista para compartir. */
export async function freshCopy(url: string, name: string): Promise<File> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se ha podido descargar la foto.");
  const prepared = await prepareImage(await res.blob());
  return new File([prepared.blob], name, { type: "image/jpeg", lastModified: Date.now() });
}
