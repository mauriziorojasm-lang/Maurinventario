-- =====================================================================
-- MaurInventario · Migración 17 · Varias organizaciones (SaaS)
--
-- Cada cliente tiene su ORGANIZACIÓN con sus usuarios, datos y archivos.
-- Cómo se garantiza el aislamiento (en la base de datos, no en pantalla):
--   1. Todas las tablas de negocio tienen organization_id (obligatorio).
--   2. Una política RESTRICTIVA en cada tabla: solo se ven y se escriben
--      filas de la organización activa del usuario (current_org_id()), que
--      se calcula en el servidor a partir de sus membresías; el navegador
--      no puede elegir otra.
--   3. Las funciones de negocio dejan de saltarse la seguridad: pasan a
--      ser del rol mi_definer, que NO puede saltarse RLS, así que también
--      quedan limitadas a la organización activa.
--   4. Las referencias entre tablas exigen la misma organización (claves
--      foráneas compuestas): no se puede vender el lote de otro cliente
--      aunque se conozca su identificador.
--   5. Nombres, SKU y numeración (V-000001, pedido nº 1…) son por
--      organización.
-- Datos existentes: si ya hay usuarios, todo pasa a una organización
-- «MaurInventario» cuyo propietario es el primer administrador. No se
-- borra ningún dato.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Rol sin privilegios para las funciones de negocio
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'mi_definer') then
    create role mi_definer nologin nobypassrls inherit;
  end if;
end $$;
alter role mi_definer nologin nobypassrls inherit;
grant mi_definer to postgres;
grant usage on schema public, private to mi_definer;
-- auth y storage son de Supabase: se intenta el permiso directo y, si el
-- proyecto no lo deja, a través del rol «authenticated» (mismas reglas RLS).
-- Al final de la migración se comprueba que funciona; si no, no se aplica nada.
do $$ begin
  begin
    grant usage on schema auth, storage to mi_definer;
    grant execute on all functions in schema auth to mi_definer;
  exception when insufficient_privilege then
    raise notice 'Permisos directos en auth/storage no disponibles; se usa el rol authenticated.';
  end;
  begin
    grant authenticated to mi_definer;
  exception when insufficient_privilege then
    raise notice 'No se puede añadir mi_definer a authenticated.';
  end;
end $$;

-- ---------------------------------------------------------------------
-- 1. Organizaciones, miembros, invitaciones, suscripción y plataforma
-- ---------------------------------------------------------------------
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'activa' check (status in ('activa', 'suspendida', 'eliminacion_solicitada')),
  deletion_requested_at timestamptz,
  deletion_requested_by uuid references public.profiles (id) on delete set null
);

create table if not exists public.memberships (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'vendedor', 'almacen')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships (user_id);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role text not null check (role in ('admin', 'vendedor', 'almacen')),
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz
);
create index if not exists invitations_org_idx on public.invitations (organization_id);

-- Estado de la suscripción. Lo escribe SOLO el servidor (webhook de Stripe
-- o el administrador de la plataforma), nunca el navegador.
create table if not exists public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  comped boolean not null default false,               -- acceso gratuito concedido por la plataforma
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  last_event_at timestamptz,                            -- para ignorar eventos antiguos que llegan tarde
  updated_at timestamptz not null default now()
);

-- Eventos de pago ya procesados (idempotencia)
create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  event_created_at timestamptz,
  received_at timestamptz not null default now()
);

-- Administradores de la PLATAFORMA (el dueño del servicio). No ven datos
-- de las organizaciones: solo cifras agregadas y estados.
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Numeración por organización (ventas, pedidos de compra)
create table if not exists public.org_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null,
  value bigint not null default 0,
  primary key (organization_id, kind)
);

alter table public.profiles add column if not exists active_org_id uuid references public.organizations (id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. Organización para los datos que ya existen
-- ---------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_org uuid;
begin
  if not exists (select 1 from public.profiles) or exists (select 1 from public.organizations) then
    return;
  end if;
  select id into v_owner from public.profiles where role = 'admin' and active order by created_at limit 1;
  if v_owner is null then
    select id into v_owner from public.profiles order by created_at limit 1;
  end if;
  insert into public.organizations (name, created_by) values ('MaurInventario', v_owner) returning id into v_org;
  insert into public.memberships (organization_id, user_id, role)
  select v_org, p.id, case when p.role = 'admin' then 'admin' else 'vendedor' end from public.profiles p;
  perform set_config('maurinventario.skip_row_audit', 'on', false);
  update public.profiles set active_org_id = v_org;
  perform set_config('maurinventario.skip_row_audit', '', false);
  -- La organización del dueño no paga (acceso concedido por la plataforma)
  insert into public.subscriptions (organization_id, status, comped) values (v_org, 'active', true);
  perform set_config('mi.legacy_org', v_org::text, false);
end $$;

-- ---------------------------------------------------------------------
-- 3. organization_id en todas las tablas de negocio
-- ---------------------------------------------------------------------
create or replace function private.org_tables()
returns setof text
language sql
immutable
as $$
  select unnest(array[
    'responsibles', 'brands', 'categories', 'products', 'product_variants', 'platforms', 'carriers',
    'mobile_devices', 'mobile_device_accounts', 'suppliers', 'purchase_orders', 'purchase_order_costs',
    'purchase_order_items', 'inventory_lots', 'inventory_movements', 'sales', 'sale_items', 'stock_exits',
    'stock_adjustments', 'returns', 'return_items', 'partner_transfers', 'import_batches', 'review_items',
    'audit_log', 'email_integration', 'email_messages', 'email_accounts', 'product_aliases',
    'product_photos', 'photo_uses', 'listings'
  ])
$$;

do $$
declare
  t text;
  v_org uuid := nullif(current_setting('mi.legacy_org', true), '')::uuid;
begin
  for t in select private.org_tables()
  loop
    execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations (id) on delete cascade', t);
    if v_org is not null then
      execute format('alter table public.%I disable trigger user', t);
      execute format('update public.%I set organization_id = %L where organization_id is null', t, v_org);
      execute format('alter table public.%I enable trigger user', t);
    end if;
    execute format('create index if not exists %I on public.%I (organization_id)', t || '_org_idx', t);
  end loop;
end $$;

-- Las filas sin organización que pudieran quedar (sin usuarios todavía:
-- solo los datos de ejemplo de la instalación) se borran: cada organización
-- recibe los suyos al crearse.
delete from public.mobile_devices where organization_id is null;
delete from public.platforms where organization_id is null;
delete from public.carriers where organization_id is null;
delete from public.email_integration where organization_id is null;

do $$
declare t text;
begin
  for t in select private.org_tables()
  loop
    if t <> 'audit_log' then
      execute format('alter table public.%I alter column organization_id set not null', t);
    end if;
  end loop;
end $$;

-- Gmail: una conexión por organización
alter table public.email_integration drop constraint if exists email_integration_pkey;
alter table public.email_integration add primary key (organization_id);
alter table public.email_integration alter column id set default true;
alter table public.email_integration drop constraint if exists email_integration_id_check;

-- ---------------------------------------------------------------------
-- 4. Unicidad por organización (nombres, SKU, números…)
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select i.indexrelid::regclass::text as idx, c.relname as tbl, pg_get_indexdef(i.indexrelid) as def,
           con.conname, i.indisprimary
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      left join pg_constraint con on con.conindid = i.indexrelid and con.contype in ('u', 'p')
     where c.relnamespace = 'public'::regnamespace
       and c.relname in (select private.org_tables())
       and i.indisunique and not i.indisprimary
       and not exists (
         select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'organization_id' and a.attnum = any (i.indkey)
       )
  loop
    v_def := regexp_replace(r.def, 'USING (\w+) \(', 'USING \1 (organization_id, ');
    if r.conname is not null then
      execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    else
      execute format('drop index %s', r.idx);
    end if;
    execute v_def;
  end loop;
end $$;

-- Para las claves foráneas compuestas: (organization_id, id) único en cada tabla
do $$
declare t text;
begin
  for t in select private.org_tables()
  loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'id') then
      execute format('create unique index if not exists %I on public.%I (organization_id, id)', t || '_org_id_uq', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Referencias siempre dentro de la misma organización
--    Cada clave foránea simple entre tablas de negocio se sustituye por una
--    compuesta (organization_id, columna) con el MISMO nombre y la misma
--    acción al borrar. Así no se puede apuntar a una fila de otro cliente,
--    y la API (PostgREST) sigue viendo una sola relación entre las tablas.
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  v_del text;
begin
  for r in
    select con.conname, con.confdeltype, con.condeferrable, con.condeferred, cl.relname as child, a.attname as col, pcl.relname as parent
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_class pcl on pcl.oid = con.confrelid
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
     where con.contype = 'f' and cardinality(con.conkey) = 1
       and cl.relnamespace = 'public'::regnamespace
       and cl.relname in (select private.org_tables())
       and pcl.relname in (select private.org_tables())
       and pa.attname = 'id'
  loop
    v_del := case r.confdeltype
      when 'c' then 'on delete cascade'
      when 'n' then format('on delete set null (%I)', r.col)
      when 'r' then 'on delete restrict'
      else 'on delete no action' end;
    execute format('alter table public.%I drop constraint %I', r.child, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (organization_id, %I) references public.%I (organization_id, id) %s%s',
      r.child, r.conname, r.col, r.parent, v_del,
      case when r.condeferrable then ' deferrable' || case when r.condeferred then ' initially deferred' else '' end else '' end
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6. Organización activa y permisos (funciones de confianza: comprueban
--    todo explícitamente porque leen sin las restricciones de RLS)
-- ---------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.organization_id
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.active
    join public.organizations o on o.id = m.organization_id and o.status <> 'suspendida'
   where m.user_id = auth.uid()
     and m.organization_id = coalesce(
           nullif(current_setting('app.org_id', true), '')::uuid,
           p.active_org_id,
           (select m2.organization_id from public.memberships m2 where m2.user_id = auth.uid() order by m2.created_at limit 1))
$$;

create or replace function public.current_org_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.memberships m where m.user_id = auth.uid() and m.organization_id = public.current_org_id()
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case when public.current_org_role() is null then null when public.current_org_role() = 'admin' then 'admin'::public.app_role else 'vendedor'::public.app_role end
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_org_role() = 'admin', false)
$$;

create or replace function public.is_warehouse()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_org_role() = 'almacen', false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_org_role() is not null
$$;

create or replace function public.current_responsible_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
    from public.responsibles r
   where r.profile_id = auth.uid() and r.organization_id = public.current_org_id()
     and r.deleted_at is null and r.active
   limit 1
$$;

-- ¿La organización puede trabajar? (prueba en vigor, suscripción al día o acceso concedido)
create or replace function public.org_has_access(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s join public.organizations o on o.id = s.organization_id
     where s.organization_id = p_org and o.status = 'activa'
       and (s.comped
            or s.status in ('active', 'past_due')
            or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now()))
  )
