# Supabase Read Model v2

## Назначение

Read Model v2 убирает обязательную загрузку полного каталожного snapshot размером 45,46 MB из обычных пользовательских сценариев. Каталог, фильтры, PDP, поиск и редакционные подборки получают только нужный срез данных через безопасные публичные RPC. Полный `get_catalog_snapshot` сохранён только для диагностики и parity-проверок.

Production frontend не переключён: без явного DEV-параметра сайт продолжает использовать локальный источник данных. Текущий DEV-проект Supabase — `sofievka`, project ref `wfxcklglujgramasdzyr`.

## Поток данных

1. `get_catalog_version` возвращает текущую версию опубликованного read model.
2. `get_catalog_bootstrap` один раз загружает таксономию, бренды, определения атрибутов и счётчики без полного массива товаров.
3. PLP параллельно вызывает `get_catalog_products` и `get_catalog_facets`.
4. PDP вызывает `get_catalog_product`, который возвращает одну полную карточку и до четырёх связанных компактных карточек.
5. Автодополнение и страница поиска используют `search_catalog`.
6. Главная и другие редакционные блоки используют `get_catalog_collection`.
7. `get_catalog_snapshot` доступен адаптеру только в режиме `dataSource=supabase-full` для debug/parity.

## Публичный DataSource API

- `loadVersion()` — версия опубликованного read model.
- `loadBootstrap()` — таксономия, бренды, атрибуты и агрегированные счётчики.
- `listProducts(query)` — компактные карточки, сортировка и offset pagination.
- `loadFacets(query)` — серверные brand/category/availability/technical facets с self-exclusion.
- `getProductById(id)` — полный PDP payload и связанные товары.
- `search(query)` — серверное ранжирование по SKU, модели, названию, FTS, trigram и substring.
- `getCollection(id)` — редакционная подборка в заданном порядке.
- `loadFullSnapshot()` — только диагностический путь.

`LocalCatalogDataSource` реализует тот же контракт, поэтому локальный и Supabase-режимы можно сравнивать одними parity-тестами.

## PLP semantics

- Фильтры между группами объединяются через AND.
- Несколько значений внутри одной группы объединяются через OR.
- Facet counts рассчитываются с self-exclusion выбранной группы.
- Неопределённая цена сортируется после товаров с известной ценой.
- Стабильный tie-breaker — канонический порядок и ID.
- Размер страницы по умолчанию — 24, серверный предел — 96.
- Выбрана offset pagination: при текущих 3 215 записях она сохраняет существующее поведение сортировки, URL и кнопку «Показати ще» без усложнения публичного контракта. Cursor pagination можно добавить при существенном росте каталога.

## Кэширование и инвалидация

- Bootstrap кэшируется на клиенте на 300 секунд.
- Scoped responses кэшируются на 60 секунд.
- Ключ включает версию read model, имя операции и стабильное представление параметров.
- При изменении версии scoped-кэш очищается до следующего чтения.
- Повторный PLP не загружает bootstrap повторно и делает только запросы товаров и facets.
- RPC вызываются POST-запросами Supabase, поэтому общий CDN-кэш сейчас не используется. Если он понадобится, безопасное развитие — version-keyed GET façade на edge, а не возврат к полному snapshot.

## База данных

Миграция `20260929000400_catalog_scoped_read_api.sql` добавляет приватный материализованный слой `catalog_product_cards`, индексы и публичные RPC. `finalize_catalog_snapshot` синхронизирует полный диагностический snapshot и scoped cards атомарно.

Миграция `20260929000500_catalog_facets_object_length_fix.sql` добавляет закрытый helper `extensions.jsonb_object_length(jsonb)` для совместимости PostgreSQL окружения и обновляет контролируемый `search_path` facets-функции.

Все публичные функции используют `SECURITY DEFINER`, фиксированный `search_path`, явные grants и обязательное исключение скрытых товаров. Прямой доступ anon к приватным таблицам и служебной финализации отсутствует.

## Индексы

Материализованный слой индексирован по опубликованности, category/brand, цене, наличию, порядку, поисковому документу и trigram-полям. На фактическом DEV-наборе из 3 215 товаров все проверенные планы выполняются без temp I/O; самый тяжёлый — поиск, 316,709 ms. Дополнительная миграция индексов сейчас не обоснована измерениями.

## DEV-запуск

```powershell
npm run catalog:adapter:demo
```

- Scoped preview: `http://127.0.0.1:4174/?dataSource=supabase`
- Full debug snapshot: добавьте `?dataSource=supabase-full`
- Обычный локальный режим: URL без `dataSource`

DEV-сервер удаляет восемь тяжёлых product-feed script tags только для `dataSource=supabase`. Обычная локальная страница остаётся неизменной. Параметр DEV-источника сохраняется при внутренних переходах, фильтрации, сортировке, поиске и работе истории; публичные URL без DEV-параметра не переписываются.

## Ошибки и конкурентные запросы

- Нет неявного fallback на локальный полный каталог: ошибка remote source показывается контролируемым состоянием с retry.
- PLP отменяет устаревшие запросы через `AbortController` и игнорирует ответы с устаревшим sequence id.
- Автодополнение использует debounce, отмену предыдущего запроса и безопасное пустое/error состояние.
- PLP показывает skeleton, empty state, load-more и ошибку в существующей дизайн-системе.

## Проверки

```powershell
npm run catalog:performance:baseline
npm run catalog:performance:v2
npm run catalog:scoped:parity
npm run catalog:adapter:parity
node tests/catalog-qa.js
node tests/catalog-contract-qa.js
node tests/product-identity-audit.js
node tests/supabase-client-qa.mjs
node tests/supabase-schema-qa.js
```

Подробные результаты находятся в `reports/catalog-performance-baseline-v2.json`, `reports/catalog-performance-v2.json`, `reports/catalog-scoped-parity-v2.json`, `reports/catalog-data-source-parity.json` и `reports/catalog-scoped-read-model-preflight.json`.

## Ограничения текущего этапа

- Production frontend не подключён к Supabase.
- Vercel deploy и push не выполнялись.
- Импорт товаров не выполнялся; использован уже существовавший DEV-набор.
- Docker не использовался.
- Локальный runtime pgTAP не запускался из-за Docker-free стратегии; SQL suite добавлен, статическая schema QA и удалённые read-only security/parity проверки пройдены.
