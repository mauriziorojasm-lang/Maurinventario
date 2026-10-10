"use client";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { createOrganization, type CreateOrgState } from "./actions";

export function CreateOrgForm({ suggested }: { suggested: string }) {
  const [state, action, pending] = useActionState<CreateOrgState, FormData>(createOrganization, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nombre de tu negocio" htmlFor="org-name">
        <Input id="org-name" name="name" defaultValue={suggested} required minLength={2} maxLength={80} placeholder="Por ejemplo: Gafas Málaga" />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Creando…" : "Crear mi espacio"}
      </Button>
    </form>
  );
}
