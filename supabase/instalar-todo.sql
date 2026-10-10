-- =====================================================================
-- MaurInventario · INSTALACIÓN COMPLETA DE LA BASE DE DATOS
-- Pégalo ENTERO en Supabase → SQL Editor → New query → Run.
-- Solo una vez por proyecto, en un proyecto NUEVO y vacío.
-- Contiene, en orden, las 18 migraciones de supabase/migrations/ (este
-- archivo se genera a partir de ellas con «npm run db:instalador»).
-- Si algo falla, no se guarda nada: todo va en una sola transacción.
-- =====================================================================

begin;

-- >>> 20261008100000_esquema_base.sql
-- =====================================================================
-- MaurInventario · Migración 1 · Esquema base
-- Tablas, relaciones, restricciones e índices.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role as enum ('admin', 'vendedor');
create type public.po_status as enum ('pendiente', 'recibido', 'cancelado');
create type public.po_item_status as enum ('pendiente', 'recibido', 'cancelado');
create type public.po_cost_type as enum ('transporte', 'aduanas', 'aranceles', 'comisiones', 'gestion', 'otros');
create type public.lot_origin as enum ('compra', 'ajuste');
create type public.movement_type as enum (
  'entrada_compra',     -- recepción de un pedido de compra (+)
  'venta',              -- venta (-)
  'anulacion_venta',    -- anulación de una venta (+)
  'devolucion',         -- el cliente devuelve el producto (+)
  'salida_sin_venta',   -- regalo, pérdida… (-)
  'anulacion_salida',   -- anulación de una salida sin venta (+)
  'ajuste_entrada',     -- ajuste manual autorizado (+)
  'ajuste_salida'       -- ajuste manual autorizado (-)
);
create type public.shipping_status as enum ('pendiente', 'enviado');
create type public.record_status as enum ('activa', 'anulada');
create type public.return_type as enum (
  'devolucion_producto',     -- caso 1: el cliente devuelve el producto y se le reembolsa
  'reembolso_sin_producto'   -- caso 2: la plataforma reembolsa y el cliente se queda el producto
);
create type public.exit_reason as enum ('regalo', 'perdida', 'otro', 'pendiente');
create type public.adjustment_direction as enum ('entrada', 'salida');
create type public.review_status as enum ('pendiente', 'resuelto', 'descartado');

-- ---------------------------------------------------------------------
-- Utilidad: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Usuarios (perfil de cada usuario de Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.app_role not null default 'vendedor',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Responsables / vendedores
create table public.responsibles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  profile_id uuid unique references public.profiles (id) on delete set null,
  email text,
  active boolean not null default true,
  is_partner boolean not null default false, -- participa en el reparto 50/50
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  import_batch_id uuid
);
create unique index responsibles_name_uq on public.responsibles (lower(trim(name))) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index brands_name_uq on public.brands (lower(trim(name))) where deleted_at is null;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index categories_name_uq on public.categories (lower(trim(name))) where deleted_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  brand_id uuid references public.brands (id),
  category_id uuid references public.categories (id),
  sku text check (sku is null or length(trim(sku)) > 0),
  description text,
  photo_path text,
  normal_sale_price numeric(12,2) check (normal_sale_price is null or normal_sale_price >= 0),
  legacy_code text,          -- ID que tenía en el Excel (solo referencia)
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  import_batch_id uuid,
  source_ref text
);
create unique index products_name_uq on public.products (lower(trim(name))) where deleted_at is null;
create unique index products_sku_uq on public.products (lower(trim(sku))) where sku is not null and deleted_at is null;
create index products_name_trgm on public.products using gin (name extensions.gin_trgm_ops);
create index products_category_idx on public.products (category_id);
create index products_brand_idx on public.products (brand_id);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id),
  name text not null check (length(trim(name)) > 0),
  sku text check (sku is null or length(trim(sku)) > 0),
  normal_sale_price numeric(12,2) check (normal_sale_price is null or normal_sale_price >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index product_variants_name_uq on public.product_variants (product_id, lower(trim(name))) where deleted_at is null;
create unique index product_variants_sku_uq on public.product_variants (lower(trim(sku))) where sku is not null and deleted_at is null;
create index product_variants_product_idx on public.product_variants (product_id);

-- Un SKU no puede repetirse ni entre productos ni entre variantes
create or replace function public.check_sku_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sku text := lower(trim(new.sku));
begin
  if new.sku is null or new.deleted_at is not null then
    return new;
  end if;
  if tg_table_name = 'products' then
    if exists (
      select 1 from public.product_variants v
      where v.deleted_at is null and lower(trim(v.sku)) = v_sku and v.product_id <> new.id
    ) then
      raise exception 'El SKU % ya está en uso por otra variante.', new.sku using errcode = '23505';
    end if;
  else
    if exists (
      select 1 from public.products p
      where p.deleted_at is null and lower(trim(p.sku)) = v_sku and p.id <> new.product_id
    ) then
      raise exception 'El SKU % ya está en uso por otro producto.', new.sku using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

create trigger products_sku_check before insert or update of sku, deleted_at on public.products
  for each row execute function public.check_sku_unique();
create trigger product_variants_sku_check before insert or update of sku, deleted_at on public.product_variants
  for each row execute function public.check_sku_unique();

-- ---------------------------------------------------------------------
-- Ventas: plataformas, transportistas, móviles
-- ---------------------------------------------------------------------
create table public.platforms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  requires_shipping boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);
create unique index platforms_name_uq on public.platforms (lower(trim(name)));

create table public.carriers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index carriers_name_uq on public.carriers (lower(trim(name)));

create table public.mobile_devices (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number > 0),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Datos de la cuenta de cada móvil (solo administradores)
create table public.mobile_device_accounts (
  mobile_device_id uuid primary key references public.mobile_devices (id) on delete cascade,
  email text,
  phone text,
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Compras
-- ---------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  contact_name text,
  email text,
  phone text,
  notes text,
  is_placeholder boolean not null default false, -- "Proveedor pendiente de identificar"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index suppliers_name_uq on public.suppliers (lower(trim(name))) where deleted_at is null;

create sequence public.purchase_order_number_seq start 1;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  order_number integer not null unique default nextval('public.purchase_order_number_seq') check (order_number > 0),
  supplier_id uuid not null references public.suppliers (id),
  order_date date not null,
  status public.po_status not null default 'pendiente',
  received_at date,
  notes text,
  cancel_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch_id uuid,
  source_ref text,
  check (status <> 'recibido' or received_at is not null)
);
alter sequence public.purchase_order_number_seq owned by public.purchase_orders.order_number;
create index purchase_orders_supplier_idx on public.purchase_orders (supplier_id);
create index purchase_orders_date_idx on public.purchase_orders (order_date);

create table public.purchase_order_costs (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  cost_type public.po_cost_type not null,
  amount numeric(12,2) not null check (amount >= 0),
  description text,
  created_at timestamptz not null default now()
);
create index purchase_order_costs_po_idx on public.purchase_order_costs (purchase_order_id);

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id) on delete cascade,
  line_number integer not null,
  variant_id uuid not null references public.product_variants (id),
  quantity_ordered integer not null check (quantity_ordered > 0),
  unit_cost numeric(14,6) not null check (unit_cost >= 0),   -- coste de mercancía por unidad
  quantity_received integer check (quantity_received is null or quantity_received >= 0),
  status public.po_item_status not null default 'pendiente',
  substitutes_item_id uuid references public.purchase_order_items (id), -- línea sustituida
  notes text,
  created_at timestamptz not null default now(),
  source_ref text,
  unique (purchase_order_id, line_number)
);
create index purchase_order_items_po_idx on public.purchase_order_items (purchase_order_id);
create index purchase_order_items_variant_idx on public.purchase_order_items (variant_id);

-- ---------------------------------------------------------------------
-- Inventario: lotes y movimientos
-- ---------------------------------------------------------------------
create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  origin public.lot_origin not null,
  purchase_order_id uuid references public.purchase_orders (id),
  purchase_order_item_id uuid unique references public.purchase_order_items (id),
  variant_id uuid not null references public.product_variants (id),
  received_at date not null,
  quantity_initial integer not null check (quantity_initial > 0),
  quantity_available integer not null default 0,
  unit_cost numeric(14,6) not null check (unit_cost >= 0),  -- coste real unitario del lote
  notes text,
  created_at timestamptz not null default now(),
  constraint inventory_lots_stock_no_negativo check (quantity_available >= 0),
  constraint inventory_lots_stock_max check (quantity_available <= quantity_initial),
  check (origin <> 'compra' or (purchase_order_id is not null and purchase_order_item_id is not null))
);
create index inventory_lots_variant_idx on public.inventory_lots (variant_id);
create index inventory_lots_po_idx on public.inventory_lots (purchase_order_id);
create index inventory_lots_available_idx on public.inventory_lots (variant_id) where quantity_available > 0;

-- Ventas
create sequence public.sale_number_seq start 1;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  sale_number text not null unique default ('V-' || lpad(nextval('public.sale_number_seq')::text, 6, '0')),
  sale_date date not null,
  responsible_id uuid not null references public.responsibles (id),
  platform_id uuid not null references public.platforms (id),
  carrier_id uuid references public.carriers (id),
  mobile_device_id uuid references public.mobile_devices (id),
  shipping_status public.shipping_status,
  shipping_label_path text,
  external_reference text,
  notes text,
  status public.record_status not null default 'activa',
  voided_at timestamptz,
  voided_by uuid references public.profiles (id) on delete set null,
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_batch_id uuid,
  source_ref text,
  import_fingerprint text unique
);
alter sequence public.sale_number_seq owned by public.sales.sale_number;
create index sales_date_idx on public.sales (sale_date);
create index sales_responsible_idx on public.sales (responsible_id);
create index sales_platform_idx on public.sales (platform_id);
create index sales_status_idx on public.sales (status);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id),
  line_number integer not null,
  variant_id uuid not null references public.product_variants (id),
  lot_id uuid not null references public.inventory_lots (id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,4) not null check (unit_price >= 0),
  notes text,
  created_at timestamptz not null default now(),
  source_ref text,
  unique (sale_id, line_number)
);
create index sale_items_sale_idx on public.sale_items (sale_id);
create index sale_items_variant_idx on public.sale_items (variant_id);
create index sale_items_lot_idx on public.sale_items (lot_id);

-- Salidas sin venta (regalos, pérdidas…)
create table public.stock_exits (
  id uuid primary key default gen_random_uuid(),
  exit_date date not null,
  variant_id uuid not null references public.product_variants (id),
  lot_id uuid not null references public.inventory_lots (id),
  quantity integer not null check (quantity > 0),
  reason public.exit_reason not null,
  responsible_id uuid references public.responsibles (id),
  notes text,
  status public.record_status not null default 'activa',
  voided_at timestamptz,
  void_reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  import_batch_id uuid,
  source_ref text,
  import_fingerprint text unique
);
create index stock_exits_date_idx on public.stock_exits (exit_date);
create index stock_exits_variant_idx on public.stock_exits (variant_id);

-- Ajustes manuales autorizados
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  adjustment_date date not null,
  direction public.adjustment_direction not null,
  variant_id uuid not null references public.product_variants (id),
  lot_id uuid not null references public.inventory_lots (id),
  quantity integer not null check (quantity > 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Devoluciones
create table public.returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id),
  return_date date not null,
  return_type public.return_type not null,
  reason text,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index returns_sale_idx on public.returns (sale_id);
create index returns_date_idx on public.returns (return_date);

create table public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns (id),
  sale_item_id uuid not null references public.sale_items (id),
  quantity integer not null check (quantity > 0),
  refund_amount numeric(12,2) not null check (refund_amount >= 0),
  restocked boolean not null,
  created_at timestamptz not null default now()
);
create index return_items_return_idx on public.return_items (return_id);
create index return_items_sale_item_idx on public.return_items (sale_item_id);

-- Movimientos de stock (historial inmutable)
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  movement_type public.movement_type not null,
  variant_id uuid not null references public.product_variants (id),
  lot_id uuid not null references public.inventory_lots (id),
  quantity integer not null check (quantity <> 0),
  occurred_at date not null,
  purchase_order_id uuid references public.purchase_orders (id),
  sale_item_id uuid references public.sale_items (id),
  return_item_id uuid references public.return_items (id),
  stock_exit_id uuid references public.stock_exits (id),
  adjustment_id uuid references public.stock_adjustments (id),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (movement_type in ('entrada_compra', 'devolucion', 'anulacion_venta', 'anulacion_salida', 'ajuste_entrada') and quantity > 0)
    or (movement_type in ('venta', 'salida_sin_venta', 'ajuste_salida') and quantity < 0)
  )
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, occurred_at);
create index inventory_movements_lot_idx on public.inventory_movements (lot_id);
create index inventory_movements_sale_item_idx on public.inventory_movements (sale_item_id);

-- El stock de cada lote SOLO cambia a través de movimientos
create or replace function public.apply_inventory_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.inventory_lots%rowtype;
begin
  select * into v_lot from public.inventory_lots where id = new.lot_id for update;
  if v_lot.variant_id <> new.variant_id then
    raise exception 'El lote no corresponde a ese producto/variante.';
  end if;
  if v_lot.quantity_available + new.quantity < 0 then
    raise exception 'No hay stock suficiente.' using errcode = 'P0001';
  end if;
  update public.inventory_lots
     set quantity_available = quantity_available + new.quantity
   where id = new.lot_id;
  return new;
end;
$$;

create trigger inventory_movements_apply after insert on public.inventory_movements
  for each row execute function public.apply_inventory_movement();

create or replace function public.prevent_movement_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Los movimientos de stock no se pueden modificar ni borrar. Registra un movimiento nuevo.';
end;
$$;

create trigger inventory_movements_immutable before update or delete on public.inventory_movements
  for each row execute function public.prevent_movement_changes();

-- ---------------------------------------------------------------------
-- Reparto entre socios: pagos entre responsables
-- ---------------------------------------------------------------------
create table public.partner_transfers (
  id uuid primary key default gen_random_uuid(),
  transfer_date date not null,
  from_responsible_id uuid not null references public.responsibles (id),
  to_responsible_id uuid not null references public.responsibles (id),
  amount numeric(12,2) not null check (amount > 0),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (from_responsible_id <> to_responsible_id)
);

-- ---------------------------------------------------------------------
-- Importación y datos pendientes de revisar
-- ---------------------------------------------------------------------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb
);

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  entity_type text,
  entity_id uuid,
  title text not null,
  details text,
  payload jsonb,
  status public.review_status not null default 'pendiente',
  import_batch_id uuid references public.import_batches (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text
);
create index review_items_status_idx on public.review_items (status, created_at desc);
create index review_items_entity_idx on public.review_items (entity_type, entity_id);

-- ---------------------------------------------------------------------
-- Auditoría
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  action text not null,
  entity text not null,
  entity_id text,
  summary text,
  old_data jsonb,
  new_data jsonb
);
create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_user_idx on public.audit_log (user_id);

-- ---------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger responsibles_updated_at before update on public.responsibles for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger purchase_orders_updated_at before update on public.purchase_orders for each row execute function public.set_updated_at();
create trigger sales_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger mobile_device_accounts_updated_at before update on public.mobile_device_accounts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Datos de referencia (no son datos de demostración: son las opciones
-- reales que aparecen en el Excel y en los requisitos)
-- ---------------------------------------------------------------------
insert into public.platforms (name, requires_shipping, sort_order) values
  ('Vinted', true, 10),
  ('Wallapop', true, 20),
  ('En persona', false, 30);

insert into public.carriers (name) values
  ('InPost'), ('Seur'), ('Correos'), ('DHL'), ('Vinted Go');

