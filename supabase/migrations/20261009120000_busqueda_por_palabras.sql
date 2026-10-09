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
