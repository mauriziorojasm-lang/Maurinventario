// Genera los recursos de marca (símbolos, iconos de app, favicon, imagen para compartir) a partir de la geometría oficial del símbolo. Uso: node scripts/generar-marca.mjs public
import sharp from "sharp";
import { writeFileSync } from "node:fs";
const out = process.argv[2];
const A = "M0 0H38V50H0ZM43 0H71A25 25 0 0 1 71 50H43ZM0 55H38V96H0Z";
const B = "M43 55H67L96 96H72Z";
const As = "M0 0H36V48H0ZM44 0H72A24 24 0 0 1 72 48H44ZM0 56H36V96H0Z";
const Bs = "M44 56H68L96 96H72Z";
const INK = "#0B0F0E", G5 = "#0F9D63", G4 = "#36C784", W = "#FFFFFF";
const sym = (a, b, small = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Resellap"><path fill="${a}" d="${small ? As : A}"/><path fill="${b}" d="${small ? Bs : B}"/></svg>\n`;
const styles = { tinta: [INK, INK], acento: [INK, G5], blanco: [W, W], "blanco-acento": [W, G4], verde: [G5, G5] };
for (const [k, [a, b]] of Object.entries(styles)) {
  writeFileSync(`${out}/brand/resellap-simbolo-${k}.svg`, sym(a, b));
  writeFileSync(`${out}/brand/resellap-simbolo-${k}-small.svg`, sym(a, b, true));
}
// Favicon adaptable (claro/oscuro) con el corte pequeño
writeFileSync(`${out}/../src/app/icon.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 96 96"><style>path{fill:${INK}}.l{fill:${G5}}@media (prefers-color-scheme:dark){path{fill:#FFFFFF}.l{fill:${G4}}}</style><path d="${As}"/><path class="l" d="${Bs}"/></svg>\n`);
// Icono de app: símbolo al 50 % sobre tinta
const icon = (size, scale = 0.5, small = false) => {
  const s = size * scale, o = (size - s) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${INK}"/><g transform="translate(${o} ${o}) scale(${s / 96})"><path fill="${W}" d="${small ? As : A}"/><path fill="${G5}" d="${small ? Bs : B}"/></g></svg>`);
};
const png = (svg, file) => sharp(svg).png({ compressionLevel: 9 }).toFile(file);
await png(icon(180), `${out}/icons/apple-icon-180.png`);
await png(icon(192), `${out}/icons/icon-192.png`);
await png(icon(512), `${out}/icons/icon-512.png`);
await png(icon(512, 0.42), `${out}/icons/maskable-512.png`);
await png(icon(1024), `${out}/brand/resellap-app-icon-1024.png`);
// favicon.ico (32 px, corte pequeño) — PNG dentro de ICO
const ico32 = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 96 96"><path fill="${INK}" d="${As}"/><path fill="${G5}" d="${Bs}"/></svg>`)).png().toBuffer();
const hdr = Buffer.alloc(22); hdr.writeUInt16LE(0,0); hdr.writeUInt16LE(1,2); hdr.writeUInt16LE(1,4);
hdr.writeUInt8(32,6); hdr.writeUInt8(32,7); hdr.writeUInt8(0,8); hdr.writeUInt8(0,9); hdr.writeUInt16LE(1,10); hdr.writeUInt16LE(32,12);
hdr.writeUInt32LE(ico32.length,14); hdr.writeUInt32LE(22,18);
writeFileSync(`${out}/../src/app/favicon.ico`, Buffer.concat([hdr, ico32]));
// Imagen para compartir (Open Graph) 1200x630
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${INK}"/>
<g transform="translate(96 96) scale(1.25)"><path fill="${W}" d="${A}"/><path fill="${G4}" d="${B}"/></g>
<text x="96" y="430" font-family="Instrument Sans, Inter, sans-serif" font-weight="600" font-size="84" letter-spacing="-2.5" fill="${W}">Sabes lo que ganas.</text>
<text x="96" y="500" font-family="Inter, sans-serif" font-weight="400" font-size="34" fill="#B4BDB9">Inventario, ventas, envíos y beneficio para revendedores.</text>
<text x="96" y="566" font-family="Instrument Sans, Inter, sans-serif" font-weight="600" font-size="34" letter-spacing="-1" fill="${G4}">Resellap</text></svg>`;
writeFileSync(`${out}/brand/og.svg`, og);
console.log("ok");
