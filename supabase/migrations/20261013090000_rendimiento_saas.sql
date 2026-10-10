-- =====================================================================
-- MaurInventario · Migración 18 · Rapidez de la versión SaaS
-- Las reglas de acceso llamaban a funciones como current_org_id() o
-- is_admin() UNA VEZ POR FILA. Envolviéndolas en (SELECT …) PostgreSQL
-- las calcula una sola vez por consulta. Mismas reglas, mismo resultado.
-- No cambia ni borra datos.
-- =====================================================================
do $$
declare
  p record;
  v_using text;
  v_check text;
  rx constant text := '\m(auth\.uid|current_org_id|current_org_role|current_app_role|current_responsible_id|is_admin|is_warehouse|is_active_user|is_platform_admin)\(\)';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual ~ rx or with_check ~ rx)
  loop
    v_using := case when p.qual is null then null else regexp_replace(p.qual, rx, '(SELECT \1())', 'g') end;
    v_check := case when p.with_check is null then null else regexp_replace(p.with_check, rx, '(SELECT \1())', 'g') end;
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || coalesce(' using (' || v_using || ')', '')
      || coalesce(' with check (' || v_check || ')', '');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Todo lo que cada pantalla necesita saber del usuario, en UNA consulta
-- (antes eran cinco): perfil, espacio activo con su suscripción, ficha de
-- responsable, si es dueño de la plataforma y sus espacios.
-- ---------------------------------------------------------------------
create or replace function public.session_context()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name, 'active', p.active)
                  from public.profiles p where p.id = auth.uid()),
    'org', public.current_org_info(),
    'responsible', (select jsonb_build_object('id', r.id, 'name', r.name)
                      from public.responsibles r where r.id = public.current_responsible_id()),
    'platform_admin', public.is_platform_admin(),
    'orgs', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name)), '[]'::jsonb) from public.my_organizations() o))
  where auth.uid() is not null
$$;
revoke execute on function public.session_context() from public, anon;
grant execute on function public.session_context() to authenticated;