$$;

create or replace function public.require_active_user()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'Tu usuario no está activo o no tiene permisos.' using errcode = '42501';
  end if;
  if not public.org_has_access(public.current_org_id()) then
    raise exception 'La suscripción de tu organización no está activa. Tus datos están a salvo: el administrador puede reactivarla en Suscripción.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No tienes permisos para realizar esta acción.' using errcode = '42501';
  end if;
  perform public.require_active_user();
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa join public.profiles p on p.id = pa.user_id and p.active where pa.user_id = auth.uid())
$$;

-- Valor por defecto de organization_id: la organización activa
do $$
declare t text;
begin
  for t in select private.org_tables()
  loop
    execute format('alter table public.%I alter column organization_id set default public.current_org_id()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. Numeración por organización
-- ---------------------------------------------------------------------
create or replace function private.next_org_number(p_org uuid, p_kind text)
returns bigint
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.org_counters (organization_id, kind, value) values (p_org, p_kind, 1)
  on conflict (organization_id, kind) do update set value = public.org_counters.value + 1
  returning value
$$;

create or replace function private.assign_sale_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sale_number is null then
    new.sale_number := 'V-' || lpad(private.next_org_number(new.organization_id, 'venta')::text, 6, '0');
  end if;
  return new;
end;
$$;

create or replace function private.assign_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.order_number is null then
    new.order_number := private.next_org_number(new.organization_id, 'pedido')::integer;
    -- Si el número ya lo tiene un pedido metido a mano, se busca el siguiente libre
    while exists (select 1 from public.purchase_orders where organization_id = new.organization_id and order_number = new.order_number) loop
      new.order_number := private.next_org_number(new.organization_id, 'pedido')::integer;
    end loop;
  end if;
  return new;
end;
$$;
alter table public.sales alter column sale_number drop default;
alter table public.purchase_orders alter column order_number drop default;
drop trigger if exists sales_assign_number on public.sales;
create trigger sales_assign_number before insert on public.sales for each row execute function private.assign_sale_number();
drop trigger if exists purchase_orders_assign_number on public.purchase_orders;
create trigger purchase_orders_assign_number before insert on public.purchase_orders for each row execute function private.assign_order_number();

-- Contadores de la organización existente: siguen donde iban
insert into public.org_counters (organization_id, kind, value)
select organization_id, 'venta', max(nullif(regexp_replace(sale_number, '\D', '', 'g'), '')::bigint) from public.sales group by organization_id
on conflict (organization_id, kind) do update set value = greatest(public.org_counters.value, excluded.value);
insert into public.org_counters (organization_id, kind, value)
select organization_id, 'pedido', max(order_number) from public.purchase_orders group by organization_id
on conflict (organization_id, kind) do update set value = greatest(public.org_counters.value, excluded.value);

-- ---------------------------------------------------------------------
-- 8. Seguridad por filas
-- ---------------------------------------------------------------------
-- Política restrictiva de aislamiento (se suma a las que ya había) y acceso
-- completo DENTRO de la organización para las funciones de negocio.
do $$
declare t text;
begin
  for t in select private.org_tables()
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_org_isolation', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to public using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id())',
      t || '_org_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_definer', t);
    execute format('create policy %I on public.%I for all to mi_definer using (true) with check (true)', t || '_definer', t);
    -- Sin prueba en vigor ni suscripción al día: solo lectura (también por la API directa).
    -- El historial (audit_log) queda fuera: lo escriben los propios cambios permitidos.
    if t <> 'audit_log' then
      execute format('drop policy if exists %I on public.%I', t || '_write_ins', t);
      execute format('drop policy if exists %I on public.%I', t || '_write_upd', t);
      execute format('drop policy if exists %I on public.%I', t || '_write_del', t);
      execute format('create policy %I on public.%I as restrictive for insert to public with check ((select public.org_has_access(public.current_org_id())))', t || '_write_ins', t);
      execute format('create policy %I on public.%I as restrictive for update to public using ((select public.org_has_access(public.current_org_id()))) with check ((select public.org_has_access(public.current_org_id())))', t || '_write_upd', t);
      execute format('create policy %I on public.%I as restrictive for delete to public using ((select public.org_has_access(public.current_org_id())))', t || '_write_del', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on all tables in schema public to mi_definer;
grant usage, select on all sequences in schema public to mi_definer;
grant execute on all functions in schema public, private to mi_definer;

-- Perfiles: cada uno el suyo; el administrador, los de SU organización.
-- Nadie modifica perfiles ajenos (los permisos van por organización).
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid()
         or (public.is_admin() and exists (select 1 from public.memberships m where m.user_id = profiles.id and m.organization_id = public.current_org_id())));
create policy profiles_definer on public.profiles for all to mi_definer using (true) with check (true);

-- Ventas: el almacén ve todas (para preparar envíos); el vendedor, las suyas
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales for select to authenticated
  using (public.is_admin() or public.is_warehouse()
         or (public.is_active_user() and responsible_id = public.current_responsible_id()));
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items for select to authenticated
  using (public.is_admin() or public.is_warehouse()
         or exists (select 1 from public.sales s where s.id = sale_items.sale_id and public.is_active_user()
                     and s.responsible_id = public.current_responsible_id()));

-- Tablas nuevas
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.platform_admins enable row level security;
alter table public.org_counters enable row level security;

create policy organizations_member on public.organizations for select to authenticated
  using (exists (select 1 from public.memberships m where m.organization_id = organizations.id and m.user_id = auth.uid()));
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or (organization_id = public.current_org_id() and public.is_admin()));
create policy invitations_admin on public.invitations for select to authenticated
  using (organization_id = public.current_org_id() and public.is_admin());
create policy subscriptions_member on public.subscriptions for select to authenticated
  using (organization_id = public.current_org_id());
create policy platform_admins_self on public.platform_admins for select to authenticated using (user_id = auth.uid());
-- billing_events y org_counters: sin acceso directo (solo funciones del servidor)
revoke all on public.billing_events, public.org_counters, public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;
revoke insert, update, delete on public.organizations, public.memberships, public.invitations, public.subscriptions from authenticated;
revoke all on public.organizations, public.memberships, public.invitations, public.subscriptions from anon;
create policy organizations_definer on public.organizations for all to mi_definer using (true) with check (true);
create policy memberships_definer on public.memberships for all to mi_definer using (true) with check (true);

-- ---------------------------------------------------------------------
-- 9. Altas de usuarios: entran activos y sin organización (la crean al
--    registrarse o se unen por invitación)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, active)
  values (new.id, lower(coalesce(new.email, '')), nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''), 'vendedor', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- El «último administrador» ahora es por organización (ver remove_member)
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

-- Auditoría: cada registro queda en la organización de la fila cambiada
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
  v_old jsonb;
  v_new jsonb;
begin
  if coalesce(current_setting('maurinventario.skip_row_audit', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_new := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'mobile_device_id', v_old ->> 'mobile_device_id');
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, old_data, new_data)
  values (
    coalesce((v_new ->> 'organization_id')::uuid, (v_old ->> 'organization_id')::uuid, public.current_org_id()),
    auth.uid(), public.audit_actor_email(),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
    tg_table_name, v_id, v_old, v_new);
  return coalesce(new, old);
end;
$$;
drop trigger if exists profiles_audit on public.profiles;

-- ---------------------------------------------------------------------
-- 10. Archivos: solo los de la organización (la ruta empieza por el id
--     del producto o de la venta, que se comprueba con RLS)
-- ---------------------------------------------------------------------
create or replace function public.can_access_sale_label(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sales s
     where s.id::text = split_part(p_object_name, '/', 1)
       and s.organization_id = public.current_org_id()
       and (public.is_admin() or public.is_warehouse()
            or (s.status = 'activa' and public.is_active_user() and s.responsible_id = public.current_responsible_id())))
$$;

create or replace function public.can_access_product_photo(p_object_name text, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.products p
     where p.id::text = split_part(p_object_name, '/', 1)
       and p.organization_id = public.current_org_id()
       and (not p_write or public.is_admin()))
$$;
revoke execute on function public.can_access_product_photo(text, boolean) from public, anon;
grant execute on function public.can_access_product_photo(text, boolean) to authenticated;

