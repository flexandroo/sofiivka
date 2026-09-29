begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

select is((select count(*)::integer from public.brands), 36, 'core seed has 36 brands');
select is((select count(*)::integer from public.categories), 87, 'core seed has 87 categories');
select is((select count(*)::integer from public.attribute_definitions), 64, 'core seed has 64 attributes');
select is((select count(*)::integer from public.category_attributes), 648, 'core seed has 648 category-attribute relations');
select is((select count(*)::integer from public.category_attributes where not facet_enabled), 47, '47 non-filterable category facets remain disabled');
select is((select count(*)::integer from public.products), 0, 'core seed imports no products');

select is(
  (select count(*)::integer from public.categories where parent_id is null and level <> 1),
  0,
  'all category roots have level 1'
);
select is(
  (
    select count(*)::integer
    from public.categories child
    join public.categories parent on parent.internal_id = child.parent_id
    where child.level <> parent.level + 1
  ),
  0,
  'every child category is exactly one level below its parent'
);
select is(
  (
    with recursive walk as (
      select internal_id as origin_id, parent_id, array[internal_id] as path, false as cycle
      from public.categories
      union all
      select walk.origin_id, parent.parent_id, walk.path || parent.internal_id,
             parent.internal_id = any(walk.path)
      from walk
      join public.categories parent on parent.internal_id = walk.parent_id
      where not walk.cycle
    )
    select count(*)::integer from walk where cycle
  ),
  0,
  'category hierarchy contains no cycle'
);
select is(
  (select count(*)::integer from public.categories where sort_order < 0),
  0,
  'category ordering contains no negative positions'
);
select ok(
  exists (select 1 from public.categories where status = 'future'),
  'future category status is represented in the core registry'
);
select ok(
  exists (select 1 from public.categories where status = 'internal'),
  'internal category status is represented in the core registry'
);
select ok(
  exists (select 1 from public.categories where visibility = 'landing'),
  'landing category visibility is represented in the core registry'
);
select ok(
  exists (select 1 from public.categories where visibility = 'service'),
  'service category visibility is represented in the core registry'
);

insert into public.brands (internal_id, stable_id, slug, name)
values ('10000000-0000-0000-0000-000000000001', 'qa-brand', 'qa-brand', 'QA Brand');
insert into public.categories (internal_id, stable_id, slug, level, title)
values ('20000000-0000-0000-0000-000000000001', 'qa-root', 'qa-root', 1, 'QA Root');
insert into public.categories (internal_id, stable_id, slug, parent_id, level, title)
values (
  '20000000-0000-0000-0000-000000000002', 'qa-child', 'qa-child',
  '20000000-0000-0000-0000-000000000001', 2, 'QA Child'
);
insert into public.categories (internal_id, stable_id, slug, level, title)
values ('20000000-0000-0000-0000-000000000003', 'qa-root-two', 'qa-root-two', 1, 'QA Root Two');
select lives_ok(
  $$ insert into public.categories (internal_id, stable_id, slug, parent_id, level, title)
     values (
       '20000000-0000-0000-0000-000000000004', 'qa-child-other-branch', 'qa-child',
       '20000000-0000-0000-0000-000000000003', 2, 'QA Child Other Branch'
     ) $$,
  'the same category slug is allowed below a different parent'
);
select throws_ok(
  $$ insert into public.categories (internal_id, stable_id, slug, parent_id, level, title)
     values (
       '20000000-0000-0000-0000-000000000005', 'qa-child-sibling-duplicate', 'qa-child',
       '20000000-0000-0000-0000-000000000001', 2, 'QA Duplicate Sibling'
     ) $$,
  '23505',
  null,
  'duplicate sibling category slug is rejected'
);

select throws_ok(
  $$ update public.categories set parent_id = '20000000-0000-0000-0000-000000000002', level = 3 where internal_id = '20000000-0000-0000-0000-000000000001' $$,
  'P0001',
  null,
  'category cycle is rejected'
);

insert into public.products (
  internal_id, legacy_id, sku, slug, title, short_title, model,
  brand_id, primary_category_id, updated_at
)
values (
  '30000000-0000-0000-0000-000000000001', 'qa-product-1', 'QA-SKU-1', 'qa-product-1',
  'QA Product One', 'QA One', 'QA-1',
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '2000-01-01'
);

