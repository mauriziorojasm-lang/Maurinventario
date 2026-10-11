-- Datos de ejemplo FICTICIOS para las capturas del vídeo.
\set ON_ERROR_STOP 1
select set_config('request.jwt.claim.sub', (select id::text from auth.users limit 1), false);
set role authenticated;
do $$
declare
  me uuid := auth.uid();
  resp uuid; resp2 uuid; sup1 uuid; sup2 uuid; sup3 uuid;
  vin uuid := (select id from platforms where name='Vinted');
  wal uuid := (select id from platforms where name='Wallapop');
  per uuid := (select id from platforms where name='En persona');
  pid uuid; po uuid; r record; i int; d date; v record; lot uuid; price numeric; plat uuid; s uuid;
  prods jsonb := '[
   {"n":"Oakley HSTN","b":"Oakley","c":"Gafas de sol","p":60,"v":[["Negro mate",19.5]],"q":[12]},
   {"n":"Ray-Ban Wayfarer","b":"Ray-Ban","c":"Gafas de sol","p":75,"v":[["Negro",28]],"q":[8]},
   {"n":"Nike Air Force 1 ''07","b":"Nike","c":"Zapatillas","p":85,"v":[["Blanco · 42",41],["Blanco · 43",41],["Blanco · 44",41]],"q":[4,5,3]},
   {"n":"Adidas Samba OG","b":"Adidas","c":"Zapatillas","p":95,"v":[["Blanco · 41",48],["Blanco · 42",48],["Negro · 42",48]],"q":[3,4,3]},
   {"n":"New Balance 550","b":"New Balance","c":"Zapatillas","p":99,"v":[["Blanco/Verde · 42",52],["Blanco/Verde · 43",52]],"q":[3,3]},
   {"n":"Carhartt Detroit Jacket","b":"Carhartt","c":"Ropa","p":120,"v":[["Marrón · M",55],["Marrón · L",55]],"q":[3,3]},
   {"n":"The North Face Nuptse 1996","b":"The North Face","c":"Ropa","p":180,"v":[["Negro · M",92],["Negro · L",92]],"q":[2,3]},
   {"n":"Levi''s 501 Vintage","b":"Levi''s","c":"Ropa","p":45,"v":[["W32 L32",14],["W34 L32",14]],"q":[6,5]},
   {"n":"Polo Ralph Lauren Slim Fit","b":"Ralph Lauren","c":"Ropa","p":49,"v":[["Azul marino · M",17],["Blanco · L",17]],"q":[6,6]},
   {"n":"Stanley Quencher 1,18 L","b":"Stanley","c":"Hogar","p":39,"v":[["Rosa",16],["Crema",16]],"q":[7,6]},
   {"n":"Oakley Encoder","b":"Oakley","c":"Gafas de sol","p":70,"v":[["Rosadas",24]],"q":[6]},
   {"n":"Nike Tech Fleece Hoodie","b":"Nike","c":"Ropa","p":75,"v":[["Gris · M",33],["Negro · L",33]],"q":[5,4]}
  ]';
  p jsonb; k int; items jsonb; seq int := 0; n int;
begin
  perform setseed(0.42);
  insert into responsibles (name, profile_id, is_partner) values ('Maurizio', me, true) returning id into resp;
  insert into responsibles (name, is_partner) values ('Lucía', true) returning id into resp2;
  insert into suppliers (name) values ('Mayorista Gafas Valencia') returning id into sup1;
  insert into suppliers (name) values ('Outlet Sneakers Madrid') returning id into sup2;
  insert into suppliers (name) values ('Lotes Moda Europa') returning id into sup3;
  for k in 0 .. jsonb_array_length(prods) - 1 loop
    p := prods -> k;
    select coalesce((select id from brands where name = p->>'b'), null) into pid;
    if pid is null then insert into brands (name) values (p->>'b'); end if;
    if not exists (select 1 from categories where name = p->>'c') then insert into categories (name) values (p->>'c'); end if;
    pid := create_product(jsonb_build_object('name', p->>'n', 'normal_sale_price', (p->>'p')::numeric,
      'variants', (select jsonb_agg(jsonb_build_object('name', x->>0, 'normal_sale_price', (p->>'p')::numeric)) from jsonb_array_elements(p->'v') x)));
    update products set brand_id = (select id from brands where name = p->>'b'), category_id = (select id from categories where name = p->>'c') where id = pid;
    -- dos pedidos de compra: enero y julio
    for i in 1 .. 2 loop
      seq := seq + 1;
      items := (select jsonb_agg(jsonb_build_object('variant_id', pv.id, 'quantity', ((p->'q')->>pv.rn)::int * (case when i = 1 then 1 else 2 end), 'unit_cost', ((p->'v')->pv.rn->>1)::numeric * (case when i = 1 then 1 else 0.94 end)))
                from (select id, (row_number() over (order by created_at, name) - 1)::int rn from product_variants where product_id = pid) pv);
      po := save_purchase_order(jsonb_build_object('order_number', seq, 'supplier_id', case when p->>'c' = 'Gafas de sol' then sup1 when p->>'c' = 'Zapatillas' then sup2 else sup3 end,
        'order_date', case when i = 1 then '2026-01-08' else '2026-07-02' end, 'items', items,
        'costs', jsonb_build_array(jsonb_build_object('cost_type', 'transporte', 'amount', 12.5 + i * 3), jsonb_build_object('cost_type', 'aduanas', 'amount', 8))));
      perform receive_purchase_order(jsonb_build_object('purchase_order_id', po, 'received_at', case when i = 1 then '2026-01-14' else '2026-07-09' end,
        'lines', (select jsonb_agg(jsonb_build_object('item_id', it.id, 'quantity_received', it.quantity_ordered)) from purchase_order_items it where it.purchase_order_id = po)));
    end loop;
  end loop;
  -- ventas: enero → 10 de octubre, más en los últimos meses
  d := '2026-01-16';
  while d <= '2026-10-10' loop
    n := case when d >= '2026-09-01' then 1 when d >= '2026-06-01' then (random() < 0.6)::int else (random() < 0.35)::int end;
    for i in 1 .. n loop
      select pv.id vid, pv.normal_sale_price np, l.id lid into v
        from product_variants pv join inventory_lots l on l.variant_id = pv.id and l.quantity_available > 0
        order by random() limit 1;
      exit when v is null;
      select id into lot from inventory_lots where variant_id = v.vid and quantity_available > 0 order by received_at, created_at limit 1;
      price := round(v.np * (0.82 + random() * 0.2));
      plat := case when random() < 0.55 then vin when random() < 0.85 then wal else per end;
      s := create_sale(jsonb_build_object('sale_date', d, 'responsible_id', case when random() < 0.7 then resp else resp2 end, 'platform_id', plat,
           'shipping_status', case when plat = per or d < '2026-10-08' then 'enviado' else 'pendiente' end,
           'items', jsonb_build_array(jsonb_build_object('variant_id', v.vid, 'lot_id', lot, 'quantity', 1, 'unit_price', price))));
    end loop;
    d := d + 1;
  end loop;
end $$;
reset role;
update email_integration set status = 'conectado', email = 'maurinventario@gmail.com', connected_at = now() - interval '20 days', last_sync_at = now() - interval '4 minutes', last_success_at = now() - interval '4 minutes', default_responsible_id = (select id from responsibles where name = 'Maurizio');
select count(*) as ventas, sum(si.quantity * si.unit_price) as ingresos from sales s join sale_items si on si.sale_id = s.id;