drop policy if exists "product_photos_select" on storage.objects;
drop policy if exists "product_photos_insert" on storage.objects;
drop policy if exists "product_photos_update" on storage.objects;
drop policy if exists "product_photos_delete" on storage.objects;
create policy "product_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and public.can_access_product_photo(name, false));
create policy "product_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.can_access_product_photo(name, true));
create policy "product_photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.can_access_product_photo(name, true))
  with check (bucket_id = 'product-photos' and public.can_access_product_photo(name, true));
create policy "product_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.can_access_product_photo(name, true));


-- ---------------------------------------------------------------------
-- 11. Ventas: el almacén gestiona los envíos de cualquier venta
-- ---------------------------------------------------------------------
create or replace function public.update_sale(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
  v_sale public.sales%rowtype;
  v_platform public.platforms%rowtype;
  k text;
  v_seller_keys text[] := array['id', 'shipping_status', 'carrier_id', 'shipping_label_path', 'external_reference', 'notes'];
begin
  perform public.require_active_user();
  select * into v_sale from public.sales where id = private.uuid_or_null(p, 'id') for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if v_sale.status <> 'activa' then
    raise exception 'La venta está anulada y no se puede modificar.';
  end if;

  if not v_admin then
    -- Almacén: cualquier venta, solo los datos del envío
    if public.is_warehouse() then
      v_seller_keys := array['id', 'shipping_status', 'carrier_id', 'shipping_label_path'];
    elsif v_sale.responsible_id is distinct from public.current_responsible_id() then
      raise exception 'Solo puedes modificar tus propias ventas.' using errcode = '42501';
    end if;
    for k in select jsonb_object_keys(p)
    loop
      if not (k = any (v_seller_keys)) then
        raise exception 'No tienes permisos para modificar ese dato de la venta.' using errcode = '42501';
      end if;
    end loop;
  end if;

  if p ? 'responsible_id' then
    v_sale.responsible_id := private.uuid_or_null(p, 'responsible_id');
    if not exists (select 1 from public.responsibles where id = v_sale.responsible_id and deleted_at is null) then
      raise exception 'El responsable seleccionado no existe.';
    end if;
  end if;
  if p ? 'sale_date' then
    v_sale.sale_date := coalesce(private.date_or_null(p, 'sale_date', 'La fecha'), v_sale.sale_date);
  end if;
  if p ? 'platform_id' then
    v_sale.platform_id := private.uuid_or_null(p, 'platform_id');
  end if;
  if p ? 'carrier_id' then
    v_sale.carrier_id := private.uuid_or_null(p, 'carrier_id');
  end if;
  if p ? 'mobile_device_id' then
    v_sale.mobile_device_id := private.uuid_or_null(p, 'mobile_device_id');
  end if;
  if p ? 'shipping_status' then
    v_sale.shipping_status := private.txt(p, 'shipping_status')::public.shipping_status;
  end if;
  if p ? 'shipping_label_path' then
    v_sale.shipping_label_path := private.txt(p, 'shipping_label_path');
  end if;
  if p ? 'external_reference' then
    v_sale.external_reference := private.txt(p, 'external_reference');
  end if;
  if p ? 'notes' then
    v_sale.notes := private.txt(p, 'notes');
  end if;

  select * into v_platform from public.platforms where id = v_sale.platform_id;
  if not found then
    raise exception 'Selecciona la plataforma de venta.';
  end if;
  if v_platform.requires_shipping then
    v_sale.shipping_status := coalesce(v_sale.shipping_status, 'pendiente');
  else
    v_sale.shipping_status := null;
    v_sale.carrier_id := null;
    v_sale.shipping_label_path := null;
  end if;
  if v_sale.mobile_device_id is not null and not exists (select 1 from public.mobile_devices where id = v_sale.mobile_device_id) then
    raise exception 'El móvil seleccionado no existe.';
  end if;

  update public.sales set
    sale_date = v_sale.sale_date,
    responsible_id = v_sale.responsible_id,
    platform_id = v_sale.platform_id,
    carrier_id = v_sale.carrier_id,
    mobile_device_id = v_sale.mobile_device_id,
    shipping_status = v_sale.shipping_status,
    shipping_label_path = v_sale.shipping_label_path,
    external_reference = v_sale.external_reference,
    notes = v_sale.notes
  where id = v_sale.id;
end;
$$;

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
  if public.is_warehouse() then
    return jsonb_build_object('reviews', 0, 'emails', 0, 'detected', 0, 'listings', 0,
      'shipments', (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente'));
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

-- ---------------------------------------------------------------------
-- 12. Gmail por organización
-- ---------------------------------------------------------------------
-- Quién actúa al procesar un correo: el usuario (si es administrador de la
-- organización del correo) o, en el proceso automático, el administrador
-- que conectó Gmail en ESA organización.
drop function if exists private.email_actor();
create or replace function private.email_actor(p_email_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_actor uuid;
begin
  select organization_id into v_org from public.email_messages where id = p_email_id;
  if v_org is null then
    raise exception 'El correo no existe.';
  end if;
  if v_uid is not null then
    if v_org is distinct from public.current_org_id() then
      raise exception 'El correo no existe.';
    end if;
    perform public.require_admin();
    return v_uid;
  end if;
  select acting_profile_id into v_actor from public.email_integration where organization_id = v_org;
  if v_actor is null or not exists (
    select 1 from public.memberships m join public.profiles p on p.id = m.user_id
     where m.organization_id = v_org and m.user_id = v_actor and m.role = 'admin' and p.active) then
    raise exception 'La conexión con Gmail no tiene un administrador activo asociado. Vuelve a conectar Gmail.';
  end if;
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('app.org_id', v_org::text, true);
  return v_actor;
end;
$$;
revoke execute on function private.email_actor(uuid) from public, anon, authenticated;

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
    on conflict (organization_id, alias_norm) do update set variant_id = excluded.variant_id;
  end if;
  return v_sale;
end;
$$;

create or replace function public.email_attach_label(p_email_id uuid, p_sale_id uuid, p_path text, p_meta jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_user boolean := auth.uid() is not null;
  v_actor uuid := private.email_actor(p_email_id);
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

drop function if exists public.email_sync_try_lock(integer);
drop function if exists public.email_sync_unlock();
create or replace function public.email_sync_try_lock(p_org uuid, p_seconds integer default 120)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.email_integration
     set lock_until = now() + make_interval(secs => p_seconds)
   where organization_id = p_org and (lock_until is null or lock_until < now())
  returning true
$$;
create or replace function public.email_sync_unlock(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_integration set lock_until = null where organization_id = p_org
$$;
revoke execute on function public.email_sync_try_lock(uuid, integer), public.email_sync_unlock(uuid) from public, anon, authenticated;
grant execute on function public.email_sync_try_lock(uuid, integer), public.email_sync_unlock(uuid) to service_role;

-- El aviso cada 5 minutos llama al servidor una vez; el servidor recorre las organizaciones conectadas
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') and exists (select 1 from pg_extension where extname = 'pg_cron') then
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
        select * into i from public.email_integration
         where refresh_token_enc is not null and app_url is not null and status <> 'error_autorizacion'
         order by updated_at desc limit 1;
        if not found then
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
  end if;
end
$cron$;

-- Numeración por organización en pedidos e importación

-- Contadores: consultar y subir (nunca bajar)
create or replace function private.counter_value(p_org uuid, p_kind text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value from public.org_counters where organization_id = p_org and kind = p_kind), 0)
$$;
create or replace function private.counter_at_least(p_org uuid, p_kind text, p_value bigint)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.org_counters (organization_id, kind, value) values (p_org, p_kind, coalesce(p_value, 0))
  on conflict (organization_id, kind) do update set value = greatest(public.org_counters.value, excluded.value)
$$;

create or replace function public.save_purchase_order(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'id');
  v_po public.purchase_orders%rowtype;
  v_number integer := private.int_or_null(p, 'order_number', 'El número de pedido');
  v_supplier uuid := private.uuid_or_null(p, 'supplier_id');
  v_date date := private.date_or_null(p, 'order_date', 'La fecha del pedido');
begin
  perform public.require_admin();

  if v_number is not null and v_number <= 0 then
    raise exception 'El número de pedido debe ser mayor que 0.';
  end if;
  if v_number is not null and exists (
    select 1 from public.purchase_orders where order_number = v_number and id is distinct from v_id
  ) then
    raise exception 'Ya existe el pedido de compra #%.', v_number;
  end if;
  if v_supplier is not null and not exists (select 1 from public.suppliers where id = v_supplier and deleted_at is null) then
    raise exception 'El proveedor seleccionado no existe.';
  end if;

  if v_id is null then
    if v_supplier is null then
      raise exception 'Un pedido pertenece a un proveedor: selecciónalo.';
    end if;
    if v_date is null then
      raise exception 'Indica la fecha del pedido.';
    end if;
    insert into public.purchase_orders (order_number, supplier_id, order_date, notes, created_by)
    values (v_number, v_supplier, v_date,
            private.txt(p, 'notes'), auth.uid())
    returning * into v_po;
    perform private.insert_po_lines(v_po.id, p -> 'items');
    perform private.insert_po_costs(v_po.id, p -> 'costs');
    perform private.counter_at_least(v_po.organization_id, 'pedido', (select max(order_number) from public.purchase_orders));
    perform public.log_action('crear_pedido_compra', 'purchase_orders', v_po.id::text,
      'Pedido de compra #' || v_po.order_number || ' creado');
    return v_po.id;
  end if;

  select * into v_po from public.purchase_orders where id = v_id for update;
  if not found then
    raise exception 'El pedido de compra no existe.';
  end if;
  if v_po.status = 'cancelado' then
    raise exception 'El pedido está cancelado y no se puede modificar.';
  end if;
  if v_po.status = 'recibido' and (p ? 'items' or p ? 'costs') then
    raise exception 'El pedido ya está recibido: sus líneas no se pueden cambiar. Los costes se cambian desde "Costes del pedido".';
  end if;

  update public.purchase_orders set
    order_number = coalesce(v_number, order_number),
    supplier_id = coalesce(v_supplier, supplier_id),
    order_date = coalesce(v_date, order_date),
    notes = case when p ? 'notes' then private.txt(p, 'notes') else notes end
  where id = v_id;

  if v_po.status = 'pendiente' then
    if p ? 'items' then
      delete from public.purchase_order_items where purchase_order_id = v_id;
      perform private.insert_po_lines(v_id, p -> 'items');
    end if;
    if p ? 'costs' then
      delete from public.purchase_order_costs where purchase_order_id = v_id;
      perform private.insert_po_costs(v_id, p -> 'costs');
    end if;
  end if;

  perform private.counter_at_least(v_po.organization_id, 'pedido', (select max(order_number) from public.purchase_orders));
  return v_id;
end;
$$;

create or replace function public.import_data(p jsonb, p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid;
  v_summary jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_name text;
  v_id uuid;
  v_variant uuid;
  r jsonb;
  it jsonb;
  v_placeholder uuid;
  v_supplier uuid;
  v_po uuid;
  v_line integer;
  v_item uuid;
  v_lot uuid;
  v_sale uuid;
  v_platform public.platforms%rowtype;
  v_resp uuid;
  v_carrier uuid;
  v_mobile uuid;
  v_idx integer;
  v_next_sale bigint;
  v_integrity jsonb;
  v_stock jsonb;
  v_exit uuid;
begin
  perform public.require_admin();

  begin
    perform set_config('maurinventario.skip_row_audit', 'on', true);

    insert into public.import_batches (file_name, created_by)
    values (coalesce(private.txt(p, 'file_name'), 'importación'), auth.uid())
    returning id into v_batch;

    create temporary table _imp_products (key text primary key, product_id uuid, variant_id uuid, created boolean) on commit drop;

    -- Durante la importación nadie más puede registrar ventas ni pedidos
    -- (evita números duplicados). Los números de venta se asignan aquí
    -- para que una simulación no "gaste" números de la secuencia.
    lock table public.sales in exclusive mode;
    lock table public.purchase_orders in exclusive mode;
    select greatest(
             coalesce((select max(substring(sale_number from '^V-(\d+)$')::bigint) from public.sales), 0),
             private.counter_value(public.current_org_id(), 'venta')
           ) + 1
      into v_next_sale;

    -- Contadores
    v_counts := jsonb_build_object(
      'categories_created', 0, 'brands_created', 0, 'carriers_created', 0, 'platforms_created', 0,
      'mobiles_processed', 0, 'responsibles_created', 0, 'suppliers_created', 0,
      'products_created', 0, 'products_existing', 0,
      'purchase_orders_created', 0, 'purchase_orders_duplicated', 0, 'purchase_items_created', 0,
      'sales_created', 0, 'sales_duplicated', 0, 'sales_failed', 0, 'sale_items_created', 0,
      'stock_exits_created', 0, 'stock_exits_duplicated', 0, 'stock_exits_failed', 0,
      'review_items_created', 0
    );

    -- Categorías
    for v_name in select distinct trim(x) from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) x where trim(x) <> ''
    loop
      if not exists (select 1 from public.categories where lower(trim(name)) = lower(v_name) and deleted_at is null) then
        insert into public.categories (name) values (v_name);
        v_counts := jsonb_set(v_counts, '{categories_created}', to_jsonb((v_counts ->> 'categories_created')::int + 1));
      end if;
    end loop;

    -- Marcas
    for v_name in select distinct trim(x) from jsonb_array_elements_text(coalesce(p -> 'brands', '[]')) x where trim(x) <> ''
    loop
      if not exists (select 1 from public.brands where lower(trim(name)) = lower(v_name) and deleted_at is null) then
        insert into public.brands (name) values (v_name);
        v_counts := jsonb_set(v_counts, '{brands_created}', to_jsonb((v_counts ->> 'brands_created')::int + 1));
      end if;
    end loop;

    -- Transportistas
    for v_name in select distinct trim(x) from jsonb_array_elements_text(coalesce(p -> 'carriers', '[]')) x where trim(x) <> ''
    loop
      if not exists (select 1 from public.carriers where lower(trim(name)) = lower(v_name)) then
        insert into public.carriers (name) values (v_name);
        v_counts := jsonb_set(v_counts, '{carriers_created}', to_jsonb((v_counts ->> 'carriers_created')::int + 1));
      end if;
    end loop;

    -- Plataformas
    for r in select * from jsonb_array_elements(coalesce(p -> 'platforms', '[]'))
    loop
      v_name := private.txt(r, 'name');
      if v_name is not null and not exists (select 1 from public.platforms where lower(trim(name)) = lower(v_name)) then
        insert into public.platforms (name, requires_shipping) values (v_name, coalesce((r ->> 'requires_shipping')::boolean, false));
        v_counts := jsonb_set(v_counts, '{platforms_created}', to_jsonb((v_counts ->> 'platforms_created')::int + 1));
      end if;
    end loop;

    -- Móviles (solo se renombran los que aún tienen el nombre genérico "Móvil N")
    for r in select * from jsonb_array_elements(coalesce(p -> 'mobile_devices', '[]'))
    loop
      select id into v_id from public.mobile_devices where number = (r ->> 'number')::integer;
      if v_id is null then
        insert into public.mobile_devices (number, name)
        values ((r ->> 'number')::integer, coalesce(private.txt(r, 'name'), 'Móvil ' || (r ->> 'number')))
        returning id into v_id;
      elsif private.txt(r, 'name') is not null then
        update public.mobile_devices set name = private.txt(r, 'name')
         where id = v_id and name = 'Móvil ' || number;
      end if;
      if private.txt(r, 'email') is not null or private.txt(r, 'phone') is not null then
        insert into public.mobile_device_accounts (mobile_device_id, email, phone)
        values (v_id, private.txt(r, 'email'), private.txt(r, 'phone'))
        on conflict (mobile_device_id) do update
          set email = coalesce(public.mobile_device_accounts.email, excluded.email),
              phone = coalesce(public.mobile_device_accounts.phone, excluded.phone);
      end if;
      v_counts := jsonb_set(v_counts, '{mobiles_processed}', to_jsonb((v_counts ->> 'mobiles_processed')::int + 1));
    end loop;

    -- Responsables
    for r in select * from jsonb_array_elements(coalesce(p -> 'responsibles', '[]'))
    loop
      v_name := private.txt(r, 'name');
      continue when v_name is null;
      select id into v_id from public.responsibles where lower(trim(name)) = lower(v_name) and deleted_at is null;
      if v_id is null then
        insert into public.responsibles (name, is_partner, import_batch_id)
        values (v_name, coalesce((r ->> 'is_partner')::boolean, false), v_batch);
        v_counts := jsonb_set(v_counts, '{responsibles_created}', to_jsonb((v_counts ->> 'responsibles_created')::int + 1));
      elsif coalesce((r ->> 'is_partner')::boolean, false) then
        update public.responsibles set is_partner = true where id = v_id;
      end if;
    end loop;

    -- Productos (uno por nombre; los existentes se reutilizan sin modificarlos)
    for r in select * from jsonb_array_elements(coalesce(p -> 'products', '[]'))
    loop
      v_name := private.txt(r, 'name');
      if v_name is null then
        raise exception 'Hay un producto sin nombre en el plan de importación.';
      end if;
      select id into v_id from public.products where lower(trim(name)) = lower(v_name) and deleted_at is null;
      if v_id is not null then
        select id into v_variant from public.product_variants
         where product_id = v_id and deleted_at is null
         order by is_default desc, created_at limit 1;
        insert into _imp_products values (r ->> 'key', v_id, v_variant, false) on conflict (key) do nothing;
        v_counts := jsonb_set(v_counts, '{products_existing}', to_jsonb((v_counts ->> 'products_existing')::int + 1));
      else
        insert into public.products (name, brand_id, category_id, sku, description, normal_sale_price, legacy_code,
                                     import_batch_id, source_ref)
        values (
          v_name,
          private.resolve_brand(jsonb_build_object('brand_name', r ->> 'brand')),
          private.resolve_category(jsonb_build_object('category_name', r ->> 'category')),
          private.txt(r, 'sku'),
          private.txt(r, 'description'),
          private.num_or_null(r, 'normal_sale_price', 'El precio normal'),
          private.txt(r, 'legacy_code'),
          v_batch,
          private.txt(r, 'source_ref')
        )
        returning id into v_id;
        insert into public.product_variants (product_id, name, is_default)
        values (v_id, coalesce(private.txt(r, 'variant_name'), 'Sin especificar'), true)
        returning id into v_variant;
        insert into _imp_products values (r ->> 'key', v_id, v_variant, true) on conflict (key) do nothing;
        v_counts := jsonb_set(v_counts, '{products_created}', to_jsonb((v_counts ->> 'products_created')::int + 1));
      end if;
    end loop;

    -- Pedidos de compra (se crean ya recibidos: es histórico)
    for r in select * from jsonb_array_elements(coalesce(p -> 'purchase_orders', '[]'))
    loop
      if exists (select 1 from public.purchase_orders where order_number = (r ->> 'order_number')::integer) then
        v_counts := jsonb_set(v_counts, '{purchase_orders_duplicated}', to_jsonb((v_counts ->> 'purchase_orders_duplicated')::int + 1));
        continue;
      end if;

      v_name := private.txt(r, 'supplier_name');
      if v_name is null then
        if v_placeholder is null then
          select id into v_placeholder from public.suppliers where is_placeholder and deleted_at is null limit 1;
          if v_placeholder is null then
            insert into public.suppliers (name, is_placeholder, notes)
            values ('Proveedor pendiente de identificar', true, 'Creado en la importación: el Excel no indica el proveedor.')
            returning id into v_placeholder;
            v_counts := jsonb_set(v_counts, '{suppliers_created}', to_jsonb((v_counts ->> 'suppliers_created')::int + 1));
          end if;
        end if;
        v_supplier := v_placeholder;
      else
        select id into v_supplier from public.suppliers where lower(trim(name)) = lower(v_name) and deleted_at is null;
        if v_supplier is null then
          insert into public.suppliers (name) values (v_name) returning id into v_supplier;
          v_counts := jsonb_set(v_counts, '{suppliers_created}', to_jsonb((v_counts ->> 'suppliers_created')::int + 1));
        end if;
      end if;

      insert into public.purchase_orders (order_number, supplier_id, order_date, status, received_at, notes, created_by, import_batch_id, source_ref)
      values ((r ->> 'order_number')::integer, v_supplier, (r ->> 'order_date')::date, 'pendiente', null,
              private.txt(r, 'notes'), auth.uid(), v_batch, private.txt(r, 'source_ref'))
      returning id into v_po;

      perform private.insert_po_costs(v_po, r -> 'costs');

      v_line := 0;
      for it in select * from jsonb_array_elements(r -> 'items')
      loop
        v_line := v_line + 1;
        select variant_id into v_variant from _imp_products where key = it ->> 'product_key';
        if v_variant is null then
          raise exception 'Pedido #%: el producto "%" no está en el plan de importación.', r ->> 'order_number', it ->> 'product_key';
        end if;
        insert into public.purchase_order_items (purchase_order_id, line_number, variant_id, quantity_ordered, unit_cost,
                                                 quantity_received, status, notes, source_ref)
        values (v_po, v_line, v_variant, (it ->> 'quantity')::integer, (it ->> 'unit_cost')::numeric,
                (it ->> 'quantity')::integer, 'recibido', private.txt(it, 'notes'), private.txt(it, 'source_ref'))
        returning id into v_item;
        insert into public.inventory_lots (origin, purchase_order_id, purchase_order_item_id, variant_id, received_at, quantity_initial, unit_cost)
        values ('compra', v_po, v_item, v_variant, (r ->> 'order_date')::date, (it ->> 'quantity')::integer, (it ->> 'unit_cost')::numeric)
        returning id into v_lot;
        insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, purchase_order_id, notes, created_by)
        values ('entrada_compra', v_variant, v_lot, (it ->> 'quantity')::integer, (r ->> 'order_date')::date, v_po,
                'Importado del Excel (' || coalesce(it ->> 'source_ref', '') || ')', auth.uid());
        v_counts := jsonb_set(v_counts, '{purchase_items_created}', to_jsonb((v_counts ->> 'purchase_items_created')::int + 1));
      end loop;

      update public.purchase_orders set status = 'recibido', received_at = order_date where id = v_po;
      perform private.apply_po_costs(v_po);
      v_counts := jsonb_set(v_counts, '{purchase_orders_created}', to_jsonb((v_counts ->> 'purchase_orders_created')::int + 1));
    end loop;


    -- Ventas (en orden de fecha; cada línea sale del lote de su pedido).
    -- Cada venta va en su propio bloque: si una falla, solo se deshace esa
    -- venta y queda registrada como "pendiente de revisar".
    for r in
      select x.value
        from jsonb_array_elements(coalesce(p -> 'sales', '[]')) with ordinality as x(value, ord)
       order by (x.value ->> 'sale_date')::date, x.ord
    loop
      if exists (select 1 from public.sales where import_fingerprint = r ->> 'fingerprint') then
        v_counts := jsonb_set(v_counts, '{sales_duplicated}', to_jsonb((v_counts ->> 'sales_duplicated')::int + 1));
        continue;
      end if;

      begin
        v_resp := null; v_carrier := null; v_mobile := null; v_platform := null;
        select id into v_resp from public.responsibles where lower(trim(name)) = lower(private.txt(r, 'responsible')) and deleted_at is null;
        select * into v_platform from public.platforms where lower(trim(name)) = lower(private.txt(r, 'platform'));
        select id into v_carrier from public.carriers where lower(trim(name)) = lower(private.txt(r, 'carrier'));
        select id into v_mobile from public.mobile_devices where number = (nullif(r ->> 'mobile_number', ''))::integer;
        if v_resp is null then
          raise exception 'Responsable desconocido: %', coalesce(r ->> 'responsible', '(vacío)');
        end if;
        if v_platform.id is null then
          raise exception 'Plataforma desconocida: %', coalesce(r ->> 'platform', '(vacía)');
        end if;

        insert into public.sales (sale_number, sale_date, responsible_id, platform_id, carrier_id, mobile_device_id, shipping_status,
                                  external_reference, notes, created_by, import_batch_id, source_ref, import_fingerprint)
        values (
          'V-' || lpad(v_next_sale::text, 6, '0'),
          (r ->> 'sale_date')::date, v_resp, v_platform.id,
          case when v_platform.requires_shipping then v_carrier end,
          v_mobile,
          case when v_platform.requires_shipping
               then coalesce(private.txt(r, 'shipping_status')::public.shipping_status, 'pendiente') end,
          private.txt(r, 'external_reference'), private.txt(r, 'notes'), auth.uid(), v_batch,
          private.txt(r, 'source_ref'), r ->> 'fingerprint'
        )
        returning id into v_sale;

        v_idx := 0;
        for it in select * from jsonb_array_elements(r -> 'items')
        loop
          v_idx := v_idx + 1;
          v_variant := null; v_lot := null;
          select variant_id into v_variant from _imp_products where key = it ->> 'product_key';
          if v_variant is null then
            raise exception 'Producto desconocido: %', it ->> 'product_key';
          end if;
          select l.id into v_lot
            from public.inventory_lots l
            join public.purchase_orders po on po.id = l.purchase_order_id
            left join public.purchase_order_items i on i.id = l.purchase_order_item_id
           where l.variant_id = v_variant
             and po.order_number = (it ->> 'purchase_order_number')::integer
             and l.quantity_available >= (it ->> 'quantity')::integer
           order by i.line_number
           limit 1;
          if v_lot is null then
            raise exception 'No hay stock suficiente en el pedido #% para este producto', it ->> 'purchase_order_number';
          end if;
          insert into public.sale_items (sale_id, line_number, variant_id, lot_id, quantity, unit_price, notes, source_ref)
          values (v_sale, v_idx, v_variant, v_lot, (it ->> 'quantity')::integer, (it ->> 'unit_price')::numeric,
                  private.txt(it, 'notes'), private.txt(r, 'source_ref'))
          returning id into v_item;
          insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, sale_item_id, created_by)
          values ('venta', v_variant, v_lot, -((it ->> 'quantity')::integer), (r ->> 'sale_date')::date, v_item, auth.uid());
        end loop;

        v_next_sale := v_next_sale + 1;
        v_counts := jsonb_set(v_counts, '{sales_created}', to_jsonb((v_counts ->> 'sales_created')::int + 1));
        v_counts := jsonb_set(v_counts, '{sale_items_created}', to_jsonb((v_counts ->> 'sale_items_created')::int + v_idx));
      exception
        when sqlstate 'MI001' then raise;
        when others then
          v_errors := v_errors || jsonb_build_object('source_ref', r ->> 'source_ref', 'error', sqlerrm);
          if not exists (select 1 from public.review_items where kind = 'venta_no_importada'
                            and title = 'Venta no importada (' || coalesce(r ->> 'source_ref', '') || ')') then
            insert into public.review_items (kind, entity_type, title, details, payload, import_batch_id)
            values ('venta_no_importada', 'sales', 'Venta no importada (' || coalesce(r ->> 'source_ref', '') || ')',
                    sqlerrm, r, v_batch);
            v_counts := jsonb_set(v_counts, '{review_items_created}', to_jsonb((v_counts ->> 'review_items_created')::int + 1));
          end if;
          v_counts := jsonb_set(v_counts, '{sales_failed}', to_jsonb((v_counts ->> 'sales_failed')::int + 1));
      end;
    end loop;

    -- Salidas sin venta (las ventas a 0 € del Excel)
    for r in
      select x.value
        from jsonb_array_elements(coalesce(p -> 'stock_exits', '[]')) with ordinality as x(value, ord)
       order by (x.value ->> 'exit_date')::date, x.ord
    loop
      if exists (select 1 from public.stock_exits where import_fingerprint = r ->> 'fingerprint') then
        v_counts := jsonb_set(v_counts, '{stock_exits_duplicated}', to_jsonb((v_counts ->> 'stock_exits_duplicated')::int + 1));
        continue;
      end if;
      begin
        v_variant := null; v_lot := null; v_resp := null;
        select variant_id into v_variant from _imp_products where key = r ->> 'product_key';
        if v_variant is null then
          raise exception 'Producto desconocido: %', r ->> 'product_key';
        end if;
        select l.id into v_lot
          from public.inventory_lots l
          join public.purchase_orders po on po.id = l.purchase_order_id
          left join public.purchase_order_items i on i.id = l.purchase_order_item_id
         where l.variant_id = v_variant
           and po.order_number = (r ->> 'purchase_order_number')::integer
           and l.quantity_available >= (r ->> 'quantity')::integer
         order by i.line_number
         limit 1;
        if v_lot is null then
          raise exception 'No hay stock suficiente en el pedido #% para la salida sin venta', r ->> 'purchase_order_number';
        end if;
        select id into v_resp from public.responsibles where lower(trim(name)) = lower(private.txt(r, 'responsible')) and deleted_at is null;
        insert into public.stock_exits (exit_date, variant_id, lot_id, quantity, reason, responsible_id, notes, created_by,
                                        import_batch_id, source_ref, import_fingerprint)
        values ((r ->> 'exit_date')::date, v_variant, v_lot, (r ->> 'quantity')::integer,
                coalesce(private.txt(r, 'reason'), 'pendiente')::public.exit_reason, v_resp, private.txt(r, 'notes'),
                auth.uid(), v_batch, private.txt(r, 'source_ref'), r ->> 'fingerprint')
        returning id into v_exit;
        insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, stock_exit_id, notes, created_by)
        values ('salida_sin_venta', v_variant, v_lot, -((r ->> 'quantity')::integer), (r ->> 'exit_date')::date, v_exit,
                private.txt(r, 'notes'), auth.uid());
        v_counts := jsonb_set(v_counts, '{stock_exits_created}', to_jsonb((v_counts ->> 'stock_exits_created')::int + 1));
      exception
        when sqlstate 'MI001' then raise;
        when others then
          v_errors := v_errors || jsonb_build_object('source_ref', r ->> 'source_ref', 'error', sqlerrm);
          if not exists (select 1 from public.review_items where kind = 'salida_no_importada'
                            and title = 'Salida sin venta no importada (' || coalesce(r ->> 'source_ref', '') || ')') then
            insert into public.review_items (kind, entity_type, title, details, payload, import_batch_id)
            values ('salida_no_importada', 'stock_exits', 'Salida sin venta no importada (' || coalesce(r ->> 'source_ref', '') || ')',
                    sqlerrm, r, v_batch);
            v_counts := jsonb_set(v_counts, '{review_items_created}', to_jsonb((v_counts ->> 'review_items_created')::int + 1));
          end if;
          v_counts := jsonb_set(v_counts, '{stock_exits_failed}', to_jsonb((v_counts ->> 'stock_exits_failed')::int + 1));
      end;
    end loop;

    -- Datos pendientes de revisar que detectó la validación
    for r in select * from jsonb_array_elements(coalesce(p -> 'review_items', '[]'))
    loop
      -- No duplicar avisos que ya existen de una importación anterior
      continue when exists (
        select 1 from public.review_items ri
         where ri.kind = coalesce(private.txt(r, 'kind'), 'importacion')
           and ri.title = coalesce(private.txt(r, 'title'), 'Dato pendiente de revisar')
      );
      insert into public.review_items (kind, entity_type, title, details, payload, import_batch_id)
      values (coalesce(private.txt(r, 'kind'), 'importacion'), private.txt(r, 'entity_type'),
              coalesce(private.txt(r, 'title'), 'Dato pendiente de revisar'), private.txt(r, 'details'), r -> 'payload', v_batch);
      v_counts := jsonb_set(v_counts, '{review_items_created}', to_jsonb((v_counts ->> 'review_items_created')::int + 1));
    end loop;

    -- Resultado: stock por producto e integridad
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'name', pr.name,
             'stock', coalesce((select sum(l.quantity_available) from public.inventory_lots l
                                  join public.product_variants v on v.id = l.variant_id
                                 where v.product_id = k.product_id), 0),
             'stock_value', coalesce((select round(sum(l.quantity_available * l.unit_cost), 2) from public.inventory_lots l
                                  join public.product_variants v on v.id = l.variant_id
                                 where v.product_id = k.product_id), 0),
             'created', k.created)), '{}'::jsonb)
      into v_stock
      from _imp_products k
      join public.products pr on pr.id = k.product_id;

    select coalesce(jsonb_agg(jsonb_build_object('check', c.check_name, 'ok', c.ok, 'problems', c.problems, 'detail', c.detail)), '[]'::jsonb)
      into v_integrity
      from public.check_integrity() c;

    v_summary := jsonb_build_object(
      'batch_id', v_batch,
      'dry_run', p_dry_run,
      'counts', v_counts,
      'errors', v_errors,
      'stock_by_product', v_stock,
      'integrity', v_integrity,
      'lot_costs', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'source_ref', i.source_ref, 'order_number', po.order_number,
                 'unit_cost_real', round(l.unit_cost, 6))), '[]'::jsonb)
          from public.inventory_lots l
          join public.purchase_order_items i on i.id = l.purchase_order_item_id
          join public.purchase_orders po on po.id = l.purchase_order_id
         where po.import_batch_id = v_batch
      ),
      'totals', jsonb_build_object(
        'sales_amount', (select coalesce(sum(round(si.quantity * si.unit_price, 2)), 0) from public.sale_items si
                          join public.sales s on s.id = si.sale_id where s.import_batch_id = v_batch),
        'sales_units', (select coalesce(sum(si.quantity), 0) from public.sale_items si
                          join public.sales s on s.id = si.sale_id where s.import_batch_id = v_batch),
        'purchase_amount', (select coalesce(round(sum(l.quantity_initial * l.unit_cost), 2), 0) from public.inventory_lots l
                          join public.purchase_orders po on po.id = l.purchase_order_id where po.import_batch_id = v_batch),
        'purchase_units', (select coalesce(sum(l.quantity_initial), 0) from public.inventory_lots l
                          join public.purchase_orders po on po.id = l.purchase_order_id where po.import_batch_id = v_batch),
        'stock_units', (select coalesce(sum(quantity_available), 0) from public.inventory_lots),
        'stock_value', (select coalesce(sum(round(x.v, 2)), 0) from (select sum(quantity_available * unit_cost) as v
                                                                         from public.inventory_lots group by variant_id) x),
        'exit_units', (select coalesce(sum(quantity), 0) from public.stock_exits where import_batch_id = v_batch)
      )
    );

    if p_dry_run then
      raise exception using errcode = 'MI001', message = 'simulacion';
    end if;

    -- Las secuencias no se deshacen con la transacción: solo se ajustan en la importación real
    perform private.counter_at_least(public.current_org_id(), 'pedido', (select max(order_number) from public.purchase_orders));
    if v_next_sale > 1 then
      perform private.counter_at_least(public.current_org_id(), 'venta', v_next_sale - 1);
    end if;

    update public.import_batches set summary = v_summary where id = v_batch;
    perform set_config('maurinventario.skip_row_audit', 'off', true);
    perform public.log_action('importacion', 'import_batches', v_batch::text,
      'Importación de ' || coalesce(private.txt(p, 'file_name'), 'Excel') || ': ' ||
      (v_counts ->> 'products_created') || ' productos, ' ||
      (v_counts ->> 'purchase_orders_created') || ' pedidos, ' ||
      (v_counts ->> 'sales_created') || ' ventas, ' ||
      (v_counts ->> 'stock_exits_created') || ' salidas sin venta', v_counts);
  exception
    when sqlstate 'MI001' then
      -- Simulación: todo lo anterior se ha deshecho, pero conservamos el resultado
      null;
  end;

  return v_summary;
