-- =====================================================================
-- MaurInventario · Migración 12 · Ventas detectadas (confirmación manual)
--
-- Las ventas que llegan por correo ya no se registran solas: quedan como
-- «detectadas» hasta que el administrador las confirma. Así puede:
--   · confirmarla (se crea la venta y se descuenta el stock),
--   · corregir el producto o el precio antes de confirmar,
--   · marcarla como duplicado de una venta que ya apuntó a mano
--     (no se crea nada y la etiqueta de Vinted irá a esa venta),
--   · descartarla.
-- No borra ni modifica datos existentes.
-- =====================================================================

alter table public.email_messages drop constraint if exists email_messages_status_check;
alter table public.email_messages add constraint email_messages_status_check
  check (status in ('pendiente', 'detectada', 'procesado', 'duplicado', 'ignorado', 'revision', 'esperando', 'error'));

-- ---------------------------------------------------------------------
-- Confirmar una venta detectada. Igual que antes, más un precio opcional
-- (solo si lo indica el administrador; si no, el del correo).
-- ---------------------------------------------------------------------
drop function if exists public.email_register_sale(uuid, uuid, text, text);

create or replace function public.email_register_sale(
  p_email_id uuid,
  p_variant_id uuid,
  p_alias text default null,
  p_alias_norm text default null,
  p_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_user boolean := auth.uid() is not null;   -- antes de que email_actor fije el usuario
  v_actor uuid := private.email_actor();
  e public.email_messages%rowtype;
  v_platform uuid;
  v_price numeric;
  v_lot uuid;
  v_resp uuid;
  v_mobile uuid;
  v_date date;
  v_sale uuid;
  v_handle text;
begin
  select * into e from public.email_messages where id = p_email_id for update;
  if not found then
    raise exception 'El correo no existe.';
  end if;
  if e.sale_id is not null then
    return e.sale_id;                     -- ya confirmada (o marcada como duplicado): no se duplica
  end if;
  if e.kind not in ('vinted_venta', 'wallapop_venta') then
    raise exception 'Este correo no es una venta.';
  end if;
  if exists (select 1 from public.sales where source_email_id = e.id) then
    select id into v_sale from public.sales where source_email_id = e.id;
    update public.email_messages set sale_id = v_sale, status = 'procesado', processed_at = coalesce(processed_at, now()), updated_at = now() where id = e.id;
    return v_sale;
  end if;

  if p_price is not null and not v_is_user then
    raise exception 'Solo el administrador puede cambiar el precio.';
  end if;
  v_price := coalesce(p_price, nullif(e.parsed ->> 'price', '')::numeric);
  if v_price is null or v_price <= 0 then
    raise exception 'El correo no tiene un precio válido.';
  end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id and deleted_at is null) then
    raise exception 'El producto elegido no existe.';
  end if;

  select id into v_platform from public.platforms
   where lower(name) = case when e.kind = 'vinted_venta' then 'vinted' else 'wallapop' end and active;
  if v_platform is null then
    raise exception 'No existe la plataforma % en Listas y ajustes.', case when e.kind = 'vinted_venta' then 'Vinted' else 'Wallapop' end;
  end if;

  v_handle := e.parsed ->> 'account_norm';
  select responsible_id, mobile_device_id into v_resp, v_mobile
    from public.email_accounts where platform = e.platform and handle_norm = v_handle;
  if v_resp is null then
    select default_responsible_id into v_resp from public.email_integration where id;
  end if;
  if v_resp is null then
    raise exception 'Falta el responsable: asigna uno a la cuenta «%» o elige un responsable por defecto en Ventas por correo.', coalesce(e.parsed ->> 'account', '?');
  end if;

  select id into v_lot from public.inventory_lots
   where variant_id = p_variant_id and quantity_available > 0
   order by received_at, created_at
   limit 1;
  if v_lot is null then
    raise exception 'No hay stock de ese producto en ningún lote.';
  end if;

  v_date := coalesce(nullif(e.parsed ->> 'sale_date', '')::date, (e.received_at at time zone 'Europe/Madrid')::date);

  v_sale := public.create_sale(jsonb_build_object(
    'sale_date', v_date,
    'responsible_id', v_resp,
    'platform_id', v_platform,
    'mobile_device_id', v_mobile,
    'shipping_status', 'pendiente',
    'notes', 'Detectada en el correo de ' || initcap(e.platform),
    'items', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant_id, 'lot_id', v_lot, 'quantity', 1, 'unit_price', v_price))
  ));

  update public.sales
     set source = 'correo',
         source_email_id = e.id,
         buyer_name = nullif(e.parsed ->> 'buyer', ''),
         platform_transaction_id = coalesce(platform_transaction_id, nullif(e.parsed ->> 'transaction_id', ''))
   where id = v_sale;

  update public.email_messages
     set sale_id = v_sale, variant_id = p_variant_id, status = 'procesado', review_reason = null, candidates = null,
         last_error = null, processed_at = now(), resolved_by = case when v_is_user then v_actor end,
         updated_at = now()
   where id = e.id;

  if p_alias is not null and p_alias_norm is not null and length(trim(p_alias_norm)) > 0 then
    insert into public.product_aliases (variant_id, alias, alias_norm, created_by)
    values (p_variant_id, p_alias, p_alias_norm, v_actor)
    on conflict (alias_norm) do update set variant_id = excluded.variant_id;
  end if;
  return v_sale;
