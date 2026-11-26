-- Some user-supplied recommended price lists do not state VAT treatment.
-- Preserve that missing fact as NULL; quote the listed amount without inventing a VAT uplift.
-- Existing TRUE/FALSE sources, FX settings and stored product prices are unchanged.
alter table public.product_price_sources alter column vat_included drop not null;

comment on column public.product_price_sources.vat_included is
  'TRUE: VAT explicitly included; FALSE: VAT explicitly excluded, apply configured VAT; NULL: VAT not stated, use amount as quoted without claiming inclusion or adding VAT.';

create or replace function public._fx_site_price(base numeric, currency text, vat_included boolean,
  rate numeric, markup_percent numeric, vat_percent numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(base
    * case when vat_included is false then 1 + vat_percent / 100 else 1 end
    * case when currency = 'UAH' then 1 else rate * (1 + markup_percent / 100) end, 0)
$$;

comment on function public._fx_site_price(numeric, text, boolean, numeric, numeric, numeric) is
  'Whole-UAH site price using configured FX spread. VAT is added only for explicitly VAT-exclusive sources; NULL VAT is an unstated as-quoted amount, not a VAT-inclusive assertion.';
