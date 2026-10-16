"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "@/components/ui";

const ITEMS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/espacios", label: "Espacios y suscripciones" },
] as const;

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Administración" className="no-scrollbar -mx-1 flex max-w-full gap-1 overflow-x-auto">
      {ITEMS.map((i) => {
        const on = i.href === "/admin" ? path === "/admin" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={clsx("flex min-h-10 shrink-0 items-center rounded-[10px] px-3 text-[13.5px] font-medium", on ? "bg-[#222927] text-white" : "text-[#B4BDB9] hover:text-white")}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
