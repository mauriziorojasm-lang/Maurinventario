import "server-only";
import { createClient } from "./supabase/server";
import type { MobileOption, Option, PlatformOption } from "./types";

/** Listas para los desplegables de los formularios. */
export async function loadSaleOptions() {
  const supabase = await createClient();
  const [resp, plat, car, mob] = await Promise.all([
    supabase.from("responsibles").select("id, name").is("deleted_at", null).eq("active", true).order("name"),
    supabase.from("platforms").select("id, name, requires_shipping").eq("active", true).order("sort_order").order("name"),
    supabase.from("carriers").select("id, name").eq("active", true).order("name"),
    supabase.from("mobile_devices").select("id, number, name").eq("active", true).order("number"),
  ]);
  return {
    responsibles: (resp.data ?? []) as Option[],
    platforms: (plat.data ?? []) as PlatformOption[],
    carriers: (car.data ?? []) as Option[],
    mobiles: (mob.data ?? []) as MobileOption[],
  };
}

export async function loadCatalogOptions() {
  const supabase = await createClient();
  const [cats, brands] = await Promise.all([
    supabase.from("categories").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("brands").select("id, name").is("deleted_at", null).order("name"),
  ]);
  return { categories: (cats.data ?? []) as Option[], brands: (brands.data ?? []) as Option[] };
}

export async function loadSuppliers() {
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("id, name, is_placeholder").is("deleted_at", null).order("is_placeholder").order("name");
  return (data ?? []) as (Option & { is_placeholder: boolean })[];
}
