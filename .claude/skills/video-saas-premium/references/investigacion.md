# Investigación profunda

El material de un buen concepto es **lo que la marca ya es**, no lo que "los videos SaaS suelen tener". Extrae toda la información real posible antes de imaginar nada. Todo lo que escribas debe tener fuente.

## Fuentes (de la más a la menos importante)

### 1. La web, completa
- `python3 <skill>/scripts/brand_from_url.py <url> brand/` → colores (revisa sus roles a ojo), tipografías, logo, titulares del DOM y capturas.
- Recorre **todas** las páginas que existan: inicio, producto o features, precios, comparativas, casos, docs, changelog, blog, nosotros, FAQ. Cada una se captura y el copy se guarda.
- Anota:
  - la frase que más repiten;
  - la promesa central;
  - qué comparan con la competencia;
  - qué es gratis y qué de pago;
  - qué demuestran con capturas o videos propios.

### 2. Instagram (y TikTok, X, LinkedIn, YouTube)
- **Perfil**: bio, link, destacados (qué temas eligieron fijar).
- **Los últimos 12–20 posts** y **los 3–5 con más interacción**: qué muestran, qué formato usan (carrusel, reel, foto) y cómo es el texto de los captions.
- **Cómo se mueve la marca en sus reels**: ritmo, transiciones, tipografía en pantalla, música, si sale gente o solo producto. El video nuevo debe sentirse **de la misma familia, pero mejor**, no de otra marca.
- **Comentarios**: qué pregunta la gente, qué elogia y de qué se queja. Ahí está lo que la gente no entiende del producto, que es justo lo que el motion puede explicar. No copies nombres ni datos personales de nadie.
- **Acceso**:
  - Si tienes un navegador conectado (por ejemplo Claude in Chrome), úsalo.
  - Instagram suele bloquear el navegador headless con un login. En ese caso **pide capturas**: el perfil, 3–5 posts, un par de reels y los comentarios más reveladores.
  - Nunca rellenes con suposiciones.

### 3. Tiendas, reseñas y prensa
- App Store / Google Play: capturas oficiales, descripción, nota, reseñas.
- Google Maps, G2, Capterra, Product Hunt, Trustpilot, X: elogios y quejas que se repiten.
- Usa solo hechos verificables y cita la fuente. Una reseña no se convierte en cifra ("4,8 ★ en App Store" solo si se ve en la tienda hoy).

### 4. La competencia (2–3)
Cómo se presentan, qué colores y estructuras de video usan. Sirve para **diferenciarse**: si todos hacen "problema oscuro → dashboard claro", ese camino ya está gastado en esta categoría.

### 5. El producto real
- Capturas de la persona (ver [Capturas de UI](capturas-ui.md)), una cuenta demo o el propio producto si es público.
- **El código del producto, si lo tiene local**: íconos (SVG o paths), tokens de color, tipografías, componentes y textos reales. Es la fuente más fiel que existe.

### 6. Activos de marca existentes
Logo (SVG), mascota o personajes, ilustraciones, `.riv` (Rive), `.lottie`/`.json` (Lottie), proyectos de After Effects, fotos, footage, guía de marca. **Lo que ya existe decide herramientas**: una mascota en Rive pide Rive; un set de íconos animados en Lottie pide Lottie.

## El dossier: `investigacion/dossier.md`

```markdown
# <Producto> — dossier

## En una frase (con SUS palabras)
## Para quién es
## El momento "wow" (qué pasa cuando funciona)
## Lo que más repiten (copy textual + dónde)
## Cómo hablan (3–5 citas textuales de la web y de las redes)
## Lo que la gente pregunta, elogia y critica (resumido, sin nombres)
## Lenguaje visual propio
- colores con su rol, tipografías, formas y motivos que repiten, cómo se mueven sus reels, fotos o ilustración
## Activos disponibles (con rutas)
## Hechos usables en pantalla (cada uno con su fuente)
## Competencia: cómo se presentan y en qué se diferencia este producto
## Lo que NO sabemos (preguntarle a la persona)
```

Muéstrale a la persona un resumen de 5–8 líneas: **qué entendiste del producto y qué te sorprendió**. Si algo está mal, aquí sale barato.

## Reglas
- **Solo hechos.** Nada de estadísticas, testimonios, logos de clientes ni "el más usado" sin fuente visible.
- **Privacidad**: sin nombres, caras ni datos de terceros (comentarios, capturas con emails o teléfonos). Tápalos o usa datos de demo.
- **Copia los textos exactos.** No los parafrasees de memoria.
