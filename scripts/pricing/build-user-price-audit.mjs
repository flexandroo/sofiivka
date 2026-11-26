// Produce a read-only post-publication audit. No hosted connection and no price mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const DIR=path.join(ROOT,'imports/overnight-prices');
const plan=JSON.parse(await fs.readFile(path.join(DIR,'price-plan.json'),'utf8'));
const pointer=JSON.parse(await fs.readFile(path.join(DIR,'release-pointer.json'),'utf8'));
const manifest=JSON.parse(await fs.readFile(path.resolve(ROOT,pointer.manifest),'utf8'));
const supported=plan.rows.filter(row=>row.target.amount!==null).map(row=>({legacyId:row.legacyId,internalId:row.internalId,sku:row.sku,brand:row.brand,
  amount:row.target.amount,currency:row.target.currency,priceStatus:row.target.priceStatus,
  source:row.action==='apply_user_price_list'?row.priceSource:row.expected.priceSource}));
const encoded=Buffer.from(JSON.stringify(supported)).toString('base64');
const sql=`-- Read-only: exact list-owned prices, all catalogue price/public-cache consistency, no payload dump.
set local statement_timeout='30s';
with expected as materialized(
  select value item from jsonb_array_elements(convert_from(decode('${encoded}','base64'),'UTF8')::jsonb)
), checked as materialized(
  select e.item,p.internal_id,p.legacy_id,p.amount,p.old_amount,p.currency,p.price_status,s.product_id,
    (p.internal_id is null or p.internal_id::text is distinct from e.item->>'internalId' or p.sku is distinct from e.item->>'sku'
      or b.stable_id is distinct from e.item->>'brand' or p.amount is distinct from(e.item->>'amount')::numeric
      or p.old_amount is not null or p.currency is distinct from e.item->>'currency' or p.price_status::text is distinct from e.item->>'priceStatus')core_bad,
    (s.product_id is null or s.base_amount is distinct from(e.item#>>'{source,baseAmount}')::numeric
      or s.currency is distinct from e.item#>>'{source,currency}'or s.vat_included is distinct from(e.item#>>'{source,vatIncluded}')::boolean
      or s.active is distinct from(e.item#>>'{source,active}')::boolean or s.source is distinct from e.item#>>'{source,source}'
      or s.source_ref is distinct from e.item#>>'{source,sourceRef}')source_bad
  from expected e left join public.products p on p.legacy_id=e.item->>'legacyId'
    left join public.brands b on b.internal_id=p.brand_id left join public.product_price_sources s on s.product_id=p.internal_id
), active as materialized(select snapshot_version from public.catalog_snapshot_pointer where singleton), stats as(
  select
    (select count(*)from public.products)canonical_products,
    (select count(*)from public.products where publication_status='published')published_products,
    (select count(*)from public.products where price_status='known'and amount>0)known_prices,
    (select count(*)from public.products where old_amount is not null)unsupported_old_prices,
    (select count(*)from public.product_price_sources where active)active_price_sources,
    (select count(*)from checked where core_bad)core_failures,
    (select count(*)from checked where source_bad)source_failures,
    (select count(*)from public.product_price_sources s where active and not exists(select1 from expected e where e.item->>'internalId'=s.product_id::text))unexpected_active_sources,
    (select count(*)from public.products p where p.amount is not null and not exists(select1 from expected e where e.item->>'legacyId'=p.legacy_id))unsupported_prices,
    (select count(*)from public.catalog_product_cards c join active a using(snapshot_version)join public.products p on p.legacy_id=c.legacy_id
      where c.amount is distinct from p.amount or c.price_status is distinct from p.price_status
        or(c.card#>>'{pricing,amount}')::numeric is distinct from p.amount or c.card#>>'{pricing,priceStatus}'is distinct from p.price_status::text)public_card_price_failures,
    (select count(*)from public.catalog_product_snapshots s join active a using(snapshot_version)join public.products p on p.legacy_id=s.legacy_id
      where p.publication_status='published'and((s.payload#>>'{pricing,amount}')::numeric is distinct from p.amount
        or s.payload#>>'{pricing,priceStatus}'is distinct from p.price_status::text))public_snapshot_price_failures,
    (select count(*)from public.catalog_snapshot_releases)release_rows,
    (select count(*)from public.catalog_product_snapshots join active using(snapshot_version))active_snapshot_rows,
    (select count(*)from public.catalog_product_cards join active using(snapshot_version))active_public_cards,
    (select count(*)from public.price_fx_runs where rates->>'jobId'='${manifest.jobId}'and rates->>'operation'='apply')job_audit_rows,
    (select coalesce(sum(changed),0)from public.price_fx_runs where rates->>'jobId'='${manifest.jobId}'and rates->>'operation'='apply')job_changed_rows
)
select jsonb_build_object('pass',canonical_products=19629 and published_products=19327 and known_prices=${supported.length}
  and active_price_sources=${supported.length} and unsupported_old_prices=0 and core_failures=0 and source_failures=0
  and unexpected_active_sources=0 and unsupported_prices=0 and public_card_price_failures=0 and public_snapshot_price_failures=0
  and release_rows=1 and active_snapshot_rows=19570 and active_public_cards=19327
  and job_audit_rows=${manifest.chunks.length} and job_changed_rows=${manifest.changedProducts}
  and(select snapshot_version from active)='${manifest.activeVersion}',
  'actual',to_jsonb(stats),'expectedKnownPrices',${supported.length},'expectedChangedRows',${manifest.changedProducts},
  'expectedAuditRows',${manifest.chunks.length},'jobId','${manifest.jobId}','planSha256','${manifest.planSha256}',
  'activeVersion',(select snapshot_version from active),'databaseBytes',pg_database_size(current_database()))result from stats;
`.replaceAll('select1','select 1');
if(Buffer.byteLength(sql)>1800000)throw Error('Final audit exceeds the hosted query budget');
const output=path.resolve(ROOT,path.dirname(pointer.manifest),'final-audit.sql');await fs.writeFile(output,sql);
console.log(JSON.stringify({status:'PREPARED_READ_ONLY',file:path.relative(ROOT,output).replaceAll('\\','/'),bytes:Buffer.byteLength(sql),
  sha256:createHash('sha256').update(sql).digest('hex'),supportedPrices:supported.length,hostedWrites:0}));
