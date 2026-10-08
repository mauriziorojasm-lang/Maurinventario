"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ActionMessages, ConfirmAction, Modal, useServerAction } from "@/components/ui-client";
import type { Option } from "@/lib/types";
import { deleteProduct, deleteVariant, saveVariant } from "../actions";
import { ProductForm, type ProductFormValues } from "../product-form";

export function EditProductButton({ initial, brands, categories }: { initial: ProductFormValues; brands: Option[]; categories: Option[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Editar producto</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Editar producto" wide>
        <ProductForm initial={initial} brands={brands} categories={categories} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function DeleteProductButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      label="Eliminar"
      title={`Eliminar «${name}»`}
      description="Solo se puede eliminar si no tiene stock. Su historial de compras y ventas se conserva."
      confirmLabel="Eliminar producto"
      action={() => deleteProduct(id)}
      onDone={() => router.push("/productos")}
    />
  );
}

export function VariantEditor({
  productId,
  variant,
}: {
  productId: string;
  variant?: { id: string; name: string; sku: string | null; normal_sale_price: number | null; stock: number; canDelete: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(variant?.name ?? "");
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [price, setPrice] = useState(variant?.normal_sale_price != null ? String(variant.normal_sale_price) : "");
  const save = useServerAction(saveVariant);
  const del = useServerAction(deleteVariant);
  return (
    <>
      {variant ? (
        <button className="text-xs font-semibold text-brand-ink hover:underline" onClick={() => setOpen(true)}>
          Editar
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          Añadir variante
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={variant ? `Variante «${variant.name}»` : "Nueva variante"}
        footer={
          <>
            {variant?.canDelete && (
              <Button
                variant="danger"
                className="mr-auto"
                disabled={del.pending}
                onClick={async () => {
                  const r = await del.run(variant.id);
                  if (r.ok) setOpen(false);
                }}
              >
                Eliminar variante
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              variant="primary"
              disabled={save.pending || !name.trim()}
              onClick={async () => {
                const r = await save.run({ id: variant?.id, product_id: productId, name: name.trim(), sku: sku.trim() || null, normal_sale_price: price.trim().replace(",", ".") || null });
                if (r.ok) setOpen(false);
              }}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="Nombre" required hint="Por ejemplo: Negro, Blanco, Dorado.">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="SKU / referencia">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </Field>
          <Field label="Precio normal (€)" hint="Déjalo vacío para usar el del producto.">
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          {variant && variant.stock > 0 && <p className="text-xs text-muted">Tiene {variant.stock} unidades en stock: no se puede eliminar.</p>}
        </div>
        <ActionMessages error={save.error ?? del.error} />
      </Modal>
    </>
  );
}