insert into public.mobile_devices (number, name)
select n, 'Móvil ' || n from generate_series(1, 6) as n;

-- >>> 20261008100100_seguridad_y_auditoria.sql
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

-- >>> 20261008100200_logica_de_negocio.sql
-- =====================================================================
-- MaurInventario · Migración 3 · Lógica de negocio
-- Todas las operaciones que tocan stock, lotes o costes se hacen con
-- estas funciones. Cada llamada es una transacción: o se guarda todo,
-- o no se guarda nada.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------
-- Utilidades internas (no accesibles desde la API)
-- ---------------------------------------------------------------------
create or replace function private.txt(p jsonb, k text)
returns text
language sql
immutable
as $$
  select nullif(trim(p ->> k), '')
$$;

create or replace function private.uuid_or_null(p jsonb, k text)
returns uuid
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(p ->> k), '');
begin
  if v is null then
    return null;
  end if;
  return v::uuid;
exception when invalid_text_representation then
  raise exception 'Identificador no válido en el campo %.', k;
end;
$$;

create or replace function private.int_or_null(p jsonb, k text, p_label text)
returns integer
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(p ->> k), '');
begin
  if v is null then
    return null;
  end if;
  if v !~ '^-?\d+$' then
    raise exception '% debe ser un número entero.', p_label;
  end if;
  return v::integer;
end;
$$;

create or replace function private.num_or_null(p jsonb, k text, p_label text)
returns numeric
language plpgsql
immutable
as $$
declare
  v text := replace(nullif(trim(p ->> k), ''), ',', '.');
begin
  if v is null then
    return null;
  end if;
  if v !~ '^-?\d+(\.\d+)?$' then
    raise exception '% debe ser un número.', p_label;
  end if;
  return v::numeric;
end;
$$;

create or replace function private.date_or_null(p jsonb, k text, p_label text)
returns date
language plpgsql
immutable
as $$
declare
  v text := nullif(trim(p ->> k), '');
begin
  if v is null then
    return null;
  end if;
  return v::date;
exception when others then
  raise exception '% no es una fecha válida.', p_label;
end;
$$;

