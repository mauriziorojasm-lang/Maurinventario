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
