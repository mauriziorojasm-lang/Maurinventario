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
