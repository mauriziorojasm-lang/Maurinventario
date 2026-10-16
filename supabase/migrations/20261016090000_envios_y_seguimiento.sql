-- =====================================================================
-- Resellap · Migración 20 · Ventas detectadas más automáticas, foto del
-- anuncio y seguimiento de envíos
-- ---------------------------------------------------------------------
-- · Ventas: foto del anuncio (image_path), fecha y hora de «enviado» y de
--   «entregado», estado del seguimiento y último movimiento.
-- · tracking_events: historial de movimientos de cada envío.
-- · shipment_alerts: alertas internas (entregado, retraso, incidencia,
--   intento de entrega, devolución, estado desconocido, sin novedades).
-- · Al marcar una venta como enviada se guarda la fecha y hora exacta y
--   empieza el seguimiento (lo hace la base de datos, no la pantalla).
-- · Confirmar una venta detectada acepta transportista y responsable
--   elegidos (o los detectados) y guarda la foto del anuncio.
-- · Estadísticas de envíos por transportista (tiempo medio, mediana,
--   entregados, incidencias, retrasos y devoluciones).
-- · Almacén privado «sale-images» para las fotos de los anuncios.
-- No borra ni modifica datos existentes: las ventas enviadas antes de esta
-- migración se quedan sin fecha de envío (no se inventa) y no cuentan en
-- los tiempos de entrega.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas en ventas
-- ---------------------------------------------------------------------
alter table public.sales
  add column if not exists image_path text,
  add column if not exists shipped_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists tracking_status text,
  add column if not exists tracking_status_at timestamptz,
  add column if not exists tracking_last_event text,
  add column if not exists tracking_last_location text,
  add column if not exists tracking_eta date,
  add column if not exists tracking_provider text,
  add column if not exists tracking_registered_at timestamptz,
  add column if not exists tracking_checked_at timestamptz,
  add column if not exists tracking_error text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_tracking_status_check') then
    alter table public.sales add constraint sales_tracking_status_check check (
      tracking_status is null or tracking_status in
        ('pendiente', 'enviado', 'en_transito', 'en_reparto', 'entregado', 'incidencia', 'devuelto', 'cancelado', 'desconocido'));
  end if;
end $$;

create index if not exists sales_shipped_idx on public.sales (organization_id, shipped_at) where shipped_at is not null;
create index if not exists sales_tracking_open_idx on public.sales (tracking_checked_at)
  where shipped_at is not null and delivered_at is null and tracking_number is not null;

-- ---------------------------------------------------------------------
-- 2. Historial de movimientos y alertas
-- ---------------------------------------------------------------------
create table if not exists public.tracking_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  sale_id uuid not null,
  occurred_at timestamptz not null,
  status text not null check (status in
    ('pendiente', 'enviado', 'en_transito', 'en_reparto', 'entregado', 'incidencia', 'devuelto', 'cancelado', 'desconocido')),
  description text not null,
  location text,
  source text not null check (source in ('resellap', 'manual', 'proveedor', 'correo')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  constraint tracking_events_sale_fk foreign key (organization_id, sale_id) references public.sales (organization_id, id) on delete cascade,
  unique (organization_id, sale_id, dedupe_key)
);
create index if not exists tracking_events_sale_idx on public.tracking_events (sale_id, occurred_at desc);

create table if not exists public.shipment_alerts (
  id bigint generated always as identity primary key,
  organization_id uuid not null default public.current_org_id() references public.organizations (id) on delete cascade,
  sale_id uuid not null,
  kind text not null check (kind in ('entregado', 'retraso', 'incidencia', 'intento', 'devolucion', 'desconocido', 'sin_actualizar')),
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  read_by uuid references public.profiles (id) on delete set null,
  constraint shipment_alerts_sale_fk foreign key (organization_id, sale_id) references public.sales (organization_id, id) on delete cascade,
  unique (organization_id, sale_id, kind)
);
create index if not exists shipment_alerts_open_idx on public.shipment_alerts (organization_id, created_at desc) where read_at is null;

