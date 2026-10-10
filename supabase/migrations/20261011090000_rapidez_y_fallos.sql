-- =====================================================================
-- MaurInventario · Migración 15 · Fallos y rapidez
--   · Ventas sin duplicados: si el móvil reenvía la misma venta (doble
--     pulsación o corte de conexión), se devuelve la que ya existía.
--   · Reordenar fotos de una vez (todo o nada).
--   · Contadores del menú en una sola consulta (nav_badges).
--   · Resumen de anuncios calculado en la base de datos (sin el tope de
--     1000 filas de la API).
-- Solo añade una columna vacía y funciones. No borra ni cambia datos.
-- =====================================================================

alter table public.sales add column if not exists client_request_id uuid;
create unique index if not exists sales_client_request_id_uq on public.sales (client_request_id) where client_request_id is not null;

create or replace function public.create_sale(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
  v_self uuid := public.current_responsible_id();
  v_resp uuid := private.uuid_or_null(p, 'responsible_id');
  v_platform public.platforms%rowtype;
  v_carrier uuid := private.uuid_or_null(p, 'carrier_id');
  v_mobile uuid := private.uuid_or_null(p, 'mobile_device_id');
  v_ship public.shipping_status;
  v_label text := private.txt(p, 'shipping_label_path');
  v_date date := coalesce(private.date_or_null(p, 'sale_date', 'La fecha'), current_date);
  v_sale_id uuid;
  v_item jsonb;
  v_line integer := 0;
  v_item_id uuid;
  v_qty integer;
  v_req uuid := private.uuid_or_null(p, 'client_request_id');
begin
  perform public.require_active_user();

  -- Pulsación repetida o reintento tras un corte: devuelve la venta ya creada
  if v_req is not null then
    select id into v_sale_id from public.sales where client_request_id = v_req and created_by = auth.uid();
    if found then
      return v_sale_id;
    end if;
  end if;

  if not v_admin then
    if v_self is null then
      raise exception 'Tu usuario no está vinculado a ningún responsable. Pide al administrador que lo vincule.';
    end if;
    if v_resp is null then
      v_resp := v_self;
    elsif v_resp <> v_self then
      raise exception 'Solo puedes registrar ventas a tu nombre.' using errcode = '42501';
    end if;
  end if;

  if v_resp is null then
    raise exception 'Selecciona el responsable de la venta.';
  end if;
  if not exists (select 1 from public.responsibles where id = v_resp and deleted_at is null and active) then
    raise exception 'El responsable seleccionado no existe o está inactivo.';
  end if;

  select * into v_platform from public.platforms where id = private.uuid_or_null(p, 'platform_id') and active;
  if not found then
    raise exception 'Selecciona la plataforma de venta.';
  end if;

  if v_platform.requires_shipping then
    v_ship := coalesce(private.txt(p, 'shipping_status')::public.shipping_status, 'pendiente');
    if v_carrier is not null and not exists (select 1 from public.carriers where id = v_carrier) then
      raise exception 'La empresa de transporte no existe.';
    end if;
  else
    v_ship := null;
    v_carrier := null;
    v_label := null;
  end if;

  if v_mobile is not null and not exists (select 1 from public.mobile_devices where id = v_mobile) then
    raise exception 'El móvil seleccionado no existe.';
  end if;

  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'La venta debe tener al menos un producto.';
  end if;

  for v_item in select * from jsonb_array_elements(p -> 'items')
  loop
    perform private.validate_stock_line(v_item, true);
  end loop;
  perform private.check_lot_availability(p -> 'items');

  insert into public.sales (sale_date, responsible_id, platform_id, carrier_id, mobile_device_id,
                            shipping_status, shipping_label_path, external_reference, notes, created_by, client_request_id)
  values (v_date, v_resp, v_platform.id, v_carrier, v_mobile, v_ship, v_label,
          private.txt(p, 'external_reference'), private.txt(p, 'notes'), auth.uid(), v_req)
  returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(p -> 'items')
  loop
    v_line := v_line + 1;
    v_qty := (v_item ->> 'quantity')::integer;
    insert into public.sale_items (sale_id, line_number, variant_id, lot_id, quantity, unit_price, notes)
    values (v_sale_id, v_line, (v_item ->> 'variant_id')::uuid, (v_item ->> 'lot_id')::uuid, v_qty,
            private.num_or_null(v_item, 'unit_price', 'El precio'), private.txt(v_item, 'notes'))
    returning id into v_item_id;

    insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, sale_item_id, created_by)
    values ('venta', (v_item ->> 'variant_id')::uuid, (v_item ->> 'lot_id')::uuid, -v_qty, v_date, v_item_id, auth.uid());
  end loop;

  perform public.log_action('crear_venta', 'sales', v_sale_id::text,
    'Venta ' || (select sale_number from public.sales where id = v_sale_id) || ' registrada');
  return v_sale_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Reordenar las fotos de un producto (la primera pasa a ser la portada)
