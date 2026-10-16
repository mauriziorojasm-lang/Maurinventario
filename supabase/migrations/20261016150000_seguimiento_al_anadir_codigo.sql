-- Seguimiento: al añadir a mano el código de una venta, entra en «Seguimiento» aunque la
-- venta ya estuviera marcada como enviada antes de que existiera la hora de envío.

-- 1. El primer movimiento («Marcado como enviado en Resellap») también cuando solo se pone la hora de envío
drop trigger if exists sales_shipping_event on public.sales;
create trigger sales_shipping_event after insert or update of shipping_status, shipped_at on public.sales
  for each row execute function private.sales_shipping_event();

-- 2. Código puesto a mano: la venta pasa a enviada y empieza el seguimiento
create or replace function public.update_tracking(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sales%rowtype := private.require_shipping_access(private.uuid_or_null(p, 'id'));
  v_number text;
  v_status text := nullif(p ->> 'status', '');
begin
  if s.status <> 'activa' then
    raise exception 'La venta está anulada.';
  end if;
  if p ? 'tracking_number' then
    v_number := nullif(upper(regexp_replace(coalesce(p ->> 'tracking_number', ''), '\s+', '', 'g')), '');
    if v_number is not null and v_number !~ '^[A-Z0-9-]{4,40}$' then
      raise exception 'El código de seguimiento solo puede tener letras, números y guiones (de 4 a 40).';
    end if;
    if v_number is distinct from s.tracking_number then
      update public.sales
         set tracking_number = v_number, tracking_registered_at = null, tracking_error = null, tracking_checked_at = null
       where id = s.id;
    end if;
    -- Con código, el paquete ya está en camino
    if v_number is not null and s.shipped_at is null and s.delivered_at is null then
      if s.shipping_status is distinct from 'enviado' then
        update public.sales set shipping_status = 'enviado' where id = s.id;  -- el aviso pone la hora y el estado
      else
        -- Marcada como enviada antes de guardar la hora de envío: el seguimiento empieza ahora
        update public.sales
           set shipped_at = now(),
               tracking_status = case when tracking_status is null or tracking_status = 'pendiente' then 'enviado' else tracking_status end,
               tracking_status_at = case when tracking_status is null or tracking_status = 'pendiente' then now() else tracking_status_at end
         where id = s.id;
      end if;
      s.shipping_status := 'enviado';
      s.shipped_at := now();
    end if;
  end if;
  if p ? 'carrier_id' then
    if private.uuid_or_null(p, 'carrier_id') is not null
       and not exists (select 1 from public.carriers where id = private.uuid_or_null(p, 'carrier_id')) then
      raise exception 'El transportista no existe.';
    end if;
    update public.sales set carrier_id = private.uuid_or_null(p, 'carrier_id') where id = s.id;
  end if;
  if v_status is not null then
    if s.shipped_at is null and s.shipping_status <> 'enviado' then
      raise exception 'Primero marca la venta como enviada.';
    end if;
    perform private.tracking_set_status(s.id, v_status, nullif(p ->> 'note', ''), null, now(), 'manual');
  end if;
end;
$$;

-- 3. Ventas que ya tienen código y estaban marcadas como enviadas sin hora: entran en «Seguimiento»
update public.sales
   set shipped_at = now(),
       tracking_status = case when tracking_status is null or tracking_status = 'pendiente' then 'enviado' else tracking_status end,
       tracking_status_at = case when tracking_status is null or tracking_status = 'pendiente' then now() else tracking_status_at end
 where status = 'activa' and shipping_status = 'enviado' and shipped_at is null and delivered_at is null
   and tracking_number is not null;