end;
$$;

-- ---------------------------------------------------------------------
-- 13. Las funciones de negocio dejan de saltarse la seguridad
-- ---------------------------------------------------------------------
do $$
declare
  r record;
  trusted text[] := array[
    'current_org_id', 'current_org_role', 'current_app_role', 'is_admin', 'is_warehouse', 'is_active_user',
    'current_responsible_id', 'org_has_access', 'require_active_user', 'require_admin', 'is_platform_admin',
    'handle_new_user', 'audit_actor_email', 'audit_row_change', 'log_action', 'log_user_event', 'my_activity',
    'ai_usage_take', 'ai_usage_refund', 'email_actor', 'can_access_sale_label', 'can_access_product_photo',
    'next_org_number', 'counter_value', 'counter_at_least', 'assign_sale_number', 'assign_order_number', 'email_sync_try_lock', 'email_sync_unlock', 'email_cron_tick'];
begin
  for r in
    select p.oid::regprocedure as fn, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
  loop
    if not (r.proname = any (trusted)) then
      execute format('alter function %s owner to mi_definer', r.fn);
    end if;
  end loop;
end $$;

-- =====================================================================
-- 14. Organizaciones: crear, cambiar, invitar, miembros y baja.
--     Funciones de confianza: cada una comprueba quién llama y sobre qué
--     organización actúa. Nunca aceptan la organización del navegador
--     salvo para cambiar a otra de la que el usuario YA es miembro.
-- =====================================================================
create or replace function public.create_organization(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_person text;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and active) then
    raise exception 'Tienes que iniciar sesión.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'Confirma tu correo electrónico antes de crear tu espacio.';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then
    raise exception 'El nombre del negocio debe tener entre 2 y 80 caracteres.';
  end if;
  if (select count(*) from public.organizations where created_by = v_uid) >= 3 then
    raise exception 'Has alcanzado el máximo de 3 espacios creados.';
  end if;

  insert into public.organizations (name, created_by) values (v_name, v_uid) returning id into v_org;
  insert into public.memberships (organization_id, user_id, role) values (v_org, v_uid, 'admin');
  insert into public.subscriptions (organization_id, status, trial_ends_at) values (v_org, 'trialing', now() + interval '7 days');
  -- Listas iniciales (cada organización tiene las suyas)
  insert into public.platforms (organization_id, name, requires_shipping, sort_order)
  values (v_org, 'Vinted', true, 10), (v_org, 'Wallapop', true, 20), (v_org, 'En persona', false, 30);
  insert into public.carriers (organization_id, name)
  values (v_org, 'InPost'), (v_org, 'Seur'), (v_org, 'Correos'), (v_org, 'DHL'), (v_org, 'Vinted Go');
  insert into public.email_integration (organization_id) values (v_org);
  select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_person from public.profiles where id = v_uid;
  insert into public.responsibles (organization_id, name, profile_id, is_partner) values (v_org, v_person, v_uid, true);
  update public.profiles set active_org_id = v_org where id = v_uid;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (v_org, v_uid, public.audit_actor_email(), 'crear_organizacion', 'organizations', v_org::text, 'Espacio creado: ' || v_name);
  return v_org;
