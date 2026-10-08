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
