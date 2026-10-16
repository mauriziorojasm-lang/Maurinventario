import type { Perm } from "@/lib/permissions";
import { IconCompras, IconDetectadas, IconEnvios, IconInformes, IconInicio, IconInventario, IconSeguimiento, IconVentas, type RsIcon } from "@/components/rs-icons";
import {
  ArrowLeftRight,
  Boxes,
  CirclePlus,
  CreditCard,
  Factory,
  FileSpreadsheet,
  Handshake,
  List,
  ListChecks,
  Mail,
  Megaphone,
  ScrollText,
  Settings,
  Undo2,
  UserCog,
  UserRound,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

export type BadgeKey = "reviews" | "shipments" | "emails" | "detected" | "listings" | "alerts";

export type NavItem = {
  href: string;
  label: string;
  icon: RsIcon | LucideIcon;
  adminOnly?: boolean;
  /** Permiso necesario para verlo (el administrador los tiene todos). */
  perm?: Perm;
  badgeKey?: BadgeKey;
};
export type NavGroup = { label: string | null; items: NavItem[]; /** Va abajo, separado (Configuración y Cuenta). */ footer?: boolean };

/**
 * Menú de Resellap. Arriba, el flujo del día a día (inventario → venta →
 * envío → seguimiento → informes); después, la gestión y la configuración.
 */
export const NAV: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Inicio", icon: IconInicio },
      { href: "/productos", label: "Inventario", icon: IconInventario },
      { href: "/ventas", label: "Ventas", icon: IconVentas },
      { href: "/detectadas", label: "Ventas detectadas", icon: IconDetectadas, badgeKey: "detected", perm: "correo" },
      { href: "/envios", label: "Pendientes de envío", icon: IconEnvios, badgeKey: "shipments" },
      { href: "/seguimiento", label: "Seguimiento", icon: IconSeguimiento, badgeKey: "alerts" },
      { href: "/informes", label: "Informes", icon: IconInformes, perm: "costes" },
    ],
  },
  {
    label: "Gestión",
    items: [
      { href: "/ventas/nueva", label: "Nueva venta", icon: CirclePlus, perm: "ventas_crear" },
      { href: "/compras", label: "Compras", icon: IconCompras, perm: "compras" },
      { href: "/proveedores", label: "Proveedores", icon: Factory, perm: "compras" },
      { href: "/inventario", label: "Lotes y costes", icon: Boxes, perm: "costes" },
      { href: "/anuncios", label: "Anuncios", icon: Megaphone, badgeKey: "listings", perm: "anuncios" },
      { href: "/descripciones", label: "Generador de descripciones", icon: WandSparkles, perm: "generador" },
      { href: "/devoluciones", label: "Devoluciones", icon: Undo2, perm: "ventas_editar" },
      { href: "/salidas", label: "Salidas y ajustes", icon: ArrowLeftRight, perm: "stock" },
      { href: "/reparto", label: "Reparto entre socios", icon: Handshake, perm: "costes" },
    ],
  },
  {
    label: "Automatización y datos",
    items: [
      { href: "/correos", label: "Ventas por correo", icon: Mail, badgeKey: "emails", perm: "correo" },
      { href: "/importar", label: "Importar Excel", icon: FileSpreadsheet, perm: "importar" },
      { href: "/revision", label: "Pendientes de revisar", icon: ListChecks, badgeKey: "reviews", perm: "importar" },
    ],
  },
  {
    label: "Configuración",
    footer: true,
    items: [
      { href: "/configuracion", label: "Configuración", icon: Settings },
      { href: "/ajustes", label: "Listas", icon: List, perm: "configuracion" },
      { href: "/responsables", label: "Responsables", icon: Users, perm: "configuracion" },
      { href: "/equipo", label: "Equipo", icon: UserCog, adminOnly: true },
      { href: "/suscripcion", label: "Suscripción", icon: CreditCard, adminOnly: true },
      { href: "/auditoria", label: "Auditoría", icon: ScrollText, adminOnly: true },
      { href: "/cuenta", label: "Cuenta", icon: UserRound },
    ],
  },
];
