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