-- Nombre legible de un lote: "Pedido #7" o "Ajuste 08/10/2026"
create or replace function private.lot_label(p_lot_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when l.origin = 'compra' then 'Pedido #' || po.order_number
           else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY')
         end
    from public.inventory_lots l
    left join public.purchase_orders po on po.id = l.purchase_order_id
   where l.id = p_lot_id
$$;

create or replace function private.variant_stock(p_variant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(quantity_available), 0)::integer
    from public.inventory_lots
   where variant_id = p_variant_id
$$;

create or replace function private.variant_label(p_variant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.name || case when v.is_default and v.name in ('Única', 'Sin especificar') then '' else ' · ' || v.name end
    from public.product_variants v
    join public.products p on p.id = v.product_id
   where v.id = p_variant_id
$$;

create or replace function private.resolve_brand(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'brand_id');
  v_name text := private.txt(p, 'brand_name');
begin
  if v_id is not null then
    if not exists (select 1 from public.brands where id = v_id and deleted_at is null) then
      raise exception 'La marca seleccionada no existe.';
    end if;
    return v_id;
  end if;
  if v_name is null then
    return null;
  end if;
  select id into v_id from public.brands where lower(trim(name)) = lower(v_name) and deleted_at is null;
  if v_id is null then
    insert into public.brands (name) values (v_name) returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function private.resolve_category(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'category_id');
  v_name text := private.txt(p, 'category_name');
begin
  if v_id is not null then
    if not exists (select 1 from public.categories where id = v_id and deleted_at is null) then
      raise exception 'La categoría seleccionada no existe.';
    end if;
    return v_id;
  end if;
  if v_name is null then
    return null;
  end if;
  select id into v_id from public.categories where lower(trim(name)) = lower(v_name) and deleted_at is null;
  if v_id is null then
    insert into public.categories (name) values (v_name) returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Comprueba (y bloquea) los lotes de una lista de líneas antes de sacar stock.
-- p_lines: [{variant_id, lot_id, quantity}]
create or replace function private.check_lot_availability(p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_lot public.inventory_lots%rowtype;
begin
  for r in
    select (l ->> 'lot_id')::uuid as lot_id,
           (l ->> 'variant_id')::uuid as variant_id,
           sum((l ->> 'quantity')::integer) as qty
      from jsonb_array_elements(p_lines) l
     group by 1, 2
  loop
    select * into v_lot from public.inventory_lots where id = r.lot_id for update;
    if not found then
      raise exception 'El pedido/lote seleccionado no existe.';
    end if;
    if v_lot.variant_id <> r.variant_id then
      raise exception 'El lote % no corresponde a %.', private.lot_label(r.lot_id), private.variant_label(r.variant_id);
    end if;
    if v_lot.quantity_available < r.qty then
      raise exception 'No hay stock suficiente. % de % solo tiene % unidad(es) disponible(s) y se piden %.',
        private.lot_label(r.lot_id), private.variant_label(r.variant_id), v_lot.quantity_available, r.qty
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

-- Valida una línea de salida de stock (venta, salida sin venta, ajuste)
create or replace function private.validate_stock_line(p jsonb, p_require_price boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_variant uuid := private.uuid_or_null(p, 'variant_id');
  v_lot uuid := private.uuid_or_null(p, 'lot_id');
  v_qty integer := private.int_or_null(p, 'quantity', 'Las unidades');
  v_price numeric;
begin
  if v_variant is null then
    raise exception 'Selecciona el producto.';
  end if;
  if not exists (
    select 1 from public.product_variants v join public.products pr on pr.id = v.product_id
     where v.id = v_variant and v.deleted_at is null and pr.deleted_at is null
  ) then
    raise exception 'El producto seleccionado no existe o está eliminado.';
  end if;
  if v_lot is null then
    raise exception 'Selecciona el pedido/lote de procedencia de %.', private.variant_label(v_variant);
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'Las unidades deben ser un número entero mayor que 0.';
  end if;
  if p_require_price then
    v_price := private.num_or_null(p, 'unit_price', 'El precio');
    if v_price is null then
      raise exception 'Indica el precio de venta de %.', private.variant_label(v_variant);
    end if;
    if v_price < 0 then
      raise exception 'El precio no puede ser negativo.';
    end if;
    if v_price = 0 then
      raise exception 'Una venta a 0 € no es una venta: regístrala como salida sin venta (regalo o pérdida).';
    end if;
  end if;
end;
$$;

-- Reparte los costes adicionales del pedido entre las líneas recibidas,
-- en proporción al valor de la mercancía, y actualiza el coste real de
-- cada lote. Si toda la mercancía tiene coste 0, se reparte por unidades.
create or replace function private.apply_po_costs(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_extras numeric;
  v_value numeric;
  v_units numeric;
begin
  select coalesce(sum(amount), 0) into v_extras
    from public.purchase_order_costs where purchase_order_id = p_po_id;

  select coalesce(sum(quantity_received * unit_cost), 0), coalesce(sum(quantity_received), 0)
    into v_value, v_units
    from public.purchase_order_items
   where purchase_order_id = p_po_id and status = 'recibido' and quantity_received > 0;

  if v_units = 0 then
    return;
  end if;

  if v_value > 0 then
    update public.inventory_lots l
       set unit_cost = i.unit_cost * (1 + v_extras / v_value)
      from public.purchase_order_items i
     where l.purchase_order_item_id = i.id and i.purchase_order_id = p_po_id;
  else
    update public.inventory_lots l
       set unit_cost = i.unit_cost + v_extras / v_units
      from public.purchase_order_items i
     where l.purchase_order_item_id = i.id and i.purchase_order_id = p_po_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- PRODUCTOS
-- ---------------------------------------------------------------------
create or replace function public.create_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text := private.txt(p, 'name');
  v jsonb;
  v_count integer := 0;
  v_price numeric := private.num_or_null(p, 'normal_sale_price', 'El precio normal de venta');
begin
  perform public.require_admin();
  if v_name is null then
    raise exception 'El nombre del producto es obligatorio.';
  end if;
  if exists (select 1 from public.products where lower(trim(name)) = lower(v_name) and deleted_at is null) then
    raise exception 'Ya existe un producto llamado "%".', v_name;
  end if;
  if v_price is not null and v_price < 0 then
    raise exception 'El precio normal de venta no puede ser negativo.';
  end if;

  insert into public.products (name, brand_id, category_id, sku, description, photo_path, normal_sale_price, notes, created_by)
  values (
    v_name,
    private.resolve_brand(p),
    private.resolve_category(p),
    private.txt(p, 'sku'),
    private.txt(p, 'description'),
    private.txt(p, 'photo_path'),
    v_price,
    private.txt(p, 'notes'),
    auth.uid()
  )
  returning id into v_id;

  for v in select * from jsonb_array_elements(coalesce(p -> 'variants', '[]'::jsonb))
  loop
    if private.txt(v, 'name') is null then
      raise exception 'Todas las variantes necesitan un nombre.';
    end if;
    insert into public.product_variants (product_id, name, sku, normal_sale_price, is_default)
    values (v_id, private.txt(v, 'name'), private.txt(v, 'sku'),
            private.num_or_null(v, 'normal_sale_price', 'El precio de la variante'), v_count = 0);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    insert into public.product_variants (product_id, name, is_default) values (v_id, 'Única', true);
  end if;

  perform public.log_action('crear_producto', 'products', v_id::text, 'Producto creado: ' || v_name);
  return v_id;
end;
$$;

create or replace function public.update_product(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'id');
  v_name text := private.txt(p, 'name');
  v_price numeric := private.num_or_null(p, 'normal_sale_price', 'El precio normal de venta');
begin
  perform public.require_admin();
  if not exists (select 1 from public.products where id = v_id and deleted_at is null) then
    raise exception 'El producto no existe.';
  end if;
  if p ? 'name' then
    if v_name is null then
      raise exception 'El nombre del producto es obligatorio.';
    end if;
    if exists (select 1 from public.products where lower(trim(name)) = lower(v_name) and deleted_at is null and id <> v_id) then
      raise exception 'Ya existe otro producto llamado "%".', v_name;
    end if;
  end if;
  if v_price is not null and v_price < 0 then
    raise exception 'El precio normal de venta no puede ser negativo.';
  end if;

  update public.products set
    name = case when p ? 'name' then v_name else name end,
    brand_id = case when p ? 'brand_id' or p ? 'brand_name' then private.resolve_brand(p) else brand_id end,
    category_id = case when p ? 'category_id' or p ? 'category_name' then private.resolve_category(p) else category_id end,
    sku = case when p ? 'sku' then private.txt(p, 'sku') else sku end,
    description = case when p ? 'description' then private.txt(p, 'description') else description end,
    photo_path = case when p ? 'photo_path' then private.txt(p, 'photo_path') else photo_path end,
    normal_sale_price = case when p ? 'normal_sale_price' then v_price else normal_sale_price end,
    notes = case when p ? 'notes' then private.txt(p, 'notes') else notes end
  where id = v_id;
end;
$$;

create or replace function public.save_variant(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'id');
  v_product uuid := private.uuid_or_null(p, 'product_id');
  v_name text := private.txt(p, 'name');
  v_price numeric := private.num_or_null(p, 'normal_sale_price', 'El precio de la variante');
begin
  perform public.require_admin();
  if v_name is null then
    raise exception 'La variante necesita un nombre.';
  end if;
  if v_price is not null and v_price < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;
  if v_id is null then
    if not exists (select 1 from public.products where id = v_product and deleted_at is null) then
      raise exception 'El producto no existe.';
    end if;
    insert into public.product_variants (product_id, name, sku, normal_sale_price, is_default)
    values (v_product, v_name, private.txt(p, 'sku'), v_price,
            not exists (select 1 from public.product_variants where product_id = v_product and deleted_at is null))
    returning id into v_id;
  else
    update public.product_variants
       set name = v_name, sku = private.txt(p, 'sku'), normal_sale_price = v_price
     where id = v_id and deleted_at is null;
    if not found then
      raise exception 'La variante no existe.';
    end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_variant(p_variant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product uuid;
begin
  perform public.require_admin();
  select product_id into v_product from public.product_variants where id = p_variant_id and deleted_at is null;
  if v_product is null then
    raise exception 'La variante no existe.';
  end if;
  if private.variant_stock(p_variant_id) > 0 then
    raise exception 'No se puede eliminar una variante con stock. Primero ajusta o vende su stock.';
  end if;
  if (select count(*) from public.product_variants where product_id = v_product and deleted_at is null) <= 1 then
    raise exception 'Un producto debe tener al menos una variante.';
  end if;
  update public.product_variants set deleted_at = now(), is_default = false where id = p_variant_id;
  update public.product_variants set is_default = true
   where id = (select id from public.product_variants where product_id = v_product and deleted_at is null order by created_at limit 1)
     and not exists (select 1 from public.product_variants where product_id = v_product and deleted_at is null and is_default);
end;
$$;

create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.products where id = p_product_id and deleted_at is null) then
    raise exception 'El producto no existe.';
  end if;
  if exists (
    select 1 from public.inventory_lots l join public.product_variants v on v.id = l.variant_id
     where v.product_id = p_product_id and l.quantity_available > 0
  ) then
    raise exception 'No se puede eliminar un producto con stock. Primero ajusta o vende su stock.';
  end if;
  update public.product_variants set deleted_at = now() where product_id = p_product_id and deleted_at is null;
  update public.products set deleted_at = now() where id = p_product_id;
  perform public.log_action('eliminar_producto', 'products', p_product_id::text, 'Producto eliminado (borrado lógico)');
end;
$$;

-- ---------------------------------------------------------------------
-- VENTAS
-- ---------------------------------------------------------------------
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
begin
  perform public.require_active_user();

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
                            shipping_status, shipping_label_path, external_reference, notes, created_by)
  values (v_date, v_resp, v_platform.id, v_carrier, v_mobile, v_ship, v_label,
          private.txt(p, 'external_reference'), private.txt(p, 'notes'), auth.uid())
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
    if v_sale.responsible_id is distinct from public.current_responsible_id() then
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

-- Cambiar precio o notas de una línea (no afecta al stock)
create or replace function public.update_sale_item(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := private.uuid_or_null(p, 'id');
  v_price numeric := private.num_or_null(p, 'unit_price', 'El precio');
begin
  perform public.require_admin();
  if not exists (
    select 1 from public.sale_items si join public.sales s on s.id = si.sale_id
     where si.id = v_id and s.status = 'activa'
  ) then
    raise exception 'La línea de venta no existe o la venta está anulada.';
  end if;
  if p ? 'unit_price' and (v_price is null or v_price <= 0) then
    raise exception 'El precio debe ser mayor que 0.';
  end if;
  update public.sale_items set
    unit_price = case when p ? 'unit_price' then v_price else unit_price end,
    notes = case when p ? 'notes' then private.txt(p, 'notes') else notes end
  where id = v_id;
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  r record;
begin
  perform public.require_admin();
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indica el motivo de la anulación.';
  end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if v_sale.status <> 'activa' then
    raise exception 'La venta ya está anulada.';
  end if;
  if exists (select 1 from public.returns where sale_id = p_sale_id) then
    raise exception 'La venta tiene devoluciones registradas y no se puede anular.';
  end if;

  for r in select * from public.sale_items where sale_id = p_sale_id
  loop
    insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, sale_item_id, notes, created_by)
    values ('anulacion_venta', r.variant_id, r.lot_id, r.quantity, current_date, r.id, trim(p_reason), auth.uid());
  end loop;

  update public.sales
     set status = 'anulada', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
   where id = p_sale_id;

  perform public.log_action('anular_venta', 'sales', p_sale_id::text,
    'Venta ' || v_sale.sale_number || ' anulada: ' || trim(p_reason));
end;
$$;

-- Búsqueda de productos para vender (sin costes para vendedores)
create or replace function public.search_sellable_variants(
  p_query text default null,
  p_only_in_stock boolean default false,
  p_limit integer default 20,
  p_product_id uuid default null
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  variant_count integer,
  sku text,
  brand_name text,
  category_name text,
  stock integer,
  normal_sale_price numeric,
  photo_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(p_query), '');
begin
  perform public.require_active_user();
  return query
  select v.id,
         pr.id,
         pr.name,
         v.name,
         (select count(*)::integer from public.product_variants v2 where v2.product_id = pr.id and v2.deleted_at is null),
         coalesce(v.sku, pr.sku),
         b.name,
         c.name,
         coalesce((select sum(l.quantity_available) from public.inventory_lots l where l.variant_id = v.id), 0)::integer,
         coalesce(v.normal_sale_price, pr.normal_sale_price),
         pr.photo_path
    from public.product_variants v
    join public.products pr on pr.id = v.product_id
    left join public.brands b on b.id = pr.brand_id
    left join public.categories c on c.id = pr.category_id
   where v.deleted_at is null and pr.deleted_at is null
     and (p_product_id is null or pr.id = p_product_id)
     and (
       v_q is null
       or pr.name ilike '%' || v_q || '%'
       or v.name ilike '%' || v_q || '%'
       or coalesce(v.sku, '') ilike '%' || v_q || '%'
       or coalesce(pr.sku, '') ilike '%' || v_q || '%'
       or coalesce(b.name, '') ilike '%' || v_q || '%'
     )
     and (
       not p_only_in_stock
       or exists (select 1 from public.inventory_lots l where l.variant_id = v.id and l.quantity_available > 0)
     )
   order by (exists (select 1 from public.inventory_lots l where l.variant_id = v.id and l.quantity_available > 0)) desc,
            pr.name, v.name
   limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;

-- Lotes con stock de una variante (el coste solo se devuelve al admin)
create or replace function public.get_available_lots(p_variant_id uuid)
returns table (
  lot_id uuid,
  label text,
  purchase_order_number integer,
  received_at date,
  quantity_available integer,
  unit_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin boolean := public.is_admin();
begin
  perform public.require_active_user();
  return query
  select l.id,
         private.lot_label(l.id),
         po.order_number,
         l.received_at,
         l.quantity_available,
         case when v_admin then round(l.unit_cost, 4) else null end
    from public.inventory_lots l
    left join public.purchase_orders po on po.id = l.purchase_order_id
   where l.variant_id = p_variant_id and l.quantity_available > 0
   order by l.received_at, po.order_number nulls last, l.created_at;
end;
$$;

-- ---------------------------------------------------------------------
-- COMPRAS
-- ---------------------------------------------------------------------
create or replace function private.insert_po_lines(p_po_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_line integer := 0;
  v_variant uuid;
  v_qty integer;
  v_cost numeric;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe tener al menos una línea.';
  end if;
  for v in select * from jsonb_array_elements(p_items)
  loop
    v_line := v_line + 1;
    v_variant := private.uuid_or_null(v, 'variant_id');
    v_qty := private.int_or_null(v, 'quantity', 'Las unidades');
    v_cost := private.num_or_null(v, 'unit_cost', 'El coste unitario');
    if v_variant is null or not exists (select 1 from public.product_variants where id = v_variant and deleted_at is null) then
      raise exception 'Línea %: selecciona un producto válido.', v_line;
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Línea %: las unidades deben ser un número entero mayor que 0.', v_line;
    end if;
    if v_cost is null or v_cost < 0 then
      raise exception 'Línea %: indica un coste unitario válido (0 o más).', v_line;
    end if;
    insert into public.purchase_order_items (purchase_order_id, line_number, variant_id, quantity_ordered, unit_cost, notes)
    values (p_po_id, v_line, v_variant, v_qty, v_cost, private.txt(v, 'notes'));
  end loop;
end;
$$;

create or replace function private.insert_po_costs(p_po_id uuid, p_costs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_amount numeric;
  v_type text;
begin
  for v in select * from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb))
  loop
    v_type := private.txt(v, 'cost_type');
    v_amount := private.num_or_null(v, 'amount', 'El importe del coste');
    if v_amount is null or v_amount = 0 then
      continue;
    end if;
    if v_type is null or v_type not in ('transporte', 'aduanas', 'aranceles', 'comisiones', 'gestion', 'otros') then
      raise exception 'Tipo de coste no válido: %.', coalesce(v_type, '(vacío)');
    end if;
    if v_amount < 0 then
      raise exception 'Los costes no pueden ser negativos.';
    end if;
    insert into public.purchase_order_costs (purchase_order_id, cost_type, amount, description)
    values (p_po_id, v_type::public.po_cost_type, v_amount, private.txt(v, 'description'));
  end loop;
end;
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
    values (coalesce(v_number, nextval('public.purchase_order_number_seq')::integer), v_supplier, v_date,
            private.txt(p, 'notes'), auth.uid())
    returning * into v_po;
    perform private.insert_po_lines(v_po.id, p -> 'items');
    perform private.insert_po_costs(v_po.id, p -> 'costs');
    perform setval('public.purchase_order_number_seq',
                   greatest((select max(order_number) from public.purchase_orders), 1));
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

  perform setval('public.purchase_order_number_seq',
                 greatest((select max(order_number) from public.purchase_orders), 1));
  return v_id;
end;
$$;

create or replace function public.cancel_purchase_order(p_po_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
begin
  perform public.require_admin();
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'El pedido de compra no existe.';
  end if;
  if v_po.status <> 'pendiente' then
    raise exception 'Solo se pueden cancelar pedidos pendientes.';
  end if;
  update public.purchase_order_items set status = 'cancelado', quantity_received = 0 where purchase_order_id = p_po_id;
  update public.purchase_orders set status = 'cancelado', cancel_reason = nullif(trim(p_reason), '') where id = p_po_id;
  perform public.log_action('cancelar_pedido_compra', 'purchase_orders', p_po_id::text,
    'Pedido de compra #' || v_po.order_number || ' cancelado');
end;
$$;

-- Recepción de un pedido.
-- p: {purchase_order_id, received_at, lines: [{item_id, quantity_received,
--      substitute_variant_id?, substitute_quantity?, notes?}]}
create or replace function public.receive_purchase_order(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_date date := coalesce(private.date_or_null(p, 'received_at', 'La fecha de recepción'), current_date);
  v_line jsonb;
  v_item public.purchase_order_items%rowtype;
  v_qty integer;
  v_sub_variant uuid;
  v_sub_qty integer;
  v_next_line integer;
  v_new_item uuid;
  v_lot uuid;
  v_received_units integer := 0;
  v_pending integer;
  v_listed integer;
begin
  perform public.require_admin();
  select * into v_po from public.purchase_orders where id = private.uuid_or_null(p, 'purchase_order_id') for update;
  if not found then
    raise exception 'El pedido de compra no existe.';
  end if;
  if v_po.status <> 'pendiente' then
    raise exception 'Solo se pueden recibir pedidos pendientes.';
  end if;
  if jsonb_typeof(p -> 'lines') is distinct from 'array' then
    raise exception 'Indica las cantidades recibidas.';
  end if;

  select count(*) into v_pending from public.purchase_order_items where purchase_order_id = v_po.id and status = 'pendiente';
  select count(distinct l ->> 'item_id') into v_listed from jsonb_array_elements(p -> 'lines') l;
  if v_listed <> v_pending then
    raise exception 'Indica la cantidad recibida de todas las líneas del pedido (aunque sea 0).';
  end if;

  select coalesce(max(line_number), 0) into v_next_line from public.purchase_order_items where purchase_order_id = v_po.id;

  for v_line in select * from jsonb_array_elements(p -> 'lines')
  loop
    select * into v_item from public.purchase_order_items
     where id = private.uuid_or_null(v_line, 'item_id') and purchase_order_id = v_po.id and status = 'pendiente'
     for update;
    if not found then
      raise exception 'Una de las líneas no pertenece a este pedido.';
    end if;

    v_qty := coalesce(private.int_or_null(v_line, 'quantity_received', 'La cantidad recibida'), 0);
    if v_qty < 0 then
      raise exception 'La cantidad recibida no puede ser negativa.';
    end if;

    update public.purchase_order_items
       set quantity_received = v_qty,
           status = case when v_qty > 0 then 'recibido'::public.po_item_status else 'cancelado'::public.po_item_status end,
           notes = coalesce(private.txt(v_line, 'notes'), notes)
     where id = v_item.id;

    if v_qty > 0 then
      insert into public.inventory_lots (origin, purchase_order_id, purchase_order_item_id, variant_id, received_at, quantity_initial, unit_cost)
      values ('compra', v_po.id, v_item.id, v_item.variant_id, v_date, v_qty, v_item.unit_cost)
      returning id into v_lot;
      insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, purchase_order_id, created_by)
      values ('entrada_compra', v_item.variant_id, v_lot, v_qty, v_date, v_po.id, auth.uid());
      v_received_units := v_received_units + v_qty;
    end if;

    -- Sustitución: se pidió una cosa y llegó otra
    v_sub_variant := private.uuid_or_null(v_line, 'substitute_variant_id');
    v_sub_qty := coalesce(private.int_or_null(v_line, 'substitute_quantity', 'Las unidades del sustituto'), 0);
    if v_sub_variant is not null and v_sub_qty > 0 then
      if not exists (select 1 from public.product_variants where id = v_sub_variant and deleted_at is null) then
        raise exception 'El producto sustituto no existe.';
      end if;
      v_next_line := v_next_line + 1;
      insert into public.purchase_order_items (purchase_order_id, line_number, variant_id, quantity_ordered, unit_cost,
                                               quantity_received, status, substitutes_item_id, notes)
      values (v_po.id, v_next_line, v_sub_variant, v_sub_qty, v_item.unit_cost, v_sub_qty, 'recibido', v_item.id,
              'Recibido en sustitución de ' || private.variant_label(v_item.variant_id))
      returning id into v_new_item;
      insert into public.inventory_lots (origin, purchase_order_id, purchase_order_item_id, variant_id, received_at, quantity_initial, unit_cost)
      values ('compra', v_po.id, v_new_item, v_sub_variant, v_date, v_sub_qty, v_item.unit_cost)
      returning id into v_lot;
      insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, purchase_order_id, notes, created_by)
      values ('entrada_compra', v_sub_variant, v_lot, v_sub_qty, v_date, v_po.id,
              'Sustituye a ' || private.variant_label(v_item.variant_id), auth.uid());
      v_received_units := v_received_units + v_sub_qty;
      perform public.log_action('sustitucion_compra', 'purchase_orders', v_po.id::text,
        'Pedido #' || v_po.order_number || ': se pidió ' || private.variant_label(v_item.variant_id) ||
        ' y se recibió ' || v_sub_qty || ' x ' || private.variant_label(v_sub_variant));
    elsif v_sub_variant is not null and v_sub_qty <= 0 then
      raise exception 'Indica cuántas unidades del producto sustituto se recibieron.';
    end if;
  end loop;

  if v_received_units = 0 then
    raise exception 'No se ha recibido ninguna unidad. Si no va a llegar nada, cancela el pedido.';
  end if;

  update public.purchase_orders set status = 'recibido', received_at = v_date where id = v_po.id;
  perform private.apply_po_costs(v_po.id);
  perform public.log_action('recibir_pedido_compra', 'purchase_orders', v_po.id::text,
    'Pedido de compra #' || v_po.order_number || ' recibido (' || v_received_units || ' unidades)');
end;
$$;

-- Cambiar los costes adicionales de un pedido (también después de recibirlo:
-- el coste real de sus lotes y el beneficio de sus ventas se recalculan)
create or replace function public.set_purchase_costs(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_po public.purchase_orders%rowtype;
begin
  perform public.require_admin();
  select * into v_po from public.purchase_orders where id = private.uuid_or_null(p, 'purchase_order_id') for update;
  if not found then
    raise exception 'El pedido de compra no existe.';
  end if;
  if v_po.status = 'cancelado' then
    raise exception 'El pedido está cancelado.';
  end if;
  delete from public.purchase_order_costs where purchase_order_id = v_po.id;
  perform private.insert_po_costs(v_po.id, p -> 'costs');
  if v_po.status = 'recibido' then
    perform private.apply_po_costs(v_po.id);
  end if;
  perform public.log_action('cambiar_costes_compra', 'purchase_orders', v_po.id::text,
    'Costes del pedido #' || v_po.order_number || ' actualizados');
end;
$$;

-- ---------------------------------------------------------------------
-- SALIDAS SIN VENTA (regalos, pérdidas…)
-- ---------------------------------------------------------------------
create or replace function public.create_stock_exit(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_date date := coalesce(private.date_or_null(p, 'exit_date', 'La fecha'), current_date);
  v_reason text := coalesce(private.txt(p, 'reason'), 'pendiente');
  v_resp uuid := private.uuid_or_null(p, 'responsible_id');
begin
  perform public.require_admin();
  perform private.validate_stock_line(p, false);
  if v_reason not in ('regalo', 'perdida', 'otro', 'pendiente') then
    raise exception 'Motivo no válido.';
  end if;
  if v_resp is not null and not exists (select 1 from public.responsibles where id = v_resp and deleted_at is null) then
    raise exception 'El responsable seleccionado no existe.';
  end if;
  perform private.check_lot_availability(jsonb_build_array(p));

  insert into public.stock_exits (exit_date, variant_id, lot_id, quantity, reason, responsible_id, notes, created_by)
  values (v_date, (p ->> 'variant_id')::uuid, (p ->> 'lot_id')::uuid, (p ->> 'quantity')::integer,
          v_reason::public.exit_reason, v_resp, private.txt(p, 'notes'), auth.uid())
  returning id into v_id;

  insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, stock_exit_id, notes, created_by)
  values ('salida_sin_venta', (p ->> 'variant_id')::uuid, (p ->> 'lot_id')::uuid, -((p ->> 'quantity')::integer),
          v_date, v_id, private.txt(p, 'notes'), auth.uid());

  perform public.log_action('crear_salida_sin_venta', 'stock_exits', v_id::text,
    'Salida sin venta (' || v_reason || '): ' || (p ->> 'quantity') || ' x ' || private.variant_label((p ->> 'variant_id')::uuid));
  return v_id;
end;
$$;

create or replace function public.void_stock_exit(p_exit_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exit public.stock_exits%rowtype;
begin
  perform public.require_admin();
  if nullif(trim(p_reason), '') is null then
    raise exception 'Indica el motivo de la anulación.';
  end if;
  select * into v_exit from public.stock_exits where id = p_exit_id for update;
  if not found then
    raise exception 'La salida no existe.';
  end if;
  if v_exit.status <> 'activa' then
    raise exception 'La salida ya está anulada.';
  end if;
  insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, stock_exit_id, notes, created_by)
  values ('anulacion_salida', v_exit.variant_id, v_exit.lot_id, v_exit.quantity, current_date, v_exit.id, trim(p_reason), auth.uid());
  update public.stock_exits set status = 'anulada', voided_at = now(), void_reason = trim(p_reason) where id = p_exit_id;
end;
$$;

-- Completar el motivo de una salida (p. ej. las importadas con "motivo pendiente")
create or replace function public.update_stock_exit(p_exit_id uuid, p_reason text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if p_reason not in ('regalo', 'perdida', 'otro', 'pendiente') then
    raise exception 'Motivo no válido.';
  end if;
  update public.stock_exits
     set reason = p_reason::public.exit_reason,
         notes = coalesce(nullif(trim(p_notes), ''), notes)
   where id = p_exit_id and status = 'activa';
  if not found then
    raise exception 'La salida no existe o está anulada.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- AJUSTES MANUALES AUTORIZADOS
-- Entrada: crea un lote nuevo con su coste. Salida: sale de un lote.
-- ---------------------------------------------------------------------
create or replace function public.create_stock_adjustment(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_dir text := private.txt(p, 'direction');
  v_variant uuid := private.uuid_or_null(p, 'variant_id');
  v_qty integer := private.int_or_null(p, 'quantity', 'Las unidades');
  v_cost numeric := private.num_or_null(p, 'unit_cost', 'El coste unitario');
  v_reason text := private.txt(p, 'reason');
  v_date date := coalesce(private.date_or_null(p, 'adjustment_date', 'La fecha'), current_date);
  v_lot uuid := private.uuid_or_null(p, 'lot_id');
begin
  perform public.require_admin();
  if v_reason is null then
    raise exception 'Indica el motivo del ajuste.';
  end if;
  if v_dir not in ('entrada', 'salida') then
    raise exception 'Indica si el ajuste es una entrada o una salida.';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'Las unidades deben ser un número entero mayor que 0.';
  end if;
  if v_variant is null or not exists (select 1 from public.product_variants where id = v_variant and deleted_at is null) then
    raise exception 'Selecciona un producto válido.';
  end if;

  if v_dir = 'entrada' then
    if v_cost is null or v_cost < 0 then
      raise exception 'Indica el coste unitario de las unidades que entran (0 o más).';
    end if;
    insert into public.inventory_lots (origin, variant_id, received_at, quantity_initial, unit_cost, notes)
    values ('ajuste', v_variant, v_date, v_qty, v_cost, v_reason)
    returning id into v_lot;
    insert into public.stock_adjustments (adjustment_date, direction, variant_id, lot_id, quantity, reason, created_by)
    values (v_date, 'entrada', v_variant, v_lot, v_qty, v_reason, auth.uid())
    returning id into v_id;
    insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, adjustment_id, notes, created_by)
    values ('ajuste_entrada', v_variant, v_lot, v_qty, v_date, v_id, v_reason, auth.uid());
  else
    if v_lot is null then
      raise exception 'Selecciona el pedido/lote del que salen las unidades.';
    end if;
    perform private.check_lot_availability(jsonb_build_array(jsonb_build_object('variant_id', v_variant, 'lot_id', v_lot, 'quantity', v_qty)));
    insert into public.stock_adjustments (adjustment_date, direction, variant_id, lot_id, quantity, reason, created_by)
    values (v_date, 'salida', v_variant, v_lot, v_qty, v_reason, auth.uid())
    returning id into v_id;
    insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, adjustment_id, notes, created_by)
    values ('ajuste_salida', v_variant, v_lot, -v_qty, v_date, v_id, v_reason, auth.uid());
  end if;

  perform public.log_action('ajuste_stock', 'stock_adjustments', v_id::text,
    'Ajuste de ' || v_dir || ': ' || v_qty || ' x ' || private.variant_label(v_variant) || ' · ' || v_reason);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- DEVOLUCIONES
-- p: {sale_id, return_date, return_type, reason, notes,
--     items: [{sale_item_id, quantity, refund_amount}]}
-- ---------------------------------------------------------------------
create or replace function public.create_return(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
  v_type text := private.txt(p, 'return_type');
  v_date date := coalesce(private.date_or_null(p, 'return_date', 'La fecha'), current_date);
  v_return uuid;
  v_ri uuid;
  v jsonb;
  v_si public.sale_items%rowtype;
  v_qty integer;
  v_refund numeric;
  v_prev_qty integer;
  v_prev_refund numeric;
  v_restock boolean;
begin
  perform public.require_admin();
  select * into v_sale from public.sales where id = private.uuid_or_null(p, 'sale_id') for update;
  if not found then
    raise exception 'La venta no existe.';
  end if;
  if v_sale.status <> 'activa' then
    raise exception 'La venta está anulada.';
  end if;
  if v_type not in ('devolucion_producto', 'reembolso_sin_producto') then
    raise exception 'Indica el tipo de devolución.';
  end if;
  v_restock := v_type = 'devolucion_producto';
  if jsonb_typeof(p -> 'items') is distinct from 'array' or jsonb_array_length(p -> 'items') = 0 then
    raise exception 'Indica qué productos se devuelven.';
  end if;

  insert into public.returns (sale_id, return_date, return_type, reason, notes, created_by)
  values (v_sale.id, v_date, v_type::public.return_type, private.txt(p, 'reason'), private.txt(p, 'notes'), auth.uid())
  returning id into v_return;

  for v in select * from jsonb_array_elements(p -> 'items')
  loop
    v_qty := private.int_or_null(v, 'quantity', 'Las unidades devueltas');
    if coalesce(v_qty, 0) = 0 then
      continue;
    end if;
    select * into v_si from public.sale_items
     where id = private.uuid_or_null(v, 'sale_item_id') and sale_id = v_sale.id
     for update;
    if not found then
      raise exception 'Uno de los productos no pertenece a esta venta.';
    end if;
    if v_qty < 0 then
      raise exception 'Las unidades devueltas no pueden ser negativas.';
    end if;
    v_refund := coalesce(private.num_or_null(v, 'refund_amount', 'El importe reembolsado'), 0);
    if v_refund < 0 then
      raise exception 'El importe reembolsado no puede ser negativo.';
    end if;

    select coalesce(sum(quantity), 0), coalesce(sum(refund_amount), 0)
      into v_prev_qty, v_prev_refund
      from public.return_items where sale_item_id = v_si.id;

    if v_qty > v_si.quantity - v_prev_qty then
      raise exception 'No se pueden devolver más unidades de las vendidas (% de %, ya devueltas %).',
        private.variant_label(v_si.variant_id), v_si.quantity, v_prev_qty;
    end if;
    if v_refund > round(v_si.unit_price * v_si.quantity, 2) - v_prev_refund then
      raise exception 'El reembolso de % supera lo cobrado en esa línea.', private.variant_label(v_si.variant_id);
    end if;

    insert into public.return_items (return_id, sale_item_id, quantity, refund_amount, restocked)
    values (v_return, v_si.id, v_qty, v_refund, v_restock)
    returning id into v_ri;

    if v_restock then
      insert into public.inventory_movements (movement_type, variant_id, lot_id, quantity, occurred_at, sale_item_id, return_item_id, created_by)
      values ('devolucion', v_si.variant_id, v_si.lot_id, v_qty, v_date, v_si.id, v_ri, auth.uid());
    end if;
  end loop;

  if not exists (select 1 from public.return_items where return_id = v_return) then
    raise exception 'Indica al menos una unidad devuelta.';
  end if;

  perform public.log_action('crear_devolucion', 'returns', v_return::text,
    'Devolución de la venta ' || v_sale.sale_number ||
    case when v_restock then ' (vuelve al stock)' else ' (reembolso sin producto)' end);
  return v_return;
end;
$$;

-- ---------------------------------------------------------------------
-- REVISIÓN DE DATOS PENDIENTES
-- ---------------------------------------------------------------------
create or replace function public.resolve_review_item(p_id uuid, p_status text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_admin();
  if p_status not in ('pendiente', 'resuelto', 'descartado') then
    raise exception 'Estado no válido.';
  end if;
  update public.review_items
     set status = p_status::public.review_status,
         resolved_at = case when p_status = 'pendiente' then null else now() end,
         resolved_by = case when p_status = 'pendiente' then null else auth.uid() end,
         resolution_note = nullif(trim(p_note), '')
   where id = p_id;
  if not found then
    raise exception 'El elemento no existe.';
  end if;
end;
$$;

-- >>> 20261008100300_informes.sql
-- =====================================================================
-- MaurInventario · Migración 4 · Vistas, informes y estadísticas
--
-- Principio contable:
--   · Valoración del inventario  → coste medio ponderado de las unidades en stock.
--   · Beneficio de cada venta    → coste real del lote de procedencia.
--
-- Todas las vistas usan security_invoker: respetan los permisos (RLS)
-- de quien consulta. Como los lotes solo los puede leer el admin, los
-- vendedores no ven costes ni beneficios.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lotes
-- ---------------------------------------------------------------------
create view public.v_lots with (security_invoker = true) as
select
  l.id as lot_id,
  l.origin,
  l.variant_id,
  v.product_id,
  p.name as product_name,
  v.name as variant_name,
  l.purchase_order_id,
  po.order_number as purchase_order_number,
  case when l.origin = 'compra' then 'Pedido #' || po.order_number
       else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end as lot_label,
  l.received_at,
  l.quantity_initial,
  l.quantity_available,
  l.unit_cost,
  round(l.quantity_available * l.unit_cost, 2) as stock_value,
  l.notes
from public.inventory_lots l
join public.product_variants v on v.id = l.variant_id
join public.products p on p.id = v.product_id
left join public.purchase_orders po on po.id = l.purchase_order_id;

-- ---------------------------------------------------------------------
-- Líneas de venta con devoluciones, coste del lote y beneficio
-- ---------------------------------------------------------------------
create view public.v_sale_lines with (security_invoker = true) as
with ret as (
  select ri.sale_item_id,
         sum(ri.quantity) as returned_qty,
         coalesce(sum(ri.quantity) filter (where ri.restocked), 0) as restocked_qty,
         sum(ri.refund_amount) as refunded
    from public.return_items ri
   group by ri.sale_item_id
)
select
  si.id as sale_item_id,
  s.id as sale_id,
  s.sale_number,
  s.sale_date,
  s.responsible_id,
  r.name as responsible_name,
  s.platform_id,
  pl.name as platform_name,
  pl.requires_shipping,
  s.carrier_id,
  ca.name as carrier_name,
  s.mobile_device_id,
  md.number as mobile_number,
  md.name as mobile_name,
  s.shipping_status,
  s.external_reference,
  si.line_number,
  si.variant_id,
  v.name as variant_name,
  v.product_id,
  p.name as product_name,
  p.category_id,
  c.name as category_name,
  p.brand_id,
  b.name as brand_name,
  coalesce(v.sku, p.sku) as sku,
  si.lot_id,
  l.purchase_order_id,
  po.order_number as purchase_order_number,
  case when l.origin = 'compra' then 'Pedido #' || po.order_number
       else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end as lot_label,
  si.quantity,
  si.unit_price,
  round(si.quantity * si.unit_price, 2) as gross_amount,
  coalesce(ret.returned_qty, 0)::integer as returned_qty,
  coalesce(ret.restocked_qty, 0)::integer as restocked_qty,
  coalesce(ret.refunded, 0) as refunded_amount,
  (si.quantity - coalesce(ret.returned_qty, 0))::integer as net_quantity,
  round(si.quantity * si.unit_price, 2) - coalesce(ret.refunded, 0) as net_amount,
  l.unit_cost as lot_unit_cost,
  round((si.quantity - coalesce(ret.restocked_qty, 0)) * l.unit_cost, 2) as cost_amount,
  round(si.quantity * si.unit_price, 2) - coalesce(ret.refunded, 0)
    - round((si.quantity - coalesce(ret.restocked_qty, 0)) * l.unit_cost, 2) as profit,
  si.notes as line_notes,
  s.notes as sale_notes,
  s.source_ref
from public.sale_items si
join public.sales s on s.id = si.sale_id and s.status = 'activa'
join public.responsibles r on r.id = s.responsible_id
join public.platforms pl on pl.id = s.platform_id
left join public.carriers ca on ca.id = s.carrier_id
left join public.mobile_devices md on md.id = s.mobile_device_id
join public.product_variants v on v.id = si.variant_id
join public.products p on p.id = v.product_id
left join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
join public.inventory_lots l on l.id = si.lot_id
left join public.purchase_orders po on po.id = l.purchase_order_id
left join ret on ret.sale_item_id = si.id;

-- ---------------------------------------------------------------------
-- Inventario por variante
-- ---------------------------------------------------------------------
create view public.v_variant_inventory with (security_invoker = true) as
with st as (
  select l.variant_id,
         sum(l.quantity_available)::integer as stock,
         sum(l.quantity_available * l.unit_cost) as stock_value,
         count(*) filter (where l.quantity_available > 0)::integer as lots_with_stock,
         array_agg(
           case when l.origin = 'compra' then 'Pedido #' || po.order_number
                else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end
           order by l.received_at
         ) filter (where l.quantity_available > 0) as lot_labels,
         array_agg(distinct po.order_number) filter (where po.order_number is not null) as purchase_order_numbers
    from public.inventory_lots l
    left join public.purchase_orders po on po.id = l.purchase_order_id
   group by l.variant_id
),
sl as (
  select si.variant_id,
         sum(si.quantity) as qty,
         sum(si.quantity * si.unit_price) as gross
    from public.sale_items si
    join public.sales s on s.id = si.sale_id and s.status = 'activa'
   group by si.variant_id
),
rt as (
  select si.variant_id, sum(ri.quantity) as returned
    from public.return_items ri
    join public.sale_items si on si.id = ri.sale_item_id
    join public.sales s on s.id = si.sale_id and s.status = 'activa'
   group by si.variant_id
)
select
  v.id as variant_id,
  v.product_id,
  p.name as product_name,
  v.name as variant_name,
  v.is_default,
  (select count(*) from public.product_variants v2 where v2.product_id = p.id and v2.deleted_at is null)::integer as variant_count,
  coalesce(v.sku, p.sku) as sku,
  p.brand_id,
  b.name as brand_name,
  p.category_id,
  c.name as category_name,
  p.photo_path,
  coalesce(st.stock, 0) as stock,
  round(coalesce(st.stock_value, 0), 2) as stock_value,
  case when coalesce(st.stock, 0) > 0 then round(st.stock_value / st.stock, 4) end as weighted_avg_cost,
  coalesce(v.normal_sale_price, p.normal_sale_price) as normal_sale_price,
  case when coalesce(sl.qty, 0) > 0 then round(sl.gross / sl.qty, 2) end as avg_sale_price,
  (coalesce(sl.qty, 0) - coalesce(rt.returned, 0))::integer as units_sold,
  coalesce(sl.qty, 0)::integer as gross_units_sold,
  round(coalesce(sl.gross, 0), 2) as gross_sold_amount,
  coalesce(v.normal_sale_price, p.normal_sale_price, case when coalesce(sl.qty, 0) > 0 then round(sl.gross / sl.qty, 2) end) as potential_unit_price,
  (coalesce(v.normal_sale_price, p.normal_sale_price) is null and coalesce(sl.qty, 0) > 0) as potential_is_estimated,
  round(coalesce(st.stock, 0) * coalesce(v.normal_sale_price, p.normal_sale_price, case when coalesce(sl.qty, 0) > 0 then sl.gross / sl.qty end), 2) as potential_value,
  round(coalesce(st.stock, 0) * coalesce(v.normal_sale_price, p.normal_sale_price, case when coalesce(sl.qty, 0) > 0 then sl.gross / sl.qty end), 2)
    - round(coalesce(st.stock_value, 0), 2) as potential_profit,
  coalesce(st.lots_with_stock, 0) as lots_with_stock,
  coalesce(st.lot_labels, '{}') as lot_labels,
  coalesce(st.purchase_order_numbers, '{}') as purchase_order_numbers
from public.product_variants v
join public.products p on p.id = v.product_id and p.deleted_at is null
left join public.brands b on b.id = p.brand_id
left join public.categories c on c.id = p.category_id
left join st on st.variant_id = v.id
left join sl on sl.variant_id = v.id
left join rt on rt.variant_id = v.id
where v.deleted_at is null
  and public.is_admin();  -- información de almacén: solo administradores

-- Inventario por producto (suma de sus variantes)
create view public.v_product_inventory with (security_invoker = true) as
select
  vi.product_id,
  vi.product_name,
  max(vi.brand_name) as brand_name,
  p.brand_id,
  max(vi.category_name) as category_name,
  p.category_id,
  max(vi.photo_path) as photo_path,
  max(p.sku) as sku,
  max(p.normal_sale_price) as normal_sale_price,
  count(*)::integer as variant_count,
  sum(vi.stock)::integer as stock,
  sum(vi.stock_value) as stock_value,
  case when sum(vi.stock) > 0 then round(sum(vi.stock_value) / sum(vi.stock), 4) end as weighted_avg_cost,
  sum(vi.units_sold)::integer as units_sold,
  case when sum(vi.gross_units_sold) > 0 then round(sum(vi.gross_sold_amount) / sum(vi.gross_units_sold), 2) end as avg_sale_price,
  sum(coalesce(vi.potential_value, 0)) as potential_value,
  sum(coalesce(vi.potential_profit, 0)) as potential_profit,
  bool_or(vi.potential_is_estimated) as potential_is_estimated,
  sum(vi.stock) filter (where vi.potential_unit_price is null)::integer as unpriced_units,
  (p.brand_id is null or p.category_id is null or p.sku is null) as has_missing_data,
  p.created_at
from public.v_variant_inventory vi
join public.products p on p.id = vi.product_id
group by vi.product_id, vi.product_name, p.brand_id, p.category_id, p.sku, p.created_at;

-- ---------------------------------------------------------------------
-- Líneas de compra con reparto de costes y coste real
-- ---------------------------------------------------------------------
create view public.v_purchase_lines with (security_invoker = true) as
with base as (
  select i.*,
         po.order_number, po.order_date, po.received_at, po.status as po_status, po.supplier_id,
         case
           when po.status = 'recibido' then coalesce(i.quantity_received, 0)
           when po.status = 'cancelado' or i.status = 'cancelado' then 0
           else i.quantity_ordered
         end as qty_basis
    from public.purchase_order_items i
    join public.purchase_orders po on po.id = i.purchase_order_id
),
tot as (
  select purchase_order_id,
         sum(qty_basis * unit_cost) as merch_total,
         sum(qty_basis) as units_total
    from base
   group by purchase_order_id
),
costs as (
  select purchase_order_id,
         coalesce(sum(amount) filter (where cost_type = 'transporte'), 0) as transporte,
         coalesce(sum(amount) filter (where cost_type = 'aduanas'), 0) as aduanas,
         coalesce(sum(amount) filter (where cost_type = 'aranceles'), 0) as aranceles,
         coalesce(sum(amount) filter (where cost_type = 'comisiones'), 0) as comisiones,
         coalesce(sum(amount) filter (where cost_type = 'gestion'), 0) as gestion,
         coalesce(sum(amount) filter (where cost_type = 'otros'), 0) as otros
    from public.purchase_order_costs
   group by purchase_order_id
),
shares as (
  select b.*,
         case
           when b.qty_basis = 0 then 0
           when t.merch_total > 0 then (b.qty_basis * b.unit_cost) / t.merch_total
           when t.units_total > 0 then b.qty_basis::numeric / t.units_total
           else 0
         end as share
    from base b
    join tot t on t.purchase_order_id = b.purchase_order_id
)
select
  sh.id as item_id,
  sh.purchase_order_id,
  sh.order_number,
  sh.order_date,
  sh.received_at,
  sh.po_status,
  sh.supplier_id,
  su.name as supplier_name,
  sh.line_number,
  sh.variant_id,
  v.product_id,
  p.name as product_name,
  v.name as variant_name,
  c.name as category_name,
  b.name as brand_name,
  sh.quantity_ordered,
  sh.quantity_received,
  sh.status as item_status,
  sh.substitutes_item_id,
  sh.unit_cost,
  sh.qty_basis,
  round(sh.qty_basis * sh.unit_cost, 2) as merchandise_cost,
  sh.qty_basis * sh.unit_cost as merchandise_raw,
  round(sh.share * coalesce(co.transporte, 0), 2) as transporte,
  round(sh.share * coalesce(co.aduanas, 0), 2) as aduanas,
  round(sh.share * coalesce(co.aranceles, 0), 2) as aranceles,
  round(sh.share * coalesce(co.comisiones, 0), 2) as comisiones,
  round(sh.share * coalesce(co.gestion, 0), 2) as gestion,
  round(sh.share * coalesce(co.otros, 0), 2) as otros,
  case when sh.qty_basis > 0
       then coalesce(l.unit_cost, sh.unit_cost + sh.share * (coalesce(co.transporte, 0) + coalesce(co.aduanas, 0) + coalesce(co.aranceles, 0)
                     + coalesce(co.comisiones, 0) + coalesce(co.gestion, 0) + coalesce(co.otros, 0)) / sh.qty_basis)
  end as real_unit_cost,
  round(sh.qty_basis * sh.unit_cost
        + sh.share * (coalesce(co.transporte, 0) + coalesce(co.aduanas, 0) + coalesce(co.aranceles, 0)
                      + coalesce(co.comisiones, 0) + coalesce(co.gestion, 0) + coalesce(co.otros, 0)), 2) as real_total_cost,
  l.id as lot_id,
  sh.notes
from shares sh
join public.suppliers su on su.id = sh.supplier_id
join public.product_variants v on v.id = sh.variant_id
join public.products p on p.id = v.product_id
left join public.categories c on c.id = p.category_id
left join public.brands b on b.id = p.brand_id
left join costs co on co.purchase_order_id = sh.purchase_order_id
left join public.inventory_lots l on l.purchase_order_item_id = sh.id;

-- Resumen por pedido de compra
create view public.v_purchase_orders with (security_invoker = true) as
select
  po.id,
  po.order_number,
  po.order_date,
  po.received_at,
  po.status,
  po.supplier_id,
  su.name as supplier_name,
  su.is_placeholder as supplier_is_placeholder,
  po.notes,
  po.created_at,
  (select count(*) from public.purchase_order_items i where i.purchase_order_id = po.id)::integer as line_count,
  (select coalesce(sum(i.quantity_ordered), 0) from public.purchase_order_items i
    where i.purchase_order_id = po.id and i.substitutes_item_id is null)::integer as units_ordered,
  (select coalesce(sum(i.quantity_received), 0) from public.purchase_order_items i where i.purchase_order_id = po.id)::integer as units_received,
  (select round(coalesce(sum(pl.merchandise_raw), 0), 2) from public.v_purchase_lines pl where pl.purchase_order_id = po.id) as merchandise_cost,
  (select coalesce(sum(c.amount), 0) from public.purchase_order_costs c where c.purchase_order_id = po.id) as extra_costs,
  -- Mercancía sin redondear línea a línea + costes adicionales (se reparten enteros)
  (select round(coalesce(sum(pl.merchandise_raw), 0), 2) from public.v_purchase_lines pl where pl.purchase_order_id = po.id)
    + (select coalesce(sum(c.amount), 0) from public.purchase_order_costs c where c.purchase_order_id = po.id) as total_cost
from public.purchase_orders po
join public.suppliers su on su.id = po.supplier_id;

-- ---------------------------------------------------------------------
-- Salidas sin venta con su coste (pérdida)
-- ---------------------------------------------------------------------
create view public.v_stock_exits with (security_invoker = true) as
select
  e.id,
  e.exit_date,
  e.variant_id,
  v.product_id,
  p.name as product_name,
  v.name as variant_name,
  e.lot_id,
  po.order_number as purchase_order_number,
  case when l.origin = 'compra' then 'Pedido #' || po.order_number
       else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end as lot_label,
  e.quantity,
  e.reason,
  e.responsible_id,
  r.name as responsible_name,
  e.notes,
  e.status,
  l.unit_cost,
  round(e.quantity * l.unit_cost, 2) as cost_amount,
  e.source_ref,
  e.created_at
from public.stock_exits e
join public.product_variants v on v.id = e.variant_id
join public.products p on p.id = v.product_id
join public.inventory_lots l on l.id = e.lot_id
left join public.purchase_orders po on po.id = l.purchase_order_id
left join public.responsibles r on r.id = e.responsible_id;

-- Devoluciones
create view public.v_returns with (security_invoker = true) as
select
  rt.id,
  rt.return_date,
  rt.return_type,
  rt.reason,
  rt.notes,
  rt.sale_id,
  s.sale_number,
  s.sale_date,
  pl.name as platform_name,
  r.name as responsible_name,
  ri.id as return_item_id,
  ri.sale_item_id,
  si.variant_id,
  p.name as product_name,
  v.name as variant_name,
  ri.quantity,
  ri.refund_amount,
  ri.restocked,
  l.unit_cost,
  case when ri.restocked then 0 else round(ri.quantity * l.unit_cost, 2) end as lost_cost,
  rt.created_at
from public.returns rt
join public.return_items ri on ri.return_id = rt.id
join public.sale_items si on si.id = ri.sale_item_id
join public.sales s on s.id = rt.sale_id
join public.platforms pl on pl.id = s.platform_id
join public.responsibles r on r.id = s.responsible_id
join public.product_variants v on v.id = si.variant_id
join public.products p on p.id = v.product_id
join public.inventory_lots l on l.id = si.lot_id;

-- Historial de movimientos con su origen
create view public.v_movements with (security_invoker = true) as
select
  m.id,
  m.movement_type,
  m.occurred_at,
  m.created_at,
  m.quantity,
  m.variant_id,
  v.product_id,
  p.name as product_name,
  v.name as variant_name,
  m.lot_id,
  case when l.origin = 'compra' then 'Pedido #' || po.order_number
       else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end as lot_label,
  l.unit_cost as lot_unit_cost,
  m.purchase_order_id,
  po_ref.order_number as purchase_order_number,
  m.sale_item_id,
  s.id as sale_id,
  s.sale_number,
  r.name as responsible_name,
  m.return_item_id,
  m.stock_exit_id,
  e.reason as exit_reason,
  m.adjustment_id,
  m.notes,
  pr.email as created_by_email
from public.inventory_movements m
join public.product_variants v on v.id = m.variant_id
join public.products p on p.id = v.product_id
join public.inventory_lots l on l.id = m.lot_id
left join public.purchase_orders po on po.id = l.purchase_order_id
left join public.purchase_orders po_ref on po_ref.id = m.purchase_order_id
left join public.sale_items si on si.id = m.sale_item_id
left join public.sales s on s.id = si.sale_id
left join public.responsibles r on r.id = s.responsible_id
left join public.stock_exits e on e.id = m.stock_exit_id
left join public.profiles pr on pr.id = m.created_by;

-- ---------------------------------------------------------------------
-- Filtros comunes de ventas
-- Fechas: desde vacío + hasta → todo hasta esa fecha;
--         desde + hasta vacío → desde esa fecha hasta hoy;
--         ambos vacíos → todo el histórico.
-- ---------------------------------------------------------------------
create or replace function public.report_sale_lines(p_filters jsonb default '{}'::jsonb)
returns setof public.v_sale_lines
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_from date := private.date_or_null(f, 'from', 'La fecha desde');
  v_to date := private.date_or_null(f, 'to', 'La fecha hasta');
  v_po integer := private.int_or_null(f, 'purchase_order_number', 'El número de pedido');
  v_q text := private.txt(f, 'search');
begin
  perform public.require_admin();
  if v_from is not null and v_to is null then
    v_to := current_date;
  end if;
  return query
  select * from public.v_sale_lines sl
   where (v_from is null or sl.sale_date >= v_from)
     and (v_to is null or sl.sale_date <= v_to)
     and (v_po is null or sl.purchase_order_number = v_po)
     and (private.uuid_or_null(f, 'product_id') is null or sl.product_id = private.uuid_or_null(f, 'product_id'))
     and (private.uuid_or_null(f, 'variant_id') is null or sl.variant_id = private.uuid_or_null(f, 'variant_id'))
     and (private.uuid_or_null(f, 'category_id') is null or sl.category_id = private.uuid_or_null(f, 'category_id'))
     and (private.uuid_or_null(f, 'brand_id') is null or sl.brand_id = private.uuid_or_null(f, 'brand_id'))
     and (private.uuid_or_null(f, 'responsible_id') is null or sl.responsible_id = private.uuid_or_null(f, 'responsible_id'))
     and (private.uuid_or_null(f, 'platform_id') is null or sl.platform_id = private.uuid_or_null(f, 'platform_id'))
     and (private.txt(f, 'shipping_status') is null or sl.shipping_status::text = private.txt(f, 'shipping_status'))
     and (v_q is null or sl.sale_number ilike '%' || v_q || '%' or sl.product_name ilike '%' || v_q || '%'
          or coalesce(sl.external_reference, '') ilike '%' || v_q || '%')
   order by sl.sale_date desc, sl.sale_number desc, sl.line_number;
end;
$$;

create or replace function public.report_sales_summary(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'lines', count(*),
    'orders', count(distinct sale_id),
    'units', coalesce(sum(net_quantity), 0),
    'gross_amount', coalesce(sum(gross_amount), 0),
    'refunded_amount', coalesce(sum(refunded_amount), 0),
    'net_amount', coalesce(sum(net_amount), 0),
    'cost_amount', coalesce(sum(cost_amount), 0),
    'profit', coalesce(sum(profit), 0),
    'avg_ticket', case when count(distinct sale_id) > 0 then round(sum(net_amount) / count(distinct sale_id), 2) else 0 end
  )
  from public.report_sale_lines(p_filters)
$$;

-- Rendimiento de responsables
create or replace function public.report_responsibles(p_filters jsonb default '{}'::jsonb)
returns table (
  responsible_id uuid,
  responsible_name text,
  active boolean,
  units integer,
  orders integer,
  revenue numeric,
  avg_ticket numeric,
  revenue_pct numeric,
  profit numeric,
  ranking integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with lines as (
    select * from public.report_sale_lines(p_filters)
  ),
  agg as (
    select r.id, r.name, r.active,
           coalesce(sum(l.net_quantity), 0)::integer as units,
           count(distinct l.sale_id)::integer as orders,
           coalesce(sum(l.net_amount), 0) as revenue,
           coalesce(sum(l.profit), 0) as profit
      from public.responsibles r
      left join lines l on l.responsible_id = r.id
     where r.deleted_at is null
       and (private.uuid_or_null(p_filters, 'responsible_id') is null or r.id = private.uuid_or_null(p_filters, 'responsible_id'))
     group by r.id, r.name, r.active
  ),
  total as (select nullif(sum(revenue), 0) as t from agg)
  select a.id, a.name, a.active, a.units, a.orders, round(a.revenue, 2),
         case when a.orders > 0 then round(a.revenue / a.orders, 2) else 0 end,
         coalesce(round(a.revenue / total.t * 100, 2), 0),
         round(a.profit, 2),
         rank() over (order by a.revenue desc)::integer
    from agg a cross join total
   order by a.revenue desc, a.name
$$;

-- Reparto entre socios (total de ventas entre el número de socios)
create or replace function public.report_partner_settlement(p_filters jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_total numeric;
  v_n integer;
  v_share numeric;
  v_from date := private.date_or_null(f, 'from', 'La fecha desde');
  v_to date := private.date_or_null(f, 'to', 'La fecha hasta');
  v_include_transfers boolean := private.txt(f, 'purchase_order_number') is null;
  v_partners jsonb;
begin
  perform public.require_admin();
  if v_from is not null and v_to is null then
    v_to := current_date;
  end if;

  select coalesce(sum(net_amount), 0) into v_total
    from public.report_sale_lines(f - 'responsible_id');

  select count(*) into v_n from public.responsibles where is_partner and deleted_at is null;
  v_share := case when v_n > 0 then round(v_total / v_n, 2) else 0 end;

  with col as (
    select responsible_id, sum(net_amount) as collected
      from public.report_sale_lines(f - 'responsible_id')
     group by responsible_id
  ),
  tr as (
    select t.*
      from public.partner_transfers t
     where t.deleted_at is null and v_include_transfers
       and (v_from is null or t.transfer_date >= v_from)
       and (v_to is null or t.transfer_date <= v_to)
  )
  select coalesce(jsonb_agg(x order by x ->> 'name'), '[]'::jsonb) into v_partners
    from (
      select jsonb_build_object(
               'responsible_id', r.id,
               'name', r.name,
               'collected', round(coalesce(col.collected, 0), 2),
               'paid', coalesce((select sum(amount) from tr where tr.from_responsible_id = r.id), 0),
               'received', coalesce((select sum(amount) from tr where tr.to_responsible_id = r.id), 0),
               'share', v_share,
               'balance', round(
                   coalesce(col.collected, 0)
                   - coalesce((select sum(amount) from tr where tr.from_responsible_id = r.id), 0)
                   + coalesce((select sum(amount) from tr where tr.to_responsible_id = r.id), 0)
                   - v_share, 2)
             ) as x
        from public.responsibles r
        left join col on col.responsible_id = r.id
       where r.is_partner and r.deleted_at is null
    ) s;

  return jsonb_build_object(
    'total', round(v_total, 2),
    'partner_count', v_n,
    'share', v_share,
    'transfers_included', v_include_transfers,
    'partners', v_partners
  );
end;
$$;

-- Inventario filtrado
create or replace function public.report_inventory(p_filters jsonb default '{}'::jsonb)
returns setof public.v_variant_inventory
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_q text := private.txt(f, 'search');
  v_po integer := private.int_or_null(f, 'purchase_order_number', 'El número de pedido');
begin
  perform public.require_admin();
  return query
  select * from public.v_variant_inventory vi
   where (v_q is null or vi.product_name ilike '%' || v_q || '%' or vi.variant_name ilike '%' || v_q || '%'
          or coalesce(vi.sku, '') ilike '%' || v_q || '%')
     and (private.uuid_or_null(f, 'product_id') is null or vi.product_id = private.uuid_or_null(f, 'product_id'))
     and (private.uuid_or_null(f, 'category_id') is null or vi.category_id = private.uuid_or_null(f, 'category_id'))
     and (private.uuid_or_null(f, 'brand_id') is null or vi.brand_id = private.uuid_or_null(f, 'brand_id'))
     and (coalesce((f ->> 'only_in_stock')::boolean, false) = false or vi.stock > 0)
     and (v_po is null or v_po = any (vi.purchase_order_numbers))
   order by (vi.stock > 0) desc, vi.product_name, vi.variant_name;
end;
$$;

create or replace function public.report_inventory_summary(p_filters jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'variants', count(*),
    'products', count(distinct product_id),
    'products_with_stock', count(distinct product_id) filter (where stock > 0),
    'units', coalesce(sum(stock), 0),
    'stock_value', coalesce(sum(stock_value), 0),
    'potential_value', coalesce(sum(potential_value), 0),
    'potential_profit', coalesce(sum(potential_profit) filter (where potential_unit_price is not null), 0),
    'unpriced_units', coalesce(sum(stock) filter (where potential_unit_price is null), 0),
    'estimated_units', coalesce(sum(stock) filter (where potential_is_estimated), 0),
    'weighted_avg_cost', case when sum(stock) > 0 then round(sum(stock_value) / sum(stock), 4) end
  )
  from public.report_inventory(p_filters)
$$;

-- Compras filtradas
create or replace function public.report_purchase_lines(p_filters jsonb default '{}'::jsonb)
returns setof public.v_purchase_lines
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  f jsonb := coalesce(p_filters, '{}'::jsonb);
  v_from date := private.date_or_null(f, 'from', 'La fecha desde');
  v_to date := private.date_or_null(f, 'to', 'La fecha hasta');
  v_po integer := private.int_or_null(f, 'purchase_order_number', 'El número de pedido');
  v_q text := private.txt(f, 'search');
begin
  perform public.require_admin();
  if v_from is not null and v_to is null then
    v_to := current_date;
  end if;
  return query
  select * from public.v_purchase_lines pl
   where (v_from is null or pl.order_date >= v_from)
     and (v_to is null or pl.order_date <= v_to)
     and (v_po is null or pl.order_number = v_po)
     and (private.uuid_or_null(f, 'supplier_id') is null or pl.supplier_id = private.uuid_or_null(f, 'supplier_id'))
     and (private.uuid_or_null(f, 'product_id') is null or pl.product_id = private.uuid_or_null(f, 'product_id'))
     and (private.txt(f, 'status') is null or pl.po_status::text = private.txt(f, 'status'))
     and (v_q is null or pl.product_name ilike '%' || v_q || '%')
   order by pl.order_number desc, pl.line_number;
end;
$$;

-- ---------------------------------------------------------------------
-- Dashboard
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today jsonb;
  v_inv jsonb;
  v_month_start date := date_trunc('month', current_date)::date;
  v_best jsonb;
  v_best_all jsonb;
  v_top jsonb;
  v_top_all jsonb;
  v_series jsonb;
  v_losses numeric;
  v_month jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
           'units', coalesce(sum(net_quantity), 0),
           'revenue', coalesce(sum(net_amount), 0),
           'orders', count(distinct sale_id),
           'profit', coalesce(sum(profit), 0))
    into v_today
    from public.v_sale_lines where sale_date = current_date;

  select jsonb_build_object(
           'units', coalesce(sum(net_quantity), 0),
           'revenue', coalesce(sum(net_amount), 0),
           'orders', count(distinct sale_id),
           'profit', coalesce(sum(profit), 0))
    into v_month
    from public.v_sale_lines where sale_date >= v_month_start;

  v_inv := public.report_inventory_summary('{}'::jsonb);

  select jsonb_build_object('name', responsible_name, 'revenue', sum(net_amount), 'units', sum(net_quantity))
    into v_best
    from public.v_sale_lines where sale_date >= v_month_start
   group by responsible_name order by sum(net_amount) desc limit 1;

  select jsonb_build_object('name', responsible_name, 'revenue', sum(net_amount), 'units', sum(net_quantity))
    into v_best_all
    from public.v_sale_lines
   group by responsible_name order by sum(net_amount) desc limit 1;

  select jsonb_build_object('name', product_name, 'units', sum(net_quantity), 'revenue', sum(net_amount))
    into v_top
    from public.v_sale_lines where sale_date >= v_month_start
   group by product_name order by sum(net_quantity) desc, sum(net_amount) desc limit 1;

  select jsonb_build_object('name', product_name, 'units', sum(net_quantity), 'revenue', sum(net_amount))
    into v_top_all
    from public.v_sale_lines
   group by product_name order by sum(net_quantity) desc, sum(net_amount) desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(m.month, 'YYYY-MM'),
           'revenue', coalesce(x.revenue, 0),
           'profit', coalesce(x.profit, 0),
           'orders', coalesce(x.orders, 0),
           'units', coalesce(x.units, 0)) order by m.month), '[]'::jsonb)
    into v_series
    from generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') as m(month)
    left join (
      select date_trunc('month', sale_date) as month,
             sum(net_amount) as revenue, sum(profit) as profit,
             count(distinct sale_id) as orders, sum(net_quantity) as units
        from public.v_sale_lines
       group by 1
    ) x on x.month = m.month;

  select coalesce(sum(cost_amount), 0) into v_losses
    from public.v_stock_exits where status = 'activa' and exit_date >= v_month_start;

  return jsonb_build_object(
    'today', v_today,
    'month', v_month,
    'inventory', v_inv,
    'best_seller_month', v_best,
    'best_seller_all', v_best_all,
    'top_product_month', v_top,
    'top_product_all', v_top_all,
    'monthly', v_series,
    'losses_month', v_losses,
    'pending_shipments', (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente'),
    'pending_reviews', (select count(*) from public.review_items where status = 'pendiente')
  );
end;
$$;

-- Resumen para el vendedor (solo sus ventas y sin costes)
create or replace function public.my_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resp uuid := public.current_responsible_id();
  v_month_start date := date_trunc('month', current_date)::date;
begin
  perform public.require_active_user();
  return (
    with lines as (
      select s.id as sale_id, s.sale_date, si.quantity, si.unit_price,
             coalesce((select sum(ri.quantity) from public.return_items ri where ri.sale_item_id = si.id), 0) as returned,
             coalesce((select sum(ri.refund_amount) from public.return_items ri where ri.sale_item_id = si.id), 0) as refunded
        from public.sales s
        join public.sale_items si on si.sale_id = s.id
       where s.status = 'activa' and s.responsible_id = v_resp
    )
    select jsonb_build_object(
      'linked', v_resp is not null,
      'today', jsonb_build_object(
        'units', coalesce(sum(quantity - returned) filter (where sale_date = current_date), 0),
        'revenue', coalesce(sum(quantity * unit_price - refunded) filter (where sale_date = current_date), 0),
        'orders', count(distinct sale_id) filter (where sale_date = current_date)),
      'month', jsonb_build_object(
        'units', coalesce(sum(quantity - returned) filter (where sale_date >= v_month_start), 0),
        'revenue', coalesce(sum(quantity * unit_price - refunded) filter (where sale_date >= v_month_start), 0),
        'orders', count(distinct sale_id) filter (where sale_date >= v_month_start)),
      'pending_shipments', (select count(*) from public.sales where status = 'activa' and responsible_id = v_resp and shipping_status = 'pendiente')
    )
    from lines
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Comprobación de integridad
-- ---------------------------------------------------------------------
create or replace function public.check_integrity()
returns table (check_name text, ok boolean, problems integer, detail text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.require_admin();

  return query
  select 'Stock de cada lote = suma de sus movimientos'::text,
         count(*) = 0, count(*)::integer,
         string_agg(private.lot_label(x.id) || ' (' || private.variant_label(x.variant_id) || ')', ', ')
    from (
      select l.id, l.variant_id
        from public.inventory_lots l
        left join public.inventory_movements m on m.lot_id = l.id
       group by l.id
      having l.quantity_available <> coalesce(sum(m.quantity), 0)
    ) x;

  return query
  select 'Cada línea recibida tiene su lote con la cantidad recibida'::text,
         count(*) = 0, count(*)::integer, string_agg('Pedido #' || po.order_number || ' línea ' || i.line_number, ', ')
    from public.purchase_order_items i
    join public.purchase_orders po on po.id = i.purchase_order_id
    left join public.inventory_lots l on l.purchase_order_item_id = i.id
   where i.status = 'recibido' and (l.id is null or l.quantity_initial <> i.quantity_received);

  return query
  select 'Cada línea de venta activa ha descontado su stock'::text,
         count(*) = 0, count(*)::integer, string_agg(s.sale_number, ', ')
    from public.sale_items si
    join public.sales s on s.id = si.sale_id and s.status = 'activa'
   where coalesce((select -sum(m.quantity) from public.inventory_movements m
                    where m.sale_item_id = si.id and m.movement_type = 'venta'), 0) <> si.quantity;

  return query
  select 'Las ventas anuladas han devuelto su stock'::text,
         count(*) = 0, count(*)::integer, string_agg(s.sale_number, ', ')
    from public.sale_items si
    join public.sales s on s.id = si.sale_id and s.status = 'anulada'
   where coalesce((select sum(m.quantity) from public.inventory_movements m where m.sale_item_id = si.id
                    and m.movement_type in ('venta', 'anulacion_venta')), 0) <> 0;

  return query
  select 'Las devoluciones con producto han vuelto al stock'::text,
         count(*) = 0, count(*)::integer, string_agg(ri.id::text, ', ')
    from public.return_items ri
   where ri.restocked
     and coalesce((select sum(m.quantity) from public.inventory_movements m where m.return_item_id = ri.id), 0) <> ri.quantity;

  return query
  select 'Ninguna variante con stock negativo'::text,
         count(*) = 0, count(*)::integer, null::text
    from public.inventory_lots where quantity_available < 0;

  return query
  select 'Pedidos recibidos con proveedor identificado'::text,
         count(*) = 0, count(*)::integer, string_agg('#' || po.order_number, ', ' order by po.order_number)
    from public.purchase_orders po
    join public.suppliers s on s.id = po.supplier_id
   where s.is_placeholder and po.status <> 'cancelado';
end;
$$;

-- >>> 20261008100400_storage.sql
-- =====================================================================
-- MaurInventario · Migración 5 · Supabase Storage
--   product-photos   → fotos de productos (privado: se ven con enlaces firmados)
--   shipping-labels  → etiquetas de envío de Vinted/Wallapop (privado)
--                      ruta: <id de la venta>/<nombre del archivo>
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-photos', 'product-photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('shipping-labels', 'shipping-labels', false, 10485760,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ¿Puede el usuario actual acceder a la etiqueta guardada en esta ruta?
create or replace function public.can_access_sale_label(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.sales s
         where s.id::text = split_part(p_object_name, '/', 1)
           and s.status = 'activa'
           and public.is_active_user()
           and s.responsible_id = public.current_responsible_id()
      )
$$;

-- Fotos de productos: las ve cualquier usuario activo; solo el admin las sube o borra
create policy "product_photos_select" on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and public.is_active_user());
create policy "product_photos_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and public.is_admin());
create policy "product_photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and public.is_admin())
  with check (bucket_id = 'product-photos' and public.is_admin());
create policy "product_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and public.is_admin());

-- Etiquetas de envío: el admin todas; el vendedor solo las de sus ventas
create policy "shipping_labels_select" on storage.objects for select to authenticated
  using (bucket_id = 'shipping-labels' and public.can_access_sale_label(name));
create policy "shipping_labels_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'shipping-labels' and public.can_access_sale_label(name));
create policy "shipping_labels_update" on storage.objects for update to authenticated
  using (bucket_id = 'shipping-labels' and public.can_access_sale_label(name))
  with check (bucket_id = 'shipping-labels' and public.can_access_sale_label(name));
create policy "shipping_labels_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'shipping-labels' and public.can_access_sale_label(name));

-- >>> 20261008100500_importacion.sql
-- =====================================================================
-- MaurInventario · Migración 6 · Importación de datos desde Excel
--
-- La aplicación lee el Excel, valida cada fila y envía aquí un "plan"
-- ya estructurado. Esta función lo guarda todo en UNA transacción.
-- Con p_dry_run = true hace la importación completa, calcula el
-- resultado y la comprobación de integridad, y después lo deshace todo
-- (simulación segura).
--
-- Nunca sobrescribe datos existentes:
--   · productos, responsables, categorías… existentes se reutilizan;
--   · un pedido de compra con un número que ya existe se omite;
--   · una venta/salida ya importada (misma huella) se omite.
-- =====================================================================

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
             (select case when is_called then last_value else last_value - 1 end from public.sale_number_seq)
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
    perform setval('public.purchase_order_number_seq', greatest(coalesce((select max(order_number) from public.purchase_orders), 1), 1));
    if v_next_sale > 1 then
      perform setval('public.sale_number_seq', v_next_sale - 1);
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

-- >>> 20261008100600_permisos_funciones.sql
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

-- >>> 20261009090000_envio_masivo.sql
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

-- >>> 20261009120000_busqueda_por_palabras.sql
-- =====================================================================
-- MaurInventario · Migración 9 · Buscador de productos por palabras
-- «Oakley Encoder» encuentra «Oakley - Encoder»: cada palabra se busca por
-- separado en nombre, variante, SKU, marca y categoría, en cualquier orden.
-- Solo sustituye la función de búsqueda (misma firma y permisos). No toca datos.
-- =====================================================================

create or replace function public.search_sellable_variants(
  p_query text default null,
  p_only_in_stock boolean default false,
  p_limit integer default 20,
  p_product_id uuid default null
)
returns table (
  variant_id uuid,
  product_id uuid,
  product_name text,
  variant_name text,
  variant_count integer,
  sku text,
  brand_name text,
  category_name text,
  stock integer,
  normal_sale_price numeric,
  photo_path text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(p_query), '');
  v_words text[] := case when nullif(trim(p_query), '') is null then '{}'::text[]
                         else regexp_split_to_array(lower(trim(p_query)), '\s+') end;
begin
  perform public.require_active_user();
  return query
  select v.id,
         pr.id,
         pr.name,
         v.name,
         (select count(*)::integer from public.product_variants v2 where v2.product_id = pr.id and v2.deleted_at is null),
         coalesce(v.sku, pr.sku),
         b.name,
         c.name,
         coalesce((select sum(l.quantity_available) from public.inventory_lots l where l.variant_id = v.id), 0)::integer,
         coalesce(v.normal_sale_price, pr.normal_sale_price),
         pr.photo_path
    from public.product_variants v
    join public.products pr on pr.id = v.product_id
    left join public.brands b on b.id = pr.brand_id
    left join public.categories c on c.id = pr.category_id
   where v.deleted_at is null and pr.deleted_at is null
     and (p_product_id is null or pr.id = p_product_id)
     and (
       v_q is null
       -- Cada palabra debe aparecer en algún dato (nombre, variante, SKU, marca o
       -- categoría), en cualquier orden: «oakley encoder» encuentra «Oakley - Encoder»
       or not exists (
         select 1 from unnest(v_words) w
          where strpos(lower(concat_ws(' ', pr.name, v.name, v.sku, pr.sku, b.name, c.name)), w) = 0
       )
     )
     and (
       not p_only_in_stock
       or exists (select 1 from public.inventory_lots l where l.variant_id = v.id and l.quantity_available > 0)
     )
   order by (exists (select 1 from public.inventory_lots l where l.variant_id = v.id and l.quantity_available > 0)) desc,
            pr.name, v.name
   limit least(greatest(coalesce(p_limit, 20), 1), 200);
end;
$$;

-- >>> 20261009150000_panel_negocio.sql
-- =====================================================================
-- MaurInventario · Migración 10 · Panel de negocio del Inicio
-- Una sola función de SOLO LECTURA (solo administrador) que reúne:
-- indicadores del mes con comparación, evolución mensual, rendimiento de
-- productos, antigüedad del stock y actividad reciente.
-- Usa exactamente los mismos criterios que el resto de la app:
--   · ventas y beneficio: v_sale_lines (ventas activas, devoluciones
--     descontadas, coste real del lote de cada unidad)
--   · valor del stock: report_inventory_summary (coste medio ponderado)
--   · actividad: inventory_movements (registro inmutable que ya existe)
-- No crea tablas ni modifica datos.
-- =====================================================================

create or replace function public.business_dashboard(p_months integer default 6)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := current_date;
  v_m0 date := date_trunc('month', current_date)::date;
  v_prev_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  -- Mismo tramo del mes anterior: del día 1 al mismo día (o al último día si ese mes es más corto)
  v_prev_end date;
  v_months integer := least(greatest(coalesce(p_months, 6), 1), 24);
  v_period_start date;
  v_cur jsonb;
  v_prev jsonb;
  v_today_stats jsonb;
  v_inv jsonb;
  v_then jsonb;
  v_series jsonb;
  v_top_profit jsonb;
  v_top_units jsonb;
  v_aging jsonb;
  v_recent jsonb;
begin
  perform public.require_admin();
  v_prev_end := least(v_prev_start + (v_today - v_m0), v_m0 - 1);
  v_period_start := (date_trunc('month', current_date) - make_interval(months => v_months - 1))::date;

  -- Indicadores de ventas (mes en curso, mismo tramo del mes anterior, hoy)
  select jsonb_build_object(
           'revenue', coalesce(sum(net_amount), 0),
           'cost', coalesce(sum(cost_amount), 0),
           'profit', coalesce(sum(profit), 0),
           'orders', count(distinct sale_id),
           'units', coalesce(sum(net_quantity), 0))
    into v_cur
    from public.v_sale_lines where sale_date between v_m0 and v_today;

  select jsonb_build_object(
           'revenue', coalesce(sum(net_amount), 0),
           'cost', coalesce(sum(cost_amount), 0),
           'profit', coalesce(sum(profit), 0),
           'orders', count(distinct sale_id),
           'units', coalesce(sum(net_quantity), 0))
    into v_prev
    from public.v_sale_lines where sale_date between v_prev_start and v_prev_end;

  select jsonb_build_object(
           'revenue', coalesce(sum(net_amount), 0),
           'profit', coalesce(sum(profit), 0),
           'orders', count(distinct sale_id))
    into v_today_stats
    from public.v_sale_lines where sale_date = v_today;

  -- Stock actual (mismo cálculo que Inventario)
  v_inv := public.report_inventory_summary('{}'::jsonb);

  -- Stock y capital al final del mismo día del mes anterior, reconstruidos
  -- deshaciendo los movimientos posteriores. Si algún lote no cuadra
  -- (cantidad negativa), no se da comparación.
  with lot_then as (
    select l.variant_id,
           l.unit_cost,
           l.quantity_available - coalesce((
             select sum(m.quantity) from public.inventory_movements m
              where m.lot_id = l.id and m.occurred_at > v_prev_end), 0) as qty
      from public.inventory_lots l
  ), per_variant as (
    select variant_id, sum(qty) as qty, round(sum(qty * unit_cost), 2) as value
      from lot_then group by variant_id
  )
  select case when exists (select 1 from lot_then where qty < 0) then null
              else jsonb_build_object('units', coalesce(sum(qty), 0), 'stock_value', coalesce(sum(value), 0)) end
    into v_then
    from per_variant;

  -- Evolución mensual
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(m.month, 'YYYY-MM'),
           'revenue', coalesce(x.revenue, 0),
           'profit', coalesce(x.profit, 0),
           'orders', coalesce(x.orders, 0),
           'units', coalesce(x.units, 0)) order by m.month), '[]'::jsonb)
    into v_series
    from generate_series(v_period_start, v_m0, interval '1 month') as m(month)
    left join (
      select date_trunc('month', sale_date) as month,
             sum(net_amount) as revenue, sum(profit) as profit,
             count(distinct sale_id) as orders, sum(net_quantity) as units
        from public.v_sale_lines
       where sale_date >= v_period_start
       group by 1
    ) x on x.month = m.month;

  -- Productos más rentables y más vendidos del periodo
  select coalesce(jsonb_agg(t order by t.profit desc), '[]'::jsonb) into v_top_profit
    from (
      select product_id, product_name, sum(profit) as profit, sum(net_amount) as revenue, sum(net_quantity) as units
        from public.v_sale_lines where sale_date >= v_period_start
       group by product_id, product_name
      having sum(profit) > 0
       order by sum(profit) desc, product_name
       limit 5
    ) t;

  select coalesce(jsonb_agg(t order by t.units desc, t.revenue desc), '[]'::jsonb) into v_top_units
    from (
      select product_id, product_name, sum(net_quantity) as units, sum(net_amount) as revenue, sum(profit) as profit
        from public.v_sale_lines where sale_date >= v_period_start
       group by product_id, product_name
      having sum(net_quantity) > 0
       order by sum(net_quantity) desc, sum(net_amount) desc, product_name
       limit 5
    ) t;

  -- Lotes con unidades que más tiempo llevan en el almacén (fecha de recepción del lote)
  select coalesce(jsonb_agg(t order by t.received_at, t.product_name), '[]'::jsonb) into v_aging
    from (
      select v.product_id, p.name as product_name, v.name as variant_name,
             case when l.origin = 'compra' then 'Pedido #' || po.order_number
                  else 'Ajuste ' || to_char(l.received_at, 'DD/MM/YYYY') end as lot_label,
             l.received_at, (v_today - l.received_at) as days,
             l.quantity_available as units, round(l.quantity_available * l.unit_cost, 2) as value
        from public.inventory_lots l
        join public.product_variants v on v.id = l.variant_id
        join public.products p on p.id = v.product_id
        left join public.purchase_orders po on po.id = l.purchase_order_id
       where l.quantity_available > 0 and p.deleted_at is null
       order by l.received_at, p.name
       limit 5
    ) t;

  -- Actividad reciente: últimos movimientos de stock registrados
  select coalesce(jsonb_agg(t order by t.created_at desc, t.occurred_at desc), '[]'::jsonb) into v_recent
    from (
      select id, movement_type, occurred_at, created_at, quantity, product_id, product_name, variant_name,
             lot_label, sale_id, sale_number, purchase_order_id, purchase_order_number, exit_reason, responsible_name
        from public.v_movements
       order by created_at desc, occurred_at desc
       limit 8
    ) t;

  return jsonb_build_object(
    'today', v_today,
    'month_start', v_m0,
    'prev_start', v_prev_start,
    'prev_end', v_prev_end,
    'months', v_months,
    'current', v_cur,
    'previous', v_prev,
    'today_stats', v_today_stats,
    'inventory', v_inv,
    'inventory_then', v_then,
    'series', v_series,
    'top_profit', v_top_profit,
    'top_units', v_top_units,
    'aging', v_aging,
    'recent', v_recent,
    'pending_shipments', (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente'),
    'pending_reviews', (select count(*) from public.review_items where status = 'pendiente')
  );
end;
$$;

revoke execute on function public.business_dashboard(integer) from public, anon;
grant execute on function public.business_dashboard(integer) to authenticated, service_role;

-- >>> 20261010090000_ventas_por_correo.sql
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

-- >>> 20261010120000_ventas_detectadas.sql
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

-- >>> 20261010150000_fotos_y_anuncios.sql
-- =====================================================================
-- MaurInventario · Migración 13 · Fotos por producto y anuncios
--
--   · product_photos: varias fotos por producto, con orden. La primera es
--     la portada (se copia a products.photo_path para las miniaturas).
--   · photo_uses: qué fotos se han usado ya en Vinted o Wallapop.
--   · listings: el anuncio de cada producto en cada plataforma (borrador,
--     publicado o retirado), con su título, texto y precio.
-- Solo añade tablas. No borra ni modifica datos existentes (salvo copiar la
-- foto actual de cada producto, si la tiene, a la nueva galería).
-- =====================================================================

create table if not exists public.product_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  path text not null unique,
  position integer not null default 0,
  width integer,
  height integer,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists product_photos_product_idx on public.product_photos (product_id, position);
alter table public.product_photos enable row level security;
create policy product_photos_read on public.product_photos for select to authenticated using (public.is_active_user());
create policy product_photos_admin on public.product_photos for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- La foto que ya tuviera cada producto pasa a ser la primera de su galería
insert into public.product_photos (product_id, path, position)
select id, photo_path, 0 from public.products where photo_path is not null
on conflict (path) do nothing;

create table if not exists public.photo_uses (
  photo_id uuid not null references public.product_photos (id) on delete cascade,
  platform text not null check (platform in ('vinted', 'wallapop')),
  used_at timestamptz not null default now(),
  primary key (photo_id, platform)
);
alter table public.photo_uses enable row level security;
create policy photo_uses_read on public.photo_uses for select to authenticated using (public.is_active_user());
create policy photo_uses_admin on public.photo_uses for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  platform text not null check (platform in ('vinted', 'wallapop')),
  status text not null default 'borrador' check (status in ('borrador', 'publicado', 'retirado')),
  title text,
  description text,
  price numeric(12,2) check (price is null or price >= 0),
  url text check (url is null or url ~* '^https?://'),
  published_at timestamptz,
  removed_at timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, platform)
);
create index if not exists listings_status_idx on public.listings (status);
alter table public.listings enable row level security;
create policy listings_read on public.listings for select to authenticated using (public.is_active_user());
create policy listings_admin on public.listings for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['product_photos', 'listings'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_audit') then
      execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row_change()', t || '_audit', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Historial de precios de un producto (solo ventas reales activas)
-- ---------------------------------------------------------------------
create or replace function public.product_price_history(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select si.unit_price::numeric as price, s.sale_date, p.name as platform,
           (s.sale_date - coalesce((select min(l.received_at)::date from public.inventory_lots l where l.id = si.lot_id), s.sale_date)) as days_in_stock
      from public.sale_items si
      join public.sales s on s.id = si.sale_id and s.status = 'activa'
      join public.product_variants v on v.id = si.variant_id
      join public.platforms p on p.id = s.platform_id
     where v.product_id = p_product_id
  )
  select case when not public.is_active_user() then null else jsonb_build_object(
    'count', (select count(*) from lines),
    'avg', (select round(avg(price), 2) from lines),
    'min', (select min(price) from lines),
    'max', (select max(price) from lines),
    'avg_days', (select round(avg(days_in_stock)) from lines),
    'by_platform', coalesce((select jsonb_object_agg(platform, jsonb_build_object('count', n, 'avg', a)) from (select platform, count(*) n, round(avg(price), 2) a from lines group by platform) x), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('date', sale_date, 'price', price, 'platform', platform) order by sale_date desc) from (select * from lines order by sale_date desc limit 8) r), '[]'::jsonb),
    'avg_cost', (select round(sum(l.unit_cost * l.quantity_available) / nullif(sum(l.quantity_available), 0), 2)
                   from public.v_lots l where l.product_id = p_product_id and l.quantity_available > 0)
  ) end
$$;
revoke execute on function public.product_price_history(uuid) from public, anon;
grant execute on function public.product_price_history(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Anuncios publicados de productos que ya no tienen stock (hay que quitarlos)
-- ---------------------------------------------------------------------
create or replace view public.v_listings_to_remove with (security_invoker = true) as
select l.id, l.product_id, l.platform, l.url, l.published_at, pi.product_name, pi.photo_path
  from public.listings l
  join public.v_product_inventory pi on pi.product_id = l.product_id
 where l.status = 'publicado' and coalesce(pi.stock, 0) = 0;
grant select on public.v_listings_to_remove to authenticated;

-- >>> 20261010200000_seguridad.sql
-- =====================================================================
-- MaurInventario · Migración 14 · Seguridad
--   · product_price_history: el vendedor ya no ve el coste de compra ni
--     las ventas de otros (solo las suyas). El administrador, todo.
--   · ai_usage + ai_usage_take: límite diario del generador de
--     descripciones por usuario (día de Madrid).
-- Solo crea o reemplaza funciones y añade una tabla. No toca datos.
-- =====================================================================

create or replace function public.product_price_history(p_product_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lines as (
    select si.unit_price::numeric as price, s.sale_date, p.name as platform,
           (s.sale_date - coalesce((select min(l.received_at)::date from public.inventory_lots l where l.id = si.lot_id), s.sale_date)) as days_in_stock
      from public.sale_items si
      join public.sales s on s.id = si.sale_id and s.status = 'activa'
      join public.product_variants v on v.id = si.variant_id
      join public.platforms p on p.id = s.platform_id
     where v.product_id = p_product_id
       and (public.is_admin() or s.responsible_id = public.current_responsible_id())
  )
  select case when not public.is_active_user() then null else jsonb_build_object(
    'count', (select count(*) from lines),
    'avg', (select round(avg(price), 2) from lines),
    'min', (select min(price) from lines),
    'max', (select max(price) from lines),
    'avg_days', (select round(avg(days_in_stock)) from lines),
    'by_platform', coalesce((select jsonb_object_agg(platform, jsonb_build_object('count', n, 'avg', a)) from (select platform, count(*) n, round(avg(price), 2) a from lines group by platform) x), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('date', sale_date, 'price', price, 'platform', platform) order by sale_date desc) from (select * from lines order by sale_date desc limit 8) r), '[]'::jsonb),
    'avg_cost', case when public.is_admin() then
                  (select round(sum(l.unit_cost * l.quantity_available) / nullif(sum(l.quantity_available), 0), 2)
                     from public.v_lots l where l.product_id = p_product_id and l.quantity_available > 0)
                end
  ) end
$$;
revoke execute on function public.product_price_history(uuid) from public, anon;
grant execute on function public.product_price_history(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Límite diario del generador (por usuario y día de Madrid)
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  uses integer not null default 0 check (uses >= 0),
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

-- Suma p_units si no se pasa del límite. Devuelve si lo ha sumado.
create or replace function public.ai_usage_take(p_units integer, p_limit integer default 60)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Europe/Madrid')::date;
  v_ok boolean;
begin
  perform public.require_active_user();
  if p_units is null or p_units < 1 or p_units > p_limit then
    return false;
  end if;
  insert into public.ai_usage as u (user_id, day, uses)
  values (auth.uid(), v_day, p_units)
  on conflict (user_id, day) do update
     set uses = u.uses + excluded.uses
   where u.uses + excluded.uses <= p_limit
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;
revoke execute on function public.ai_usage_take(integer, integer) from public, anon;
grant execute on function public.ai_usage_take(integer, integer) to authenticated;

-- Devuelve cupo cuando la IA no ha podido generar (fallo del servicio).
-- Solo la usa el servidor (clave de servicio): si la pudiera llamar el
-- usuario, se saltaría el límite. Nunca baja de 0.
create or replace function public.ai_usage_refund(p_user uuid, p_units integer)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ai_usage
     set uses = greatest(uses - p_units, 0)
   where user_id = p_user and day = (now() at time zone 'Europe/Madrid')::date and coalesce(p_units, 0) > 0
$$;
revoke execute on function public.ai_usage_refund(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_usage_refund(uuid, integer) to service_role;

-- >>> 20261011090000_rapidez_y_fallos.sql
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

-- >>> 20261011120000_ajustes_y_widgets.sql
-- =====================================================================
-- MaurInventario · Migración 16 · Ajustes personales y panel por widgets
--   · user_preferences: las preferencias de cada usuario (panel, aspecto,
--     tablas, avisos…). Cada uno solo ve y cambia las suyas.
--   · dashboard_widgets: datos reales para los widgets del inicio por
--     periodo (día, semana, mes, año) y plataforma. Solo lectura.
--   · low_stock_count: productos con poco stock (aviso opcional).
--   · log_user_event / my_activity: historial de operaciones del usuario
--     (exportaciones, copias, cambios de ajustes) sin datos internos.
-- Solo añade una tabla vacía y funciones. No borra ni cambia datos.
-- =====================================================================

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 32768),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
create policy user_preferences_own on public.user_preferences for all to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());
revoke all on public.user_preferences from anon;
grant select, insert, update, delete on public.user_preferences to authenticated;

-- ---------------------------------------------------------------------
-- Datos del panel por widgets (solo administrador)
--   p_period: 'dia' | 'semana' | 'mes' | 'anio' (hasta hoy) y el mismo
--   tramo del periodo anterior para comparar.
--   p_platform: plataforma (null = todas). Mismos criterios que el resto
--   de la app: v_sale_lines (devoluciones descontadas, coste real del lote).
-- ---------------------------------------------------------------------
create or replace function public.dashboard_widgets(p_period text default 'mes', p_platform uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_today date := current_date;
  v_period text := case when p_period in ('dia', 'semana', 'mes', 'anio') then p_period else 'mes' end;
  v_start date;
  v_prev_start date;
  v_prev_end date;
  v_cur jsonb;
  v_prev jsonb;
  v_platforms jsonb;
  v_top_units jsonb;
  v_top_profit jsonb;
  v_daily jsonb;
  v_weekly jsonb;
  v_monthly jsonb;
begin
  perform public.require_admin();
  v_start := case v_period
    when 'dia' then v_today
    when 'semana' then date_trunc('week', v_today)::date
    when 'mes' then date_trunc('month', v_today)::date
    else date_trunc('year', v_today)::date end;
  v_prev_start := case v_period
    when 'dia' then v_today - 1
    when 'semana' then v_start - 7
    when 'mes' then (v_start - interval '1 month')::date
    else (v_start - interval '1 year')::date end;
  -- Mismo número de días que el periodo actual (sin pasar del periodo anterior)
  v_prev_end := least(v_prev_start + (v_today - v_start), v_start - 1);

  with l as (
    select * from public.v_sale_lines
     where sale_date between v_prev_start and v_today
       and (p_platform is null or platform_id = p_platform))
  select jsonb_build_object(
           'revenue', coalesce(sum(net_amount) filter (where sale_date >= v_start), 0),
           'cost', coalesce(sum(cost_amount) filter (where sale_date >= v_start), 0),
           'profit', coalesce(sum(profit) filter (where sale_date >= v_start), 0),
           'orders', count(distinct sale_id) filter (where sale_date >= v_start),
           'units', coalesce(sum(net_quantity) filter (where sale_date >= v_start), 0)),
         jsonb_build_object(
           'revenue', coalesce(sum(net_amount) filter (where sale_date <= v_prev_end), 0),
           'cost', coalesce(sum(cost_amount) filter (where sale_date <= v_prev_end), 0),
           'profit', coalesce(sum(profit) filter (where sale_date <= v_prev_end), 0),
           'orders', count(distinct sale_id) filter (where sale_date <= v_prev_end),
           'units', coalesce(sum(net_quantity) filter (where sale_date <= v_prev_end), 0))
    into v_cur, v_prev
    from l;

  select coalesce(jsonb_agg(t order by t.revenue desc, t.platform_name), '[]'::jsonb) into v_platforms
    from (
      select platform_id, platform_name, count(distinct sale_id) as orders, sum(net_quantity) as units,
             sum(net_amount) as revenue, sum(profit) as profit
        from public.v_sale_lines
       where sale_date between v_start and v_today and (p_platform is null or platform_id = p_platform)
       group by platform_id, platform_name
    ) t;

  select coalesce(jsonb_agg(t order by t.units desc, t.revenue desc), '[]'::jsonb) into v_top_units
    from (
      select product_id, product_name, sum(net_quantity) as units, sum(net_amount) as revenue, sum(profit) as profit
        from public.v_sale_lines
       where sale_date between v_start and v_today and (p_platform is null or platform_id = p_platform)
       group by product_id, product_name
      having sum(net_quantity) > 0
       order by sum(net_quantity) desc, sum(net_amount) desc, product_name
       limit 8
    ) t;

  select coalesce(jsonb_agg(t order by t.profit desc), '[]'::jsonb) into v_top_profit
    from (
      select product_id, product_name, sum(net_quantity) as units, sum(net_amount) as revenue,
             sum(cost_amount) as cost, sum(profit) as profit
        from public.v_sale_lines
       where sale_date between v_start and v_today and (p_platform is null or platform_id = p_platform)
       group by product_id, product_name
      having sum(net_amount) <> 0
       order by sum(profit) desc, product_name
       limit 8
    ) t;

  -- Evolución: últimos 30 días, últimas 12 semanas y últimos 12 meses
  select coalesce(jsonb_agg(jsonb_build_object('key', to_char(d.day, 'YYYY-MM-DD'), 'revenue', coalesce(x.revenue, 0),
           'profit', coalesce(x.profit, 0), 'orders', coalesce(x.orders, 0), 'units', coalesce(x.units, 0)) order by d.day), '[]'::jsonb)
    into v_daily
    from generate_series(v_today - 29, v_today, interval '1 day') d(day)
    left join (select sale_date as day, sum(net_amount) revenue, sum(profit) profit, count(distinct sale_id) orders, sum(net_quantity) units
                 from public.v_sale_lines where sale_date >= v_today - 29 and (p_platform is null or platform_id = p_platform)
                group by sale_date) x on x.day = d.day::date;

  select coalesce(jsonb_agg(jsonb_build_object('key', to_char(w.week, 'YYYY-MM-DD'), 'revenue', coalesce(x.revenue, 0),
           'profit', coalesce(x.profit, 0), 'orders', coalesce(x.orders, 0), 'units', coalesce(x.units, 0)) order by w.week), '[]'::jsonb)
    into v_weekly
    from generate_series(date_trunc('week', v_today) - interval '11 weeks', date_trunc('week', v_today), interval '1 week') w(week)
    left join (select date_trunc('week', sale_date) as week, sum(net_amount) revenue, sum(profit) profit, count(distinct sale_id) orders, sum(net_quantity) units
                 from public.v_sale_lines where sale_date >= (date_trunc('week', v_today) - interval '11 weeks')::date and (p_platform is null or platform_id = p_platform)
                group by 1) x on x.week = w.week;

  select coalesce(jsonb_agg(jsonb_build_object('key', to_char(m.month, 'YYYY-MM'), 'revenue', coalesce(x.revenue, 0),
           'profit', coalesce(x.profit, 0), 'orders', coalesce(x.orders, 0), 'units', coalesce(x.units, 0)) order by m.month), '[]'::jsonb)
    into v_monthly
    from generate_series(date_trunc('month', v_today) - interval '11 months', date_trunc('month', v_today), interval '1 month') m(month)
    left join (select date_trunc('month', sale_date) as month, sum(net_amount) revenue, sum(profit) profit, count(distinct sale_id) orders, sum(net_quantity) units
                 from public.v_sale_lines where sale_date >= (date_trunc('month', v_today) - interval '11 months')::date and (p_platform is null or platform_id = p_platform)
                group by 1) x on x.month = m.month;

  return jsonb_build_object(
    'period', v_period,
    'start', v_start, 'end', v_today,
    'prev_start', v_prev_start, 'prev_end', v_prev_end,
    'current', v_cur,
    'previous', v_prev,
    'platforms', v_platforms,
    'top_units', v_top_units,
    'top_profit', v_top_profit,
    'series', jsonb_build_object('dia', v_daily, 'semana', v_weekly, 'mes', v_monthly),
    'inventory', public.report_inventory_summary('{}'::jsonb),
    'pending_shipments', (select count(*) from public.sales where status = 'activa' and shipping_status = 'pendiente'));
end;
$$;
revoke execute on function public.dashboard_widgets(text, uuid) from public, anon;
grant execute on function public.dashboard_widgets(text, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Productos con poco stock (entre 1 y el umbral). Solo administrador.
-- ---------------------------------------------------------------------
create or replace function public.low_stock_count(p_threshold integer)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select case when public.is_admin() then
    (select count(*)::integer from public.v_product_inventory
      where coalesce(stock, 0) between 1 and greatest(1, least(coalesce(p_threshold, 1), 1000)))
  else 0 end;
$$;
revoke execute on function public.low_stock_count(integer) from public, anon;
grant execute on function public.low_stock_count(integer) to authenticated;

-- ---------------------------------------------------------------------
-- Historial de operaciones del usuario (sin datos internos)
-- ---------------------------------------------------------------------
create or replace function public.log_user_event(p_action text, p_summary text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_active_user();
  if p_action not in ('exportar', 'copia_seguridad', 'comprobar_copia', 'preferencias', 'restablecer_preferencias', 'cerrar_sesiones', 'exportar_mis_datos') then
    raise exception 'Operación no válida.';
  end if;
  perform public.log_action(p_action, 'ajustes', auth.uid()::text, left(coalesce(p_summary, ''), 300), null);
end;
$$;
revoke execute on function public.log_user_event(text, text) from public, anon;
grant execute on function public.log_user_event(text, text) to authenticated;

create or replace function public.my_activity(p_limit integer default 50)
returns table (occurred_at timestamptz, action text, entity text, summary text)
language sql
stable
security definer
set search_path = public
as $$
  select a.occurred_at, a.action, a.entity, a.summary
    from public.audit_log a
   where a.user_id = auth.uid() and a.summary is not null and public.is_active_user()
   order by a.occurred_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke execute on function public.my_activity(integer) from public, anon;
grant execute on function public.my_activity(integer) to authenticated;

-- >>> 20261012090000_multiinquilino.sql
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
-- Para cambiar el propietario, el nuevo tiene que poder crear en el esquema
-- (en Supabase «postgres» no es superusuario). Se quita justo después.
grant create on schema public, private to mi_definer;
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
revoke create on schema public, private from mi_definer;

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

-- >>> 20261013090000_rendimiento_saas.sql
-- =====================================================================
-- MaurInventario · Migración 18 · Rapidez de la versión SaaS
-- Las reglas de acceso llamaban a funciones como current_org_id() o
-- is_admin() UNA VEZ POR FILA. Envolviéndolas en (SELECT …) PostgreSQL
-- las calcula una sola vez por consulta. Mismas reglas, mismo resultado.
-- No cambia ni borra datos.
-- =====================================================================
do $$
declare
  p record;
  v_using text;
  v_check text;
  rx constant text := '\m(auth\.uid|current_org_id|current_org_role|current_app_role|current_responsible_id|is_admin|is_warehouse|is_active_user|is_platform_admin)\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual ~ rx or with_check ~ rx)
  loop
    v_using := case when p.qual is null then null else regexp_replace(p.qual, rx, '(SELECT \1())', 'g') end;
    v_check := case when p.with_check is null then null else regexp_replace(p.with_check, rx, '(SELECT \1())', 'g') end;
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || coalesce(' using (' || v_using || ')', '')
      || coalesce(' with check (' || v_check || ')', '');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Todo lo que cada pantalla necesita saber del usuario, en UNA consulta
-- (antes eran cinco): perfil, espacio activo con su suscripción, ficha de
-- responsable, si es dueño de la plataforma y sus espacios.
-- ---------------------------------------------------------------------
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
    'orgs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name)), '[]'::jsonb) from public.my_organizations() o))
  where auth.uid() is not null
$$;
revoke execute on function public.session_context() from public, anon;
grant execute on function public.session_context() to authenticated;

-- Registro de migraciones aplicadas (para que la CLI de Supabase sepa que ya están)
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values
  ('20261008100000', 'esquema_base'),
  ('20261008100100', 'seguridad_y_auditoria'),
  ('20261008100200', 'logica_de_negocio'),
  ('20261008100300', 'informes'),
  ('20261008100400', 'storage'),
  ('20261008100500', 'importacion'),
  ('20261008100600', 'permisos_funciones'),
  ('20261009090000', 'envio_masivo'),
  ('20261009120000', 'busqueda_por_palabras'),
  ('20261009150000', 'panel_negocio'),
  ('20261010090000', 'ventas_por_correo'),
  ('20261010120000', 'ventas_detectadas'),
  ('20261010150000', 'fotos_y_anuncios'),
  ('20261010200000', 'seguridad'),
  ('20261011090000', 'rapidez_y_fallos'),
  ('20261011120000', 'ajustes_y_widgets'),
  ('20261012090000', 'multiinquilino'),
  ('20261013090000', 'rendimiento_saas')
on conflict (version) do nothing;

commit;

-- Si ves «Success. No rows returned», la base de datos está lista.
