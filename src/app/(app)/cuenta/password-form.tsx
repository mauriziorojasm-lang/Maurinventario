"use client";
import { useState } from "react";
import { Button, Field, Input } from "@/components/ui";
import { ActionMessages, useServerAction } from "@/components/ui-client";
import { changeOwnPassword } from "./actions";

export function PasswordForm() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const { run, pending, error, message } = useServerAction(changeOwnPassword);
  return (
    <div className="grid max-w-sm gap-3">
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
        <Input type="password" autoComplete="new-password" value={a} onChange={(e) => setA(e.target.value)} />
      </Field>
      <Field label="Repite la contraseña" error={b && a !== b ? "No coinciden." : undefined}>
        <Input type="password" autoComplete="new-password" value={b} onChange={(e) => setB(e.target.value)} />
      </Field>
      <Button
        variant="primary"
        className="justify-self-start"
        disabled={pending || a.length < 8 || a !== b}
        onClick={async () => {
          const r = await run(a);
          if (r.ok) {
            setA("");
            setB("");
          }
        }}
      >
        Cambiar contraseña
      </Button>
      <ActionMessages error={error} message={message} />
    </div>
  );
}
