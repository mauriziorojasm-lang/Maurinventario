-- =====================================================================
-- MaurInventario · Migración 19 · Permisos por miembro del equipo
-- El administrador elige, persona por persona, qué ve y qué puede hacer
-- cada miembro. Lo aplica la base de datos (reglas de acceso y funciones),
-- no solo la pantalla. Si a alguien no se le cambia nada, tiene los
-- permisos de su rol (vendedor o almacén), igual que hasta ahora.
-- El administrador lo puede todo. Equipo, suscripción, historial de
-- cambios, copias y eliminación del espacio siguen siendo solo suyos.
-- No cambia ni borra datos.
-- =====================================================================

alter table public.memberships add column if not exists permissions text[];

-- Lista cerrada de permisos
create or replace function private.all_permissions()
returns text[]
language sql
immutable
as $$
  select array['ventas_crear', 'ventas_todas', 'envios', 'ventas_editar', 'costes', 'catalogo', 'compras',
               'stock', 'anuncios', 'correo', 'generador', 'importar', 'configuracion']
$$;

-- Lo que tiene cada rol si no se le cambia nada (lo mismo que antes)
create or replace function private.role_default_permissions(p_role text)
returns text[]
language sql
immutable
as $$
  select case p_role
    when 'vendedor' then array['ventas_crear', 'envios', 'generador']
    when 'almacen' then array['ventas_todas', 'envios']
    else array[]::text[] end
$$;

-- Permisos efectivos del usuario en el espacio activo
create or replace function public.my_permissions()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case when m.role = 'admin' then private.all_permissions()
              else coalesce(m.permissions, private.role_default_permissions(m.role)) end
    from public.memberships m
    join public.profiles p on p.id = m.user_id and p.active
   where m.user_id = auth.uid() and m.organization_id = public.current_org_id()
$$;

create or replace function public.has_perm(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_key = any (public.my_permissions()), false)
$$;

