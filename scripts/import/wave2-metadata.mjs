// Additive prerequisites for the approved Rehau / Tweetop / OXI catalogue extension.
// Generates reviewable SQL and a validation reference; never opens hosted connections.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const brands = [
  {id:'tweetop',name:'Tweetop',website:'https://tweetop.pl/',logo:'/assets/brands/tweetop.svg',
    description:'Трубні системи для водопостачання й опалення, прес-фітинги та монтажний інструмент.'},
  {id:'oxi',name:'OXI',website:'https://oxi.ua/',logo:'/assets/brands/oxi.svg',
    description:'Український виробник автоматичних пелетних пальників для побутових і промислових котлів.'},
];
export const attributes = [{id:'pipeWallThicknessMm',label:'Товщина стінки труби, мм',unit:'мм'}];
const pipeFacets=['pipeDiameterMm','pipeWallThicknessMm','pipeLengthMm','material','pressureBar','productType'];
export const categories = [
  {id:'water-heating-pipes',parent:'water-supply',title:'Труби водопостачання й опалення',order:290,facets:pipeFacets},
  {id:'pipe-installation-components',parent:'water-supply',title:'Монтажні комплектуючі трубопроводів',order:294,facets:['pipeDiameterMm','angleDegrees','connection','material','productType','compatibility','weightKg']},
  {id:'pipe-installation-tools',parent:'water-supply',title:'Інструмент для монтажу труб',order:295,facets:['pipeDiameterMm','productType','compatibility','voltage','weightKg','material']},
  {id:'district-heating-pipes',parent:'heating',title:'Теплоізольовані труби тепломереж',order:186,facets:pipeFacets},
  {id:'district-heating-components',parent:'heating',title:'Комплектуючі тепломереж',order:187,facets:['pipeDiameterMm','angleDegrees','connection','material','pressureBar','productType']},
  {id:'geothermal-systems',parent:'heating',title:'Геотермальні зонди й комплектуючі',order:188,facets:pipeFacets},
  {id:'manifold-cabinets',parent:'distribution-hydraulics',title:'Колекторні шафи й комплектуючі',order:132,facets:['widthMm','heightMm','depthMm','material','installation','productType']},
  {id:'stormwater-infiltration-components',parent:'sewerage',title:'Інфільтрація та відведення дощових вод',order:365,facets:['volumeL','pipeDiameterMm','angleDegrees','material','productType','weightKg']},
  {id:'ventilation',parent:'climate',title:'Вентиляція',order:441,facets:[]},
  {id:'ventilation-ducts',parent:'ventilation',title:'Труби та повітроводи вентиляції',order:442,facets:pipeFacets},
  {id:'ventilation-components',parent:'ventilation',title:'Комплектуючі вентиляції',order:443,facets:['pipeDiameterMm','pipeLengthMm','angleDegrees','connection','material','productType']},
  // Extend existing leaves without replacing their current settings or links.
  {id:'pellet-burners',parent:'heat-generation',title:'Пелетні пальники',order:104,facets:['fuel']},
  {id:'pipe-fittings',parent:'water-supply',title:'Фітинги для труб',order:291,facets:['pipeWallThicknessMm']},
  {id:'underfloor-heating',parent:'heating',title:'Тепла підлога',order:140,facets:['pipeDiameterMm','pipeWallThicknessMm','pipeLengthMm','angleDegrees']},
  {id:'external-sewer-pipes',parent:'external-sewerage',title:'Труби зовнішньої каналізації',order:358,facets:['pipeWallThicknessMm']},
  {id:'internal-sewer-pipes',parent:'internal-sewerage',title:'Труби внутрішньої каналізації',order:355,facets:['pipeWallThicknessMm']},
  {id:'shutoff-valves',parent:'water-supply',title:'Крани й запірна арматура',order:292,facets:['pipeDiameterMm','voltage','protectionClass']},
  {id:'heating-fittings',parent:'heating-components',title:'Муфти, переходи й адаптери',order:180,facets:['pipeDiameterMm']},
  {id:'distribution-manifolds',parent:'distribution-hydraulics',title:'Розподільчі колектори',order:130,facets:['pipeDiameterMm','angleDegrees','voltage']},
  {id:'leak-protection',parent:'water-supply',title:'Захист від протікання води',order:293,facets:['pipeDiameterMm','flowM3h']},
  {id:'inspection-chambers',parent:'sewerage',title:'Каналізаційні колодязі й комплектуючі',order:362,facets:['angleDegrees']},
  {id:'heating-sensors-modules',parent:'automation',title:'Датчики та комунікаційні модулі',order:150,facets:['weightKg','material']},
];
export const options = {
  type:['Факельний, автоматичний'],
  material:['Нержавіюча сталь','Нержавіюча сталь / шамот','PE-RT II/AL/PE-RT II','PE-RT II/EVOH/PE-RT II','Спінений поліетилен (PE)','Пінополістирол',
    'Поліетилен (PE)','PE-Xa','PE-Xc','PE-Xe','PE-100','Поліфенілсульфон (PPSU)','Полівініліденфторид (PVDF)','PP-MD','EPDM','Бетон','PE-Xa/Al/PE','PE-Xc/Al/PE-RT',
    'Акрилонітрил-бутадієн-стирол (ABS)','Нітрильний каучук NBR','SBR','Бронза','Алюміній','Оцинкована сталь','Поліамід (PA)','Полівінілхлорид (PVC)','Каучук','Композитний матеріал','Синтетичний','Гіпсоволокниста плита'],
  productType:['Багатошарова труба','Труба з кисневим бар’єром','Монтажні комплектуючі для труб','Інструмент для монтажу труб','Комплектуючі теплої підлоги','Колекторна шафа','Комплектуючі колекторних шаф'],
  voltage:['230 В ±5%, 50 Гц','24 В AC','3 В','3,6 В','12 В','18 В','36 В','40 В'],
  outlets:['1','16'],
  fuel:['Деревні пелети'],
  compatibility:['Водогрійні пелетні котли'],
};
const literal=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";

