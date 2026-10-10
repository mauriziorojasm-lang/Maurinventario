import {
  ArrowLeftRight,
  Boxes,
  ChartColumn,
  CirclePlus,
  Factory,
  FileSpreadsheet,
  Handshake,
  Mail,
  MailCheck,
  Megaphone,
  House,
  List,
  ListChecks,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Tag,
  Truck,
  Undo2,
  WandSparkles,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; adminOnly?: boolean; badgeKey?: "reviews" | "shipments" | "emails" | "detected" | "listings" };
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Inicio", icon: House },
      { href: "/ventas/nueva", label: "Nueva venta", icon: CirclePlus },
      { href: "/ventas", label: "Ventas", icon: Receipt },
      { href: "/detectadas", label: "Ventas detectadas", icon: MailCheck, adminOnly: true, badgeKey: "detected" },
      { href: "/envios", label: "Pendientes de envío", icon: Truck, badgeKey: "shipments" },
      { href: "/productos", label: "Productos", icon: Tag },
      { href: "/anuncios", label: "Anuncios", icon: Megaphone, adminOnly: true, badgeKey: "listings" },
      { href: "/descripciones", label: "Generador de descripciones", icon: WandSparkles },
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
      { href: "/correos", label: "Ventas por correo", icon: Mail, adminOnly: true, badgeKey: "emails" },
      { href: "/importar", label: "Importar Excel", icon: FileSpreadsheet, adminOnly: true },
      { href: "/revision", label: "Pendientes de revisar", icon: ListChecks, adminOnly: true, badgeKey: "reviews" },
      { href: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
      { href: "/auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
      { href: "/ajustes", label: "Listas", icon: List, adminOnly: true },
    ],
  },
  {
    label: "Cuenta",
    items: [{ href: "/configuracion", label: "Ajustes", icon: Settings }],
  },
];