create or replace function public.require_perm(p_key text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_active_user();
  if not public.has_perm(p_key) then
    raise exception 'No tienes permisos para hacer esto. Pídeselos al administrador de tu espacio.' using errcode = '42501';
  end if;
end;
$$;

-- El administrador cambia los permisos de un miembro (null = los de su rol)
create or replace function public.set_member_permissions(p_user uuid, p_permissions text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := public.current_org_id();
  v_role text;
  v_clean text[];
begin
  perform public.require_admin();
  select role into v_role from public.memberships where organization_id = v_org and user_id = p_user for update;
  if v_role is null then
    raise exception 'Esa persona no es miembro de este espacio.';
  end if;
  if v_role = 'admin' then
    raise exception 'Un administrador ya lo puede todo. Cambia antes su rol si quieres limitarlo.';
  end if;
  if p_permissions is not null then
    if exists (select 1 from unnest(p_permissions) k where not (k = any (private.all_permissions()))) then
      raise exception 'Permiso no válido.';
    end if;
    select coalesce(array_agg(distinct k order by k), array[]::text[]) into v_clean from unnest(p_permissions) k;
  end if;
  update public.memberships set permissions = v_clean where organization_id = v_org and user_id = p_user;
  perform public.log_action('cambiar_permisos', 'memberships', p_user::text,
    case when v_clean is null then 'Permisos: los de su rol' else 'Permisos: ' || array_to_string(v_clean, ', ') end);
end;
$$;

revoke execute on function public.my_permissions(), public.has_perm(text), public.require_perm(text),
  public.set_member_permissions(uuid, text[]) from public, anon;
grant execute on function public.my_permissions(), public.has_perm(text), public.require_perm(text),
  public.set_member_permissions(uuid, text[]) to authenticated, mi_definer;
grant execute on function private.all_permissions(), private.role_default_permissions(text) to authenticated, mi_definer;

-- Lista de miembros con sus permisos (para la pantalla Equipo)
drop function if exists public.org_members();
create or replace function public.org_members()
returns table (user_id uuid, email text, full_name text, role text, joined_at timestamptz, is_me boolean,
               permissions text[], custom boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.email, p.full_name, m.role, m.created_at, m.user_id = auth.uid(),
         case when m.role = 'admin' then private.all_permissions()
              else coalesce(m.permissions, private.role_default_permissions(m.role)) end,
         m.permissions is not null
    from public.memberships m join public.profiles p on p.id = m.user_id
   where m.organization_id = public.current_org_id() and public.is_admin()
   order by m.created_at
$$;
revoke execute on function public.org_members() from public, anon;
grant execute on function public.org_members() to authenticated;

-- ---------------------------------------------------------------------
-- Reglas de acceso de las tablas: «solo administrador» pasa a «quien
-- tenga el permiso de esa área» (el administrador los tiene todos)
-- ---------------------------------------------------------------------
do $$
declare
  p record;
  v_expr text;
  v_using text;
  v_check text;
  rx constant text := '\m(is_admin|is_warehouse)\(\)';
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual ~ rx or with_check ~ rx)
       and tablename not in ('audit_log', 'invitations', 'memberships', 'profiles')
  loop
    v_expr := case
      when p.tablename in ('brands', 'categories') then '(has_perm(''catalogo'') OR has_perm(''configuracion''))'
      when p.tablename in ('products', 'product_variants', 'product_photos', 'photo_uses') then 'has_perm(''catalogo'')'
      when p.tablename in ('product_aliases', 'email_accounts', 'email_messages') then 'has_perm(''correo'')'
      when p.tablename in ('carriers', 'platforms', 'mobile_devices', 'mobile_device_accounts') then 'has_perm(''configuracion'')'
      when p.tablename = 'responsibles' and p.cmd = 'SELECT' then '(has_perm(''ventas_todas'') OR has_perm(''configuracion''))'
      when p.tablename = 'responsibles' then 'has_perm(''configuracion'')'
      when p.tablename in ('import_batches', 'review_items') then 'has_perm(''importar'')'
      when p.tablename in ('inventory_lots', 'inventory_movements', 'partner_transfers') then 'has_perm(''costes'')'
      when p.tablename = 'listings' then 'has_perm(''anuncios'')'
      when p.tablename in ('purchase_orders', 'purchase_order_items', 'purchase_order_costs', 'suppliers') then 'has_perm(''compras'')'
      when p.tablename in ('returns', 'return_items') then 'has_perm(''ventas_editar'')'
      when p.tablename in ('stock_adjustments', 'stock_exits') then 'has_perm(''stock'')'
      when p.tablename in ('sales', 'sale_items') then 'has_perm(''ventas_todas'')'
      else null end;
    if v_expr is null then
      raise exception 'Regla sin permiso asignado: %.%', p.tablename, p.policyname;
    end if;
    v_using := case when p.qual is null then null else regexp_replace(p.qual, rx, v_expr, 'g') end;
    v_check := case when p.with_check is null then null else regexp_replace(p.with_check, rx, v_expr, 'g') end;
    execute format('alter policy %I on public.%I', p.policyname, p.tablename)
      || coalesce(' using (' || v_using || ')', '')
      || coalesce(' with check (' || v_check || ')', '');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Funciones: cada área exige su permiso
-- ---------------------------------------------------------------------
create or replace function private.swap_in_function(p_fn regprocedure, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := pg_get_functiondef(p_fn);
begin
  if position(p_from in v_def) = 0 then
    raise exception 'No se encuentra «%» en %', p_from, p_fn;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn, m.perm
      from pg_proc p
      join (values
        ('business_dashboard', 'costes'), ('dashboard_stats', 'costes'), ('dashboard_widgets', 'costes'),
        ('report_inventory', 'costes'), ('report_partner_settlement', 'costes'), ('report_purchase_lines', 'costes'),
        ('report_sale_lines', 'costes'),
        ('cancel_purchase_order', 'compras'), ('receive_purchase_order', 'compras'), ('save_purchase_order', 'compras'),
        ('set_purchase_costs', 'compras'),
        ('create_product', 'catalogo'), ('update_product', 'catalogo'), ('delete_product', 'catalogo'),
        ('delete_variant', 'catalogo'), ('save_variant', 'catalogo'), ('reorder_product_photos', 'catalogo'),
        ('create_return', 'ventas_editar'), ('void_sale', 'ventas_editar'), ('update_sale_item', 'ventas_editar'),
        ('create_stock_adjustment', 'stock'), ('create_stock_exit', 'stock'), ('update_stock_exit', 'stock'),
        ('void_stock_exit', 'stock'),
        ('email_actor', 'correo'), ('email_disconnect', 'correo'), ('email_integration_status', 'correo'),
        ('email_mark_duplicate', 'correo'), ('email_set_default_responsible', 'correo'), ('email_set_status', 'correo'),
        ('import_data', 'importar'), ('resolve_review_item', 'importar'),
        ('listings_overview', 'anuncios')
      ) as m(name, perm) on m.name = p.proname
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
  loop
    perform private.swap_in_function(r.fn, 'public.require_admin()', format('public.require_perm(%L)', r.perm));
  end loop;
end $$;

-- Vender: hace falta el permiso (el administrador sigue pudiendo elegir el responsable)
select private.swap_in_function('public.create_sale(jsonb)'::regprocedure,
  'perform public.require_active_user();',
  'perform public.require_perm(''ventas_crear'');');

-- Modificar ventas: «editar ventas» = todo; si no, lo propio y, con «envíos», los datos del envío
select private.swap_in_function('public.update_sale(jsonb)'::regprocedure,
  'v_admin boolean := public.is_admin();',
  'v_admin boolean := public.has_perm(''ventas_editar'');');
select private.swap_in_function('public.update_sale(jsonb)'::regprocedure,
  $old$    if public.is_warehouse() then
      v_seller_keys := array['id', 'shipping_status', 'carrier_id', 'shipping_label_path'];
    elsif v_sale.responsible_id is distinct from public.current_responsible_id() then
      raise exception 'Solo puedes modificar tus propias ventas.' using errcode = '42501';
    end if;$old$,
  $new$    if v_sale.responsible_id is distinct from public.current_responsible_id() then
      -- Venta de otra persona: solo con «ver todas las ventas», y solo el envío
      if not public.has_perm('ventas_todas') then
        raise exception 'Solo puedes modificar tus propias ventas.' using errcode = '42501';
      end if;
      v_seller_keys := array['id'];
    else
      v_seller_keys := array['id', 'external_reference', 'notes'];
    end if;
    if public.has_perm('envios') then
      v_seller_keys := v_seller_keys || array['shipping_status', 'carrier_id', 'shipping_label_path'];
    end if;$new$);

-- Lotes disponibles: el coste solo con «costes»
select private.swap_in_function('public.get_available_lots(uuid)'::regprocedure,
  'v_admin boolean := public.is_admin();',
  'v_admin boolean := public.has_perm(''costes'');');

-- Historial de precios: ventas de todos con «ver todas», coste medio con «costes»
select private.swap_in_function('public.product_price_history(uuid)'::regprocedure,
  'public.is_admin() or s.responsible_id', 'public.has_perm(''ventas_todas'') or s.responsible_id');
select private.swap_in_function('public.product_price_history(uuid)'::regprocedure,
  '''avg_cost'', case when public.is_admin()', '''avg_cost'', case when public.has_perm(''costes'')');

select private.swap_in_function('public.low_stock_count(integer)'::regprocedure,
  'case when public.is_admin()', 'case when public.has_perm(''catalogo'')');

-- Archivos: fotos con «catálogo»; etiquetas de envío de todas las ventas con «ver todas»
select private.swap_in_function('public.can_access_product_photo(text, boolean)'::regprocedure,
  'not p_write or public.is_admin()', 'not p_write or public.has_perm(''catalogo'')');
select private.swap_in_function('public.can_access_sale_label(text)'::regprocedure,
  'public.is_admin() or public.is_warehouse()', 'public.has_perm(''ventas_todas'')');

-- Al cambiar de rol, vuelve a los permisos del nuevo rol
select private.swap_in_function('public.update_member_role(uuid, text)'::regprocedure,
  'update public.memberships set role = p_role where',
  'update public.memberships set role = p_role, permissions = null where');

-- Contadores del menú según los permisos
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
begin
  if not public.is_active_user() or v_perms is null then
    return jsonb_build_object('reviews', 0, 'shipments', 0, 'emails', 0, 'detected', 0, 'listings', 0);
  end if;
  return jsonb_build_object(
    'reviews', case when 'importar' = any (v_perms) then (select count(*) from public.review_items where status = 'pendiente') else 0 end,
    'shipments', case
      when 'ventas_todas' = any (v_perms) then (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente')
      when v_resp is not null then (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente' and responsible_id = v_resp)
      else 0 end,
    'emails', case when 'correo' = any (v_perms) then (select count(*) from public.email_messages where status = 'revision') else 0 end,
    'detected', case when 'correo' = any (v_perms) then (select count(*) from public.email_messages where status = 'detectada') else 0 end,
    'listings', case when 'anuncios' = any (v_perms) then (select count(*) from public.v_listings_to_remove) else 0 end);
end;
$$;

-- La sesión incluye los permisos efectivos
create or replace function public.session_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name, 'active', p.active)
                  from public.profiles p where p.id = auth.uid()),
    'org', public.current_org_info(),
    'responsible', (select jsonb_build_object('id', r.id, 'name', r.name)
                      from public.responsibles r where r.id = public.current_responsible_id()),
    'platform_admin', public.is_platform_admin(),
    'permissions', coalesce(to_jsonb(public.my_permissions()), '[]'::jsonb),
    'orgs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name)), '[]'::jsonb) from public.my_organizations() o))
  where auth.uid() is not null
$$;

drop function private.swap_in_function(regprocedure, text, text);
notify pgrst, 'reload schema';
