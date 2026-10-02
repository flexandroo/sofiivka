import { icon } from "/admin/admin-icons.mjs";

// Blog articles («Статті», /blog/<slug>) and cases («Кейси», /portfolio/<slug>) in one section.
// The storefront (site-posts.js) lists what is published through get_site_posts and renders one
// post on post.html through get_site_post. Text is stored as blocks, never HTML. A post saves on
// its own with its updatedAt (optimistic lock); drafts and future dates stay off the site.

const KINDS = Object.freeze({
  article: { tab: "Статті", one: "Стаття", kicker: "СТАТТЯ", add: "Нова стаття", base: "/blog", list: "Корисно знати", empty: "Статей ще немає." },
  case: { tab: "Кейси", one: "Кейс", kicker: "КЕЙС", add: "Новий кейс", base: "/portfolio", list: "Інженерні задачі", empty: "Кейсів ще немає." }
});
const BLOCK_TYPES = Object.freeze({
  heading: { label: "Підзаголовок" },
  paragraph: { label: "Абзац" },
  list: { label: "Список" },
  image: { label: "Зображення" },
  quote: { label: "Цитата" }
});
const STATE = Object.freeze({
  published: { label: "Опубліковано", tone: "success" },
  scheduled: { label: "Заплановано", tone: "info" },
  draft: { label: "Чернетка", tone: "warning" }
});
const ACTIONS = Object.freeze({ create: "Створено", update: "Змінено", delete: "Видалено" });
const FIELD_LABELS = Object.freeze({
  title: "заголовок", slug: "адреса", excerpt: "короткий опис", category: "рубрика", tags: "теги", cover_url: "обкладинка",
  cover_alt: "опис обкладинки", body: "текст", case_object: "об’єкт", case_location: "місце", case_year: "рік",
  case_equipment: "обладнання", case_photos: "фото", status: "статус", published_at: "дата публікації",
  seo_title: "SEO-заголовок", seo_description: "SEO-опис"
});
const LIMITS = Object.freeze({
  title: 200, slug: 120, excerpt: 400, category: 60, tag: 40, tags: 12, coverAlt: 200, seoTitle: 160, seoDescription: 320,
  heading: 200, paragraph: 4000, item: 1000, quote: 1000, author: 120, caption: 300, alt: 200, url: 1000,
  blocks: 120, object: 160, location: 120, equipment: 30, photos: 24
});
const EDITOR_ROLES_NOTE = "Редагувати блог і кейси можуть власник, адміністратор і контент-менеджер.";
const URL_HINT = "https://… або шлях сайту: /assets/images/…";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export async function createPostsListView({ api, search = "", signal }) {
  const kind = new URLSearchParams(search).get("kind") === "case" ? "case" : "article";
  const meta = KINDS[kind];
  const result = await api.posts.list({ signal });
  const posts = (result.posts || []).filter(post => post.kind === kind);
  const count = value => (result.posts || []).filter(post => post.kind === value).length;
  const rows = posts.map(post => `
    <tr>
      <td><a class="admin-crm-id" href="/admin/blog/${encodeURIComponent(post.id)}" data-admin-link>${escape(post.title)}</a>
        <small>${escape(meta.base)}/${escape(post.slug)}</small></td>
      <td>${escape(post.category || "—")}</td>
      <td>${statusBadge(post.state)}</td>
      <td>${post.publishedAt ? formatDate(post.publishedAt) : "—"}</td>
      <td>${formatDateTime(post.updatedAt)}${post.updatedBy ? `<small>${escape(post.updatedBy)}</small>` : ""}</td>
    </tr>`).join("");
  const html = `
    <section class="admin-crm-page admin-pages admin-posts">
      <header class="admin-page-head"><div><p class="admin-kicker">САЙТ</p><h1>Блог і кейси</h1>
        <p>${escape(`Статті розділу «${KINDS.article.list}» і реалізовані об’єкти розділу «${KINDS.case.list}». На сайті видно лише опубліковані матеріали з датою, що вже настала.${result.canEdit ? "" : " Ваша роль може лише переглядати."}`)}</p></div>
        ${result.canEdit ? `<button class="admin-button admin-button--primary" type="button" data-create-open>${icon("plus")}<span>${escape(meta.add)}</span></button>` : ""}</header>
      <nav class="admin-posts-tabs" aria-label="Тип матеріалів">
        ${Object.entries(KINDS).map(([value, item]) => `<a href="/admin/blog${value === "case" ? "?kind=case" : ""}" data-admin-link ${value === kind ? 'aria-current="page"' : ""}>${escape(item.tab)} · ${number(count(value))}</a>`).join("")}
      </nav>
      <div class="admin-products-table-wrap"><table class="admin-crm-table admin-crm-table--posts"><thead><tr>${["Матеріал", "Рубрика", "Статус", "Дата публікації", "Оновлено"].map(text => `<th scope="col">${text}</th>`).join("")}</tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="admin-muted">${escape(meta.empty)}${result.canEdit ? " Створіть перший матеріал кнопкою вгорі." : ""}</td></tr>`}</tbody></table></div>
      ${result.canEdit ? createDialog(kind) : ""}
    </section>`;
  return { html, bind: container => bindCreate(container, api) };
}

function createDialog(kind) {
  const meta = KINDS[kind];
  return `<dialog class="admin-dialog admin-create-dialog" data-create-dialog aria-labelledby="create-post-title"><form data-create-form novalidate>
    <header><p class="admin-kicker">НОВИЙ ЗАПИС</p><h2 id="create-post-title">${escape(meta.add)}</h2><p>Матеріал створиться чернеткою: на сайті його не буде, доки ви не опублікуєте.</p></header>
    <input type="hidden" name="kind" value="${kind}">
    <div class="admin-form-grid">
      ${textField("title", "Заголовок", "", LIMITS.title, { full: true, required: true })}
      ${textField("slug", "Адреса", "", LIMITS.slug, { full: true, hint: `Латиниця, цифри й дефіси. Порожнє поле: заповниться з заголовка. Сторінка: ${meta.base}/адреса` })}
    </div>
    <p class="admin-feedback admin-feedback--error" data-dialog-error role="alert" hidden></p>
    <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--primary" type="submit">Створити</button></div>
  </form></dialog>`;
}

function bindCreate(container, api) {
  const dialog = container.querySelector("[data-create-dialog]");
  if (!dialog) return;
  const form = dialog.querySelector("[data-create-form]");
  const error = dialog.querySelector("[data-dialog-error]");
  const submit = form.querySelector('[type="submit"]');
  container.querySelector("[data-create-open]")?.addEventListener("click", () => {
    error.hidden = true;
    dialog.showModal();
    form.querySelector('[name="title"]')?.focus();
  });
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const value = name => String(data.get(name) ?? "").trim();
    submit.disabled = true;
    submit.textContent = "Створюємо…";
    try {
      const created = await api.posts.create({ kind: value("kind"), title: value("title"), slug: value("slug").toLowerCase() });
      dialog.close();
      goTo(`/admin/blog/${encodeURIComponent(created.post.id)}`);
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = "Створити";
    }
  });
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
export async function createPostEditorView({ api, id, signal }) {
  const detail = await api.posts.get(id, { signal });
  if (!detail?.post) {
    return {
      html: `<section class="admin-state-panel" role="alert">${icon("warning")}<div><p class="admin-kicker">404</p><h1>Матеріал не знайдено</h1><p>Можливо, його видалили або посилання застаріло.</p></div><a class="admin-button admin-button--secondary" href="/admin/blog" data-admin-link>До блогу</a></section>`,
      bind() {}
    };
  }
  const { post, canEdit } = detail;
  const meta = KINDS[post.kind];
  const isCase = post.kind === "case";
  const vocabulary = detail.vocabulary || {};
  const html = `
    <section class="admin-crm-detail admin-pages admin-posts" data-post-editor>
      <header class="admin-editor-head">
        <div class="admin-editor-head__identity">
          <a href="/admin/blog${isCase ? "?kind=case" : ""}" data-admin-link class="admin-back-link">← ${escape(meta.tab)}</a>
          <p class="admin-kicker" data-post-address>${escape(meta.kicker)} · ${escape(meta.base)}/${escape(post.slug)}</p>
          <h1 data-post-heading>${escape(post.title)}</h1>
          <div class="admin-editor-meta"><span data-post-state>${statusBadge(post.state)}</span><span data-post-updated>${escape(updatedLabel(post))}</span>
            <a href="${escape(meta.base)}/${escape(post.slug)}" target="_blank" rel="noopener" data-post-open ${post.state === "published" ? "" : "hidden"}>Відкрити на сайті ${icon("external")}</a></div>
        </div>
      </header>
      <div class="admin-crm-layout">
        <div class="admin-crm-main">
          <form class="admin-crm-main" data-post-form novalidate>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ОСНОВНЕ</p><h2>Заголовок і анонс</h2></div></header>
              <div class="admin-form-grid">
                ${textField("title", "Заголовок", post.title, LIMITS.title, { full: true, required: true })}
                ${textField("slug", "Адреса", post.slug, LIMITS.slug, { required: true, hint: `${meta.base}/адреса. Зміна адреси ламає старі посилання.` })}
                ${textField("category", "Рубрика", post.category, LIMITS.category, { list: "admin-post-categories", hint: isCase ? "Надзаголовок кейсу, наприклад «Комплексна задача»." : "Надзаголовок у картці, наприклад «Підбір»." })}
                ${textField("tags", "Теги", (post.tags || []).join(", "), LIMITS.tag * LIMITS.tags, { full: true, hint: `Через кому, до ${LIMITS.tags}. За тегами покупці фільтрують ${isCase ? "кейси" : "статті"}.${vocabulary.tags?.length ? ` Уже є: ${vocabulary.tags.join(", ")}.` : ""}` })}
                ${textArea("excerpt", "Короткий опис", post.excerpt, LIMITS.excerpt, { full: true, rows: 3, hint: "Показується в картці й під заголовком." })}
              </div>
              <datalist id="admin-post-categories">${(vocabulary.categories || []).map(value => `<option value="${escape(value)}"></option>`).join("")}</datalist>
            </section>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ОБКЛАДИНКА</p><h2>Головне зображення</h2></div></header>
              <div class="admin-form-grid">
                ${urlField("coverUrl", "Зображення", post.cover?.url, { upload: canEdit, hint: `${URL_HINT}. Найкраще горизонтальне фото від 1200 px.` })}
                <div class="admin-field admin-banner-preview" aria-hidden="true"><span>Попередній перегляд</span><div data-cover-preview></div></div>
                ${textField("coverAlt", "Опис зображення", post.cover?.alt, LIMITS.coverAlt, { full: true, hint: "Для незрячих і пошуковиків. Порожнє поле: фото декоративне." })}
              </div>
            </section>
            <section class="admin-panel admin-pages-body">
              <header class="admin-panel__head"><div><p class="admin-kicker">ТЕКСТ</p><h2>Блоки тексту</h2></div></header>
              <p class="admin-panel-note">Посилання в тексті: <code>[текст](/delivery.html)</code> або <code>[текст](https://…)</code>. HTML не працює: сайт покаже теги як звичайний текст.</p>
              <ol class="admin-pages-blocks" data-blocks></ol>
              ${canEdit ? `<div class="admin-pages-add" data-block-add>${Object.entries(BLOCK_TYPES).map(([type, item]) =>
                `<button class="admin-button admin-button--secondary" type="button" data-add-block="${type}">${icon("plus")}${escape(item.label)}</button>`).join("")}</div>` : ""}
            </section>
            ${isCase ? `
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ОБ’ЄКТ</p><h2>Дані кейсу</h2></div></header>
              <div class="admin-form-grid">
                ${textField("caseObject", "Об’єкт", post.case?.object, LIMITS.object, { hint: "Наприклад, «Приватний будинок, 220 м²»." })}
                ${textField("caseLocation", "Місце", post.case?.location, LIMITS.location, { hint: "Місто чи область. Порожнє поле: не показується." })}
                <label class="admin-field"><span>Рік</span><input name="caseYear" type="number" min="1990" max="2100" step="1" value="${escape(post.case?.year ?? "")}"></label>
                <span aria-hidden="true"></span>
                ${textArea("equipment", "Обладнання", (post.case?.equipment || []).join("\n"), LIMITS.equipment * 170, { full: true, rows: 4, hint: `Кожна позиція з нового рядка, до ${LIMITS.equipment}. Наприклад, «Котел Baxi Luna Duo-tec 24».` })}
              </div>
              <div class="admin-posts-photos">
                <h3>Фото об’єкта</h3>
                <p class="admin-panel-note">Галерея під текстом кейсу, до ${LIMITS.photos} фото. Публікуйте фото лише з дозволу замовника.</p>
                <ol class="admin-pages-blocks" data-photos></ol>
                ${canEdit ? `<div class="admin-pages-add"><button class="admin-button admin-button--secondary" type="button" data-photo-add>${icon("plus")}Додати фото</button></div>` : ""}
              </div>
            </section>` : ""}
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПОШУК</p><h2>SEO</h2></div></header>
              <div class="admin-form-grid">
                ${textField("seoTitle", "Заголовок вкладки й пошуку (title)", post.seo?.title, LIMITS.seoTitle, { full: true, counter: 60 })}
                ${textArea("seoDescription", "Опис для пошуку (meta description)", post.seo?.description, LIMITS.seoDescription, { full: true, rows: 3, counter: 160 })}
              </div>
              <p class="admin-panel-note">Порожні поля: сайт візьме заголовок матеріалу й короткий опис.</p>
            </section>
            <section class="admin-panel">
              <header class="admin-panel__head"><div><p class="admin-kicker">ПУБЛІКАЦІЯ</p><h2>Що бачать покупці</h2></div></header>
              <div class="admin-form-grid">
                <label class="admin-field"><span>Статус</span><select name="status">
                  <option value="draft" ${post.status === "draft" ? "selected" : ""}>Чернетка — лише в адмінці</option>
                  <option value="published" ${post.status === "published" ? "selected" : ""}>Опубліковано</option></select></label>
                ${textField("publishedAt", "Дата публікації", "", 0, { type: "datetime-local", hint: "Порожнє поле: момент публікації. Майбутня дата: матеріал з’явиться тоді." })}
              </div>
            </section>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" data-upload-input hidden>
            ${canEdit ? `<footer class="admin-panel admin-crm-form-actions admin-pages-actions"><small data-dirty-note></small><button class="admin-button admin-button--primary" type="submit">Зберегти</button></footer>`
              : `<p class="admin-panel-note">${EDITOR_ROLES_NOTE}</p>`}
          </form>
        </div>
        <aside class="admin-crm-side">
          <section class="admin-panel admin-pages-help">
            <header class="admin-panel__head"><div><p class="admin-kicker">ПІДКАЗКА</p><h2>Як писати</h2></div></header>
            <ul>
              <li>Перший абзац — суть матеріалу: покупець має одразу зрозуміти, про що він.</li>
              <li>Підзаголовок відкриває новий розділ, у списку кожен пункт з нового рядка.</li>
              <li>${isCase ? "Описуйте лише підтверджені факти: склад системи, обсяг робіт, результат." : "Пишіть коротко й конкретно: що підготувати, що перевірити, куди звернутися."}</li>
              <li>Сайт покаже зміни після оновлення сторінки.</li>
            </ul>
          </section>
          <section class="admin-panel admin-crm-timeline">
            <header class="admin-panel__head"><div><p class="admin-kicker">ІСТОРІЯ</p><h2>Зміни матеріалу</h2></div></header>
            <ol data-post-history></ol>
          </section>
          ${canEdit ? `<section class="admin-panel admin-taxonomy-danger">
            <header class="admin-panel__head"><div><p class="admin-kicker">ВИДАЛЕННЯ</p><h2>Видалити матеріал</h2></div></header>
            <p class="admin-panel-note">Сторінка зникне з сайту, старі посилання вестимуть на «Матеріал не знайдено». Щоб тимчасово сховати, поставте статус «Чернетка».</p>
            <button class="admin-button admin-button--danger" type="button" data-delete-open>Видалити</button>
            <dialog class="admin-dialog" data-delete-dialog><h2 data-delete-title>Видалити матеріал?</h2><p>Це не можна скасувати. Зображення у сховищі залишаться.</p>
              <div class="admin-dialog__actions"><button class="admin-button admin-button--ghost" type="button" data-dialog-cancel>Скасувати</button><button class="admin-button admin-button--danger" type="button" data-delete-confirm>Видалити</button></div></dialog>
          </section>` : ""}
        </aside>
      </div>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;
  return { html, bind: container => bindEditor(container, api, detail) };
}

