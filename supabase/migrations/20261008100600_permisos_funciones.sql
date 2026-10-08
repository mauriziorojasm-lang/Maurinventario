-- =====================================================================
-- MaurInventario · Migración 7 · Quién puede llamar a cada función
-- Las funciones de la API solo las pueden llamar usuarios con sesión
-- iniciada. Además, cada función comprueba internamente si el usuario
-- es administrador o vendedor.
-- =====================================================================

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Funciones internas que nadie debe llamar directamente desde la API
revoke execute on function public.log_action(text, text, text, text, jsonb) from authenticated;
revoke execute on function public.audit_row_change(), public.apply_inventory_movement(), public.prevent_movement_changes(),
  public.check_sku_unique(), public.set_updated_at(), public.handle_new_user(), public.protect_last_admin() from authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
-- Utilidades puras de lectura de parámetros que usan los informes
grant execute on function private.txt(jsonb, text), private.uuid_or_null(jsonb, text),
  private.int_or_null(jsonb, text, text), private.num_or_null(jsonb, text, text),
  private.date_or_null(jsonb, text, text) to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- Las vistas solo para usuarios con sesión (y filtradas por RLS)
revoke all on public.v_lots, public.v_sale_lines, public.v_variant_inventory, public.v_product_inventory,
  public.v_purchase_lines, public.v_purchase_orders, public.v_stock_exits, public.v_returns, public.v_movements
  from anon;
grant select on public.v_lots, public.v_sale_lines, public.v_variant_inventory, public.v_product_inventory,
  public.v_purchase_lines, public.v_purchase_orders, public.v_stock_exits, public.v_returns, public.v_movements
  to authenticated;
