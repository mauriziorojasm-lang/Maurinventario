"use client";
import { useActionState } from "react";
import { Button, Field, Input, Notice } from "@/components/ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: initialError, email: "" });
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} autoFocus />
      </Field>
      <Field label="Contraseña" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error && <Notice tone="bad">{state.error}</Notice>}
      <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