end;
$$;

create or replace function public.set_active_org(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.memberships where user_id = auth.uid() and organization_id = p_org) then
    raise exception 'No perteneces a ese espacio.' using errcode = '42501';
  end if;
  update public.profiles set active_org_id = p_org where id = auth.uid();
end;
$$;

create or replace function public.my_organizations()
returns table (id uuid, name text, role text, status text, subscription_status text, trial_ends_at timestamptz, has_access boolean, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, m.role, o.status, s.status, s.trial_ends_at, public.org_has_access(o.id), o.id = public.current_org_id()
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    left join public.subscriptions s on s.organization_id = o.id
   where m.user_id = auth.uid()
   order by o.name
$$;

-- Estado de la organización activa (para avisos de prueba / pago)
create or replace function public.current_org_info()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'status', o.status, 'role', public.current_org_role(),
    'deletion_requested_at', o.deletion_requested_at,
    'subscription', jsonb_build_object(
      'status', s.status, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
      'cancel_at_period_end', s.cancel_at_period_end, 'comped', s.comped,
      'has_customer', s.stripe_customer_id is not null),
    'has_access', public.org_has_access(o.id))
    from public.organizations o left join public.subscriptions s on s.organization_id = o.id
   where o.id = public.current_org_id()
$$;

create or replace function private.token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;

