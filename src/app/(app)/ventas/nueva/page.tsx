import type { Metadata } from "next";
import { Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { loadSaleOptions } from "@/lib/options";
import { SaleForm } from "./sale-form";

export const metadata: Metadata = { title: "Nueva venta" };

export default async function NewSalePage() {
  const user = await requireUser();
  const opts = await loadSaleOptions();
  const isAdmin = user.role === "admin";
  return (
    <>
      <PageHeader title="Nueva venta" description="Producto, lote de procedencia, unidades, precio y plataforma." back={{ href: "/ventas", label: "Ventas" }} />
      {!isAdmin && !user.responsibleId ? (
        <Notice tone="warn" title="Tu usuario no está vinculado a un responsable">
          Pide al administrador que te vincule desde Responsables para poder registrar ventas.
        </Notice>
      ) : (
        <SaleForm
          isAdmin={isAdmin}
          today={todayIso()}
          responsibles={opts.responsibles}
          ownResponsible={user.responsibleId ? { id: user.responsibleId, name: user.responsibleName ?? "" } : null}
          platforms={opts.platforms}
          carriers={opts.carriers}
          mobiles={opts.mobiles}
        />
      )}
    </>
  );
}
