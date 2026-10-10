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
