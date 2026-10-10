"use client";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { recover, type RecoverState } from "./actions";

export function RecoverForm() {
  const [state, action, pending] = useActionState<RecoverState, FormData>(recover, { error: null });
  if (state.sent) {
    return <Notice tone="good" title="Revisa tu correo">Si hay una cuenta con ese email, te llegará un enlace para elegir una contraseña nueva.</Notice>;
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? "Enviando…" : "Enviar enlace"}
      </Button>
    </form>
  );
}
