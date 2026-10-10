"use server";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export type CreateOrgState = { error: string | null };

export async function createOrganization(_prev: CreateOrgState, formData: FormData): Promise<CreateOrgState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) return { error: "El nombre debe tener entre 2 y 80 caracteres." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) return { error: friendlyError(error) };
  redirect("/");
}
