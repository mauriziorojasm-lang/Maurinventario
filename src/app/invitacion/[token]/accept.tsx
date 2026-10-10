"use client";
import { useState, useTransition } from "react";
import { Button, Notice } from "@/components/ui";
import { acceptInvitation } from "./actions";

export function AcceptInvitation({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" disabled={pending} onClick={() => start(async () => setError((await acceptInvitation(token))?.error ?? null))}>
        {pending ? "Uniéndote…" : "Aceptar la invitación"}
      </Button>
      {error && <Notice tone="bad">{error}</Notice>}
    </div>
  );
}
