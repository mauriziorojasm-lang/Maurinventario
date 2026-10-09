-- =====================================================================
-- MaurInventario · Migración 11 · Ventas automáticas por correo (Gmail)
--
-- Lee los correos de Vinted y Wallapop que llegan a la cuenta centralizada
-- y registra las ventas sin duplicarlas:
--   · email_integration: estado de la conexión con Gmail (una fila). El
--     permiso de Google se guarda CIFRADO y solo lo lee el servidor.
--   · email_messages: un registro por correo de Gmail (identificador único).
--     Nunca se guarda el cuerpo del correo; solo los datos extraídos.
--   · email_accounts: usuario de Vinted/Wallapop → responsable y móvil.
--   · product_aliases: nombres de los anuncios que el administrador ha
--     confirmado para un producto/variante.
--   · sales: columnas nuevas (origen, comprador, seguimiento, transacción…).
--
-- Las ventas se crean con la MISMA función create_sale de siempre (stock por
-- lote, sin negativos, movimientos y auditoría). Las funciones de aquí
-- solo añaden el control de duplicados y el vínculo con el correo.
-- No borra ni modifica datos existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas en ventas
-- ---------------------------------------------------------------------
alter table public.sales
  add column if not exists source text not null default 'manual' check (source in ('manual', 'excel', 'correo')),
  add column if not exists buyer_name text,
  add column if not exists tracking_number text,
  add column if not exists platform_transaction_id text,
  add column if not exists shipping_deadline timestamptz,
  add column if not exists source_email_id uuid;

update public.sales set source = 'excel' where source = 'manual' and (source_ref is not null or import_batch_id is not null);

create index if not exists sales_transaction_idx on public.sales (platform_transaction_id) where platform_transaction_id is not null;

-- ---------------------------------------------------------------------
-- Conexión con Gmail (una sola fila; sin acceso desde el navegador)
-- ---------------------------------------------------------------------
create table public.email_integration (
  id boolean primary key default true check (id),
  email text,
  refresh_token_enc text,                 -- cifrado con AES-256-GCM por el servidor
  status text not null default 'desconectado' check (status in ('desconectado', 'conectado', 'error_autorizacion', 'error')),
  last_error text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_summary jsonb,
  connected_at timestamptz,
  acting_profile_id uuid references public.profiles (id) on delete set null,
  default_responsible_id uuid references public.responsibles (id) on delete set null,
  app_url text,
  cron_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  lock_until timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.email_integration (id) values (true) on conflict do nothing;
alter table public.email_integration enable row level security;
revoke all on public.email_integration from anon, authenticated;

-- ---------------------------------------------------------------------
-- Correos procesados
-- ---------------------------------------------------------------------
create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,          -- clave anti-duplicados
  gmail_thread_id text,
  received_at timestamptz not null,
  from_address text,
  subject text,
  platform text check (platform in ('vinted', 'wallapop')),
  kind text not null check (kind in ('vinted_venta', 'vinted_etiqueta', 'wallapop_venta', 'wallapop_aviso', 'otro')),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'procesado', 'ignorado', 'revision', 'esperando', 'error')),
  parsed jsonb not null default '{}'::jsonb,
  variant_id uuid references public.product_variants (id),
  sale_id uuid references public.sales (id),
  attachment_path text,
  review_reason text,
  candidates jsonb,                                -- ventas posibles para una etiqueta dudosa
  last_error text,
  attempts integer not null default 0,
  processed_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index email_messages_status_idx on public.email_messages (status, received_at);
create index email_messages_sale_idx on public.email_messages (sale_id);
alter table public.email_messages enable row level security;
create policy email_messages_select_admin on public.email_messages for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.email_messages from anon, authenticated;

alter table public.sales
  add constraint sales_source_email_fk foreign key (source_email_id) references public.email_messages (id);
create unique index if not exists sales_source_email_uq on public.sales (source_email_id) where source_email_id is not null;

-- Una etiqueta de correo solo puede ir a una venta y cada venta tiene como mucho
-- un correo de etiqueta procesado
create unique index email_messages_label_sale_uq on public.email_messages (sale_id)
  where kind = 'vinted_etiqueta' and status = 'procesado';