-- Invitar: devuelve el enlace secreto (solo se guarda su huella)
create or replace function public.invite_member(p_email text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  perform public.require_admin();
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Escribe un correo electrónico válido.';
  end if;
  if p_role not in ('admin', 'vendedor', 'almacen') then
    raise exception 'Rol no válido.';
  end if;
  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id where m.organization_id = v_org and p.email = v_email) then
    raise exception 'Esa persona ya es miembro.';
  end if;
  if (select count(*) from public.invitations where organization_id = v_org and accepted_at is null and revoked_at is null and expires_at > now()) >= 50 then
    raise exception 'Hay demasiadas invitaciones pendientes. Revoca alguna antes de invitar más.';
  end if;
  update public.invitations set revoked_at = now()
   where organization_id = v_org and email = v_email and accepted_at is null and revoked_at is null;
  insert into public.invitations (organization_id, email, role, token_hash, invited_by)
  values (v_org, v_email, p_role, private.token_hash(v_token), auth.uid());
  perform public.log_action('invitar_miembro', 'invitations', v_email, 'Invitación enviada a ' || v_email || ' (' || p_role || ')');
  return v_token;
end;
$$;

-- Lo que puede ver quien tiene el enlace (aunque aún no haya entrado)
create or replace function public.invitation_info(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'organization', o.name, 'email', i.email, 'role', i.role,
    'state', case when i.revoked_at is not null then 'revocada' when i.accepted_at is not null then 'aceptada'
                  when i.expires_at < now() then 'caducada' else 'valida' end)
    from public.invitations i join public.organizations o on o.id = i.organization_id
   where i.token_hash = private.token_hash(p_token)
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  i public.invitations%rowtype;
  v_person text;