-- ---------------------------------------------------------------------
create or replace function public.reorder_product_photos(p_product_id uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first text;
begin
  perform public.require_admin();
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Orden no válido.';
  end if;
  if exists (select 1 from unnest(p_ids) i where not exists (select 1 from public.product_photos f where f.id = i and f.product_id = p_product_id)) then
    raise exception 'Alguna foto no pertenece a este producto.';
  end if;
  update public.product_photos f
     set position = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where f.id = o.id and f.product_id = p_product_id and f.position is distinct from o.ord - 1;
  -- Las que no venían en la lista quedan detrás, en su orden
  update public.product_photos f
     set position = cardinality(p_ids) + r.rn - 1
    from (select id, row_number() over (order by position, created_at) rn
            from public.product_photos where product_id = p_product_id and not (id = any (p_ids))) r
   where f.id = r.id;
  select path into v_first from public.product_photos where product_id = p_product_id order by position, created_at limit 1;
  update public.products set photo_path = v_first, updated_at = now()
   where id = p_product_id and photo_path is distinct from v_first;
end;
$$;
revoke execute on function public.reorder_product_photos(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_product_photos(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Contadores del menú y de «Tareas» del inicio, en una sola llamada.
-- El vendedor solo recibe sus envíos pendientes.
-- ---------------------------------------------------------------------
create or replace function public.nav_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resp uuid := public.current_responsible_id();
begin
  if not public.is_active_user() then
    return jsonb_build_object('reviews', 0, 'shipments', 0, 'emails', 0, 'detected', 0, 'listings', 0);
  end if;
  if not public.is_admin() then
    return jsonb_build_object(
      'reviews', 0, 'emails', 0, 'detected', 0, 'listings', 0,
      'shipments', case when v_resp is null then 0 else
        (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente' and responsible_id = v_resp) end);
  end if;
  return jsonb_build_object(
    'reviews',   (select count(*) from public.review_items where status = 'pendiente'),
    'shipments', (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente'),
    'emails',    (select count(*) from public.email_messages where status = 'revision'),
    'detected',  (select count(*) from public.email_messages where status = 'detectada'),
    'listings',  (select count(*) from public.v_listings_to_remove));
end;
$$;
revoke execute on function public.nav_badges() from public, anon;
grant execute on function public.nav_badges() to authenticated;

-- ---------------------------------------------------------------------
-- Pantalla «Anuncios»: contadores de cada pestaña y las filas de la
-- pestaña elegida, todo calculado aquí (sin límite de filas).
-- ---------------------------------------------------------------------
create or replace function public.listings_overview(p_view text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_counts jsonb;
  v_view text := p_view;
  v_rows jsonb;
begin
  perform public.require_admin();
  with lo as (
    select pi.product_id as id, coalesce(pi.stock, 0) as stock,
           max(l.status) filter (where l.platform = 'vinted') as vinted,
           max(l.status) filter (where l.platform = 'wallapop') as wallapop
      from public.v_product_inventory pi
      left join public.listings l on l.product_id = pi.product_id
     group by pi.product_id, pi.stock)
  select jsonb_build_object(
           'sin-anunciar', count(*) filter (where stock > 0 and coalesce('publicado' in (vinted, wallapop), false) = false),
           'por-retirar',  count(*) filter (where stock = 0 and coalesce('publicado' in (vinted, wallapop), false)),
           'publicados',   count(*) filter (where coalesce('publicado' in (vinted, wallapop), false)),
           'todos',        count(*) filter (where stock > 0))
    into v_counts from lo;

  if v_view is null or v_view not in ('sin-anunciar', 'por-retirar', 'publicados', 'todos') then
    v_view := case when (v_counts ->> 'por-retirar')::int > 0 then 'por-retirar' else 'sin-anunciar' end;
  end if;

  with lo as (
    select pi.product_id as id, pi.product_name as name, pi.photo_path as photo, coalesce(pi.stock, 0) as stock,
           max(l.status) filter (where l.platform = 'vinted') as vinted,
           max(l.status) filter (where l.platform = 'wallapop') as wallapop
      from public.v_product_inventory pi
      left join public.listings l on l.product_id = pi.product_id
     group by pi.product_id, pi.product_name, pi.photo_path, pi.stock),
  f as (
    select *, coalesce('publicado' in (vinted, wallapop), false) as pub from lo)
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'photo', photo, 'stock', stock, 'vinted', vinted, 'wallapop', wallapop) order by name), '[]'::jsonb)
    into v_rows
    from f
   where case v_view
           when 'sin-anunciar' then stock > 0 and not pub
           when 'por-retirar'  then stock = 0 and pub
           when 'publicados'   then pub
           else stock > 0
         end;
  return jsonb_build_object('view', v_view, 'counts', v_counts, 'rows', v_rows);
end;
$$;
revoke execute on function public.listings_overview(text) from public, anon;
grant execute on function public.listings_overview(text) to authenticated;