export function metadataSql(){
  return `-- Approved engineering catalogue extension. Additions only, 2026-11-25.
begin;
do $wave2_metadata$
declare spec jsonb; row_brand public.brands%rowtype; row_category public.categories%rowtype;
  row_parent public.categories%rowtype; row_attribute public.attribute_definitions%rowtype;
  facet_id text; option_value text; ordinal integer;
begin
  for spec in select value from jsonb_array_elements(${literal(JSON.stringify(brands))}::jsonb) loop
    insert into public.brands(stable_id,slug,name,website_url,description,logo_url,visibility,status)
    values(spec->>'id',spec->>'id',spec->>'name',spec->>'website',spec->>'description',spec->>'logo','catalog','active')
    on conflict(stable_id)do nothing;
    select * into strict row_brand from public.brands where stable_id=spec->>'id';
    if row_brand.status<>'active' or row_brand.visibility<>'catalog' then raise exception 'Brand identity/state conflict: %',row_brand.stable_id; end if;
    perform public._taxonomy_put_release_entry('brands',row_brand.stable_id,public._taxonomy_brand_release_entry(row_brand));
  end loop;
  update public.brands set website_url='https://water.rehau.com/ua-uk'
  where stable_id='rehau' and status='active' and visibility='catalog' and nullif(btrim(website_url),'')is null;
  if found then
    select * into strict row_brand from public.brands where stable_id='rehau';
    perform public._taxonomy_put_release_entry('brands',row_brand.stable_id,public._taxonomy_brand_release_entry(row_brand));
  end if;
  for spec in select value from jsonb_array_elements(${literal(JSON.stringify(attributes))}::jsonb) loop
    insert into public.attribute_definitions(stable_id,label,value_type,unit,filterable,sortable,sort_order)
    values(spec->>'id',spec->>'label','number',spec->>'unit',true,true,75)on conflict(stable_id)do nothing;
    select * into strict row_attribute from public.attribute_definitions where stable_id=spec->>'id';
    if row_attribute.status<>'active' or row_attribute.value_type<>'number' or row_attribute.unit is distinct from spec->>'unit' then
      raise exception 'Attribute identity/type conflict: %',row_attribute.stable_id;
    end if;
    perform public._attributes_put_release_definition(row_attribute.stable_id,public._attributes_release_fields(row_attribute),
      jsonb_build_object('semanticId',row_attribute.stable_id,'aliases','[]'::jsonb));
  end loop;
  for facet_id,spec in select key,value from jsonb_each(${literal(JSON.stringify(options))}::jsonb) loop
    select * into strict row_attribute from public.attribute_definitions where stable_id=facet_id and status='active';
    if row_attribute.value_type<>'select' then raise exception 'Expected select attribute: %',facet_id; end if;
    for option_value in select jsonb_array_elements_text(spec) loop
      insert into public.attribute_options(attribute_id,value,label,sort_order)
      values(row_attribute.internal_id,option_value,option_value,1000)on conflict(attribute_id,value)do nothing;
      if exists(select 1 from public.attribute_options where attribute_id=row_attribute.internal_id and value=option_value and not active) then
        raise exception 'Refusing to reactivate manually disabled option: % / %',facet_id,option_value;
      end if;
    end loop;
    perform public._attributes_put_release_definition(row_attribute.stable_id,public._attributes_release_fields(row_attribute));
  end loop;
  for spec in select value from jsonb_array_elements(${literal(JSON.stringify(categories))}::jsonb) loop
    select * into strict row_parent from public.categories where stable_id=spec->>'parent' and status='active';
    insert into public.categories(stable_id,slug,parent_id,level,title,short_title,sort_order,status,visibility)
    values(spec->>'id',spec->>'id',row_parent.internal_id,row_parent.level+1,spec->>'title',spec->>'title',(spec->>'order')::integer,'active','catalog')
    on conflict(stable_id)do nothing;
    select * into strict row_category from public.categories where stable_id=spec->>'id';
    if row_category.parent_id is distinct from row_parent.internal_id or row_category.status<>'active' or row_category.visibility<>'catalog' then
      raise exception 'Category identity/state conflict: %',row_category.stable_id;
    end if;
    select coalesce(max(sort_order)+1,0)into ordinal from public.category_attributes where category_id=row_category.internal_id;
    for facet_id in select jsonb_array_elements_text(spec->'facets') loop
      select * into strict row_attribute from public.attribute_definitions where stable_id=facet_id and status='active';
      insert into public.category_attributes(category_id,attribute_id,facet_enabled,sort_order)
      values(row_category.internal_id,row_attribute.internal_id,row_attribute.filterable,ordinal)on conflict(category_id,attribute_id)do nothing;
      ordinal:=ordinal+1;
    end loop;
    perform public._taxonomy_put_release_entry('categories',row_category.stable_id,public._taxonomy_category_release_entry(row_category));
    perform public._attributes_sync_category_release(array[row_category.internal_id]);
  end loop;
end;
$wave2_metadata$;
commit;
`;
}