end;
$$;

-- ---------------------------------------------------------------------
-- Marcar una venta detectada como duplicado de una venta ya apuntada.
-- No crea nada ni toca el stock. El correo queda unido a esa venta, así la
-- etiqueta de Vinted que llegue después se pondrá en ella.
-- ---------------------------------------------------------------------
create or replace function public.email_mark_duplicate(p_email_id uuid, p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.email_messages%rowtype;
  s public.sales%rowtype;
  v_platform text;
begin
  perform public.require_admin();
  select * into e from public.email_messages where id = p_email_id for update;
  if not found then
    raise exception 'El correo no existe.';
  end if;
  if e.kind not in ('vinted_venta', 'wallapop_venta') then
    raise exception 'Este correo no es una venta.';
  end if;
  if e.status = 'procesado' then
    raise exception 'Esta venta ya está confirmada; si sobra, anúlala desde la ficha de la venta.';
  end if;
  if e.status = 'duplicado' and e.sale_id = p_sale_id then
    return;
  end if;
  select * into s from public.sales where id = p_sale_id;
  if not found or s.status <> 'activa' then
    raise exception 'La venta no existe o está anulada.';
  end if;
  select lower(name) into v_platform from public.platforms where id = s.platform_id;
  if v_platform is distinct from e.platform then
    raise exception 'Esa venta es de otra plataforma.';
  end if;
  if exists (select 1 from public.email_messages where sale_id = p_sale_id and kind in ('vinted_venta', 'wallapop_venta') and id <> e.id) then
    raise exception 'Esa venta ya está unida a otro correo.';
  end if;

  update public.email_messages
     set status = 'duplicado', sale_id = p_sale_id, review_reason = null, candidates = null, last_error = null,
         processed_at = now(), resolved_by = auth.uid(), updated_at = now()
   where id = e.id;
  -- Completa los datos que falten en la venta (sin pisar nada)
  update public.sales
     set buyer_name = coalesce(buyer_name, nullif(e.parsed ->> 'buyer', '')),
         platform_transaction_id = coalesce(platform_transaction_id, nullif(e.parsed ->> 'transaction_id', ''))
   where id = p_sale_id;
  perform public.log_action('venta_duplicada', 'sales', p_sale_id::text, 'Venta detectada en el correo marcada como duplicado de ' || s.sale_number);
end;
$$;

revoke execute on function public.email_register_sale(uuid, uuid, text, text, numeric) from public, anon;
revoke execute on function public.email_mark_duplicate(uuid, uuid) from public, anon;
grant execute on function public.email_register_sale(uuid, uuid, text, text, numeric), public.email_mark_duplicate(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Descartar o volver a revisar un correo. Un «duplicado» se puede deshacer
-- (vuelve a ventas detectadas); una venta confirmada no.
-- ---------------------------------------------------------------------
create or replace function public.email_set_status(p_email_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.email_messages%rowtype;
begin
  perform public.require_admin();
  select * into e from public.email_messages where id = p_email_id for update;
  if not found then
    raise exception 'El correo no existe.';
  end if;
  if e.status = 'procesado' then
    raise exception 'Este correo ya está procesado; no se puede cambiar.';
  end if;
  if p_status not in ('pendiente', 'ignorado') then
    raise exception 'Estado no válido.';
  end if;
  update public.email_messages
     set status = p_status,
         sale_id = case when e.status = 'duplicado' then null else sale_id end,
         attempts = case when p_status = 'pendiente' then 0 else attempts end,
         last_error = null, resolved_by = auth.uid(), updated_at = now()
   where id = e.id;
end;
$$;
