-- /service-center: one name everywhere (menu «Сервіс», breadcrumbs, footer and tab already say «Сервісний центр»), so the
-- headline becomes «Сервісний центр». Only the headline as it was written is replaced; an edited one stays.
update public.site_pages
set title = 'Сервісний центр', updated_at = now()
where slug = 'service-center' and title = 'Сервіс і гарантія';
