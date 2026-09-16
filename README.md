# ТД «Софіївка» — сайт

Цей репозиторій є єдиним джерелом актуального коду сайту ТД «Софіївка».

- Production: <https://sofievka.vercel.app>
- Production-гілка: `master`
- Vercel project: `sofievka`

## Як працювати з різних комп’ютерів

```powershell
git clone https://github.com/flexandroo/sofiivka.git
cd sofiivka
git switch -c feature/коротка-назва
```

Після редагування:

```powershell
git add <змінені-файли>
git commit -m "Короткий опис зміни"
git push -u origin HEAD
```

Push у будь-яку гілку, крім `master`, створює Preview Deployment у Vercel. Після перевірки зміни треба об’єднати з `master`; push у `master` автоматично оновлює production.

Перед початком нової роботи завжди синхронізуйте локальну копію:

```powershell
git switch master
git pull --ff-only
```

## Структура

Сайт статичний і розгортається з кореня репозиторію без окремого build-кроку.

- `index.html`, `homepage.css`, `script.js` — головна сторінка.
- `page-shell.js`, `pages.css`, `styles.css` — спільна оболонка й дизайн-система внутрішніх сторінок.
- `catalog-data.js`, `products-data.js`, `termojet-products-data.js`, `water-catalog-data.js` — каталог і товарні дані.
- `catalog/`, `products/`, `brands/` — статичні URL-сторінки для каталогу, товарів і брендів.
- `vercel.json` — redirects, rewrites і HTTP headers для Vercel.

## Локальний перегляд

Для поведінки, максимально близької до Vercel:

```powershell
npx vercel dev
```

Локальні `.vercel`, `.env*`, `tmp`, `.agents` і `.codex` не комітяться. Не зберігайте токени чи секрети в репозиторії.
