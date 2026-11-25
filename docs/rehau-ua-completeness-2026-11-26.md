# REHAU Ukraine: повнота офіційного джерела

Перевірка публічного [OXOMI portal 3001044](https://oxomi.com/p/3001044) завершена 26.11.2026. Це перевірка джерела; готовність конкретного товару до імпорту надалі визначають звичайні вимоги до назви, характеристик і точного зображення.

Підтверджено **4333 унікальні SKU та 4333 різні internal productId**, що дорівнює metadata.products офіційного порталу. Повний поділ: 4008 REHAU engineering і 325 MEPA поза engineering scope. Початкові 4101 resolved UA записи доповнено 24 engineering і 208 MEPA; невідомого залишку немає. Для всіх 6800 DE SKU у попередніх UA product/data cache незалежно підтверджено 2835 resolved:true, 3965 false, 0 неперевірених.

Замикання виконано без обмеження кількості SKU: 233 модельні запити, 220 слів типів товару та 1188 коректних UTF-8 слів із назв/моделей джерела; кожен новий SKU перевірено через product/data, а variants-html рекурсивно перевірено до відсутності нових SKU. 3968 попередніх variant queries та 365 нових/пізніх запитів разом покривають 4333 записи. Допоміжну спробу зі словами в неправильному кодуванні відкинуто; фінальний індекс витягнуто через Node безпосередньо з UTF-8 JSON.

Не можна підсумовувати старі prefix query counts: сервер нормалізує `135*` як `135 *` і, наприклад, повертає SKU 13474501001. Офіційний [Universal Search](https://www.oxomi.com/kba/1GF3G) має початковий limit 50; limit 5000 не є доказом отримання всього каталогу. Остаточна відповідність лічильнику доведена після фактичного збирання resolved SKU та різних productId, а не прийнята наперед.

Frozen доказ: `imports/rehau-ua-completeness-qa.json`, SHA256 `9642aba456d4c34fcac0d5faa04411506bea7ec5f9cc9eeab23d0de29e2a06cb`. Він містить повний source partition, 24 engineering recoveries з офіційними ID/назвами/URL і 208 MEPA out-of-scope recoveries з original API cache paths. Повні 9 query groups для 24 engineering збережені в `tmp/rehau-ua-completeness/full-engineering-e027d140db36f230a20d.json`, SHA256 `3ee61c7be9b61325cec205ae01b5cc1a17a19eb4ad2787d9640bd6d7125afa9b`. Цей tmp-файл є кешем; його можна відновити з публічного API наведеним нижче кодом.

## Відтворення зі свіжого clone

Спершу виконати звичайні inventory/details кроки `scripts/import/rehau-collect.py`. Потім:

```powershell
node scripts/import/rehau-ua-completeness-test.mjs
node scripts/import/rehau-ua-completeness.mjs --output=imports/rehau-ua-completeness-current.json
```

Скрипт використовує тільки вбудовані Node APIs і публічні read-only OXOMI endpoints, без credentials. Історичні SKU з committed frozen доказу та cached collector details служать лише seed: кожен заново підтверджується офіційним product/data. Тому 24 recoveries не губляться зі свіжим clone навіть за повторення старої неповної пошукової інвентаризації.

Код заново отримує **динамічне** metadata.products до та після обходу, виконує всі слова актуальних назв/моделей і повне variants closure, перевіряє рівність кількості distinct resolved SKU та distinct internal productId цільовому значенню. Незамкнений граф, зміна metadata, дублікати ID, обрізаний bulk response або неповний лічильник спричиняють ненульовий exit code. Для нових engineering SKU він додатково зберігає всі 9 повних query groups. Звіт містить query URLs, SHA256 response packets, source cache paths і повний список recoveries.

`--reuse-cache` явно відновлює попередній кешований snapshot і позначає результат як `PASS_CACHED_SOURCE_PARTITION_SNAPSHOT`; однакова актуальна кількість сама по собі не підтверджує актуальність кожного старого запису. Типовий запуск виконує свіжі публічні запити. Файли змінюються лише у власному `tmp/rehau-ua-completeness-replay` та новому звіті. Скрипт не змінює collector inventory/details, adapter, assets, frozen batches, БД чи Git. Власник імпорту окремо ingest-ить точні packets, після чого запускає звичайний media/editorial/import QA.

Локальний тест використовує fake public responses без мережі: перевіряє відкриття другого SKU через variants, третього через source-word query, повні engineering packets, cache resume та відмову при неповному наборі, зміні metadata й обрізаній відповіді. Окремі 14 assertions перевіряють distinct SKU/ID, resolved status, dynamic target, закритий граф і UTF-8 слова.
