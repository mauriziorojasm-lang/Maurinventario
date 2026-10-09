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