let keySequence = 0;
const nextKey = () => `p${++keySequence}`;

function bindEditor(container, api, detail) {
  const { canEdit } = detail;
  const state = {
    post: detail.post,
    blocks: toBlockState(detail.post.body),
    photos: toPhotoState(detail.post.case?.photos),
    initial: null
  };
  const isCase = state.post.kind === "case";
  const form = container.querySelector("[data-post-form]");
  const blocksList = container.querySelector("[data-blocks]");
  const photosList = container.querySelector("[data-photos]");
  const saveButton = form.querySelector('[type="submit"]');
  const dirtyNote = form.querySelector("[data-dirty-note]");
  const uploadInput = form.querySelector("[data-upload-input]");
  const coverPreview = container.querySelector("[data-cover-preview]");
  const field = name => form.elements.namedItem(name);

  const payload = () => {
    const data = new FormData(form);
    const value = name => String(data.get(name) ?? "").trim();
    const result = {
      title: value("title"),
      slug: value("slug").toLowerCase(),
      category: value("category"),
      tags: value("tags").split(",").map(tag => tag.trim()).filter(Boolean),
      excerpt: value("excerpt"),
      coverUrl: value("coverUrl"),
      coverAlt: value("coverAlt"),
      body: state.blocks.map(fromBlockState),
      seoTitle: value("seoTitle"),
      seoDescription: value("seoDescription"),
      status: value("status") || "draft",
      // The input has minute precision: an untouched field keeps the stored timestamp exactly.
      publishedAt: value("publishedAt") && value("publishedAt") === toLocalInput(state.post.publishedAt)
        ? state.post.publishedAt : fromLocalInput(value("publishedAt"))
    };
    if (isCase) {
      Object.assign(result, {
        caseObject: value("caseObject"),
        caseLocation: value("caseLocation"),
        caseYear: value("caseYear") === "" ? null : Number(value("caseYear")),
        equipment: value("equipment").split(/\r?\n/).map(line => line.trim()).filter(Boolean),
        photos: state.photos.map(photo => ({ url: photo.url.trim(), alt: photo.alt.trim() }))
      });
    }
    return result;
  };
  const markDirty = () => {
    if (!saveButton) return;
    const dirty = JSON.stringify(payload()) !== state.initial;
    saveButton.disabled = !dirty;
    dirtyNote.textContent = dirty ? "Є незбережені зміни." : "";
  };

  const syncCover = () => {
    const src = imageSrc(field("coverUrl").value);
    coverPreview.replaceChildren(src ? thumb(src, "admin-banner-preview__image") : element("span", { className: "admin-muted" }, "Без обкладинки: картка покаже лише текст."));
  };

  const renderBlocks = () => {
    blocksList.replaceChildren(...(state.blocks.length
      ? state.blocks.map((block, index) => blockEditor(block, index, state.blocks.length, canEdit))
      : [element("li", { className: "admin-muted admin-pages-blocks__empty" }, "Блоків ще немає. Щоб опублікувати, додайте хоча б один абзац.")]));
    container.querySelectorAll("[data-add-block]").forEach(button => { button.disabled = state.blocks.length >= LIMITS.blocks; });
    markDirty();
  };
  const renderPhotos = () => {
    if (!photosList) return;
    photosList.replaceChildren(...(state.photos.length
      ? state.photos.map((photo, index) => photoEditor(photo, index, state.photos.length, canEdit))
      : [element("li", { className: "admin-muted admin-pages-blocks__empty" }, "Фото ще немає.")]));
    const add = container.querySelector("[data-photo-add]");
    if (add) add.disabled = state.photos.length >= LIMITS.photos;
    markDirty();
  };

  // Blocks: typing, reordering, removing, adding.
  const BLOCK_FIELDS = ["text", "items", "url", "alt", "caption", "author"];
  blocksList.addEventListener("input", event => {
    const holder = event.target.closest("[data-block]");
    const block = state.blocks.find(item => item.key === holder?.dataset.block);
    if (!block) return;
    if (BLOCK_FIELDS.includes(event.target.name)) block[event.target.name] = event.target.value;
    if (event.target.name === "ordered") block.ordered = event.target.checked;
    if (event.target.name === "url") holder.querySelector("[data-block-preview]")?.replaceChildren(blockPreview(block.url));
    markDirty();
  });
  blocksList.addEventListener("change", event => {
    if (event.target.name !== "ordered") return;
    const block = state.blocks.find(item => item.key === event.target.closest("[data-block]")?.dataset.block);
    if (block) { block.ordered = event.target.checked; markDirty(); }
  });
  blocksList.addEventListener("click", event => {
    const upload = event.target.closest("[data-block-upload]");
    if (upload) { startUpload({ type: "block", key: upload.closest("[data-block]").dataset.block }); return; }
    const button = event.target.closest("[data-block-move], [data-block-remove]");
    if (!button) return;
    const index = state.blocks.findIndex(item => item.key === button.closest("[data-block]")?.dataset.block);
    if (index < 0) return;
    if (button.dataset.blockRemove !== undefined) state.blocks.splice(index, 1);
    else {
      const next = index + Number(button.dataset.blockMove);
      if (next < 0 || next >= state.blocks.length) return;
      [state.blocks[index], state.blocks[next]] = [state.blocks[next], state.blocks[index]];
    }
    renderBlocks();
    const focusKey = state.blocks[Math.min(index, state.blocks.length - 1)]?.key;
    blocksList.querySelector(`[data-block="${focusKey}"] :is(textarea, input[type="text"])`)?.focus({ preventScroll: true });
  });
  container.querySelector("[data-block-add]")?.addEventListener("click", event => {
    const button = event.target.closest("[data-add-block]");
    if (!button || state.blocks.length >= LIMITS.blocks) return;
    const block = emptyBlock(button.dataset.addBlock);
    state.blocks.push(block);
    renderBlocks();
    blocksList.querySelector(`[data-block="${block.key}"] :is(textarea, input[type="text"])`)?.focus();
  });

  // Case photos.
  photosList?.addEventListener("input", event => {
    const holder = event.target.closest("[data-photo]");
    const photo = state.photos.find(item => item.key === holder?.dataset.photo);
    if (!photo || !["url", "alt"].includes(event.target.name)) return;
    photo[event.target.name] = event.target.value;
    if (event.target.name === "url") holder.querySelector("[data-block-preview]")?.replaceChildren(blockPreview(photo.url));
    markDirty();
  });
  photosList?.addEventListener("click", event => {
    const upload = event.target.closest("[data-block-upload]");
    if (upload) { startUpload({ type: "photo", key: upload.closest("[data-photo]").dataset.photo }); return; }
    const button = event.target.closest("[data-block-move], [data-block-remove]");
    if (!button) return;
    const index = state.photos.findIndex(item => item.key === button.closest("[data-photo]")?.dataset.photo);
    if (index < 0) return;
    if (button.dataset.blockRemove !== undefined) state.photos.splice(index, 1);
    else {
      const next = index + Number(button.dataset.blockMove);
      if (next < 0 || next >= state.photos.length) return;
      [state.photos[index], state.photos[next]] = [state.photos[next], state.photos[index]];
    }
    renderPhotos();
  });
  container.querySelector("[data-photo-add]")?.addEventListener("click", () => {
    if (state.photos.length >= LIMITS.photos) return;
    const photo = { key: nextKey(), url: "", alt: "" };
    state.photos.push(photo);
    renderPhotos();
    photosList.querySelector(`[data-photo="${photo.key}"] input[name="url"]`)?.focus();
  });

  // Uploads go to the public site-media bucket; the field gets the public URL.
  let uploadTarget = null;
  const startUpload = target => { uploadTarget = target; uploadInput.click(); };
  form.querySelector('[data-upload-button="coverUrl"]')?.addEventListener("click", () => startUpload({ type: "cover" }));
  uploadInput.addEventListener("change", async () => {
    const file = uploadInput.files?.[0];
    const target = uploadTarget;
    uploadInput.value = "";
    if (!file || !target) return;
    try {
      if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) throw new Error("Підходять лише зображення JPG, PNG, WebP або AVIF.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Файл більший за 10 МБ. Стисніть зображення.");
      showToast(container, "Завантажуємо зображення…");
      const uploaded = await api.posts.upload(file);
      if (target.type === "cover") { field("coverUrl").value = uploaded.url; syncCover(); markDirty(); }
      else {
        const list = target.type === "photo" ? state.photos : state.blocks;
        const item = list.find(entry => entry.key === target.key);
        if (item) item.url = uploaded.url;
        if (target.type === "photo") renderPhotos(); else renderBlocks();
      }
      showToast(container, "Зображення завантажено. Не забудьте зберегти матеріал.");
    } catch (failure) {
      showToast(container, failure.message, true);
    }
  });

  const counters = () => form.querySelectorAll("[data-counter]").forEach(counter => {
    const input = form.querySelector(`[name="${counter.dataset.counter}"]`);
    const length = input.value.trim().length;
    counter.textContent = `${length} символів${length > Number(counter.dataset.recommended) ? ` · рекомендовано до ${counter.dataset.recommended}` : ""}`;
    counter.classList.toggle("is-over", length > Number(counter.dataset.recommended));
  });
  form.addEventListener("input", event => {
    if (event.target.name === "coverUrl") syncCover();
    counters();
    markDirty();
  });
  form.addEventListener("change", markDirty);

  const renderHead = () => {
    const { post } = state;
    const meta = KINDS[post.kind];
    container.querySelector("[data-post-heading]").textContent = post.title;
    container.querySelector("[data-post-address]").textContent = `${meta.kicker} · ${meta.base}/${post.slug}`;
    container.querySelector("[data-post-updated]").textContent = updatedLabel(post);
    container.querySelector("[data-post-state]").replaceChildren(statusNode(post.state));
    const open = container.querySelector("[data-post-open]");
    open.href = `${meta.base}/${post.slug}`;
    open.hidden = post.state !== "published";
    field("publishedAt").value = toLocalInput(post.publishedAt);
    renderHistoryList(container.querySelector("[data-post-history]"), state.history || detail.history);
  };

  if (!canEdit) {
    form.querySelectorAll("input, select, textarea, button").forEach(control => { control.disabled = true; });
  } else {
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const invalid = form.querySelector(":is(input, textarea):invalid");
      if (invalid) { invalid.reportValidity(); return; }
      saveButton.disabled = true;
      saveButton.textContent = "Зберігаємо…";
      try {
        const saved = await api.posts.update(state.post.id, payload(), state.post.updatedAt);
        state.post = saved.post;
        state.history = saved.history;
        state.blocks = toBlockState(saved.post.body);
        state.photos = toPhotoState(saved.post.case?.photos);
        resetForm(form, saved.post);
        renderHead();
        renderBlocks();
        renderPhotos();
        syncCover();
        state.initial = JSON.stringify(payload());
        showToast(container, saved.post.state === "published" ? "Збережено. Сайт покаже зміни після оновлення сторінки."
          : saved.post.state === "scheduled" ? "Збережено. Матеріал з’явиться на сайті в указаний час." : "Збережено як чернетку: на сайті матеріалу немає.");
      } catch (failure) {
        showToast(container, failure.message, true);
      }
      saveButton.textContent = "Зберегти";
      counters();
      markDirty();
    });
    bindDelete(container, api, state);
  }

  renderHead();
  renderBlocks();
  renderPhotos();
  syncCover();
  counters();
  state.initial = JSON.stringify(payload());
  markDirty();
}

