import { PO_STATUS } from "@/lib/format";
import { Badge } from "./ui";

export function POStatus({ status }: { status: string }) {
  return <Badge tone={status === "recibido" ? "good" : status === "pendiente" ? "warn" : "neutral"}>{PO_STATUS[status] ?? status}</Badge>;
}
