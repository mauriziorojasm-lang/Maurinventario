import {
  ArrowLeftRight,
  Boxes,
  ChartColumn,
  CirclePlus,
  Factory,
  FileSpreadsheet,
  Handshake,
  House,
  ListChecks,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Undo2,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean; badgeKey?: "reviews" | "shipments" };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Inicio", icon: House },
      { href: "/ventas/nueva", label: "Nueva venta", icon: CirclePlus },
      { href: "/ventas", label: "Ventas", icon: Receipt },
      { href: "/envios", label: "Pendientes de envío", icon: Truck, badgeKey: "shipments" },
      { href: "/productos", label: "Productos", icon: Tag },
    ],
  },
  {
    label: "Almacén",
    items: [
      { href: "/inventario", label: "Inventario y lotes", icon: Boxes, adminOnly: true },
      { href: "/compras", label: "Compras", icon: ShoppingCart, adminOnly: true },
      { href: "/proveedores", label: "Proveedores", icon: Factory, adminOnly: true },
      { href: "/devoluciones", label: "Devoluciones", icon: Undo2, adminOnly: true },
      { href: "/salidas", label: "Salidas y ajustes", icon: ArrowLeftRight, adminOnly: true },
    ],
  },
  {
    label: "Equipo y resultados",
    items: [
      { href: "/responsables", label: "Responsables", icon: Users, adminOnly: true },
      { href: "/reparto", label: "Reparto entre socios", icon: Handshake, adminOnly: true },
      { href: "/informes", label: "Informes", icon: ChartColumn, adminOnly: true },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/importar", label: "Importar Excel", icon: FileSpreadsheet, adminOnly: true },
      { href: "/revision", label: "Pendientes de revisar", icon: ListChecks, adminOnly: true, badgeKey: "reviews" },
      { href: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
      { href: "/auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
      { href: "/ajustes", label: "Listas y ajustes", icon: Settings, adminOnly: true },
    ],
  },
];
