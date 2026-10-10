import type { Perm } from "@/lib/permissions";
import {
  ArrowLeftRight,
  Building2,
  CreditCard,
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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  /** Permiso necesario para verlo (el administrador los tiene todos). */
  perm?: Perm;
  platformOnly?: boolean;
  badgeKey?: "reviews" | "shipments" | "emails" | "detected" | "listings";
};
export type NavGroup = { label: string | null; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Inicio", icon: House },
      { href: "/ventas/nueva", label: "Nueva venta", icon: CirclePlus, perm: "ventas_crear" },
      { href: "/ventas", label: "Ventas", icon: Receipt },
      { href: "/detectadas", label: "Ventas detectadas", icon: MailCheck, badgeKey: "detected", perm: "correo" },
      { href: "/envios", label: "Pendientes de envío", icon: Truck, badgeKey: "shipments" },
      { href: "/productos", label: "Productos", icon: Tag },
      { href: "/anuncios", label: "Anuncios", icon: Megaphone, badgeKey: "listings", perm: "anuncios" },
      { href: "/descripciones", label: "Generador de descripciones", icon: WandSparkles, perm: "generador" },
    ],
  },
  {
    label: "Almacén",
    items: [
      { href: "/inventario", label: "Inventario y lotes", icon: Boxes, perm: "costes" },
      { href: "/compras", label: "Compras", icon: ShoppingCart, perm: "compras" },
      { href: "/proveedores", label: "Proveedores", icon: Factory, perm: "compras" },
      { href: "/devoluciones", label: "Devoluciones", icon: Undo2, perm: "ventas_editar" },
      { href: "/salidas", label: "Salidas y ajustes", icon: ArrowLeftRight, perm: "stock" },
    ],
  },
  {
    label: "Equipo y resultados",
    items: [
      { href: "/responsables", label: "Responsables", icon: Users, perm: "configuracion" },
      { href: "/reparto", label: "Reparto entre socios", icon: Handshake, perm: "costes" },
      { href: "/informes", label: "Informes", icon: ChartColumn, perm: "costes" },
    ],
  },
  {
    label: "Administración",
    items: [
      { href: "/correos", label: "Ventas por correo", icon: Mail, badgeKey: "emails", perm: "correo" },
      { href: "/importar", label: "Importar Excel", icon: FileSpreadsheet, perm: "importar" },
      { href: "/revision", label: "Pendientes de revisar", icon: ListChecks, badgeKey: "reviews", perm: "importar" },
      { href: "/equipo", label: "Equipo", icon: UserCog, adminOnly: true },
      { href: "/suscripcion", label: "Suscripción", icon: CreditCard, adminOnly: true },
      { href: "/auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
      { href: "/ajustes", label: "Listas", icon: List, perm: "configuracion" },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { href: "/configuracion", label: "Ajustes", icon: Settings },
      { href: "/plataforma", label: "Plataforma", icon: Building2, platformOnly: true },
    ],
  },
];
