// Frozen manufacturer article-role repair compiler: titles, copy and primary categories only. Never connects to a database.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const GROUPS=new Set(['categories','base','scope','signed']);
const COPY_FIELDS=new Set(['title','short_title','description','short_description','full_description','description_sections','seo_title','seo_description']);
const FIELDS=new Set(['primary_category_id',...COPY_FIELDS]);
const PAV_FIELDS=new Set(['value_number','value_text','value_boolean','option_id','source_label','source_value','source_unit','normalization_rule','unit_status','provenance','unit_override']);
const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const sha=value=>createHash('sha256').update(value).digest('hex');
const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
const jsonSql=value=>`convert_from(decode(${literal(Buffer.from(JSON.stringify(value)).toString('base64'))},'base64'),'UTF8')::jsonb`;

export function selectedProducts(plan,groups=['categories','base','scope','signed']){
  for(const group of groups)assert.ok(GROUPS.has(group),`Unsupported repair group: ${group}`);
  const selected=new Set(groups),seen=new Set();
  return plan.products.map(product=>{
    assert.ok(product.id&&product.sku&&UUID.test(product.internalId),'Missing exact repair identity');
    assert.ok(!seen.has(product.id),'Duplicate repair product');seen.add(product.id);
    assert.equal(product.guardProduct.legacy_id,product.id);assert.equal(product.guardProduct.sku,product.sku);
    assert.ok(UUID.test(product.guardProduct.brand_id));
    assert.equal(product.attributeChanges.length,0,'Role repairs cannot change typed facts');
    assert.equal(product.sourceChanges.length,0,'Role repairs cannot rewrite source evidence');
    assert.equal(product.displayChanges.length,0,'Role repairs cannot rewrite source displays');
    const item={...product};
    for(const key of ['productChanges','attributeChanges','sourceChanges','displayChanges'])item[key]=(product[key]??[]).filter(change=>selected.has(change.group));
    for(const change of item.productChanges){
      assert.ok(FIELDS.has(change.field),`Forbidden product field: ${change.field}`);
      if(['base','signed'].includes(change.group))assert.ok(COPY_FIELDS.has(change.field),'Technical repairs may change only explicit public copy fields');
      if(change.field==='publication_status')assert.ok(change.group==='scope'&&change.old==='published'&&change.new==='draft','Only an explicit published→draft scope repair is allowed');
      if(change.field==='primary_category_id')assert.ok(change.group==='categories'&&UUID.test(change.old)&&UUID.test(change.new));
      assert.notDeepEqual(change.old,change.new,'A repair must change its declared field');
    }
    for(const change of item.attributeChanges){
      assert.ok(change.group==='base'&&['replace','delete'].includes(change.action)&&UUID.test(change.attributeId));
      assert.equal(change.oldRow.product_id,item.internalId);assert.equal(change.oldRow.attribute_id,change.attributeId);
      if(change.action==='replace'){assert.ok(Object.keys(change.newValues??{}).length);for(const key of Object.keys(change.newValues))assert.ok(PAV_FIELDS.has(key),`Forbidden typed field: ${key}`);}
    }
    for(const change of item.sourceChanges){
      assert.equal(change.group,'signed');assert.ok(UUID.test(change.sourceRecordId)&&UUID.test(change.supplierId));
      assert.ok(Array.isArray(change.oldCharacteristics)&&Array.isArray(change.newCharacteristics)&&change.featureGuards?.length);
      assert.equal(change.payloadChecksumBefore,null,'Reviewed sign repairs require a NULL checksum, which is preserved');
      assert.equal(change.oldCharacteristics.length,change.newCharacteristics.length,'A sign repair cannot add/remove source rows');
      let changedRows=0;
      change.oldCharacteristics.forEach((oldRow,index)=>{const next=change.newCharacteristics[index];
        try{assert.deepEqual(next,oldRow);}catch{
          assert.equal(typeof oldRow.value,'string');assert.deepEqual(next,{...oldRow,value:'-'+oldRow.value},'Only one leading minus may be restored');
          assert.ok(change.changes?.some(c=>c.index===index&&c.label===oldRow.label&&c.oldValue===oldRow.value&&c.newValue===next.value),'A source row requires its exact reviewed feature proof');changedRows++;
        }
      });
      assert.ok(changedRows>0);assert.equal(changedRows,change.featureGuards.length);
      for(const guard of change.featureGuards)assert.ok(Number.isInteger(guard.index)&&guard.index>=0&&/^[-−–]\s*\d/.test(guard.feature.value));
      const display=item.displayChanges.find(d=>d.kind==='replace-characteristics'&&d.sourceRecordId===change.sourceRecordId);
      assert.ok(display,'Every signed source correction requires the coupled public snapshot repair');assert.deepEqual(display.oldRows,change.oldCharacteristics);assert.deepEqual(display.newRows,change.newCharacteristics);
    }
    for(const change of item.displayChanges){
      assert.ok(['replace-characteristics','qualify-depth-label'].includes(change.kind));
      if(change.kind==='qualify-depth-label'){
        assert.ok(change.paths?.length,'Exact per-path depth arrays are required for reversible repair');
        for(const scoped of change.paths){assert.ok([JSON.stringify(['sourceAttributes']),JSON.stringify(['unmappedAttributes']),JSON.stringify(['source','characteristics'])].includes(JSON.stringify(scoped.path)));assert.ok(Array.isArray(scoped.oldRows)&&Array.isArray(scoped.newRows));}
      }
    }
    return item;
  }).filter(p=>['productChanges','attributeChanges','sourceChanges','displayChanges'].some(key=>p[key].length));
}