-- Reglas de acceso: lo mismo que la venta (si ves la venta, ves su seguimiento).
-- Desde el navegador solo se lee; los cambios van por las funciones de abajo.
do $$
declare t text;
begin
  foreach t in array array['tracking_events', 'shipment_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format('create policy %I on public.%I as restrictive for all using (organization_id = (select public.current_org_id())) with check (organization_id = (select public.current_org_id()))', t || '_org_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_definer', t);
    execute format('create policy %I on public.%I for all to mi_definer using (true) with check (true)', t || '_definer', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.sales s where s.id = sale_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_ins', t);
    execute format('create policy %I on public.%I as restrictive for insert with check ((select public.org_has_access((select public.current_org_id()))))', t || '_write_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_write_upd', t);
    execute format('create policy %I on public.%I as restrictive for update using ((select public.org_has_access((select public.current_org_id())))) with check ((select public.org_has_access((select public.current_org_id()))))', t || '_write_upd', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
grant select, insert, update, delete on public.tracking_events, public.shipment_alerts to mi_definer;

-- ---------------------------------------------------------------------
-- 3. Al marcar «enviado» se guarda la hora exacta y empieza el seguimiento
-- ---------------------------------------------------------------------
create or replace function private.sales_shipping_times()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    -- Venta nueva registrada ya como enviada (no las importadas de Excel: su fecha real se desconoce)
    if new.shipping_status = 'enviado' and coalesce(new.source, 'manual') <> 'excel' and new.import_batch_id is null and new.source_ref is null then
      new.shipped_at := coalesce(new.shipped_at, now());
      new.tracking_status := coalesce(new.tracking_status, 'enviado');
      new.tracking_status_at := coalesce(new.tracking_status_at, now());
    elsif new.shipping_status = 'pendiente' then
      new.tracking_status := coalesce(new.tracking_status, 'pendiente');
    end if;
    return new;
  end if;

  if new.shipping_status is distinct from old.shipping_status then
    if new.shipping_status = 'enviado' then
      new.shipped_at := coalesce(new.shipped_at, now());
      if new.tracking_status is null or new.tracking_status = 'pendiente' then
        new.tracking_status := 'enviado';
        new.tracking_status_at := now();
      end if;
    elsif new.shipping_status = 'pendiente' and old.shipping_status = 'enviado' then
      -- Se deshace «enviado»: vuelve a pendiente y el seguimiento se para
      new.shipped_at := null;
      new.delivered_at := null;
      new.tracking_status := 'pendiente';
      new.tracking_status_at := now();
      new.tracking_registered_at := null;
    end if;
  end if;
  if new.status = 'anulada' and old.status is distinct from 'anulada'
     and new.tracking_status is not null and new.tracking_status not in ('entregado', 'devuelto') then
    new.tracking_status := 'cancelado';
    new.tracking_status_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sales_shipping_times on public.sales;
create trigger sales_shipping_times before insert or update of shipping_status, status on public.sales
  for each row execute function private.sales_shipping_times();

-- Primer movimiento del historial: «Marcado como enviado en Resellap»
create or replace function private.sales_shipping_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.shipped_at is not null and (tg_op = 'INSERT' or old.shipped_at is null) then
    insert into public.tracking_events (organization_id, sale_id, occurred_at, status, description, source, dedupe_key)
    values (new.organization_id, new.id, new.shipped_at, 'enviado', 'Marcado como enviado en Resellap', 'resellap',
            'enviado:' || extract(epoch from new.shipped_at)::bigint)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists sales_shipping_event on public.sales;
create trigger sales_shipping_event after insert or update of shipping_status on public.sales
  for each row execute function private.sales_shipping_event();

-- ---------------------------------------------------------------------
-- 4. Lógica común: aplicar un estado de seguimiento y crear alertas
-- ---------------------------------------------------------------------
create or replace function private.tracking_alert(p_sale public.sales, p_kind text, p_message text)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.shipment_alerts (organization_id, sale_id, kind, message)
  values (p_sale.organization_id, p_sale.id, p_kind, p_message)
  on conflict (organization_id, sale_id, kind) do update
     set message = excluded.message, created_at = now(), read_at = null, read_by = null
   where public.shipment_alerts.read_at is not null and public.shipment_alerts.kind in ('incidencia', 'intento', 'desconocido');
end;
$$;

create or replace function private.tracking_set_status(
  p_sale_id uuid,
  p_status text,
  p_description text,
  p_location text,
  p_at timestamptz,
  p_source text)
returns void
language plpgsql
set search_path = public
as $$
declare
  s public.sales%rowtype;
  ev public.tracking_events%rowtype;
  v_at timestamptz := coalesce(p_at, now());
  v_desc text := coalesce(nullif(trim(p_description), ''), case p_status
    when 'enviado' then 'Enviado' when 'en_transito' then 'En tránsito' when 'en_reparto' then 'En reparto'
    when 'entregado' then 'Entregado' when 'incidencia' then 'Incidencia en el envío' when 'devuelto' then 'Devuelto al remitente'
    when 'cancelado' then 'Envío cancelado' else 'Estado desconocido' end);
  v_label text;
begin
  if p_status not in ('enviado', 'en_transito', 'en_reparto', 'entregado', 'incidencia', 'devuelto', 'cancelado', 'desconocido') then
    raise exception 'Estado de seguimiento no válido.';
  end if;
  select * into s from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;

  insert into public.tracking_events (organization_id, sale_id, occurred_at, status, description, location, source, dedupe_key)
  values (s.organization_id, s.id, v_at, p_status, left(v_desc, 500), left(nullif(trim(p_location), ''), 200), p_source,
          left(p_status || ':' || extract(epoch from v_at)::bigint || ':' || md5(v_desc), 200))
  on conflict do nothing;

  -- El estado actual es el del último movimiento del transportista (o el
  -- último cambio manual). «Marcado como enviado en Resellap» solo cuenta
  -- mientras no haya ninguno: así da igual si se marcó tarde.
  select * into ev from public.tracking_events
   where sale_id = s.id
   order by (source <> 'resellap') desc, occurred_at desc, id desc
   limit 1;
  update public.sales
     set tracking_status = ev.status,
         tracking_status_at = ev.occurred_at,
         tracking_last_event = ev.description,
         tracking_last_location = ev.location,
         shipping_status = case when ev.status in ('en_transito', 'en_reparto', 'entregado') and shipping_status = 'pendiente' then 'enviado' else shipping_status end,
         delivered_at = case when ev.status = 'entregado' then coalesce(delivered_at, ev.occurred_at) when ev.status = 'devuelto' then null else delivered_at end
   where id = s.id;
  -- Solo se avisa si este movimiento es el estado actual (no por uno antiguo)
  if ev.status is distinct from p_status or ev.occurred_at is distinct from v_at then
    return;
  end if;

  select coalesce(string_agg(p.name, ', '), 'el pedido') into v_label
    from public.sale_items si join public.product_variants v on v.id = si.variant_id join public.products p on p.id = v.product_id
   where si.sale_id = s.id;
  v_label := v_label || ' (' || s.sale_number || ')';

  if p_status = 'entregado' then
    perform private.tracking_alert(s, 'entregado', 'Entregado: ' || v_label || '.');
  elsif p_status = 'incidencia' then
    if v_desc ~* '(intento|ausente|no se ha podido entregar|no estaba|recipient not|attempt)' then
      perform private.tracking_alert(s, 'intento', 'Intento de entrega sin éxito: ' || v_label || '. ' || left(v_desc, 160));
    else
      perform private.tracking_alert(s, 'incidencia', 'Incidencia en el envío de ' || v_label || ': ' || left(v_desc, 160));
    end if;
  elsif p_status = 'devuelto' then
    perform private.tracking_alert(s, 'devolucion', 'El envío de ' || v_label || ' vuelve al remitente.');
  elsif p_status = 'desconocido' and p_source <> 'manual' then
    perform private.tracking_alert(s, 'desconocido', 'El transportista no da información de ' || v_label || '. Revisa el código de seguimiento.');
  end if;
end;
$$;

-- Comprueba que el usuario puede gestionar el envío de esta venta
create or replace function private.require_shipping_access(p_sale_id uuid)
returns public.sales
language plpgsql
set search_path = public
as $$
declare
  s public.sales%rowtype;
begin
  perform public.require_active_user();
  select * into s from public.sales where id = p_sale_id;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if public.has_perm('ventas_editar') then
    return s;
  end if;
  if not public.has_perm('envios') then
    raise exception 'No tienes permiso para gestionar envíos.' using errcode = '42501';
  end if;
  if s.responsible_id is distinct from public.current_responsible_id() and not public.has_perm('ventas_todas') then
    raise exception 'Solo puedes gestionar los envíos de tus ventas.' using errcode = '42501';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Funciones para la app
-- ---------------------------------------------------------------------

-- Código de seguimiento, transportista y estado manual de un envío
create or replace function public.update_tracking(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sales%rowtype := private.require_shipping_access(private.uuid_or_null(p, 'id'));
  v_number text;
  v_status text := nullif(p ->> 'status', '');
begin
  if s.status <> 'activa' then
    raise exception 'La venta está anulada.';
  end if;
  if p ? 'tracking_number' then
    v_number := nullif(upper(regexp_replace(coalesce(p ->> 'tracking_number', ''), '\s+', '', 'g')), '');
    if v_number is not null and v_number !~ '^[A-Z0-9-]{4,40}$' then
      raise exception 'El código de seguimiento solo puede tener letras, números y guiones (de 4 a 40).';
    end if;
    if v_number is distinct from s.tracking_number then
      update public.sales
         set tracking_number = v_number, tracking_registered_at = null, tracking_error = null, tracking_checked_at = null
       where id = s.id;
    end if;
  end if;
  if p ? 'carrier_id' then
    if private.uuid_or_null(p, 'carrier_id') is not null
       and not exists (select 1 from public.carriers where id = private.uuid_or_null(p, 'carrier_id')) then
      raise exception 'El transportista no existe.';
    end if;
    update public.sales set carrier_id = private.uuid_or_null(p, 'carrier_id') where id = s.id;
  end if;
  if v_status is not null then
    if s.shipped_at is null and s.shipping_status <> 'enviado' then
      raise exception 'Primero marca la venta como enviada.';
    end if;
    perform private.tracking_set_status(s.id, v_status, nullif(p ->> 'note', ''), null, now(), 'manual');
  end if;
end;
$$;

-- Marcar alertas como vistas (solo las de ventas que puedes ver)
create or replace function public.mark_shipment_alerts_read(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
  v_all boolean := public.has_perm('ventas_todas');
  v_resp uuid := public.current_responsible_id();
begin
  perform public.require_active_user();
  update public.shipment_alerts a
     set read_at = now(), read_by = auth.uid()
    from public.sales s
   where s.id = a.sale_id
     and a.read_at is null
     and (p_ids is null or a.id = any (p_ids))
     and (v_all or s.responsible_id = v_resp);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Estadísticas de envíos por transportista. Tiempo = de «Marcar como
-- enviado» a «Entregado» (las dos horas guardadas), en días con decimales.
create or replace function public.shipping_stats(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_money boolean := public.has_perm('costes');
  v_all boolean := public.has_perm('ventas_todas');
  v_resp uuid := public.current_responsible_id();
  v_result jsonb;
begin
  perform public.require_active_user();
  with base as (
    select s.id, s.carrier_id, s.shipped_at, s.delivered_at, s.tracking_status, s.tracking_eta,
           (select sum(si.quantity * si.unit_price) from public.sale_items si where si.sale_id = s.id) as revenue,
           (select sum(si.quantity * (si.unit_price - coalesce(l.unit_cost, 0)))
              from public.sale_items si left join public.inventory_lots l on l.id = si.lot_id where si.sale_id = s.id) as profit
      from public.sales s
     where s.status = 'activa'
       and s.shipped_at is not null
       and (p_from is null or s.shipped_at >= p_from)
       and (p_to is null or s.shipped_at < p_to + 1)
       and (v_all or s.responsible_id = v_resp)
  ), per as (
    select b.carrier_id,
           count(*) as shipments,
           count(*) filter (where b.delivered_at is not null) as delivered,
           count(*) filter (where b.tracking_status in ('enviado', 'en_transito', 'en_reparto', 'desconocido')) as in_transit,
           count(*) filter (where b.tracking_status = 'incidencia' or exists (
             select 1 from public.tracking_events e where e.sale_id = b.id and e.status = 'incidencia')) as incidents,
           count(*) filter (where b.tracking_status = 'devuelto') as returned,
           count(*) filter (where (b.delivered_at is not null and b.delivered_at - b.shipped_at > interval '5 days')
                             or (b.tracking_eta is not null and coalesce(b.delivered_at::date, current_date) > b.tracking_eta)
                             or (b.delivered_at is null and b.tracking_status not in ('devuelto', 'cancelado') and now() - b.shipped_at > interval '5 days')) as delayed,
           avg(greatest(0, extract(epoch from b.delivered_at - b.shipped_at)) / 86400.0) filter (where b.delivered_at is not null) as avg_days,
           percentile_cont(0.5) within group (order by greatest(0, extract(epoch from b.delivered_at - b.shipped_at)) / 86400.0)
             filter (where b.delivered_at is not null) as median_days,
           min(greatest(0, extract(epoch from b.delivered_at - b.shipped_at)) / 86400.0) filter (where b.delivered_at is not null) as min_days,
           max(greatest(0, extract(epoch from b.delivered_at - b.shipped_at)) / 86400.0) filter (where b.delivered_at is not null) as max_days
      from base b
     group by b.carrier_id
  ), transit as (
    select count(*) as n,
           sum(revenue) as value,
           sum(profit) as profit,
           avg(extract(epoch from now() - shipped_at) / 86400.0) as avg_age_days,
           max(extract(epoch from now() - shipped_at) / 86400.0) as max_age_days
      from base where tracking_status in ('enviado', 'en_transito', 'en_reparto', 'desconocido', 'incidencia')
  )
  select jsonb_build_object(
    'carriers', coalesce((select jsonb_agg(jsonb_build_object(
        'carrier_id', p.carrier_id,
        'carrier', coalesce(c.name, 'Sin transportista'),
        'shipments', p.shipments, 'delivered', p.delivered, 'in_transit', p.in_transit,
        'incidents', p.incidents, 'returned', p.returned, 'delayed', p.delayed,
        'avg_days', round(p.avg_days::numeric, 2), 'median_days', round(p.median_days::numeric, 2),
        'min_days', round(p.min_days::numeric, 2), 'max_days', round(p.max_days::numeric, 2)) order by p.shipments desc)
      from per p left join public.carriers c on c.id = p.carrier_id), '[]'::jsonb),
    'in_transit', (select jsonb_build_object(
        'count', t.n,
        'value', case when v_money then round(coalesce(t.value, 0), 2) end,
        'profit', case when v_money then round(coalesce(t.profit, 0), 2) end,
        'avg_age_days', round(t.avg_age_days::numeric, 1),
        'max_age_days', round(t.max_age_days::numeric, 1)) from transit t),
    'totals', (select jsonb_build_object(
        'shipments', coalesce(sum(shipments), 0), 'delivered', coalesce(sum(delivered), 0),
        'incidents', coalesce(sum(incidents), 0), 'returned', coalesce(sum(returned), 0), 'delayed', coalesce(sum(delayed), 0)) from per),
    'overall', (select jsonb_build_object(
        'avg_days', round(avg(greatest(0, extract(epoch from delivered_at - shipped_at)) / 86400.0)::numeric, 2),
        'median_days', round((percentile_cont(0.5) within group (order by greatest(0, extract(epoch from delivered_at - shipped_at)) / 86400.0))::numeric, 2))
        from base where delivered_at is not null),
    'legacy_shipped', (select count(*) from public.sales s where s.status = 'activa' and s.shipping_status = 'enviado' and s.shipped_at is null
                         and (v_all or s.responsible_id = v_resp))
  ) into v_result;
  return v_result;
end;
$$;

-- Plataformas y transportistas habituales (solo añade los que falten; no toca los existentes)
create or replace function public.add_standard_lists()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_p int := 0;
  v_c int := 0;
begin
  perform public.require_perm('configuracion');
  foreach v_name in array array['Vinted', 'Wallapop', 'eBay', 'Milanuncios', 'Facebook Marketplace', 'Etsy', 'todocoleccion', 'Depop', 'Vestiaire Collective'] loop
    if not exists (select 1 from public.platforms where lower(name) = lower(v_name)) then
      insert into public.platforms (name, requires_shipping, sort_order) values (v_name, true, 100);
      v_p := v_p + 1;
    end if;
  end loop;
  foreach v_name in array array['Correos', 'DHL', 'InPost', 'GLS', 'SEUR', 'Vinted Go', 'MRW', 'CTT Express', 'NACEX', 'Correos Express', 'UPS', 'FedEx', 'Paack', 'Sending'] loop
    if not exists (select 1 from public.carriers where lower(name) = lower(v_name)) then
      insert into public.carriers (name) values (v_name);
      v_c := v_c + 1;
    end if;
  end loop;
  perform public.log_action('listas_habituales', 'carriers', null, format('Añadidas %s plataformas y %s transportistas habituales', v_p, v_c), null);
  return jsonb_build_object('platforms', v_p, 'carriers', v_c);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Funciones del servidor (seguimiento automático). Solo service_role:
--    cada una trabaja con la organización de la venta, nunca con otra.
-- ---------------------------------------------------------------------

-- Aplica lo que devuelve el servicio de seguimiento
create or replace function public.tracking_apply(p_sale_id uuid, p jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  s public.sales%rowtype;
  ev jsonb;
begin
  select * into s from public.sales where id = p_sale_id;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  update public.sales
     set tracking_provider = coalesce(nullif(p ->> 'provider', ''), tracking_provider),
         tracking_registered_at = case when (p ->> 'registered')::boolean then coalesce(tracking_registered_at, now()) else tracking_registered_at end,
         tracking_checked_at = now(),
         tracking_error = nullif(p ->> 'error', ''),
         tracking_eta = coalesce(nullif(p ->> 'eta', '')::date, tracking_eta)
   where id = s.id;
  -- Movimientos del más antiguo al más reciente (el último fija el estado actual)
  for ev in select value from jsonb_array_elements(coalesce(p -> 'events', '[]'::jsonb)) order by (value ->> 'at')::timestamptz nulls first
  loop
    if ev ->> 'status' is not null and ev ->> 'at' is not null then
      perform private.tracking_set_status(s.id, ev ->> 'status', ev ->> 'description', ev ->> 'location', (ev ->> 'at')::timestamptz, 'proveedor');
    end if;
  end loop;
end;
$$;

-- Alertas por tiempo: sin novedades (3 días) y retraso (5 días sin entregar o pasada la fecha estimada)
create or replace function public.tracking_check_stale()
returns integer
language plpgsql
set search_path = public
as $$
declare
  s public.sales%rowtype;
  v_n integer := 0;
begin
  for s in
    select * from public.sales
     where status = 'activa' and shipped_at is not null and delivered_at is null
       and tracking_status in ('enviado', 'en_transito', 'en_reparto', 'desconocido')
  loop
    if (s.tracking_eta is not null and current_date > s.tracking_eta) or now() - s.shipped_at > interval '5 days' then
      perform private.tracking_alert(s, 'retraso', format('Lleva %s días enviado y aún no consta como entregado: %s.',
        floor(extract(epoch from now() - s.shipped_at) / 86400)::int, s.sale_number));
      v_n := v_n + 1;
    elsif now() - coalesce(s.tracking_status_at, s.shipped_at) > interval '3 days' then
      perform private.tracking_alert(s, 'sin_actualizar', format('Sin novedades del envío %s desde hace más de 3 días.', s.sale_number));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.tracking_apply(uuid, jsonb), public.tracking_check_stale() from public, anon, authenticated;
grant execute on function public.tracking_apply(uuid, jsonb), public.tracking_check_stale() to service_role;
revoke execute on function private.tracking_set_status(uuid, text, text, text, timestamptz, text), private.tracking_alert(public.sales, text, text),
  private.require_shipping_access(uuid), private.sales_shipping_times(), private.sales_shipping_event() from public, anon, authenticated;
grant execute on function private.tracking_set_status(uuid, text, text, text, timestamptz, text), private.tracking_alert(public.sales, text, text),
  private.require_shipping_access(uuid) to mi_definer, service_role;
grant execute on function private.sales_shipping_times(), private.sales_shipping_event() to mi_definer, service_role, authenticated;

-- ---------------------------------------------------------------------
-- 7. Confirmar ventas detectadas: transportista, responsable y foto
-- ---------------------------------------------------------------------
drop function if exists public.email_register_sale(uuid, uuid, text, text, numeric);

create or replace function public.email_register_sale(
  p_email_id uuid,
  p_variant_id uuid,
  p_alias text default null,
  p_alias_norm text default null,
  p_price numeric default null,
  p_carrier_id uuid default null,
  p_responsible_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_user boolean := auth.uid() is not null;   -- antes de que email_actor fije el usuario
  v_actor uuid := private.email_actor(p_email_id);
  e public.email_messages%rowtype;
  v_platform uuid;
  v_price numeric;
  v_lot uuid;
  v_resp uuid;
  v_mobile uuid;
  v_date date;
  v_sale uuid;
  v_handle text;
  v_carrier uuid;
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

  if (p_price is not null or p_carrier_id is not null or p_responsible_id is not null) and not v_is_user then
    raise exception 'Solo el administrador puede cambiar los datos detectados.';
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
  if p_responsible_id is not null then
    if not exists (select 1 from public.responsibles where id = p_responsible_id and deleted_at is null) then
      raise exception 'El responsable seleccionado no existe.';
    end if;
    v_resp := p_responsible_id;
  end if;
  if v_resp is null then
    select default_responsible_id into v_resp from public.email_integration where id;
  end if;
  if v_resp is null then
    raise exception 'Falta el responsable: elige uno al confirmar, asígnalo a la cuenta «%» o elige un responsable por defecto en Ventas por correo.', coalesce(e.parsed ->> 'account', '?');
  end if;

  -- Transportista: el elegido, o el detectado en el correo
  v_carrier := p_carrier_id;
  if v_carrier is not null and not exists (select 1 from public.carriers where id = v_carrier) then
    raise exception 'El transportista no existe.';
  end if;
  if v_carrier is null and nullif(e.parsed ->> 'carrier_name', '') is not null then
    select id into v_carrier from public.carriers
     where active and lower(name) = lower(e.parsed ->> 'carrier_name')
     limit 1;
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
    'carrier_id', v_carrier,
    'shipping_status', 'pendiente',
    'notes', 'Detectada en el correo de ' || initcap(e.platform),
    'items', jsonb_build_array(jsonb_build_object(
      'variant_id', p_variant_id, 'lot_id', v_lot, 'quantity', 1, 'unit_price', v_price))
  ));

  update public.sales
     set source = 'correo',
         source_email_id = e.id,
         buyer_name = nullif(e.parsed ->> 'buyer', ''),
         platform_transaction_id = coalesce(platform_transaction_id, nullif(e.parsed ->> 'transaction_id', ''), nullif(e.parsed ->> 'order_id', '')),
         image_path = coalesce(image_path, nullif(e.parsed ->> 'image_path', ''))
   where id = v_sale;

  update public.email_messages
     set sale_id = v_sale, variant_id = p_variant_id, status = 'procesado', review_reason = null, candidates = null,
         last_error = null, processed_at = now(), resolved_by = case when v_is_user then v_actor end,
         updated_at = now()
   where id = e.id;

  if p_alias is not null and p_alias_norm is not null and length(trim(p_alias_norm)) > 0 then
    insert into public.product_aliases (variant_id, alias, alias_norm, created_by)
    values (p_variant_id, p_alias, p_alias_norm, v_actor)
    on conflict (organization_id, alias_norm) do update set variant_id = excluded.variant_id;
  end if;
  return v_sale;
end;
$$;

-- «Ya estaba apuntada»: además completa la foto y el transportista si faltan
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
  v_carrier uuid;
begin
  perform public.require_perm('correo');
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
  if nullif(e.parsed ->> 'carrier_name', '') is not null then
    select id into v_carrier from public.carriers where active and lower(name) = lower(e.parsed ->> 'carrier_name') limit 1;
  end if;

  update public.email_messages
     set status = 'duplicado', sale_id = p_sale_id, review_reason = null, candidates = null, last_error = null,
         processed_at = now(), resolved_by = auth.uid(), updated_at = now()
   where id = e.id;
  -- Completa los datos que falten en la venta (sin pisar nada)
  update public.sales
     set buyer_name = coalesce(buyer_name, nullif(e.parsed ->> 'buyer', '')),
         platform_transaction_id = coalesce(platform_transaction_id, nullif(e.parsed ->> 'transaction_id', ''), nullif(e.parsed ->> 'order_id', '')),
         image_path = coalesce(image_path, nullif(e.parsed ->> 'image_path', '')),
         carrier_id = coalesce(carrier_id, v_carrier)
   where id = p_sale_id;
  perform public.log_action('venta_duplicada', 'sales', p_sale_id::text, 'Venta detectada en el correo marcada como duplicado de ' || s.sale_number);
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Contadores del menú: alertas de envíos sin ver
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
  v_perms text[] := public.my_permissions();
  v_all boolean;
begin
  if not public.is_active_user() or v_perms is null then
    return jsonb_build_object('reviews', 0, 'shipments', 0, 'emails', 0, 'detected', 0, 'listings', 0, 'alerts', 0);
  end if;
  v_all := 'ventas_todas' = any (v_perms);
  return jsonb_build_object(
    'reviews', case when 'importar' = any (v_perms) then (select count(*) from public.review_items where status = 'pendiente') else 0 end,
    'shipments', case
      when v_all then (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente')
      when v_resp is not null then (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente' and responsible_id = v_resp)
      else 0 end,
    'emails', case when 'correo' = any (v_perms) then (select count(*) from public.email_messages where status = 'revision') else 0 end,
    'detected', case when 'correo' = any (v_perms) then (select count(*) from public.email_messages where status = 'detectada') else 0 end,
    'listings', case when 'anuncios' = any (v_perms) then (select count(*) from public.v_listings_to_remove) else 0 end,
    'alerts', (select count(*) from public.shipment_alerts a join public.sales s on s.id = a.sale_id
                where a.read_at is null and (v_all or s.responsible_id = v_resp)));
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Almacén privado de fotos de anuncios (carpeta = organización)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sale-images', 'sale-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "sale_images_select" on storage.objects;
create policy "sale_images_select" on storage.objects for select to authenticated
  using (bucket_id = 'sale-images' and split_part(name, '/', 1) = (select public.current_org_id())::text);

-- ---------------------------------------------------------------------
-- 10. Permisos y propietario de las funciones de negocio
-- ---------------------------------------------------------------------
revoke execute on function public.update_tracking(jsonb), public.mark_shipment_alerts_read(bigint[]), public.shipping_stats(date, date),
  public.add_standard_lists(), public.email_register_sale(uuid, uuid, text, text, numeric, uuid, uuid) from public, anon;
grant execute on function public.update_tracking(jsonb), public.mark_shipment_alerts_read(bigint[]), public.shipping_stats(date, date),
  public.add_standard_lists(), public.email_register_sale(uuid, uuid, text, text, numeric, uuid, uuid) to authenticated, service_role, mi_definer;

-- Las funciones de negocio no se saltan las reglas de acceso (ver migración 17)
grant create on schema public to mi_definer;
alter function public.update_tracking(jsonb) owner to mi_definer;
alter function public.mark_shipment_alerts_read(bigint[]) owner to mi_definer;
alter function public.shipping_stats(date, date) owner to mi_definer;
alter function public.add_standard_lists() owner to mi_definer;
alter function public.email_register_sale(uuid, uuid, text, text, numeric, uuid, uuid) owner to mi_definer;
revoke create on schema public from mi_definer;
