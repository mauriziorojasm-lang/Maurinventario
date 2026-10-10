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