begin
  if v_uid is null then
    raise exception 'Inicia sesión para aceptar la invitación.' using errcode = '42501';
  end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Confirma tu correo electrónico antes de aceptar la invitación.';
  end if;
  select * into i from public.invitations where token_hash = private.token_hash(p_token) for update;
  if not found or i.revoked_at is not null or i.accepted_at is not null or i.expires_at < now() then
    raise exception 'La invitación no es válida o ha caducado. Pide una nueva.';
  end if;
  if i.email <> v_email then
    raise exception 'Esta invitación es para %. Entra con ese correo para aceptarla.', i.email;
  end if;
  insert into public.memberships (organization_id, user_id, role) values (i.organization_id, v_uid, i.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  if i.role = 'vendedor' and not exists (select 1 from public.responsibles where organization_id = i.organization_id and profile_id = v_uid) then
    select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_person from public.profiles where id = v_uid;
    -- Si ya hay un responsable con ese nombre, se le añade el correo para distinguirlo
    if exists (select 1 from public.responsibles where organization_id = i.organization_id and lower(trim(name)) = lower(trim(v_person)) and deleted_at is null) then
      v_person := v_person || ' (' || v_email || ')';
    end if;
    insert into public.responsibles (organization_id, name, profile_id) values (i.organization_id, v_person, v_uid);
  end if;
  update public.invitations set accepted_at = now(), accepted_by = v_uid where id = i.id;
  update public.profiles set active_org_id = i.organization_id where id = v_uid;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (i.organization_id, v_uid, v_email, 'aceptar_invitacion', 'memberships', v_uid::text, v_email || ' se ha unido como ' || i.role);
  return i.organization_id;
end;
$$;

create or replace function public.revoke_invitation(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  update public.invitations set revoked_at = now()
   where id = p_id and organization_id = public.current_org_id() and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'La invitación no existe o ya no está pendiente.';
  end if;
end;
$$;

create or replace function public.org_members()
returns table (user_id uuid, email text, full_name text, role text, joined_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.email, p.full_name, m.role, m.created_at, m.user_id = auth.uid()
    from public.memberships m join public.profiles p on p.id = m.user_id
   where m.organization_id = public.current_org_id() and public.is_admin()
   order by m.created_at
$$;

create or replace function public.org_invitations()
returns table (id uuid, email text, role text, created_at timestamptz, expires_at timestamptz, state text)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.email, i.role, i.created_at, i.expires_at,
         case when i.revoked_at is not null then 'revocada' when i.accepted_at is not null then 'aceptada'
              when i.expires_at < now() then 'caducada' else 'pendiente' end
    from public.invitations i
   where i.organization_id = public.current_org_id() and public.is_admin()
   order by i.created_at desc
   limit 100
$$;

create or replace function public.update_member_role(p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_old text;
  v_person text;
begin
  perform public.require_admin();
  if p_role not in ('admin', 'vendedor', 'almacen') then
    raise exception 'Rol no válido.';
  end if;
  select role into v_old from public.memberships where organization_id = v_org and user_id = p_user for update;
  if v_old is null then
    raise exception 'Esa persona no es miembro de este espacio.';
  end if;
  if v_old = 'admin' and p_role <> 'admin'
     and not exists (select 1 from public.memberships where organization_id = v_org and role = 'admin' and user_id <> p_user) then
    raise exception 'Debe quedar al menos un administrador.';
  end if;
  update public.memberships set role = p_role where organization_id = v_org and user_id = p_user;
  if p_role = 'vendedor' and not exists (select 1 from public.responsibles where organization_id = v_org and profile_id = p_user) then
    select coalesce(nullif(full_name, ''), split_part(email, '@', 1)) into v_person from public.profiles where id = p_user;
    if exists (select 1 from public.responsibles where organization_id = v_org and lower(trim(name)) = lower(trim(v_person)) and deleted_at is null) then
      v_person := v_person || ' (' || (select email from public.profiles where id = p_user) || ')';
    end if;
    insert into public.responsibles (organization_id, name, profile_id) values (v_org, v_person, p_user);
  end if;
  perform public.log_action('cambiar_rol', 'memberships', p_user::text, 'Rol cambiado a ' || p_role);
end;
$$;

-- Quitar a alguien (o salir uno mismo). Sus ventas se conservan.
create or replace function public.remove_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_role text;
begin
  if v_org is null then
    raise exception 'No tienes un espacio activo.' using errcode = '42501';
  end if;
  if p_user <> auth.uid() then
    perform public.require_admin();
  end if;
  select role into v_role from public.memberships where organization_id = v_org and user_id = p_user for update;
  if v_role is null then
    raise exception 'Esa persona no es miembro de este espacio.';
  end if;
  if v_role = 'admin' and not exists (select 1 from public.memberships where organization_id = v_org and role = 'admin' and user_id <> p_user) then
    raise exception 'Debe quedar al menos un administrador.';
  end if;
  delete from public.memberships where organization_id = v_org and user_id = p_user;
  update public.responsibles set active = false where organization_id = v_org and profile_id = p_user;
  update public.profiles set active_org_id = null where id = p_user and active_org_id = v_org;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (v_org, auth.uid(), public.audit_actor_email(), 'quitar_miembro', 'memberships', p_user::text, 'Miembro quitado del espacio');
end;
$$;

-- Solicitud de eliminación del espacio y de sus datos (la ejecuta la
-- plataforma pasado el plazo; mientras, se puede anular y exportar).
create or replace function public.request_org_deletion(p_confirm_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede solicitar la eliminación.' using errcode = '42501';
  end if;
  select name into v_name from public.organizations where id = v_org;
  if trim(coalesce(p_confirm_name, '')) <> v_name then
    raise exception 'Escribe exactamente el nombre del espacio para confirmar.';
  end if;
  update public.organizations set status = 'eliminacion_solicitada', deletion_requested_at = now(), deletion_requested_by = auth.uid()
   where id = v_org;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (v_org, auth.uid(), public.audit_actor_email(), 'solicitar_eliminacion', 'organizations', v_org::text, 'Eliminación del espacio solicitada');
end;
$$;

create or replace function public.cancel_org_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if not public.is_admin() then
    raise exception 'Solo un administrador puede anular la eliminación.' using errcode = '42501';
  end if;
  update public.organizations set status = 'activa', deletion_requested_at = null, deletion_requested_by = null
   where id = v_org and status = 'eliminacion_solicitada';
  if not found then
    raise exception 'No hay ninguna eliminación pendiente.';
  end if;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (v_org, auth.uid(), public.audit_actor_email(), 'anular_eliminacion', 'organizations', v_org::text, 'Eliminación del espacio anulada');
end;
$$;

-- =====================================================================
-- 15. Suscripciones (solo el servidor, con la clave secreta)
-- =====================================================================
-- Registra un evento de pago; devuelve false si ya se había procesado
create or replace function public.billing_record_event(p_id text, p_type text, p_org uuid, p_created timestamptz)
returns boolean
language sql
security definer
set search_path = public
as $$
  insert into public.billing_events (id, type, organization_id, event_created_at)
  values (p_id, p_type, p_org, p_created)
  on conflict (id) do nothing
  returning true
$$;

-- Aplica el estado de la suscripción. Ignora datos más antiguos que los
-- ya guardados (eventos que llegan fuera de orden).
create or replace function public.billing_apply(
  p_org uuid, p_status text, p_trial_end timestamptz, p_period_end timestamptz, p_cancel_at_end boolean,
  p_customer text, p_subscription text, p_event_created timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused') then
    raise exception 'Estado de suscripción desconocido: %', p_status;
  end if;
  update public.subscriptions
     set status = p_status, trial_ends_at = coalesce(p_trial_end, trial_ends_at), current_period_end = p_period_end,
         cancel_at_period_end = coalesce(p_cancel_at_end, false),
         stripe_customer_id = coalesce(p_customer, stripe_customer_id),
         stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id),
         last_event_at = p_event_created, updated_at = now()
   where organization_id = p_org and (last_event_at is null or p_event_created >= last_event_at);
  return found;
end;
$$;

create or replace function public.billing_set_customer(p_org uuid, p_customer text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscriptions set stripe_customer_id = p_customer, updated_at = now() where organization_id = p_org and stripe_customer_id is null
$$;

revoke execute on function public.billing_record_event(text, text, uuid, timestamptz),
  public.billing_apply(uuid, text, timestamptz, timestamptz, boolean, text, text, timestamptz),
  public.billing_set_customer(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_record_event(text, text, uuid, timestamptz),
  public.billing_apply(uuid, text, timestamptz, timestamptz, boolean, text, text, timestamptz),
  public.billing_set_customer(uuid, text) to service_role;

-- =====================================================================
-- 16. Panel de la plataforma (dueño del servicio): SOLO cifras y estados.
--     No da acceso a inventario, ventas, compras ni archivos de nadie.
-- =====================================================================
create or replace function public.platform_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'organizations', (select count(*) from public.organizations),
    'users', (select count(distinct user_id) from public.memberships),
    'trials_active', (select count(*) from public.subscriptions where status = 'trialing' and trial_ends_at > now() and not comped),
    'trials_expired', (select count(*) from public.subscriptions where status = 'trialing' and trial_ends_at <= now() and not comped),
    'active', (select count(*) from public.subscriptions where status = 'active' and not comped),
    'past_due', (select count(*) from public.subscriptions where status in ('past_due', 'unpaid', 'incomplete')),
    'canceled', (select count(*) from public.subscriptions where status in ('canceled', 'incomplete_expired')),
    'cancel_scheduled', (select count(*) from public.subscriptions where cancel_at_period_end and status = 'active'),
    'comped', (select count(*) from public.subscriptions where comped),
    'suspended', (select count(*) from public.organizations where status = 'suspendida'),
    'deletion_requested', (select count(*) from public.organizations where status = 'eliminacion_solicitada'),
    'new_last_30d', (select count(*) from public.organizations where created_at > now() - interval '30 days'));
end;
$$;

create or replace function public.platform_organizations()
returns table (id uuid, name text, created_at timestamptz, status text, owner_email text, members bigint,
               subscription_status text, trial_ends_at timestamptz, current_period_end timestamptz,
               cancel_at_period_end boolean, comped boolean, deletion_requested_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  return query
  select o.id, o.name, o.created_at, o.status,
         (select p.email from public.profiles p where p.id = o.created_by),
         (select count(*) from public.memberships m where m.organization_id = o.id),
         s.status, s.trial_ends_at, s.current_period_end, s.cancel_at_period_end, s.comped, o.deletion_requested_at
    from public.organizations o left join public.subscriptions s on s.organization_id = o.id
   order by o.created_at desc;
end;
$$;

create or replace function public.platform_set_org_status(p_org uuid, p_status text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if p_status not in ('activa', 'suspendida') then
    raise exception 'Estado no válido.';
  end if;
  update public.organizations set status = p_status where id = p_org and status <> 'eliminacion_solicitada';
  if not found then
    raise exception 'No se puede cambiar el estado de ese espacio.';
  end if;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (p_org, auth.uid(), public.audit_actor_email(), 'plataforma_estado', 'organizations', p_org::text,
          'La plataforma ha marcado el espacio como ' || p_status || coalesce(': ' || nullif(trim(p_reason), ''), ''));
end;
$$;

create or replace function public.platform_set_comped(p_org uuid, p_comped boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  update public.subscriptions set comped = coalesce(p_comped, false), updated_at = now() where organization_id = p_org;
  insert into public.audit_log (organization_id, user_id, user_email, action, entity, entity_id, summary)
  values (p_org, auth.uid(), public.audit_actor_email(), 'plataforma_acceso', 'subscriptions', p_org::text,
          case when p_comped then 'Acceso gratuito concedido por la plataforma' else 'Acceso gratuito retirado' end);
end;
$$;

-- Borrado definitivo de un espacio cuya eliminación se solicitó hace al
-- menos 30 días. Solo con la clave del servidor (lo lanza el panel de la
-- plataforma tras borrar los archivos). Los datos desaparecen de la base;
-- las copias automáticas de Supabase caducan según su propio plazo.
create or replace function public.platform_purge_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.organizations where id = p_org and status = 'eliminacion_solicitada'
                  and deletion_requested_at < now() - interval '30 days') then
    raise exception 'Solo se pueden borrar espacios con la eliminación solicitada hace más de 30 días.';
  end if;
  perform set_config('maurinventario.skip_row_audit', 'on', true);
  alter table public.inventory_movements disable trigger user;
  delete from public.organizations where id = p_org;
  alter table public.inventory_movements enable trigger user;
end;
$$;

revoke execute on function public.platform_stats(), public.platform_organizations(), public.platform_set_org_status(uuid, text, text),
  public.platform_set_comped(uuid, boolean) from public, anon;
grant execute on function public.platform_stats(), public.platform_organizations(), public.platform_set_org_status(uuid, text, text),
  public.platform_set_comped(uuid, boolean) to authenticated;
revoke execute on function public.platform_purge_organization(uuid) from public, anon, authenticated;
grant execute on function public.platform_purge_organization(uuid) to service_role;

revoke execute on function public.create_organization(text), public.set_active_org(uuid), public.my_organizations(), public.current_org_info(),
  public.invite_member(text, text), public.accept_invitation(text), public.revoke_invitation(uuid), public.org_members(),
  public.org_invitations(), public.update_member_role(uuid, text), public.remove_member(uuid), public.request_org_deletion(text),
  public.cancel_org_deletion(), public.is_warehouse(), public.current_org_role(), public.org_has_access(uuid), public.is_platform_admin()
  from public, anon;
grant execute on function public.create_organization(text), public.set_active_org(uuid), public.my_organizations(), public.current_org_info(),
  public.invite_member(text, text), public.accept_invitation(text), public.revoke_invitation(uuid), public.org_members(),
  public.org_invitations(), public.update_member_role(uuid, text), public.remove_member(uuid), public.request_org_deletion(text),
  public.cancel_org_deletion(), public.is_warehouse(), public.current_org_role(), public.org_has_access(uuid), public.is_platform_admin()
  to authenticated;
revoke execute on function public.invitation_info(text) from public;
grant execute on function public.invitation_info(text) to anon, authenticated;
grant execute on function public.current_org_id() to authenticated, mi_definer;

-- Las funciones de negocio pueden llamar a las demás (incluidas las creadas arriba)
grant execute on all functions in schema public, private to mi_definer;
grant execute on function public.current_responsible_id(), public.current_org_info(), public.is_platform_admin() to authenticated;

-- Comprobación final: las funciones de negocio pueden leer quién es el
-- usuario y los archivos. Si no, se cancela TODA la migración.
do $$ begin
  if not has_schema_privilege('mi_definer', 'auth', 'usage') or not has_function_privilege('mi_definer', 'auth.uid()', 'execute')
     or not has_schema_privilege('mi_definer', 'storage', 'usage') then
    raise exception 'El rol mi_definer no tiene acceso a auth/storage. No se ha aplicado nada. Avisa al desarrollador.';
  end if;
end $$;
