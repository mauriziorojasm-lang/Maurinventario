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
