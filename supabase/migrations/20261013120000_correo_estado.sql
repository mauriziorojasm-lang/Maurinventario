-- =====================================================================
-- MaurInventario · Ventas por correo: el estado de Gmail salía como
-- «Sin conectar» en la versión SaaS. La función que lo lee ya no tiene
-- privilegios especiales y no podía consultar el aviso automático de
-- Supabase (pg_cron). Ahora lo pregunta a una función de confianza que
-- solo devuelve sí/no. No cambia datos.
-- =====================================================================
create or replace function private.email_cron_active()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean := false;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute 'select exists (select 1 from cron.job where jobname = ''maurinventario-correo'' and active)' into v;
    exception when others then
      v := false;
    end;
  end if;
  return coalesce(v, false);
end;
$$;
revoke execute on function private.email_cron_active() from public, anon, authenticated;
grant execute on function private.email_cron_active() to mi_definer;

do $$
declare
  v_def text := pg_get_functiondef('public.email_integration_status()'::regprocedure);
  v_from text := $f$  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'select exists (select 1 from cron.job where jobname = ''maurinventario-correo'' and active)' into v_cron;
  end if;$f$;
begin
  if position(v_from in v_def) = 0 then
    raise exception 'No se encuentra la consulta de pg_cron en email_integration_status';
  end if;
  execute replace(v_def, v_from, '  v_cron := private.email_cron_active();');
end $$;
