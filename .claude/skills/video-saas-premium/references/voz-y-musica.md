# Voz en off y música (ElevenLabs)

## La API key
La key **nunca** va en el chat, en el proyecto ni en la skill. La persona la guarda una vez en su llavero:

```bash
# macOS (Llavero)
security add-generic-password -U -a "$USER" -s elevenlabs-api-key -w 'sk_...'
# Linux / Windows / CI: variable de entorno
export ELEVENLABS_API_KEY=sk_...
```

`scripts/eleven_vo.py` la busca en este orden: `--key-file` → `$ELEVENLABS_API_KEY` → Llavero (`elevenlabs-api-key`). Si una key aparece en el chat, recomienda revocarla y generar otra.

## Voz: que la persona elija escuchando
```bash
python3 scripts/eleven_vo.py quota                       # caracteres disponibles
python3 scripts/eleven_vo.py search --lang es --use narrative_story
python3 scripts/eleven_vo.py add <voice_id> [<voice_id> ...]          # voces de la librería → la cuenta
python3 scripts/eleven_vo.py samples --out muestras --text "La frase del gancho." <voice_id> ...
```
Abre la carpeta `muestras/` y pregunta cuál prefiere. **No elijas por ella.** Si la persona te delega la decisión ("confío en tu criterio"), elige una, di cuál y por qué, y ofrece cambiarla.

## Guion = lo que se lee en pantalla
- **Una frase por plano**, corta, con la actitud de la marca. Si la marca lo permite, que suene humana y un poco atrevida ("¿El WhatsApp sonando en plena consulta?", "Tranqui.") en vez de folleto ("Optimiza la gestión de tu clínica").
- La voz manda el ritmo: cada plano dura lo que dura su frase, más un respiro.
- La voz dice **exactamente** los titulares/subtítulos, palabra por palabra.
- Ortografía fonética: "API" → "ei pi ái", "IA" → "i a", "1 de octubre" → "primero de octubre", dominios → "tumarca punto com". Revisa que el nombre de la marca suene bien.
- Frases cortas; tono de keynote.

```bash
# script.json → {"L1": "Desde el primero de octubre, …", "L2": "…"}
python3 scripts/eleven_vo.py lines --voice <voice_id> --script script.json --out assets/audio/vo
#   → L1.mp3 … + align.json (inicio/fin de cada palabra)
python3 scripts/audio_tools.py words --align assets/audio/vo/align.json --key L1 --start 0.5 --idx 0,1,2
#   → [0.5, 0.81, 0.92]  → MKP.sayIn("#h1 .w", [...])
python3 scripts/audio_tools.py vo-mix --dir assets/audio/vo --starts starts.json --dur 36 --out assets/audio/vo-mix.mp3
```
`starts.json` = segundo global donde empieza cada línea. Si una línea no cabe en su escena, **mueve la escena o el acto**; nunca aceleres la voz. Deja ≥ 0.15 s entre líneas.

## Música
```bash
python3 scripts/eleven_vo.py music --out muestras/musica-A.mp3 --seconds 22 --prompt "Elegant minimal deep house groove for a design software commercial… Instrumental, 120 BPM."
```
Genera 3 estilos (de uno en uno: el plan básico permite 2 peticiones simultáneas; los prompts **no pueden nombrar marcas** como "Apple"). La persona elige y **se extiende la muestra aprobada** por compases:

```bash
python3 scripts/audio_tools.py music --sample muestras/musica-A.mp3 --vo assets/audio/vo-mix.mp3 \
  --dur 36 --drop <segundo de la solución> --freeze <segundo del golpe> --out assets/audio/music-mix.mp3
```
Usa `--drop` en la palabra donde se nombra el producto por primera vez ("…*TuProducto* contesta por ti"). Detecta BPM y fase, repite compases completos, la deja **filtrada y baja durante el problema**, baja más en el golpe, **se abre en un downbeat exacto en la solución**, hace fade final y la comprime bajo la voz (sidechain).

### Pistas largas con intro y drop (`music-fit`)
Si generas una pista completa (40–45 s, con intro y un drop marcado), no la extiendas: **recórtala** para que su drop caiga en la palabra que nombra el producto.
```bash
python3 scripts/audio_tools.py music-fit --sample muestras/musica-B.mp3 --vo assets/audio/vo-mix.mp3 --at 5.06 --dur 37 --out assets/audio/music-mix.mp3
#   → drop in sample 8.42s → at 5.06s · beat 0.510s (117.6 BPM) · bars at: [5.06, 7.10, 9.14, …]
```
Detecta el drop y el pulso solo (o pásale `--drop <segundo en la pista>`), mantiene la pista continua, la agacha bajo la voz y te imprime los compases: **corta el montaje en esos tiempos**. Si la pista no tiene un drop claro, usa `music`.

## Niveles
Voz ≈ −16 LUFS · música ≈ −22 · bus de efectos ≈ −23 · master ≈ −15 (redes). Compruébalo con `audio_tools.py check`.

En HyperFrames: un `<audio id="vo">` y un `<audio id="music">` de duración completa, más un `<audio>` por efecto.

## Límites del plan básico de ElevenLabs
`mp3_44100_128` como máximo (192 devuelve 403), 2 peticiones simultáneas (429), ~10 voces propias.
