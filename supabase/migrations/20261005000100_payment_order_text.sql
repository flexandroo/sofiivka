-- /payment said orders cannot be created on the site, while /checkout creates them (final audit AUD-008).
-- Only the one paragraph is replaced, so other edits made in /admin/pages stay as they are.
update public.site_pages
set body = (
  select jsonb_agg(case when block ->> 'text' = 'Онлайн-еквайринг і автоматичне створення замовлення на сайті наразі недоступні. Менеджер погоджує спосіб оплати та надає актуальні реквізити після перевірки товарів. Не здійснюйте переказ до отримання підтвердження.'
    then jsonb_set(block, '{text}', to_jsonb('Замовлення можна оформити на сайті: менеджер перевірить наявність, ціну й доставку та зв’яжеться з вами. Онлайн-оплати карткою поки немає, реквізити для оплати надсилаємо після підтвердження. Не здійснюйте переказ до отримання підтвердження.'::text)) else block end order by position)
  from jsonb_array_elements(body) with ordinality as item(block, position)
),
updated_at = now()
where slug = 'payment'
  and body @> jsonb_build_array(jsonb_build_object('text', 'Онлайн-еквайринг і автоматичне створення замовлення на сайті наразі недоступні. Менеджер погоджує спосіб оплати та надає актуальні реквізити після перевірки товарів. Не здійснюйте переказ до отримання підтвердження.'));
