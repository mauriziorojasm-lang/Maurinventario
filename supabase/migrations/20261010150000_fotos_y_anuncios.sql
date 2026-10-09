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
