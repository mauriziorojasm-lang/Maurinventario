\set ON_ERROR_STOP 1
-- correos de venta: 2 registrados (con etiqueta) + 3 pendientes de confirmar
create temp table em as
with v as (select pv.id vid, p.name pname, pv.name vname from product_variants pv join products p on p.id = pv.product_id)
select * from (values
 ('gm-1', '2026-10-09 18:12+02'::timestamptz, 'vinted', 'Oakley HSTN', 52::numeric, 'mecias8', 'registrar'),
 ('gm-2', '2026-10-10 10:41+02', 'vinted', 'Adidas Samba OG', 89, 'sara.vnt', 'registrar'),
 ('gm-3', '2026-10-11 01:41+02', 'vinted', 'Oakley HSTN', 55, 'jorge_m91', 'detectada'),
 ('gm-4', '2026-10-11 01:43+02', 'wallapop', 'Oakley Encoder', 62, 'lucia_rv', 'detectada'),
 ('gm-5', '2026-10-11 01:52+02', 'vinted', 'Stanley Quencher 1,18 L', 34, 'paula.rz', 'detectada')
) t(gid, at, plat, prod, price, buyer, action);
insert into email_messages (gmail_message_id, received_at, from_address, subject, platform, kind, status, parsed, variant_id, processed_at)
select gid, at, case when plat = 'vinted' then 'no-reply@vinted.es' else 'no-reply@wallapop.com' end,
  case when plat = 'vinted' then 'Has vendido un artículo en Vinted' else 'Aquí tienes la confirmación de tu venta' end,
  plat, plat || '_venta', 'detectada',
  jsonb_build_object('product', prod, 'price', price, 'shipping', null, 'total', price, 'buyer', buyer, 'account', 'maurinventario', 'account_norm', 'maurinventario', 'sale_date', (at at time zone 'Europe/Madrid')::date),
  (select pv.id from product_variants pv join products p on p.id = pv.product_id join inventory_lots l on l.variant_id = pv.id and l.quantity_available > 0 where p.name = prod order by pv.name limit 1), at + interval '2 minutes'
from em;
grant select on em to authenticated, service_role;
grant select on em to authenticated, service_role;
select set_config('request.jwt.claim.sub', (select id::text from auth.users limit 1), false);
set role authenticated;
select email_register_sale(e.id, e.variant_id) from email_messages e join em on em.gid = e.gmail_message_id where em.action = 'registrar';
reset role;
-- correos de etiqueta (PDF) que se vinculan solos a su venta
insert into email_messages (gmail_message_id, received_at, from_address, subject, platform, kind, status, parsed)
select 'lbl-' || em.gid, em.at + interval '35 minutes', 'no-reply@vinted.es', 'Tu etiqueta de envío', 'vinted', 'vinted_etiqueta', 'pendiente',
  jsonb_build_object('product', em.prod, 'pdf', jsonb_build_object('filename', 'etiqueta.pdf', 'size', 48211))
from em where em.action = 'registrar';
set role service_role;
select email_attach_label(l.id, s.id, s.id || '/etiqueta-vinted.pdf', jsonb_build_object('tracking_number', 'VG' || (900000000 + row_number() over ())::text || 'ES', 'transaction_id', (14800000000 + row_number() over () * 7)::text, 'deadline', (current_date + 4)::text, 'carrier_id', (select id from carriers where name = 'Vinted Go')))
from email_messages l join email_messages v on v.gmail_message_id = substr(l.gmail_message_id, 5) join sales s on s.source_email_id = v.id
where l.kind = 'vinted_etiqueta';
reset role;
select s.sale_number, s.source, s.buyer_name, s.tracking_number, s.shipping_label_path is not null lbl from sales s where s.source = 'correo';
