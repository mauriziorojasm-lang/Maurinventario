-- =====================================================================
-- MaurInventario · Migración 8 · Marcar varias ventas como enviadas o
-- pendientes de una vez.
-- Todo o nada: si una venta falla (anulada, de otro vendedor…), no se
-- cambia ninguna. Cada venta pasa por update_sale, así que se aplican
-- exactamente los mismos permisos que al editarla una a una.
-- =====================================================================

create or replace function public.set_sales_shipping_status(p_sale_ids uuid[], p_status text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  perform public.require_active_user();
  if p_status is null or p_status not in ('pendiente', 'enviado') then
    raise exception 'Estado de envío no válido.';
  end if;
  if p_sale_ids is null or cardinality(p_sale_ids) = 0 then
    raise exception 'No has seleccionado ninguna venta.';
  end if;
  if cardinality(p_sale_ids) > 500 then
    raise exception 'Como máximo 500 ventas a la vez.';
  end if;

  for v_id in select distinct unnest(p_sale_ids)
  loop
    if not exists (
      select 1 from public.sales s join public.platforms pl on pl.id = s.platform_id
      where s.id = v_id and pl.requires_shipping
    ) then
      raise exception 'Una de las ventas seleccionadas no lleva envío.';
    end if;
    perform public.update_sale(jsonb_build_object('id', v_id, 'shipping_status', p_status));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.set_sales_shipping_status(uuid[], text) from public, anon;
grant execute on function public.set_sales_shipping_status(uuid[], text) to authenticated, service_role;
