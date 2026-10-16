/**
 * Permisos de los miembros del equipo. El administrador los tiene todos;
 * a cada vendedor o mozo de almacén se le pueden dar o quitar áreas en
 * Equipo. La base de datos aplica las mismas reglas (no solo la pantalla).
 */
export type Perm =
  | "ventas_crear"
  | "ventas_todas"
  | "envios"
  | "ventas_editar"
  | "costes"
  | "catalogo"
  | "compras"
  | "stock"
  | "anuncios"
  | "correo"
  | "generador"
  | "importar"
  | "configuracion";

export const PERMISSIONS: { key: Perm; label: string; hint: string; group: "Ventas" | "Productos y almacén" | "Negocio" }[] = [
  { key: "ventas_crear", label: "Registrar ventas", hint: "Crear ventas a su nombre.", group: "Ventas" },
  { key: "ventas_todas", label: "Ver todas las ventas", hint: "No solo las suyas (necesario para preparar envíos de otros).", group: "Ventas" },
  { key: "envios", label: "Gestionar envíos", hint: "Marcar enviado, paquetería y etiqueta de las ventas que ve.", group: "Ventas" },
  { key: "ventas_editar", label: "Editar y anular ventas", hint: "Cambiar cualquier dato, anular y registrar devoluciones.", group: "Ventas" },
  { key: "correo", label: "Ventas por correo", hint: "Confirmar ventas detectadas y revisar correos de Vinted/Wallapop.", group: "Ventas" },
  { key: "catalogo", label: "Productos y fotos", hint: "Crear y editar productos, variantes, fotos, marcas y categorías.", group: "Productos y almacén" },
  { key: "stock", label: "Salidas y ajustes de stock", hint: "Regalos, pérdidas y correcciones de inventario.", group: "Productos y almacén" },
  { key: "compras", label: "Compras y proveedores", hint: "Pedidos a proveedores, recepción y sus costes.", group: "Productos y almacén" },
  { key: "anuncios", label: "Anuncios", hint: "Preparar anuncios y ver cuáles hay que quitar.", group: "Productos y almacén" },
  { key: "generador", label: "Generador de descripciones", hint: "Usar la IA para escribir anuncios.", group: "Productos y almacén" },
  { key: "costes", label: "Costes, beneficios e informes", hint: "Ver lo que costó cada lote, el beneficio, el panel de negocio, informes, reparto y exportar.", group: "Negocio" },
  { key: "importar", label: "Importar Excel", hint: "Importar datos y resolver pendientes de revisar.", group: "Negocio" },
  { key: "configuracion", label: "Listas y responsables", hint: "Plataformas, paqueterías, móviles, marcas, categorías y responsables.", group: "Negocio" },
];

export const ROLE_DEFAULTS: Record<"vendedor" | "almacen", Perm[]> = {
  vendedor: ["ventas_crear", "envios", "generador"],
  almacen: ["ventas_todas", "envios"],
};

/** ¿Puede este usuario hacer/ver esto? (el administrador, siempre) */
export function can(user: { role: string | null; permissions: string[] }, key: Perm): boolean {
  return user.role === "admin" || user.permissions.includes(key);
}
