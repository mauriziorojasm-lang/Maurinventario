-- =====================================================================
-- Resellap · Migración 17 · Cambio de marca (antes MaurInventario)
-- ---------------------------------------------------------------------
-- · La tarea automática del correo pasa a llamarse «resellap-correo».
-- · El estado de la conexión reconoce los dos nombres, para que nada se
--   rompa mientras se aplica el cambio.
-- No toca datos.
-- =====================================================================

create or replace function public.email_integration_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.email_integration%rowtype;
  v_cron boolean := false;
begin
  perform public.require_admin();
  select * into i from public.email_integration where id;
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'select exists (select 1 from cron.job where jobname in (''resellap-correo'', ''maurinventario-correo'') and active)' into v_cron;
  end if;
  return jsonb_build_object(
    'email', i.email,
    'status', i.status,
    'connected', i.refresh_token_enc is not null,
    'last_error', i.last_error,
    'last_sync_at', i.last_sync_at,
    'last_success_at', i.last_success_at,
    'last_summary', i.last_summary,
    'connected_at', i.connected_at,
    'default_responsible_id', i.default_responsible_id,
    'app_url', i.app_url,
    'cron_active', v_cron
  );
end;
$$;

-- Renombrar la tarea programada (solo donde existe pg_cron, es decir, en Supabase)
do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'maurinventario-correo') then
      perform cron.unschedule('maurinventario-correo');
      perform cron.schedule('resellap-correo', '*/5 * * * *', 'select private.email_cron_tick()');
    end if;
  end if;
end
$cron$;