-- ---------------------------------------------------------------------
-- Cuentas de las plataformas (el «Hola, usuario:» del correo)
-- ---------------------------------------------------------------------
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('vinted', 'wallapop')),
  handle text not null,
  handle_norm text not null,
  responsible_id uuid references public.responsibles (id) on delete set null,
  mobile_device_id uuid references public.mobile_devices (id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, handle_norm)
);
alter table public.email_accounts enable row level security;
create policy email_accounts_admin on public.email_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Alias de productos (nombre del anuncio → variante)
-- ---------------------------------------------------------------------
create table public.product_aliases (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  alias text not null,
  alias_norm text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.product_aliases enable row level security;
create policy product_aliases_admin on public.product_aliases for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['email_accounts', 'product_aliases'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t || '_audit', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Ayuda: ¿lo llama el servidor (sin usuario) o un administrador?
-- ---------------------------------------------------------------------
create or replace function private.email_actor()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_actor uuid;
begin
  if v_uid is not null then
    -- Petición de un usuario: tiene que ser administrador
    perform public.require_admin();
    return v_uid;
  end if;
  -- Proceso automático (clave de servidor): actúa en nombre del administrador
  -- que conectó Gmail, para que create_sale aplique sus reglas y la auditoría
  -- lo registre
  select acting_profile_id into v_actor from public.email_integration where id;
  if v_actor is null or not exists (select 1 from public.profiles where id = v_actor and role = 'admin' and active) then
    raise exception 'La conexión con Gmail no tiene un administrador activo asociado. Vuelve a conectar Gmail.';
  end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  return v_actor;
end;
$$;
revoke execute on function private.email_actor() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Registrar la venta de un correo (Vinted «Has vendido» o Wallapop
-- confirmación). Idempotente: si el correo ya tiene venta, la devuelve.
-- p_variant_id: variante elegida (automática o por el administrador).
-- p_alias: si se indica, se recuerda ese nombre para la variante.
-- ---------------------------------------------------------------------
create or replace function public.email_register_sale(p_email_id uuid, p_variant_id uuid, p_alias text default null, p_alias_norm text default null)
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
    return e.sale_id;                     -- ya procesado: no se duplica
  end if;
  if e.kind not in ('vinted_venta', 'wallapop_venta') then
    raise exception 'Este correo no es una venta.';
  end if;
  if exists (select 1 from public.sales where source_email_id = e.id) then
    -- Defensa extra: venta ya creada con este correo
    select id into v_sale from public.sales where source_email_id = e.id;
    update public.email_messages set sale_id = v_sale, status = 'procesado', processed_at = coalesce(processed_at, now()), updated_at = now() where id = e.id;
    return v_sale;
  end if;

  v_price := nullif(e.parsed ->> 'price', '')::numeric;
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

  -- Responsable: el de la cuenta de la plataforma; si no, el de por defecto
  v_handle := e.parsed ->> 'account_norm';
  select responsible_id, mobile_device_id into v_resp, v_mobile
    from public.email_accounts where platform = e.platform and handle_norm = v_handle;
  if v_resp is null then
    select default_responsible_id into v_resp from public.email_integration where id;
  end if;
  if v_resp is null then
    raise exception 'Falta el responsable: asigna uno a la cuenta «%» o elige un responsable por defecto en Ventas por correo.', coalesce(e.parsed ->> 'account', '?');
  end if;

  -- Lote: el más antiguo con unidades (primero en entrar, primero en salir)
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
    'notes', 'Registrada automáticamente desde el correo de ' || initcap(e.platform),
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
-- Vincular la etiqueta de Vinted (PDF ya subido al bucket privado) a una
-- venta existente. Idempotente. Nunca crea ventas.
-- p_meta: tracking_number, transaction_id, deadline (timestamptz), carrier_id, force (bool)
-- ---------------------------------------------------------------------
create or replace function public.email_attach_label(p_email_id uuid, p_sale_id uuid, p_path text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_user boolean := auth.uid() is not null;
  v_actor uuid := private.email_actor();
  e public.email_messages%rowtype;
  s public.sales%rowtype;
  v_requires boolean;
  v_force boolean := coalesce((p_meta ->> 'force')::boolean, false);
begin
  select * into e from public.email_messages where id = p_email_id for update;
  if not found then
    raise exception 'El correo no existe.';
  end if;
  if e.kind <> 'vinted_etiqueta' then
    raise exception 'Este correo no es una etiqueta de envío.';
  end if;
  if e.status = 'procesado' then
    if e.sale_id = p_sale_id then
      return;                              -- ya hecho: no se repite
    end if;
    raise exception 'Esta etiqueta ya está vinculada a otra venta.';
  end if;
  if p_path is null or p_path not like p_sale_id::text || '/%' then
    raise exception 'La ruta de la etiqueta no corresponde a la venta.';
  end if;

  select * into s from public.sales where id = p_sale_id for update;
  if not found or s.status <> 'activa' then
    raise exception 'La venta no existe o está anulada.';
  end if;
  select requires_shipping into v_requires from public.platforms where id = s.platform_id;
  if not v_requires then
    raise exception 'Esa venta no lleva envío.';
  end if;
  if exists (select 1 from public.email_messages where sale_id = p_sale_id and kind = 'vinted_etiqueta' and status = 'procesado') then
    raise exception 'Esa venta ya tiene la etiqueta de otro correo.';
  end if;
  if s.shipping_label_path is not null and s.shipping_label_path <> p_path and not v_force then
    raise exception 'Esa venta ya tiene una etiqueta subida a mano.';
  end if;

  update public.sales
     set shipping_label_path = p_path,
         tracking_number = coalesce(nullif(p_meta ->> 'tracking_number', ''), tracking_number),
         platform_transaction_id = coalesce(platform_transaction_id, nullif(p_meta ->> 'transaction_id', '')),
         shipping_deadline = coalesce(nullif(p_meta ->> 'deadline', '')::timestamptz, shipping_deadline),
         carrier_id = coalesce(carrier_id, nullif(p_meta ->> 'carrier_id', '')::uuid)
   where id = p_sale_id;

  update public.email_messages
     set sale_id = p_sale_id, attachment_path = p_path, status = 'procesado', review_reason = null, candidates = null,
         last_error = null, processed_at = now(), resolved_by = case when v_is_user then v_actor end, updated_at = now()
   where id = e.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Acciones del administrador sobre un correo: descartar o reintentar
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
     set status = p_status, attempts = case when p_status = 'pendiente' then 0 else attempts end,
         last_error = null, resolved_by = auth.uid(), updated_at = now()
   where id = e.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Estado de la conexión (sin el permiso de Google ni el token interno)
-- ---------------------------------------------------------------------
create or replace function public.email_integration_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.email_integration%rowtype;
  v_cron boolean := false;
begin
  perform public.require_admin();
  select * into i from public.email_integration where id;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'select exists (select 1 from cron.job where jobname = ''maurinventario-correo'' and active)' into v_cron;
  end if;
  return jsonb_build_object(
    'email', i.email,
    'status', i.status,
    'connected', i.refresh_token_enc is not null,
    'last_error', i.last_error,
    'last_sync_at', i.last_sync_at,
    'last_success_at', i.last_success_at,
    'last_summary', i.last_summary,
    'connected_at', i.connected_at,
    'default_responsible_id', i.default_responsible_id,
    'app_url', i.app_url,
    'cron_active', v_cron
  );
end;
$$;

create or replace function public.email_set_default_responsible(p_responsible_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if p_responsible_id is not null and not exists (select 1 from public.responsibles where id = p_responsible_id and deleted_at is null) then
    raise exception 'El responsable no existe.';
  end if;
  update public.email_integration set default_responsible_id = p_responsible_id, updated_at = now() where id;
end;
$$;

create or replace function public.email_disconnect()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  update public.email_integration
     set refresh_token_enc = null, status = 'desconectado', last_error = null, updated_at = now()
   where id;
  perform public.log_action('desconectar_gmail', 'email_integration', null, 'Gmail desconectado');
end;
$$;

-- ---------------------------------------------------------------------
-- Bloqueo para que dos sincronizaciones no se pisen (solo servidor)
-- ---------------------------------------------------------------------
create or replace function public.email_sync_try_lock(p_seconds integer default 120)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.email_integration
     set lock_until = now() + make_interval(secs => p_seconds)
   where id and (lock_until is null or lock_until < now())
  returning true
$$;

create or replace function public.email_sync_unlock()
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_integration set lock_until = null where id
$$;

revoke execute on function public.email_register_sale(uuid, uuid, text, text) from public, anon;
revoke execute on function public.email_attach_label(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.email_set_status(uuid, text) from public, anon;
revoke execute on function public.email_integration_status() from public, anon;
revoke execute on function public.email_set_default_responsible(uuid) from public, anon;
revoke execute on function public.email_disconnect() from public, anon;
revoke execute on function public.email_sync_try_lock(integer) from public, anon, authenticated;
revoke execute on function public.email_sync_unlock() from public, anon, authenticated;
grant execute on function public.email_register_sale(uuid, uuid, text, text), public.email_attach_label(uuid, uuid, text, jsonb),
  public.email_set_status(uuid, text), public.email_integration_status(), public.email_set_default_responsible(uuid),
  public.email_disconnect() to authenticated, service_role;
grant execute on function public.email_sync_try_lock(integer), public.email_sync_unlock() to service_role;

-- ---------------------------------------------------------------------
-- Ejecución automática cada 5 minutos (Supabase Cron + pg_net).
-- Llama a la web (dirección guardada al conectar Gmail) con un token
-- interno que solo conocen la base de datos y el servidor.
-- Si el proyecto no tiene estas extensiones (por ejemplo, en los tests
-- locales), esta parte se omite sin error.
-- ---------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_net with schema extensions';
    execute 'create extension if not exists pg_cron';
    execute $fn$
      create or replace function private.email_cron_tick()
      returns void
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        i public.email_integration%rowtype;
      begin
        select * into i from public.email_integration where id;
        if i.refresh_token_enc is null or i.app_url is null or i.status = 'error_autorizacion' then
          return;
        end if;
        perform net.http_post(
          url := rtrim(i.app_url, '/') || '/api/correo/sincronizar',
          headers := jsonb_build_object('content-type', 'application/json', 'x-cron-token', i.cron_token),
          body := '{}'::jsonb,
          timeout_milliseconds := 55000
        );
      end;
      $body$
    $fn$;
    execute 'revoke execute on function private.email_cron_tick() from public, anon, authenticated';
    if exists (select 1 from cron.job where jobname = 'maurinventario-correo') then
      perform cron.unschedule('maurinventario-correo');
    end if;
    perform cron.schedule('maurinventario-correo', '*/5 * * * *', 'select private.email_cron_tick()');
  end if;
end
$cron$;
