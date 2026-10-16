import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { todayIso } from "@/lib/format";
import { loadSuppliers } from "@/lib/options";
import { PurchaseOrderForm } from "../po-form";

export const metadata: Metadata = { title: "Nuevo pedido de compra" };

export default async function NewPO() {
  await requirePerm("compras");
  const suppliers = await loadSuppliers();
  return (
    <>
      <PageHeader title="Nuevo pedido de compra" description="Proveedor, líneas y costes. Se guarda como pendiente hasta que llegue." back={{ href: "/compras", label: "Compras" }} />
      <PurchaseOrderForm suppliers={suppliers} today={todayIso()} />
    </>
  );
}
