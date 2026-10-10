"use client";
import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchOrganization } from "@/app/(app)/espacio/actions";

/** Selector del espacio de trabajo (solo aparece si perteneces a varios). */
export function OrgSwitcher({ current, orgs }: { current: string; orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Espacio de trabajo</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            const r = await switchOrganization(e.target.value);
            if (r.ok) router.push("/");
          })
        }
        className="h-11 w-full appearance-none truncate rounded-[10px] border border-white/10 bg-chrome-2 py-0 pl-3 pr-8 text-base font-semibold text-chrome-ink md:h-9 md:text-[13px]"
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ChevronsUpDown size={15} className="pointer-events-none absolute right-2.5 text-chrome-ink/60" />
    </label>
  );
}
