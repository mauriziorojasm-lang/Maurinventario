# Antes de empezar

La persona tiene que saber **desde el primer mensaje** todo lo que necesitas y **qué pierde si falta algo**. Nada de pedir cosas de a una a mitad del trabajo.

## 1. Revisa el equipo

```bash
python3 <skill>/scripts/preflight.py
```

### Obligatorio (sin esto no hay video)
| Qué | Para qué | Cómo instalar |
|---|---|---|
| **Node 22+** | `npx hyperframes`: componer, revisar y renderizar | https://nodejs.org o `nvm install 22` |
| **ffmpeg + ffprobe** | audio, efectos, render y normalización | macOS `brew install ffmpeg` · Linux `sudo apt install ffmpeg` · Windows `winget install ffmpeg` |
| **Google Chrome o Chromium** | extraer la marca de la web, capturas | https://www.google.com/chrome |
| **Python 3 con `numpy` y `Pillow`** | scripts de marca, audio, efectos y análisis de referencias | `python3 -m pip install numpy pillow` |

### Obligatorio para el resultado premium
| Qué | Qué pasa si falta |
|---|---|
| **Botanica Free SFXs** (gratis): https://mgulifes.gumroad.com/l/botanicafree. Si Gumroad pide precio, se pone $0. Se descomprime en `~/Downloads` y la skill la encuentra sola. | **Los efectos de sonido quedan pobres**: solo el kit sintetizado (teclas, pops, vibración), sin los clics, brillos y transiciones de Botanica. Es parte del resultado, no un extra. |

### Necesario para voz y música
| Qué | Qué pasa si falta |
|---|---|
| **Cuenta de ElevenLabs** con su API key guardada en el llavero (nunca en el chat): `security add-generic-password -U -a "$USER" -s elevenlabs-api-key -w 'sk_...'` (macOS) o `export ELEVENLABS_API_KEY=sk_...` (Linux/Windows). Ver [Voz y música](voz-y-musica.md#la-api-key). | **No hay voz en off ni música generada.** El video queda solo con texto y efectos, salvo que la persona traiga su propia voz grabada y su propia música con licencia. Díselo claro para que decida antes del concepto. |

### Bueno saber
- **macOS** da los **emojis de Apple** (Apple Color Emoji) y la fuente **SF Pro** del sistema. En Linux o Windows los emojis se ven con la fuente de emojis de ese sistema. SF Pro no se redistribuye: fuera de macOS usa Inter o Geist.
- Si `preflight.py` dice que Node no está en el PATH (pasa con nvm), exporta la ruta que te indica en cada comando. Si el `python3` por defecto no tiene numpy, usa el que te indica.

## 2. Lo que la persona te tiene que dar

**Obligatorio:**
1. **El link del producto**: web, app o landing. Si no hay web, una descripción y dónde se ve el producto.
2. **Sus redes**, sobre todo **Instagram** (y TikTok, X, LinkedIn o YouTube si los usa).
3. **Para qué es el video**: dónde se va a publicar (reel, hero de la web, anuncio, lanzamiento, pitch) y qué tiene que lograr. Si no lo sabe, propón tú y que confirme.

**Muy útil (pídelo, pero no bloquea):**
- La idea o lo que tiene en la cabeza, aunque sea vaga.
- El **logo en SVG** (o el PNG más grande) y la guía de marca si existe.
- **Animaciones que ya tenga**: archivos `.riv` (Rive), `.lottie` o `.json` (Lottie), proyectos de After Effects, mascota o personajes.
- **El código del producto** si lo tiene local: es la fuente más fiel para recrear la UI (íconos, colores, textos).
- Videos o grabaciones de pantalla propios, fotos del producto o del equipo. Si no hay video real, el mundo físico se resuelve en 3D (objetos, nunca personas falsas).
- **Cifras o logros reales** que quiera mostrar, con su fuente (nada se inventa).
- **Referencias de videos que le gusten** y por qué. Se analizan antes de diseñar.
- Plazo, duración o formato si ya los tiene decididos.

**Más adelante te la pediré** (avísalo desde ya):
- Capturas de pantallas concretas de su producto (te mando la lista después de elegir concepto).
- Elegir uno de 3 conceptos.
- Si el concepto lleva voz o música: escuchar muestras y elegir.

## 3. El mensaje (plantilla)

Adáptalo: quita lo que ya está resuelto y no repitas lo que la persona ya te dio.

> Antes de arrancar, esto es todo lo que necesito:
>
> **Para instalar** (una sola vez): *(solo lo que `preflight.py` marcó con ✗, con su comando)*
> - **Efectos de sonido Botanica**, gratis: https://mgulifes.gumroad.com/l/botanicafree → descomprímelo en Descargas. Sin este pack los efectos quedan pobres.
> - **ElevenLabs** (si quieres voz en off o música): guarda tu API key en el llavero con este comando… Sin ElevenLabs el video va sin voz ni música generada.
>
> **De tu parte:**
> 1. El link de tu producto y tu Instagram (y otras redes si usas).
> 2. ¿Dónde vas a publicar el video y qué quieres que logre?
> 3. Si tienes: logo en SVG, guía de marca, animaciones (Rive / Lottie / After Effects), el código del producto, cifras reales con fuente, videos de referencia que te gusten.
>
> **Después te voy a pedir:** unas capturas puntuales de tu producto, que elijas entre 3 conceptos y, si el video lleva voz o música, que elijas escuchando.
>
> Con el link ya empiezo a investigar.

## 4. Mientras esperas

Con el link ya puedes empezar la [investigación](investigacion.md). No construyas nada hasta tener el brief (el trabajo del video) y un concepto elegido.