export function repairChunkSql(items,{activeVersion,planSha256,jobId,direction='apply',productCount=19629}={}){
  assert.ok(items.length>0&&items.length<=50,'A repair transaction must contain1–50 exact products');
  assert.match(activeVersion,/^[a-f\d]{64}$/);assert.match(planSha256,/^[a-f\d]{64}$/);assert.ok(['apply','rollback'].includes(direction));
  assert.match(jobId,/^[a-z0-9-]{1,150}$/);assert.ok(Number.isSafeInteger(productCount)&&productCount>0);
  const rollback=direction==='rollback';
  return `-- Guarded catalogue ${direction}; ${String(jobId).replaceAll('\n',' ')}; plan SHA256 ${planSha256}.
begin;
set local statement_timeout='45s';
set local lock_timeout='5s';
set local jit=off;
set local timezone='UTC';
do $catalog_repair$
declare
 items jsonb:=${jsonSql(items)};
 item jsonb; change jsonb; guard jsonb; current_row jsonb; expected_row jsonb; target_row jsonb;
 product public.products%rowtype; source_record public.product_source_records%rowtype;
 product_patch jsonb; snapshot_payload jsonb; next_payload jsonb; old_rows jsonb; new_rows jsonb; current_rows jsonb;
 row_value jsonb; rebuilt jsonb; snapshot_path text[]; field_name text; set_clause text;
 active_version text; target_status text; changed boolean; found_old boolean; found_new boolean;
 changed_ids uuid[]:='{}'; verified integer:=0; source_id uuid;
begin
 if current_user not in('postgres','service_role','supabase_admin') or current_database()<>'postgres' then raise exception 'Privileged catalogue importer database required';end if;
 if(select count(*)from public.products)<>${Number(productCount)} then raise exception 'Catalogue cardinality changed';end if;
 select snapshot_version into active_version from public.catalog_snapshot_pointer where singleton for update;
 if active_version is distinct from ${literal(activeVersion)} then raise exception 'Active catalogue pointer changed';end if;
 perform 1 from public.catalog_snapshot_releases where snapshot_version=active_version and ready for update;
 if not found then raise exception 'Ready active release required';end if;
 for item in select value from jsonb_array_elements(items)loop
  select * into product from public.products where internal_id=(item->>'internalId')::uuid for update;
  guard:=item->'guardProduct';
  if not found or product.legacy_id is distinct from item->>'id' or product.sku is distinct from item->>'sku'
   or product.brand_id::text is distinct from guard->>'brand_id'
   or product.last_import_run_id::text is distinct from guard->>'last_import_run_id'
  then raise exception 'Product identity/ownership guard failed for %',item->>'id';end if;
  target_status:=item->>'expectedStatus';
  select value->>'new' into field_name from jsonb_array_elements(item->'productChanges')where value->>'field'='publication_status';
  if product.publication_status::text is distinct from target_status and product.publication_status::text is distinct from field_name
  then raise exception 'Product status guard failed for %',product.legacy_id;end if;
  changed:=false; product_patch:='{}';
  for change in select value from jsonb_array_elements(item->'productChanges')loop
   field_name:=change->>'field';
   if field_name<>all(array['primary_category_id','title','short_title','description','short_description','full_description','description_sections','seo_title','seo_description'])then raise exception 'Forbidden product repair field';end if;
   expected_row:=change->'${rollback?'new':'old'}';target_row:=change->'${rollback?'old':'new'}';current_row:=to_jsonb(product)->field_name;
   if current_row is not distinct from target_row then continue;end if;
   if current_row is distinct from expected_row then raise exception 'Product old-value guard failed for %/%',product.legacy_id,field_name;end if;
   if field_name='primary_category_id'then
    perform 1 from public.categories c where c.internal_id=(target_row#>>'{}')::uuid and c.status='active'
      and not exists(select 1 from public.categories child where child.parent_id=c.internal_id and child.status='active');
    if not found or exists(select 1 from public.product_categories where product_id=product.internal_id and category_id=(target_row#>>'{}')::uuid)
    then raise exception 'Target active leaf/secondary category guard failed';end if;
   end if;
   product_patch:=product_patch||jsonb_build_object(field_name,target_row);
  end loop;
  if product_patch<>'{}'then
   select string_agg(format('%1$I=(jsonb_populate_record(null::public.products,$1)).%1$I',key),','order by key)into set_clause from jsonb_object_keys(product_patch)key;
   execute 'update public.products set '||set_clause||' where internal_id=$2'using product_patch,product.internal_id;changed:=true;
  end if;
  for change in select value from jsonb_array_elements(item->'attributeChanges')loop
   select to_jsonb(v)into current_row from public.product_attribute_values v where product_id=product.internal_id and attribute_id=(change->>'attributeId')::uuid for update;
   expected_row:=change->'oldRow';target_row:=case when change->>'action'='delete'then null else expected_row||(change->'newValues')end;
   ${rollback?`guard:=expected_row;expected_row:=target_row;target_row:=guard;`:''}
   if(current_row-'updated_at')is not distinct from(target_row-'updated_at')then continue;end if;
   if ${rollback?"(current_row-'updated_at')is distinct from(expected_row-'updated_at')":"current_row is distinct from expected_row"} then raise exception 'Typed old-row guard failed for %/%',product.legacy_id,change->>'stableId';end if;
   if target_row is null then
    delete from public.product_attribute_values where product_id=product.internal_id and attribute_id=(change->>'attributeId')::uuid;
   elsif current_row is null then
    insert into public.product_attribute_values select(jsonb_populate_record(null::public.product_attribute_values,target_row)).*;
   else
    product_patch:=case when ${rollback?'true':'false'} then(select coalesce(jsonb_object_agg(key,target_row->key),'{}')from jsonb_object_keys(change->'newValues')key)else change->'newValues'end;
    if exists(select 1 from jsonb_object_keys(product_patch)key where key<>all(array['value_number','value_text','value_boolean','option_id','source_label','source_value','source_unit','normalization_rule','unit_status','provenance','unit_override']))then raise exception 'Forbidden typed repair field';end if;
    select string_agg(format('%1$I=(jsonb_populate_record(null::public.product_attribute_values,$1)).%1$I',key),','order by key)into set_clause from jsonb_object_keys(product_patch)key;
    execute 'update public.product_attribute_values set '||set_clause||' where product_id=$2 and attribute_id=$3'using product_patch,product.internal_id,(change->>'attributeId')::uuid;
   end if;changed:=true;
  end loop;
  for change in select value from jsonb_array_elements(item->'sourceChanges')loop
   select * into source_record from public.product_source_records where internal_id=(change->>'sourceRecordId')::uuid for update;
   if not found or source_record.product_id is distinct from product.internal_id or source_record.source_id is distinct from change->>'sourceId'
    or source_record.supplier_id::text is distinct from change->>'supplierId' or source_record.import_run_id::text is distinct from change->>'importRunId'
    or source_record.source_url is distinct from change->>'sourceUrl' or source_record.payload_checksum is not null
   then raise exception 'Source identity/checksum guard failed for %',product.legacy_id;end if;
   for guard in select value from jsonb_array_elements(change->'featureGuards')loop
    if source_record.raw_payload#>array['sourceEvidence','sourceEtim','features',guard->>'index']is distinct from guard->'feature'
    then raise exception 'Original signed ETIM feature guard failed for %',product.legacy_id;end if;
   end loop;
   expected_row:=change->'${rollback?'newCharacteristics':'oldCharacteristics'}';target_row:=change->'${rollback?'oldCharacteristics':'newCharacteristics'}';
   current_row:=source_record.raw_payload->'characteristics';
   if current_row is not distinct from target_row then continue;end if;
   if current_row is distinct from expected_row then raise exception 'Source characteristic old-array guard failed for %',product.legacy_id;end if;
   update public.product_source_records set raw_payload=jsonb_set(raw_payload,'{characteristics}',target_row,false)where internal_id=source_record.internal_id;
   changed:=true;
  end loop;
  if jsonb_array_length(item->'displayChanges')>0 then
   select payload into snapshot_payload from public.catalog_product_snapshots where snapshot_version=active_version and legacy_id=product.legacy_id for update;
   if not found then raise exception 'Active source snapshot missing for %',product.legacy_id;end if;
   next_payload:=snapshot_payload;
   for change in select value from jsonb_array_elements(item->'displayChanges')loop
    found_old:=false;found_new:=false;
    foreach snapshot_path slice 1 in array array[array['sourceAttributes',null],array['unmappedAttributes',null],array['source','characteristics']]loop
     snapshot_path:=array_remove(snapshot_path,null);current_rows:=next_payload#>snapshot_path;
     if current_rows is null then
      if change->>'kind'='replace-characteristics'and cardinality(snapshot_path)=1 then raise exception 'Required source array missing for %',product.legacy_id;end if;
      continue;
     end if;
     if jsonb_typeof(current_rows)<>'array'then raise exception 'Source display is not an array';end if;
     if change->>'kind'='qualify-depth-label'and change?'paths'then
      select value into guard from jsonb_array_elements(change->'paths')where value->'path'=to_jsonb(snapshot_path);
      if not found then continue;end if;
      old_rows:=guard->'${rollback?'newRows':'oldRows'}';new_rows:=guard->'${rollback?'oldRows':'newRows'}';
      if current_rows is not distinct from new_rows then found_new:=true;continue;end if;
      if current_rows is distinct from old_rows then raise exception 'Depth display old-array guard failed for %',product.legacy_id;end if;
      rebuilt:=new_rows;found_old:=true;
     elsif change->>'kind'='replace-characteristics'then
      old_rows:=change->'${rollback?'newRows':'oldRows'}';new_rows:=change->'${rollback?'oldRows':'newRows'}';
      if current_rows is not distinct from new_rows then found_new:=true;continue;end if;
      if current_rows is distinct from old_rows then raise exception 'Display characteristic old-array guard failed for %',product.legacy_id;end if;
      rebuilt:=new_rows;found_old:=true;
     elsif change->>'kind'='qualify-depth-label'then raise exception 'Exact per-path depth arrays are required for reversible repair';
     else raise exception 'Unsupported display repair';end if;
     next_payload:=jsonb_set(next_payload,snapshot_path,rebuilt,false);
    end loop;
    if not found_old and not found_new then raise exception 'No exact guarded display row for %',product.legacy_id;end if;
   end loop;
   if next_payload is distinct from snapshot_payload then update public.catalog_product_snapshots set payload=next_payload where snapshot_version=active_version and legacy_id=product.legacy_id;changed:=true;end if;
  end if;
  if changed then changed_ids:=array_append(changed_ids,product.internal_id);end if;verified:=verified+1;
 end loop;
 if cardinality(changed_ids)>0 then perform public._admin_refresh_catalog(changed_ids);end if;
 raise notice 'catalogue repair ${direction}: verified %, changed %',verified,cardinality(changed_ids);
end;
$catalog_repair$;
commit;
`;
}

