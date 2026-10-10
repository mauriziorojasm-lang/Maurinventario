"use client";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { setNewPassword, type NewPasswordState } from "./actions";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<NewPasswordState, FormData>(setNewPassword, { error: null });
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Nueva contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Repite la contraseña" htmlFor="repeat">
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
