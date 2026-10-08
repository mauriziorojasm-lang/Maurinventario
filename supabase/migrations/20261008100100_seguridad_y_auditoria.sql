-- =====================================================================
-- MaurInventario · Migración 2 · Permisos (RLS) y auditoría
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funciones de permisos
-- ---------------------------------------------------------------------
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_app_role() is not null
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
   where r.profile_id = auth.uid() and r.deleted_at is null and r.active
   limit 1
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
end;
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
end;
$$;

-- ---------------------------------------------------------------------
-- Perfil automático al crear un usuario en Supabase Auth.
-- El rol se toma de app_metadata.role (solo lo puede fijar el servidor).
-- El primer usuario que se crea en un proyecto vacío es administrador.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_meta_role text := new.raw_app_meta_data ->> 'role';
  v_active boolean;
begin
  if v_meta_role in ('admin', 'vendedor') then
    -- Creado por el administrador desde la aplicación (rol fijado por el servidor)
    v_role := v_meta_role::public.app_role;
    v_active := true;
  elsif not exists (select 1 from public.profiles) then
    -- Primer usuario del proyecto: administrador
    v_role := 'admin';
    v_active := true;
  else
    -- Cualquier otro alta (p. ej. desde el panel de Supabase o un registro público
    -- activado por error) entra DESACTIVADA hasta que un admin la active.
    v_role := 'vendedor';
    v_active := false;
  end if;

  insert into public.profiles (id, email, full_name, role, active)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    v_role,
    v_active
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nunca puede quedarse la aplicación sin ningún administrador activo
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from public.profiles p
       where p.id <> old.id and p.role = 'admin' and p.active
    ) then
      raise exception 'Debe existir al menos un administrador activo.';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_last_admin before update on public.profiles
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.responsibles enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.platforms enable row level security;
alter table public.carriers enable row level security;
alter table public.mobile_devices enable row level security;
alter table public.mobile_device_accounts enable row level security;
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_costs enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_exits enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.partner_transfers enable row level security;
alter table public.import_batches enable row level security;
alter table public.review_items enable row level security;
alter table public.audit_log enable row level security;

-- Perfiles: cada uno ve el suyo; el admin ve y edita todos
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Responsables: el admin todo; el vendedor solo su propia ficha
create policy responsibles_select on public.responsibles for select to authenticated
  using (public.is_admin() or (profile_id = auth.uid() and public.is_active_user()));
create policy responsibles_insert_admin on public.responsibles for insert to authenticated
  with check (public.is_admin());
create policy responsibles_update_admin on public.responsibles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Catálogo y listas: lectura para usuarios activos, escritura solo admin
do $$
declare
  t text;
begin
  foreach t in array array['brands', 'categories', 'products', 'product_variants', 'platforms', 'carriers', 'mobile_devices']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_active_user())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert_admin', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update_admin', t);
  end loop;
end;
$$;

-- Datos privados de los móviles: solo admin
create policy mobile_device_accounts_admin on public.mobile_device_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Proveedores: solo admin
create policy suppliers_select_admin on public.suppliers for select to authenticated using (public.is_admin());
create policy suppliers_insert_admin on public.suppliers for insert to authenticated with check (public.is_admin());
create policy suppliers_update_admin on public.suppliers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Compras, lotes, movimientos, salidas, ajustes, devoluciones:
-- lectura solo admin. La escritura se hace EXCLUSIVAMENTE con las
-- funciones de negocio (no hay políticas de escritura).
create policy purchase_orders_select_admin on public.purchase_orders for select to authenticated using (public.is_admin());
create policy purchase_order_costs_select_admin on public.purchase_order_costs for select to authenticated using (public.is_admin());
create policy purchase_order_items_select_admin on public.purchase_order_items for select to authenticated using (public.is_admin());
create policy inventory_lots_select_admin on public.inventory_lots for select to authenticated using (public.is_admin());
create policy inventory_movements_select_admin on public.inventory_movements for select to authenticated using (public.is_admin());
create policy stock_exits_select_admin on public.stock_exits for select to authenticated using (public.is_admin());
create policy stock_adjustments_select_admin on public.stock_adjustments for select to authenticated using (public.is_admin());
create policy returns_select_admin on public.returns for select to authenticated using (public.is_admin());
create policy return_items_select_admin on public.return_items for select to authenticated using (public.is_admin());

-- Ventas: el admin ve todas; el vendedor solo las suyas
create policy sales_select on public.sales for select to authenticated
  using (
    public.is_admin()
    or (public.is_active_user() and responsible_id = public.current_responsible_id())
  );
create policy sale_items_select on public.sale_items for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.sales s
       where s.id = sale_items.sale_id
         and public.is_active_user()
         and s.responsible_id = public.current_responsible_id()
    )
  );

-- Reparto entre socios: solo admin
create policy partner_transfers_admin on public.partner_transfers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Importaciones, revisión y auditoría: solo admin
create policy import_batches_select_admin on public.import_batches for select to authenticated using (public.is_admin());
create policy review_items_select_admin on public.review_items for select to authenticated using (public.is_admin());
create policy review_items_update_admin on public.review_items for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy audit_log_select_admin on public.audit_log for select to authenticated using (public.is_admin());

-- El rol anónimo (sin sesión) no puede leer ni escribir nada
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create or replace function public.audit_actor_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.email from public.profiles p where p.id = auth.uid()
$$;

-- Registro de una acción de negocio (p. ej. "Recepción del pedido #7")
create or replace function public.log_action(
  p_action text,
  p_entity text,
  p_entity_id text,
  p_summary text,
  p_data jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (user_id, user_email, action, entity, entity_id, summary, new_data)
  values (auth.uid(), public.audit_actor_email(), p_action, p_entity, p_entity_id, p_summary, p_data);
end;
$$;

-- Registro automático de cada alta, cambio o borrado de fila
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

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;

  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'mobile_device_id', v_old ->> 'mobile_device_id');

  insert into public.audit_log (user_id, user_email, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(),
    public.audit_actor_email(),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
    tg_table_name,
    v_id,
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'responsibles', 'brands', 'categories', 'products', 'product_variants',
    'platforms', 'carriers', 'mobile_devices', 'mobile_device_accounts', 'suppliers',
    'purchase_orders', 'purchase_order_costs', 'purchase_order_items',
    'sales', 'sale_items', 'stock_exits', 'stock_adjustments', 'returns', 'return_items',
    'partner_transfers', 'review_items'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t || '_audit', t
    );
  end loop;
end;
$$;
