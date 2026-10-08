export type NavItem = { href: string; label: string; adminOnly?: boolean; badgeKey?: "reviews" | "shipments" };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Inicio" },
      { href: "/ventas/nueva", label: "Nueva venta" },
      { href: "/ventas", label: "Ventas" },
      { href: "/envios", label: "Pendientes de envío", badgeKey: "shipments" },
      { href: "/productos", label: "Productos" },
    ],
  },
  {
    label: "Almacén",
    items: [
      { href: "/inventario", label: "Inventario y lotes", adminOnly: true },
      { href: "/compras", label: "Compras", adminOnly: true },
      { href: "/proveedores", label: "Proveedores", adminOnly: true },
      { href: "/devoluciones", label: "Devoluciones", adminOnly: true },
      { href: "/salidas", label: "Salidas y ajustes", adminOnly: true },
    ],
  },
  {
    label: "Equipo y resultados",
    items: [
      { href: "/responsables", label: "Responsables", adminOnly: true },
      { href: "/reparto", label: "Reparto entre socios", adminOnly: true },
      { href: "/informes", label: "Informes", adminOnly: true },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/importar", label: "Importar Excel", adminOnly: true },
      { href: "/revision", label: "Pendientes de revisar", adminOnly: true, badgeKey: "reviews" },
      { href: "/usuarios", label: "Usuarios", adminOnly: true },
      { href: "/auditoria", label: "Auditoría", adminOnly: true },
      { href: "/ajustes", label: "Listas y ajustes", adminOnly: true },
    ],
  },
];
