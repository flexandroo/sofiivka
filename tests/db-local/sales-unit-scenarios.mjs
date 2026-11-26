// Real migrated Postgres: sale units are canonical for new lines and immutable
// order snapshots thereafter. No remote connection or catalogue inference.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createDatabase } from './database.mjs';

const STAFF = '00000000-0000-4000-8000-000000000081';
const CUSTOMER = '00000000-0000-4000-8000-000000000082';
const one = async (db, sql, args=[]) => (await db.query(sql,args)).rows[0];
async function as(db,role,user,sql,args=[]) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({'x-forwarded-for':'203.0.113.81'})]);
  if(role) await db.exec(`set role ${role}`);
  try { return (await one(db,sql,args)).r; } finally { await db.exec('reset role'); }
}
const staff = (db,sql,args=[]) => as(db,'authenticated',STAFF,sql,args);
async function rejects(promise,pattern) { await assert.rejects(promise,pattern); }

export async function run(db) {
  const brand = await one(db,'select internal_id from public.brands order by stable_id limit 1');
  const category = await one(db,'select internal_id from public.categories order by level desc,stable_id limit 1');
  await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id,amount,price_status,publication_status,sale_unit)
    values('unit-pipe','UNIT-M','unit-pipe','Труба тестова','Труба','UNIT-M',$1,$2,100,'known','published','m'),
    ('unit-piece','UNIT-PC','unit-piece','Муфта тестова','Муфта','UNIT-PC',$1,$2,50,'known','published','piece')`,[brand.internal_id,category.internal_id]);
  await db.query(`insert into auth.users(id,email,email_confirmed_at)values($1,'unit-staff@example.test',now()),($2,'unit-customer@example.test',now())`,[STAFF,CUSTOMER]);
  await db.query("insert into public.admin_profiles(user_id,name,role)values($1,'Менеджер одиниць','manager')",[STAFF]);

  // Only pricing.unit is added to the current rich payload; all source/media,
  // relations and arbitrary existing fields survive the preserved implementation.
  const payload = await one(db,`select public._admin_product_payload(p.internal_id,$1) current,
    public._admin_product_payload_without_sale_unit(p.internal_id,$1) previous
    from public.products p where legacy_id='unit-pipe'`,[{source:{characteristics:[{label:'Довжина',value:'50 м'}]},sentinel:'preserve'}]);
  assert.equal(payload.current.pricing.unit,'m');
  const withoutUnit=structuredClone(payload.current);delete withoutUnit.pricing.unit;
  assert.deepEqual(withoutUnit,payload.previous);
  assert.equal((await one(db,"select public._admin_product_payload(internal_id)->'pricing' pricing from public.products where legacy_id='unit-piece'")).pricing.unit,'piece');
  assert.equal((await one(db,'select public._admin_product_payload($1) r',['00000000-0000-4000-8000-000000009999'])).r,null);
  const card=(await one(db,'select public._catalog_card($1,$2) r',[payload.current,'Тест'])).r;
  assert.equal(card.pricing.unit,'m');
  await db.exec(`insert into public.catalog_snapshot_releases(snapshot_version,contract_version,categories,brands,attribute_definitions,
    product_count,public_product_count,product_id_hash,ready) values('unit-local','unit-local','[]','[]','{}',0,0,repeat('0',64),true);
    insert into public.catalog_snapshot_pointer(singleton,snapshot_version)values(true,'unit-local');
    select public._admin_refresh_catalog(array(select internal_id from public.products where legacy_id in('unit-pipe','unit-piece')));`);
  const publicRows=(await db.query(`select c.legacy_id,c.card#>>'{pricing,unit}' card_unit,s.payload#>>'{pricing,unit}' snapshot_unit,
    (c.card#>>'{pricing,amount}')::numeric amount from public.catalog_product_cards c join public.catalog_product_snapshots s using(snapshot_version,legacy_id)
    where c.snapshot_version='unit-local' order by c.legacy_id`)).rows;
  assert.deepEqual(publicRows.map(r=>[r.legacy_id,r.card_unit,r.snapshot_unit,Number(r.amount)]),
    [['unit-piece','piece','piece',50],['unit-pipe','m','m',100]]);

  // Checkout prices AND units are server-derived, including forged client data.
  const checkout={name:'Тест одиниць',phone:'0675558100',email:'unit-customer@example.test',delivery:'pickup',
    saleUnit:'piece',items:[{id:'unit-pipe',quantity:3,saleUnit:'piece',unit:'piece',price:1},
      {id:'unit-piece',quantity:2,saleUnit:'m',unit:'m',unitAmount:1}]};
  const submitted=await as(db,'authenticated',CUSTOMER,'select public.crm_submit_order($1) r',[checkout]);
  assert.equal(submitted.accepted,true);assert.equal(Number(submitted.itemsTotal),400);
  let order=await staff(db,'select public.admin_crm_get_order($1) r',[submitted.number]);
  assert.deepEqual(order.items.map(x=>[x.saleUnit,Number(x.quantity),Number(x.unitAmount),Number(x.lineTotal)]),[['m',3,100,300],['piece',2,50,100]]);
  assert.deepEqual((await as(db,'authenticated',CUSTOMER,'select public.customer_get_order($1) r',[submitted.number])).order.items.map(x=>x.saleUnit),['m','piece']);

  // Today's product unit must not rewrite an order's saved commercial unit.
  await db.exec("update public.products set sale_unit='piece' where legacy_id='unit-pipe'");
  const originalLineIds=order.items.map(x=>x.id);
  order=await staff(db,'select public.admin_crm_update_order_items($1,$2,null) r',[submitted.number,
    [{id:originalLineIds[0],quantity:4,saleUnit:'piece'},{id:originalLineIds[1],quantity:1,saleUnit:'m'}]]);
  assert.deepEqual(order.items.map(x=>x.saleUnit),['m','piece']);assert.equal(Number(order.items[0].lineTotal),400);
  assert.equal(order.activity[0].data.items.changed[0].saleUnit,'m');
  const exported=await staff(db,'select public.admin_crm_export_orders() r');
  assert.deepEqual(exported.rows.find(x=>x.number===submitted.number).items.map(x=>x.saleUnit),['m','piece']);
  assert.deepEqual((await as(db,'authenticated',CUSTOMER,'select public.customer_get_order($1) r',[submitted.number])).order.items.map(x=>x.saleUnit),['m','piece']);

  // New orders/reorders use the current canonical unit, not the old basket/client.
  const manual=await staff(db,'select public.admin_crm_create_order($1) r',[{name:'Ручне замовлення',phone:'0675558101',delivery:'pickup',
    lines:[{productId:'unit-pipe',quantity:3,saleUnit:'m'},{title:'Монтаж',quantity:1,unitAmount:200,saleUnit:'m'}]}]);
  assert.deepEqual(manual.items.map(x=>x.saleUnit),['piece','piece']);
  await db.exec("update public.products set sale_unit='m' where legacy_id='unit-pipe'");
  const search=await staff(db,"select public.admin_crm_search_products('UNIT-M') r");assert.equal(search[0].saleUnit,'m');
  const manualMetres=await staff(db,'select public.admin_crm_create_order($1) r',[{name:'Ручний метр',phone:'0675558102',delivery:'pickup',
    lines:[{productId:'unit-pipe',quantity:3,saleUnit:'piece'}]}]);
  assert.equal(manualMetres.items[0].saleUnit,'m');assert.equal(Number(manualMetres.items[0].lineTotal),300);

  // Defaults, constraints and API permissions remain backwards compatible.
  await db.query(`insert into public.products(legacy_id,sku,slug,title,short_title,model,brand_id,primary_category_id)
    values('unit-default','UNIT-DEFAULT','unit-default','Типовий товар','Товар','UNIT-DEFAULT',$1,$2)`,[brand.internal_id,category.internal_id]);
  assert.equal((await one(db,"select sale_unit from public.products where legacy_id='unit-default'")).sale_unit,'piece');
  await rejects(db.exec("update public.products set sale_unit='roll' where legacy_id='unit-pipe'"),/check constraint/);
  await rejects(staff(db,'select public.admin_crm_create_order($1) r',[{name:'Дробова кількість',phone:'0675558103',delivery:'pickup',lines:[{productId:'unit-pipe',quantity:1.5}]}]),/цілим числом/);
  await rejects(as(db,'anon',null,'select public._admin_product_payload($1) r',['00000000-0000-4000-8000-000000009999']),/permission denied/);
  await rejects(as(db,'anon',null,'select public._crm_resolve_order_lines(null,$1) r',[[{productId:'unit-pipe',quantity:1}]]),/permission denied/);
  return {status:'PASS',canonicalMetrePrice:100,quantity:3,lineTotal:300,mixedBasket:400,forgedClientUnitIgnored:true,
    storedHistoryAndExport:true,existingLineSnapshotPreserved:true,manualPieceDefault:true,canonicalPayloadPreserved:true,hostedConnections:0};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const db=await createDatabase();try{console.log(JSON.stringify(await run(db)));}catch(e){console.error(e.message);process.exitCode=1;}finally{await db.close();}
}
