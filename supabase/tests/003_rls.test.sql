begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, email, aud, role) values
  ('71000000-0000-0000-0000-000000000001', 'owner-rls@example.invalid', 'authenticated', 'authenticated'),
  ('71000000-0000-0000-0000-000000000002', 'admin-rls@example.invalid', 'authenticated', 'authenticated'),
  ('71000000-0000-0000-0000-000000000003', 'manager-rls@example.invalid', 'authenticated', 'authenticated'),
  ('71000000-0000-0000-0000-000000000004', 'content-rls@example.invalid', 'authenticated', 'authenticated'),
  ('71000000-0000-0000-0000-000000000005', 'inactive-rls@example.invalid', 'authenticated', 'authenticated'),
  ('71000000-0000-0000-0000-000000000006', 'unprofiled-rls@example.invalid', 'authenticated', 'authenticated');

insert into public.admin_profiles (user_id, name, role, active) values
  ('71000000-0000-0000-0000-000000000001', 'RLS Owner', 'owner', true),
  ('71000000-0000-0000-0000-000000000002', 'RLS Admin', 'admin', true),
  ('71000000-0000-0000-0000-000000000003', 'RLS Manager', 'manager', true),
  ('71000000-0000-0000-0000-000000000004', 'RLS Content', 'content_manager', true),
  ('71000000-0000-0000-0000-000000000005', 'RLS Inactive', 'manager', false);

insert into public.brands (internal_id, stable_id, slug, name, status, visibility) values
  ('72000000-0000-0000-0000-000000000001', 'rls-brand-active', 'rls-brand-active', 'RLS Active Brand', 'active', 'catalog'),
  ('72000000-0000-0000-0000-000000000002', 'rls-brand-inactive', 'rls-brand-inactive', 'RLS Inactive Brand', 'inactive', 'catalog');
insert into public.categories (internal_id, stable_id, slug, level, title, status, visibility) values
  ('73000000-0000-0000-0000-000000000001', 'rls-category-active', 'rls-category-active', 1, 'RLS Active Category', 'active', 'catalog'),
  ('73000000-0000-0000-0000-000000000002', 'rls-category-archived', 'rls-category-archived', 1, 'RLS Archived Category', 'archived', 'catalog'),
  ('73000000-0000-0000-0000-000000000003', 'rls-category-secondary', 'rls-category-secondary', 1, 'RLS Secondary Category', 'active', 'catalog');

insert into public.products (
  internal_id, legacy_id, sku, slug, title, short_title, model,
  brand_id, primary_category_id, publication_status, inventory_status
) values
  (
    '74000000-0000-0000-0000-000000000001', 'rls-public', 'RLS-PUBLIC', 'rls-public',
    'RLS Public Product', 'Public', 'PUBLIC',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'published', 'in_stock'
  ),
  (
    '74000000-0000-0000-0000-000000000002', 'rls-draft', 'RLS-DRAFT', 'rls-draft',
    'RLS Draft Product', 'Draft', 'DRAFT',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'draft', 'unknown'
  ),
  (
    '74000000-0000-0000-0000-000000000003', 'rls-inactive-brand', 'RLS-INACTIVE-BRAND', 'rls-inactive-brand',
    'RLS Inactive Brand Product', 'Inactive brand', 'INACTIVE-BRAND',
    '72000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000001', 'published', 'in_stock'
  ),
  (
    '74000000-0000-0000-0000-000000000004', 'rls-archived-category', 'RLS-ARCHIVED-CAT', 'rls-archived-category',
    'RLS Archived Category Product', 'Archived category', 'ARCHIVED-CAT',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002', 'published', 'in_stock'
  ),
  (
    '74000000-0000-0000-0000-000000000005', 'rls-discontinued', 'RLS-DISCONTINUED', 'rls-discontinued',
    'RLS Discontinued Product', 'Discontinued', 'DISCONTINUED',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'published', 'discontinued'
  ),
  (
    '74000000-0000-0000-0000-000000000006', 'rls-hidden', 'RLS-HIDDEN', 'rls-hidden',
    'RLS Hidden Product', 'Hidden', 'HIDDEN',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'hidden', 'in_stock'
  ),
  (
    '74000000-0000-0000-0000-000000000007', 'rls-archived', 'RLS-ARCHIVED', 'rls-archived',
    'RLS Archived Product', 'Archived', 'ARCHIVED',
    '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001', 'hidden', 'unknown'
  );
