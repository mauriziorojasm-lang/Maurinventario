import type { Metadata } from "next";
import { PageHeader, Panel } from "@/components/ui";
import { requirePerm } from "@/lib/auth";
import { loadCatalogOptions } from "@/lib/options";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Nuevo producto" };

export default async function NewProduct() {
  await requirePerm("catalogo");
  const { brands, categories } = await loadCatalogOptions();
  return (
    <>
      <PageHeader title="Nuevo producto" back={{ href: "/productos", label: "Productos" }} />
      <Panel className="max-w-3xl">
        <ProductForm brands={brands} categories={categories} />
      </Panel>
    </>
  );
}
