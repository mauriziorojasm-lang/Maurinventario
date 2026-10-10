"use server";
import { redirect } from "next/navigation";
import { friendlyError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvitation(token: string): Promise<{ error: string }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { error: "Invitación no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { error: friendlyError(error) };
  redirect("/");
}