update public.products
set publication_status = 'archived', archived_at = now()
where internal_id = '74000000-0000-0000-0000-000000000007';

insert into public.attribute_definitions (internal_id, stable_id, label, value_type)
values ('77000000-0000-0000-0000-000000000001', 'rls-attribute', 'RLS attribute', 'number');
insert into public.product_attribute_values (product_id, attribute_id, value_number) values
  ('74000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 1),
  ('74000000-0000-0000-0000-000000000002', '77000000-0000-0000-0000-000000000001', 2),
  ('74000000-0000-0000-0000-000000000006', '77000000-0000-0000-0000-000000000001', 6),
  ('74000000-0000-0000-0000-000000000007', '77000000-0000-0000-0000-000000000001', 7);
insert into public.product_media (product_id, url) values
  ('74000000-0000-0000-0000-000000000001', 'https://example.invalid/public.webp'),
  ('74000000-0000-0000-0000-000000000002', 'https://example.invalid/draft.webp'),
  ('74000000-0000-0000-0000-000000000006', 'https://example.invalid/hidden.webp'),
  ('74000000-0000-0000-0000-000000000007', 'https://example.invalid/archived.webp');
insert into public.product_documents (product_id, title, url) values
  ('74000000-0000-0000-0000-000000000001', 'Public document', 'https://example.invalid/public.pdf'),
  ('74000000-0000-0000-0000-000000000002', 'Draft document', 'https://example.invalid/draft.pdf'),
  ('74000000-0000-0000-0000-000000000006', 'Hidden document', 'https://example.invalid/hidden.pdf'),
  ('74000000-0000-0000-0000-000000000007', 'Archived document', 'https://example.invalid/archived.pdf');
insert into public.tags (internal_id, stable_id, slug, name, status) values
  ('7a000000-0000-0000-0000-000000000001', 'rls-active-tag', 'rls-active-tag', 'RLS Active Tag', 'active'),
  ('7a000000-0000-0000-0000-000000000002', 'rls-review-tag', 'rls-review-tag', 'RLS Review Tag', 'review');
insert into public.product_tags (product_id, tag_id) values
  ('74000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000001'),
  ('74000000-0000-0000-0000-000000000001', '7a000000-0000-0000-0000-000000000002'),
  ('74000000-0000-0000-0000-000000000002', '7a000000-0000-0000-0000-000000000001');
insert into public.product_categories (product_id, category_id) values
  ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000003'),
  ('74000000-0000-0000-0000-000000000002', '73000000-0000-0000-0000-000000000003'),
  ('74000000-0000-0000-0000-000000000006', '73000000-0000-0000-0000-000000000003'),
  ('74000000-0000-0000-0000-000000000007', '73000000-0000-0000-0000-000000000003');
insert into public.product_collections (internal_id, stable_id, slug, title, collection_type)
values ('78000000-0000-0000-0000-000000000001', 'rls-collection', 'rls-collection', 'RLS Collection', 'manual');
insert into public.product_collection_items (collection_id, product_id) values
  ('78000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001'),
  ('78000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000002'),
  ('78000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000006'),
  ('78000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000007');

insert into public.suppliers (internal_id, stable_id, name)
values ('75000000-0000-0000-0000-000000000001', 'rls-supplier', 'RLS Supplier');
insert into public.product_source_records (internal_id, product_id, supplier_id, source_id, raw_payload)
values (
  '76000000-0000-0000-0000-000000000001',
  '74000000-0000-0000-0000-000000000001',
  '75000000-0000-0000-0000-000000000001',
  'rls-source-1',
  '{"supplierSecret":"must-not-leak"}'::jsonb
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select results_eq(
  $$ select legacy_id from public.products order by legacy_id $$,
  $$ values ('rls-discontinued'::text), ('rls-public'::text) $$,
  'anonymous users see only eligible published products, including discontinued inventory'
);
select results_eq(
  $$ select id from public.catalog_products order by id $$,
  $$ values ('rls-discontinued'::text), ('rls-public'::text) $$,
  'catalog view cannot bypass brand/category/publication visibility'
);
select results_eq(
  $$ select product_id from public.product_media order by product_id $$,
  $$ values ('74000000-0000-0000-0000-000000000001'::uuid) $$,
  'product media cannot leak draft, hidden or archived products'
);
select results_eq(
  $$ select product_id from public.product_documents order by product_id $$,
  $$ values ('74000000-0000-0000-0000-000000000001'::uuid) $$,
  'product documents cannot leak draft, hidden or archived products'
);
select results_eq(
  $$ select product_id from public.product_attribute_values order by product_id $$,
  $$ values ('74000000-0000-0000-0000-000000000001'::uuid) $$,
  'product attributes cannot leak draft, hidden or archived products'
);
select results_eq(
  $$ select product_id from public.product_categories order by product_id $$,
  $$ values ('74000000-0000-0000-0000-000000000001'::uuid) $$,
  'secondary product categories cannot leak draft, hidden or archived products'
);
select results_eq(
  $$ select product_id from public.product_collection_items order by product_id $$,
  $$ values ('74000000-0000-0000-0000-000000000001'::uuid) $$,
  'collection items cannot leak draft, hidden or archived products'
);
select results_eq(
  $$ select product_id, tag_id from public.product_tags order by product_id, tag_id $$,
  $$ values (
    '74000000-0000-0000-0000-000000000001'::uuid,
    '7a000000-0000-0000-0000-000000000001'::uuid
  ) $$,
  'product tag relations expose only public products with active tags'
);
select throws_ok(
  $$ select raw_payload from public.product_source_records $$,
  '42501',
  null,
  'anonymous users cannot read supplier raw payloads'
);
select throws_ok(
  $$ insert into public.brands (stable_id, slug, name) values ('anon-write', 'anon-write', 'Anon write') $$,
  '42501',
  null,
  'anonymous users cannot insert catalog rows'
);
select throws_ok(
  $$ update public.products set title = 'Anon update' where internal_id = '74000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'anonymous users cannot update products'
);
select throws_ok(
  $$ delete from public.products where internal_id = '74000000-0000-0000-0000-000000000001' $$,
  '42501',
  null,
  'anonymous users cannot delete products'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000006', true);
select results_eq(
  $$ select legacy_id from public.products order by legacy_id $$,
  $$ values ('rls-discontinued'::text), ('rls-public'::text) $$,
  'authenticated users without an admin profile retain public read scope only'
);
select is(
  (select count(*)::integer from public.product_source_records),
  0,
  'authenticated users without an admin profile see no supplier provenance'
);
select throws_ok(
  $$ select public.update_product_content(
       '74000000-0000-0000-0000-000000000002', '', '', '', '[]'::jsonb, null, null
     ) $$,
  'P0001',
  null,
  'authenticated users without an admin profile cannot use staff RPCs'
);
select throws_ok(
  $$ insert into public.products (legacy_id, sku, slug, title, short_title, model, brand_id, primary_category_id)
     values ('unprofiled-write', 'UNPROFILED-WRITE', 'unprofiled-write', 'Unprofiled write', 'Unprofiled', 'UNPROFILED',
       '72000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000001') $$,
  '42501',
  null,
  'authenticated users without an admin profile cannot insert products'
);
update public.products set title = 'Unprofiled update'
where internal_id = '74000000-0000-0000-0000-000000000002';
delete from public.products where internal_id = '74000000-0000-0000-0000-000000000002';
reset role;
select is(
  (select title from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  'RLS Draft Product',
  'unprofiled update and delete changed no protected rows'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000005', true);
select results_eq(
  $$ select legacy_id from public.products order by legacy_id $$,
  $$ values ('rls-discontinued'::text), ('rls-public'::text) $$,
  'inactive staff fall back to public read scope'
);
select throws_ok(
  $$ select public.update_product_commercial(
       '74000000-0000-0000-0000-000000000002', 100, null, 'UAH', 'known', 'in_stock'
     ) $$,
  'P0001',
  null,
  'inactive staff cannot use commercial RPC'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
update public.products set title = 'Manager direct edit must fail'
where internal_id = '74000000-0000-0000-0000-000000000002';
update public.products set legacy_id = 'manager-changed-id'
where internal_id = '74000000-0000-0000-0000-000000000002';
select lives_ok(
  $$ select public.update_product_commercial(
       '74000000-0000-0000-0000-000000000002', 100, null, 'UAH', 'known', 'in_stock'
     ) $$,
  'manager may update commercial fields through the scoped RPC'
);
select throws_ok(
  $$ select public.update_product_content(
       '74000000-0000-0000-0000-000000000002', 'Manager content', '', '', '[]'::jsonb, null, null
     ) $$,
  'P0001',
  null,
  'manager cannot use content RPC'
);
reset role;
select is(
  (select title from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  'RLS Draft Product',
  'manager direct product update changed zero rows'
);
select is(
  (select legacy_id from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  'rls-draft',
  'manager cannot alter protected legacy identity'
);
select is(
  (select amount from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  100.00::numeric,
  'manager commercial RPC changed the approved field'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*)::integer from public.product_source_records),
  0,
  'content manager sees no supplier raw payloads'
);
update public.products set amount = 999
where internal_id = '74000000-0000-0000-0000-000000000002';
select lives_ok(
  $$ select public.update_product_content(
       '74000000-0000-0000-0000-000000000002', 'Content description', 'Short content', 'Full content', '[]'::jsonb, 'SEO', 'SEO description'
     ) $$,
  'content manager may update content fields through the scoped RPC'
);
select throws_ok(
  $$ select public.update_product_content(
       '74000000-0000-0000-0000-000000000002', '', '', '', null, null, null
     ) $$,
  'P0001',
  null,
  'content RPC rejects a null section array'
);
select throws_ok(
  $$ select public.update_product_commercial(
       '74000000-0000-0000-0000-000000000002', 110, null, 'UAH', 'known', 'in_stock'
     ) $$,
  'P0001',
  null,
  'content manager cannot use commercial RPC'
);
select lives_ok(
  $$ insert into public.product_media (internal_id, product_id, url)
     values ('79000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000002', 'https://example.invalid/content.webp') $$,
  'content manager may insert product media metadata'
);
select lives_ok(
  $$ update public.product_media set alt_text = 'Content alt' where internal_id = '79000000-0000-0000-0000-000000000001' $$,
  'content manager may update product media metadata'
);
select lives_ok(
  $$ delete from public.product_media where internal_id = '79000000-0000-0000-0000-000000000001' $$,
  'content manager may delete product media metadata'
);
select lives_ok(
  $$ insert into public.product_documents (internal_id, product_id, title, url)
     values ('79000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000002', 'Content document', 'https://example.invalid/content.pdf') $$,
  'content manager may insert product documents'
);
select lives_ok(
  $$ delete from public.product_documents where internal_id = '79000000-0000-0000-0000-000000000002' $$,
  'content manager may delete product documents'
);
select lives_ok(
  $$ insert into public.tags (internal_id, stable_id, slug, name)
     values ('79000000-0000-0000-0000-000000000003', 'content-tag', 'content-tag', 'Content tag') $$,
  'content manager may create editorial tags'
);
select lives_ok(
  $$ delete from public.tags where internal_id = '79000000-0000-0000-0000-000000000003' $$,
  'content manager may delete an unused editorial tag'
);
select lives_ok(
  $$ insert into public.product_collections (internal_id, stable_id, slug, title, collection_type)
     values ('79000000-0000-0000-0000-000000000004', 'content-collection', 'content-collection', 'Content collection', 'manual') $$,
  'content manager may create homepage/catalog collections'
);
select lives_ok(
  $$ delete from public.product_collections where internal_id = '79000000-0000-0000-0000-000000000004' $$,
  'content manager may delete an unused collection'
);
reset role;
select is(
  (select description from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  'Content description',
  'content RPC changed the approved field'
);
select is(
  (select amount from public.products where internal_id = '74000000-0000-0000-0000-000000000002'),
  100.00::numeric,
  'content manager direct write and commercial RPC did not change the commercial field'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ insert into public.brands (internal_id, stable_id, slug, name)
     values ('79000000-0000-0000-0000-000000000006', 'admin-brand', 'admin-brand', 'Admin brand') $$,
  'admin may insert a brand'
);
select lives_ok(
  $$ update public.brands set name = 'Admin brand updated' where internal_id = '79000000-0000-0000-0000-000000000006' $$,
  'admin may update a brand'
);
select lives_ok(
  $$ delete from public.brands where internal_id = '79000000-0000-0000-0000-000000000006' $$,
  'admin may delete an unreferenced brand'
);
select lives_ok(
  $$ insert into public.categories (internal_id, stable_id, slug, level, title)
     values ('79000000-0000-0000-0000-000000000007', 'admin-category', 'admin-category', 1, 'Admin category') $$,
  'admin may insert a category'
);
select lives_ok(
  $$ delete from public.categories where internal_id = '79000000-0000-0000-0000-000000000007' $$,
  'admin may delete an unreferenced category'
);
select lives_ok(
  $$ insert into public.attribute_definitions (internal_id, stable_id, label, value_type)
     values ('79000000-0000-0000-0000-000000000008', 'admin-attribute', 'Admin attribute', 'string') $$,
  'admin may insert an attribute definition'
);
select lives_ok(
  $$ delete from public.attribute_definitions where internal_id = '79000000-0000-0000-0000-000000000008' $$,
  'admin may delete an unreferenced attribute definition'
);
select lives_ok(
  $$ insert into public.import_runs (internal_id, supplier_id)
     values ('79000000-0000-0000-0000-000000000009', '75000000-0000-0000-0000-000000000001') $$,
  'admin may insert an import run'
);
select lives_ok(
  $$ delete from public.import_runs where internal_id = '79000000-0000-0000-0000-000000000009' $$,
  'admin may delete an unreferenced import run'
);
select lives_ok(
  $$ update public.products set title = 'Admin direct edit' where internal_id = '74000000-0000-0000-0000-000000000002' $$,
  'admin may directly update catalog rows'
);
select throws_ok(
  $$ update public.products set legacy_id = 'admin-changed-id' where internal_id = '74000000-0000-0000-0000-000000000002' $$,
  'P0001',
  null,
  'immutable legacy identity also applies to admin writes'
);
select throws_ok(
  $$ update public.admin_profiles set role = 'owner' where user_id = '71000000-0000-0000-0000-000000000002' $$,
  '42501',
  null,
  'admin cannot promote itself to owner'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ update public.admin_profiles set role = 'owner' where user_id = '71000000-0000-0000-0000-000000000002' $$,
  'owner may promote another administrator to owner'
);
select lives_ok(
  $$ update public.admin_profiles set role = 'admin' where user_id = '71000000-0000-0000-0000-000000000002' $$,
  'owner may demote another owner while one active owner remains'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-media', '74000000-0000-0000-0000-000000000001/hero.webp') $$,
  'content manager may register media below an existing product UUID path'
);
select lives_ok(
  $$ update storage.objects
     set name = '74000000-0000-0000-0000-000000000001/hero-updated.webp'
     where bucket_id = 'product-media'
       and name = '74000000-0000-0000-0000-000000000001/hero.webp' $$,
  'content manager may update an object while it remains in an allowed product path'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-media', '00000000-0000-0000-0000-000000000000/orphan.webp') $$,
  '42501',
  null,
  'content manager cannot create an orphan product-media path'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('import-private', 'rls-supplier/2026/09/run/file.json') $$,
  '42501',
  null,
  'content manager cannot write private supplier imports'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.product_source_records),
  1,
  'manager may read supplier provenance needed for mapping work'
);
select lives_ok(
  $$ update public.product_attribute_values set value_number = 1.5
     where product_id = '74000000-0000-0000-0000-000000000001'
       and attribute_id = '77000000-0000-0000-0000-000000000001' $$,
  'manager may update normalized product specifications'
);
select lives_ok(
  $$ insert into public.category_mapping_reviews (
       internal_id, product_id, current_category_id, suggested_category_id, reason
     ) values (
       '79000000-0000-0000-0000-000000000005',
       '74000000-0000-0000-0000-000000000002',
       '73000000-0000-0000-0000-000000000001',
       '73000000-0000-0000-0000-000000000003',
       'Manager review fixture'
     ) $$,
  'manager may create a category mapping review'
);
select lives_ok(
  $$ delete from public.category_mapping_reviews where internal_id = '79000000-0000-0000-0000-000000000005' $$,
  'manager may resolve/remove a category mapping review fixture'
);
select throws_ok(
  $$ insert into public.brands (stable_id, slug, name) values ('manager-brand', 'manager-brand', 'Manager brand') $$,
  '42501',
  null,
  'manager cannot create brands'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('product-media', '74000000-0000-0000-0000-000000000001/manager.webp') $$,
  '42501',
  null,
  'manager cannot write public content assets'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('import-private', 'rls-supplier/2026/09/76000000-0000-0000-0000-000000000001/file.json') $$,
  'admin may write a supplier-scoped private import object'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'product-media' and name like '74000000-0000-0000-0000-000000000001/%'),
  1,
  'anonymous users may read/list registered public assets'
);
select is(
  (select count(*)::integer from storage.objects where bucket_id = 'import-private'),
  0,
  'anonymous users cannot see private supplier-import objects'
);
reset role;

select * from finish();
rollback;