export async function prepare({planFile='imports/overnight-audit/source-reconciliation/correction-plan.json',groups=['categories','base','scope','signed'],chunkSize=50,outputDir}={}){
  assert.ok(Number.isInteger(chunkSize)&&chunkSize>=1&&chunkSize<=50);
  const raw=await fs.readFile(path.resolve(ROOT,planFile),'utf8'),plan=JSON.parse(raw),planSha256=sha(raw);
  assert.equal(plan.format,'sofiivka-catalog-repair-plan-v1');assert.equal(plan.projectRef,'fkjarsouuchjiedrrblc');
  assert.equal(planSha256,'e5f34b6c9e0c4c80528e3df56659ef9930a7a62d435e036a1034f684b21a6bd9','Only the reviewed frozen manufacturer role plan is accepted');
  assert.equal(plan.summary.products,326);assert.equal(plan.summary.headProducts,306);assert.equal(plan.summary.categoryMoves,33);
  assert.ok(groups.every(group=>['base','categories'].includes(group)),'Only role copy and primary categories');
  const products=selectedProducts(plan,groups);assert.equal(products.length,326);assert.ok(products.length,'No selected repairs');
  const directory=path.resolve(ROOT,outputDir??`imports/overnight-audit/releases/${plan.jobId}-${groups.join('-')}-${planSha256.slice(0,12)}`);await fs.mkdir(directory,{recursive:true});
  const chunks=[];let offset=0;
  while(offset<products.length){
    let count=Math.min(chunkSize,products.length-offset),items,sql,rollbackSql;
    for(;;){items=products.slice(offset,offset+count);const options={activeVersion:plan.activeVersion,planSha256,jobId:plan.jobId,productCount:plan.productCount??19629};
      sql=repairChunkSql(items,options);rollbackSql=repairChunkSql(items,{...options,direction:'rollback'});
      if(Math.max(Buffer.byteLength(sql),Buffer.byteLength(rollbackSql))<650000)break;
      assert.ok(count>1,'One repair exceeds the safe request byte budget');count=Math.ceil(count/2);
    }
    const ordinal=String(chunks.length+1).padStart(3,'0'),file=path.join(directory,`${ordinal}-apply.sql`),rollbackFile=path.join(directory,`${ordinal}-rollback.sql`);
    await fs.writeFile(file,sql);await fs.writeFile(rollbackFile,rollbackSql);
    chunks.push({index:chunks.length+1,products:items.length,ids:items.map(p=>p.id),file:path.relative(ROOT,file).replaceAll('\\','/'),rollbackFile:path.relative(ROOT,rollbackFile).replaceAll('\\','/'),sha256:sha(sql),rollbackSha256:sha(rollbackSql),bytes:Buffer.byteLength(sql),rollbackBytes:Buffer.byteLength(rollbackSql)});offset+=count;
  }
  const manifest={format:'sofiivka-catalog-repair-release-v1',jobId:plan.jobId,projectRef:plan.projectRef,activeVersion:plan.activeVersion,planFile,planSha256,groups,products:products.length,chunks};
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){const [key,...rest]=arg.replace(/^--/,'').split('=');const value=rest.join('=');if(key==='plan')options.planFile=value;else if(key==='groups')options.groups=value.split(',');else if(key==='chunk-size')options.chunkSize=Number(value);else if(key==='output')options.outputDir=value;else throw Error(`Unknown argument: ${arg}`);}
 const result=await prepare(options);console.log(JSON.stringify({status:'PREPARED_NOT_EXECUTED',jobId:result.jobId,products:result.products,chunks:result.chunks.length,groups:result.groups,hostedWrites:0}));
}
