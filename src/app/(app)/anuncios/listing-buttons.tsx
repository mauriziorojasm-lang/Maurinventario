"use client";
import { Button } from "@/components/ui";
import { useServerAction } from "@/components/ui-client";
import { setListingStatus, type ListingPlatform } from "./actions";

export function RemovedButton({ productId, platform }: { productId: string; platform: ListingPlatform }) {
  const { run, pending, error } = useServerAction(setListingStatus);
  const name = platform === "vinted" ? "Vinted" : "Wallapop";
  return (
    <span className="flex flex-col">
      <Button size="sm" variant="danger" disabled={pending} onClick={() => run(productId, platform, "retirado")}>
        {pending ? "Guardando…" : `Quitado de ${name}`}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
