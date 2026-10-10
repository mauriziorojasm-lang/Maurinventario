# Dossier — MaurInventario SaaS

Fuente: código de la rama `saas` (no se pudo acceder a la web ni a Instagram desde el entorno: bloqueados por la red).

## Hechos (con fuente)
- Inventario para revendedores que compran por lotes y venden en varias plataformas. (`src/app/precios/page.tsx`)
- Titular propio: «Controla tu stock y **cuánto ganas** con cada venta.» · «Sin hojas de cálculo.» (precios)
- «Cada unidad sabe de qué pedido vino y cuánto costó» → beneficio real por venta. (precios)
- Ventas en Vinted, Wallapop y resto; devoluciones, salidas, envíos y etiquetas para almacén. (precios)
- Equipo con roles: administrador, vendedor (sin costes), almacén. (docs/SAAS.md)
- 7 días gratis sin tarjeta, después 4,99 €/mes, plan único, usuarios incluidos, cancelar no borra datos. (`src/lib/site.ts`, precios)
- Generador de descripciones con IA para Wallapop, Vinted, eBay o Instagram. (`descripciones/page.tsx`)
- Ventas detectadas desde el correo de Vinted/Wallapop. **Ojo:** para clientes externos requiere verificación de Google (docs/SAAS.md) → no anunciar aún.
- Nació para sustituir un Excel `INVENTARIO.xlsx`. (README)

## Marca
- Verde Vinted `#007782`, brillante `#2bb3bd`, chrome `#121110`, papel `#f4f2ee`, etiqueta amarilla `#f5d547` / `#4a3d00`.
- Tipos: Barlow Condensed 600/700 en mayúsculas (display), Public Sans (texto).
- Logo: `public/icons`.

## Público
Revendedores de Vinted y Wallapop. Ven el video en TikTok e Instagram (@maurinventario).

## Lo que no sabemos
- Contenido y tono del Instagram. Reseñas o cifras reales de clientes (no hay → no se usan cifras).