select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id)
     values ('qa-product-1', 'QA-SKU-LEGACY-DUP', 'qa-legacy-duplicate', 'Duplicate legacy ID', 'Duplicate', 'QA-LD',
       '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
  '23505',
  null,
  'duplicate legacy product ID is rejected'
);
select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id)
     values ('qa-product-2', 'qa-sku-1', 'qa-product-2', 'Duplicate SKU', 'Duplicate', 'QA-2',
       '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
  '23505',
  null,
  'case-insensitive duplicate SKU is rejected'
);
select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id)
     values ('qa-product-3', 'QA-SKU-3', 'QA-PRODUCT-1', 'Duplicate slug', 'Duplicate', 'QA-3',
       '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
  '23505',
  null,
  'case-insensitive duplicate slug is rejected'
);
select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id)
     values (' qa-product-4 ', 'QA-SKU-4', 'qa-product-4', 'Whitespace ID', 'Whitespace', 'QA-4',
       '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002') $$,
  '23514',
  null,
  'identifier whitespace is rejected instead of silently normalized'
);
select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id, amount, price_status)
     values ('qa-product-5', 'QA-SKU-5', 'qa-product-5', 'Invalid price', 'Invalid price', 'QA-5',
       '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 100, 'unknown') $$,
  '23514',
  null,
  'unknown price status cannot carry a numeric price'
);

update public.products set title = 'QA Product One Updated' where internal_id = '30000000-0000-0000-0000-000000000001';
select ok(
  (select updated_at > '2000-01-01'::timestamptz from public.products where internal_id = '30000000-0000-0000-0000-000000000001'),
  'updated_at trigger advances product timestamp'
);
select throws_ok(
  $$ update public.products set legacy_id = 'changed-id' where internal_id = '30000000-0000-0000-0000-000000000001' $$,
  'P0001',
  null,
  'legacy product ID is immutable'
);

insert into public.suppliers (internal_id, stable_id, name)
values ('40000000-0000-0000-0000-000000000001', 'qa-supplier', 'QA Supplier');
insert into public.product_source_records (internal_id, product_id, supplier_id, source_id)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'source-1'
);
insert into public.attribute_definitions (internal_id, stable_id, label, value_type)
values ('70000000-0000-0000-0000-000000000001', 'qa-delete-attribute', 'QA delete attribute', 'string');
insert into public.product_attribute_values (product_id, attribute_id, value_text)
values (
  '30000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'protected'
);
select throws_ok(
  $$ delete from public.products where internal_id = '30000000-0000-0000-0000-000000000001' $$,
  '23503',
  null,
  'supplier provenance blocks physical product deletion'
);
select throws_ok(
  $$ delete from public.brands where internal_id = '10000000-0000-0000-0000-000000000001' $$,
  '23503',
  null,
  'referenced brand deletion is restricted'
);
select throws_ok(
  $$ delete from public.categories where internal_id = '20000000-0000-0000-0000-000000000002' $$,
  '23503',
  null,
  'referenced category deletion is restricted'
);
select throws_ok(
  $$ delete from public.attribute_definitions where internal_id = '70000000-0000-0000-0000-000000000001' $$,
  '23503',
  null,
  'referenced attribute deletion is restricted'
);
select throws_ok(
  $$ delete from public.suppliers where internal_id = '40000000-0000-0000-0000-000000000001' $$,
  '23503',
  null,
  'referenced supplier deletion is restricted'
);

insert into public.products (
  internal_id, legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id
) values (
  '30000000-0000-0000-0000-000000000002', 'qa-cascade-product', 'QA-CASCADE', 'qa-cascade-product',
  'QA Cascade Product', 'Cascade', 'QA-C',
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'
);
insert into public.product_media (internal_id, product_id, url)
values (
  '70000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  'https://example.invalid/cascade.webp'
);
delete from public.products where internal_id = '30000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::integer from public.product_media where internal_id = '70000000-0000-0000-0000-000000000002'),
  0,
  'product-owned media cascades only when an otherwise deletable product is purged'
);

insert into auth.users (id, email, aud, role)
values ('60000000-0000-0000-0000-000000000001', 'owner-integrity@example.invalid', 'authenticated', 'authenticated');
insert into public.admin_profiles (user_id, name, role)
values ('60000000-0000-0000-0000-000000000001', 'Integrity Owner', 'owner');
select throws_ok(
  $$ update public.admin_profiles set active = false where user_id = '60000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'the last active owner cannot be deactivated'
);
select throws_ok(
  $$ delete from public.admin_profiles where user_id = '60000000-0000-0000-0000-000000000001' $$,
  '23514',
  null,
  'the last active owner cannot be deleted'
);

select * from finish();
rollback;