export function stagedReference(reference){
  const result=structuredClone(reference);
  for(const brand of brands)if(!result.brands.some(row=>row.id===brand.id))result.brands.push({id:brand.id,name:brand.name,status:'active'});
  for(const row of attributes)result.attributes[row.id]??={type:'number',label:row.label,unit:row.unit,values:[]};
  for(const [id,values]of Object.entries(options)){
    if(!result.attributes[id]||result.attributes[id].type!=='select')throw new Error(`Missing select definition: ${id}`);
    result.attributes[id].values=[...new Set([...(result.attributes[id].values||[]),...values])];
  }
  for(const spec of categories){
    let row=result.categories.find(category=>category.id===spec.id);
    if(!row){row={id:spec.id,title:spec.title,status:'active',visibility:'catalog',leaf:!categories.some(child=>child.parent===spec.id),facets:[]};result.categories.push(row);}
    row.facets=[...new Set([...row.facets,...spec.facets])];
  }
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=path.resolve(import.meta.dirname,'../..');
  const reference=JSON.parse(fs.readFileSync(path.join(root,'imports/reference-wave2.json'),'utf8'));
  fs.writeFileSync(path.join(root,'imports/wave2-metadata.sql'),metadataSql());
  fs.writeFileSync(path.join(root,'imports/reference-wave2-staged.json'),JSON.stringify(stagedReference(reference))+'\n');
  console.log(JSON.stringify({brands:brands.map(x=>x.id),categories:categories.length,attributes:attributes.length,options:Object.values(options).flat().length,hostedWrites:false}));
}