function bindDelete(container, api, state) {
  const dialog = container.querySelector("[data-delete-dialog]");
  if (!dialog) return;
  container.querySelector("[data-delete-open]")?.addEventListener("click", () => {
    dialog.querySelector("[data-delete-title]").textContent = `Видалити «${state.post.title}»?`;
    dialog.showModal();
  });
  dialog.querySelector("[data-dialog-cancel]").addEventListener("click", () => dialog.close());
  const confirmButton = dialog.querySelector("[data-delete-confirm]");
  confirmButton.addEventListener("click", async () => {
    confirmButton.disabled = true;
    confirmButton.textContent = "Видаляємо…";
    try {
      await api.posts.remove(state.post.id, state.post.updatedAt);
      dialog.close();
      goTo(`/admin/blog${state.post.kind === "case" ? "?kind=case" : ""}`, { replace: true });
    } catch (failure) {
      dialog.close();
      showToast(container, failure.message, true);
      confirmButton.disabled = false;
      confirmButton.textContent = "Видалити";
    }
  });
}

function resetForm(form, post) {
  const set = (name, value) => { const input = form.elements.namedItem(name); if (input) input.value = value ?? ""; };
  set("title", post.title);
  set("slug", post.slug);
  set("category", post.category);
  set("tags", (post.tags || []).join(", "));
  set("excerpt", post.excerpt);
  set("coverUrl", post.cover?.url);
  set("coverAlt", post.cover?.alt);
  set("seoTitle", post.seo?.title);
  set("seoDescription", post.seo?.description);
  set("status", post.status);
  set("publishedAt", toLocalInput(post.publishedAt));
  if (post.kind === "case") {
    set("caseObject", post.case?.object);
    set("caseLocation", post.case?.location);
    set("caseYear", post.case?.year ?? "");
    set("equipment", (post.case?.equipment || []).join("\n"));
  }
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
function emptyBlock(type) {
  return { key: nextKey(), type: BLOCK_TYPES[type] ? type : "paragraph", text: "", items: "", ordered: false, url: "", alt: "", caption: "", author: "" };
}

function toBlockState(body) {
  return (Array.isArray(body) ? body : []).map(block => ({
    ...emptyBlock(block.type),
    text: block.text || "",
    items: Array.isArray(block.items) ? block.items.join("\n") : "",
    ordered: Boolean(block.ordered),
    url: block.url || "",
    alt: block.alt || "",
    caption: block.caption || "",
    author: block.author || ""
  }));
}

function fromBlockState(block) {
  if (block.type === "list") {
    return { type: "list", ordered: block.ordered, items: block.items.split(/\r?\n/).map(line => line.trim()).filter(Boolean) };
  }
  if (block.type === "image") return { type: "image", url: block.url.trim(), alt: block.alt.trim(), caption: block.caption.trim() };
  if (block.type === "quote") return { type: "quote", text: block.text.trim(), author: block.author.trim() };
  return { type: block.type, text: block.text.trim() };
}

function toPhotoState(photos) {
  return (Array.isArray(photos) ? photos : []).map(photo => ({ key: nextKey(), url: photo.url || "", alt: photo.alt || "" }));
}

function blockEditor(block, index, total, canEdit) {
  const label = BLOCK_TYPES[block.type].label;
  const fieldId = `block-${block.key}`;
  const controls = [];
  if (block.type === "heading") {
    controls.push(element("input", { id: fieldId, name: "text", type: "text", maxlength: String(LIMITS.heading), required: true, disabled: !canEdit, value: block.text }));
  } else if (block.type === "paragraph" || block.type === "list") {
    const area = element("textarea", {
      id: fieldId, name: block.type === "list" ? "items" : "text", disabled: !canEdit, required: true,
      rows: block.type === "list" ? "5" : "4", maxlength: String(block.type === "list" ? LIMITS.item * 40 : LIMITS.paragraph),
      placeholder: block.type === "list" ? "Кожен пункт з нового рядка" : ""
    });
    area.value = block.type === "list" ? block.items : block.text;
    controls.push(area);
  } else if (block.type === "quote") {
    const area = element("textarea", { id: fieldId, name: "text", disabled: !canEdit, required: true, rows: "3", maxlength: String(LIMITS.quote) });
    area.value = block.text;
    controls.push(area, labelled("Автор або джерело", element("input", { name: "author", type: "text", maxlength: String(LIMITS.author), disabled: !canEdit, value: block.author })));
  } else if (block.type === "image") {
    controls.push(imageControls(fieldId, block, canEdit),
      labelled("Опис зображення", element("input", { name: "alt", type: "text", maxlength: String(LIMITS.alt), disabled: !canEdit, value: block.alt })),
      labelled("Підпис під зображенням", element("input", { name: "caption", type: "text", maxlength: String(LIMITS.caption), disabled: !canEdit, value: block.caption })));
  }
  return element("li", { className: `admin-pages-block admin-pages-block--${block.type}`, "data-block": block.key },
    element("header", { className: "admin-pages-block__head" },
      element("label", { className: "admin-pages-block__type", for: fieldId }, `${index + 1}. ${label}`),
      block.type === "list" ? element("label", { className: "admin-pages-block__ordered" },
        element("input", { type: "checkbox", name: "ordered", checked: block.ordered, disabled: !canEdit }), "Нумерований") : null,
      canEdit ? element("div", { className: "admin-collection-item__actions" },
        iconButton(`Блок ${index + 1} вище`, "↑", { "data-block-move": "-1" }, index === 0),
        iconButton(`Блок ${index + 1} нижче`, "↓", { "data-block-move": "1" }, index === total - 1),
        iconButton(`Прибрати блок ${index + 1}`, "×", { "data-block-remove": "" }, false)) : null),
    ...controls);
}

function photoEditor(photo, index, total, canEdit) {
  const fieldId = `photo-${photo.key}`;
  return element("li", { className: "admin-pages-block admin-pages-block--image", "data-photo": photo.key },
    element("header", { className: "admin-pages-block__head" },
      element("label", { className: "admin-pages-block__type", for: fieldId }, `Фото ${index + 1}`),
      canEdit ? element("div", { className: "admin-collection-item__actions" },
        iconButton(`Фото ${index + 1} вище`, "↑", { "data-block-move": "-1" }, index === 0),
        iconButton(`Фото ${index + 1} нижче`, "↓", { "data-block-move": "1" }, index === total - 1),
        iconButton(`Прибрати фото ${index + 1}`, "×", { "data-block-remove": "" }, false)) : null),
    imageControls(fieldId, photo, canEdit),
    labelled("Опис фото", element("input", { name: "alt", type: "text", maxlength: String(LIMITS.alt), disabled: !canEdit, value: photo.alt })));
}

function imageControls(fieldId, item, canEdit) {
  return element("div", { className: "admin-posts-image" },
    element("div", { className: "admin-posts-image__preview", "data-block-preview": "" }, blockPreview(item.url)),
    element("div", { className: "admin-banner-url" },
      element("input", { id: fieldId, name: "url", type: "text", maxlength: String(LIMITS.url), required: true, disabled: !canEdit, value: item.url,
        placeholder: URL_HINT, autocomplete: "off", spellcheck: "false" }),
      canEdit ? element("button", { className: "admin-button admin-button--secondary", type: "button", "data-block-upload": "" }, "Завантажити") : null));
}

function blockPreview(url) {
  const src = imageSrc(url);
  return src ? thumb(src, "admin-posts-image__thumb") : element("span", { className: "admin-posts-image__thumb", "aria-hidden": "true" });
}

function labelled(text, control) {
  return element("label", { className: "admin-posts-subfield" }, element("span", {}, text), control);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderHistoryList(list, history) {
  if (!list) return;
  list.replaceChildren(...(history?.length ? history.map(entry => element("li", { className: "admin-crm-event" },
    element("header", {}, element("strong", {}, entry.actor), element("time", {}, formatDateTime(entry.createdAt))),
    element("p", {}, entry.action === "update"
      ? `${ACTIONS.update}: ${(entry.fields || []).map(name => FIELD_LABELS[name] || name).join(", ")}`
      : ACTIONS[entry.action] || entry.action)))
    : [element("li", { className: "admin-muted" }, "Змін через адмінку ще не було.")]));
}

function updatedLabel(post) {
  return `Оновлено ${formatDateTime(post.updatedAt)}${post.updatedBy ? ` · ${post.updatedBy}` : ""}`;
}

function statusBadge(value) {
  const item = STATE[value] || STATE.draft;
  return `<span class="admin-status admin-status--${item.tone}">${escape(item.label)}</span>`;
}

function statusNode(value) {
  const item = STATE[value] || STATE.draft;
  return element("span", { className: `admin-status admin-status--${item.tone}` }, item.label);
}

// Site paths are stored as written; the admin lives under /admin, so assets/... needs a leading slash.
function imageSrc(url) {
  const value = String(url || "").trim();
  if (/^https:\/\/[^\s<>"\\]+$/i.test(value)) return value;
  if (/^\/[^/\\\s<>"][^\s<>"\\]*$/.test(value)) return value;
  if (/^assets\/[^\s<>"\\]+$/.test(value)) return `/${value}`;
  return "";
}

function thumb(src, className) {
  const placeholder = () => element("span", { className, "aria-hidden": "true" });
  const image = element("img", { className, src, alt: "", loading: "lazy" });
  image.addEventListener("error", () => image.replaceWith(placeholder()), { once: true });
  return image;
}

function textField(name, label, value, maxLength, { full = false, hint = "", required = false, counter = 0, list = "", type = "text" } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span>
    <input name="${name}" type="${type}" value="${escape(value ?? "")}" ${maxLength ? `maxlength="${maxLength}"` : ""} ${required ? "required" : ""} ${list ? `list="${list}"` : ""}>
    ${counter ? `<small data-counter="${name}" data-recommended="${counter}"></small>` : ""}
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function textArea(name, label, value, maxLength, { full = false, rows = 3, counter = 0, hint = "" } = {}) {
  return `<label class="admin-field${full ? " admin-field--full" : ""}"><span>${label}</span><textarea name="${name}" maxlength="${maxLength}" rows="${rows}">${escape(value ?? "")}</textarea>
    ${counter ? `<small data-counter="${name}" data-recommended="${counter}"></small>` : ""}
    ${hint ? `<small>${escape(hint)}</small>` : ""}</label>`;
}

function urlField(name, label, value, { upload = false, hint = "" } = {}) {
  return `<div class="admin-field admin-field--full"><span><label for="post-${name}">${escape(label)}</label></span>
    <div class="admin-banner-url"><input id="post-${name}" name="${name}" value="${escape(value ?? "")}" maxlength="${LIMITS.url}" autocomplete="off" spellcheck="false">
      ${upload ? `<button class="admin-button admin-button--secondary" type="button" data-upload-button="${name}">Завантажити</button>` : ""}</div>
    ${hint ? `<small>${escape(hint)}</small>` : ""}</div>`;
}

function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "className") node.className = value;
    else if (key === "value" && "value" in node) node.value = value;
    else if (key === "checked") node.checked = Boolean(value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat().filter(child => child !== null && child !== undefined));
  return node;
}

function iconButton(label, text, data, disabled) {
  return element("button", { className: "admin-icon-button", type: "button", "aria-label": label, title: label, disabled, ...data }, text);
}

// <input type="datetime-local"> works in the browser's time zone without an offset.
function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const pad = part => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

function showToast(container, message, error = false) {
  const toast = container.querySelector(".admin-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("is-error", error);
  toast.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, 5000);
}

function goTo(target, { replace = false } = {}) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { target, replace } }));
}

function number(value) {
  return new Intl.NumberFormat("uk-UA").format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
