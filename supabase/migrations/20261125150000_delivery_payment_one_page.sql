-- /delivery and /payment are one page now («Доставка й оплата»; /payment redirects to /delivery#payment). The order
-- steps, the delivery and payment options and the card-payment warning are built into the page, so the article edited
-- in /admin/pages keeps «Що перевірити при отриманні» and «Для підприємств і монтажних організацій» (the payment
-- article's business paragraph moves here). Texts are replaced only while they are as written, so edits made in
-- /admin/pages stay; the separate «Оплата» page goes. A re-run changes nothing.
update public.site_pages
set body = '[{"type":"heading","text":"Що перевірити при отриманні"},{"type":"list","ordered":false,"items":["Кількість місць, цілісність упаковки й відсутність слідів удару або намокання.","Назву та модель на коробці, якщо вона доступна без пошкодження упаковки.","Комплектність за супровідними документами.","Пошкодження потрібно зафіксувати до завершення отримання за правилами перевізника."]},{"type":"heading","text":"Для підприємств і монтажних організацій"},{"type":"paragraph","text":"Документи формуються за підтвердженими реквізитами та номенклатурою. Якщо об''єкт постачається частинами, порядок рахунків і відвантажень узгоджується до першої оплати."}]'::jsonb,
    updated_at = now()
where slug = 'delivery'
  and body = '[{"type":"heading","text":"Як формується строк"},{"type":"list","ordered":true,"items":["Перевіряємо фактичний склад відвантаження кожної позиції.","Уточнюємо, чи можна відправити комплект одним місцем або однією партією.","Звіряємо обмеження перевізника для довгомірних, важких і крихких товарів.","Підтверджуємо орієнтовну дату відправлення та спосіб отримання."]},{"type":"heading","text":"Що перевірити при отриманні"},{"type":"list","ordered":false,"items":["Кількість місць, цілісність упаковки й відсутність слідів удару або намокання.","Назву та модель на коробці, якщо вона доступна без пошкодження упаковки.","Комплектність за супровідними документами.","Пошкодження потрібно зафіксувати до завершення отримання за правилами перевізника."]},{"type":"heading","text":"Великогабаритні товари"},{"type":"paragraph","text":"Радіатори, баки, котли, довгомірні труби та інше об''ємне обладнання можуть потребувати окремого тарифу, дерев''яного каркаса або адресної доставки. Такі умови погоджуємо до оплати."}]'::jsonb;

update public.site_pages
set nav_title = 'Доставка й оплата', updated_at = now()
where slug = 'delivery' and nav_title = 'Доставка';

update public.site_pages
set seo_title = 'Доставка й оплата | ТД «Софіївка»',
    seo_description = 'Доставка по Україні перевізником, самовивіз із магазину, оплата рахунком, при отриманні або в магазині після підтвердження менеджером.',
    updated_at = now()
where slug = 'delivery'
  and seo_title = 'Доставка | ТД «Софіївка»'
  and seo_description = 'Способи отримання, підтвердження строків і перевірка технічного обладнання при доставці.';

-- Menus link the payment part of /delivery instead of /payment, which only redirects there now.
update public.site_settings
set value = replace(value::text, '"/payment"', '"/delivery#payment"')::jsonb, updated_at = now()
where key = 'menus' and value::text like '%"/payment"%';

delete from public.site_pages where slug = 'payment';
