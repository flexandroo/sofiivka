// Blog and cases v1: seed equals the storefront's built-in cards, public reads (published only,
// scheduling, tags, paging), roles, block validation (no HTML, safe links and images only),
// slugs, optimistic locking, case-only fields, delete and audit.
import assert from "node:assert/strict";
import { extractFallbackArticles, extractFallbackCase } from "../site-posts-fallback.mjs";

const STAFF = {
  owner: "00000000-0000-4000-8000-000000000061",
  manager: "00000000-0000-4000-8000-000000000062",
  content: "00000000-0000-4000-8000-000000000063"
};

async function as(db, role, userId, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ""]);
  if (role) await db.exec(`set role ${role}`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}

async function expectError(promise, pattern, label) {
  try { await promise; } catch (error) {
    assert.match(error.message, pattern, `${label}: unexpected error ${error.message}`);
    return error;
  }
  assert.fail(`${label}: expected an error`);
}

const one = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
const asUser = (db, who, sql, params) => as(db, "authenticated", STAFF[who], async () => (await one(db, sql, params)).r);
const anon = async (db, sql, params) => (await as(db, "anon", null, () => one(db, sql, params))).r;
const list = (db, kind, page = 1, tag = null, size = 12) => anon(db, "select public.get_site_posts($1, $2, $3, $4) r", [kind, page, tag, size]);
const getPublic = (db, kind, slug) => anon(db, "select public.get_site_post($1, $2) r", [kind, slug]);
const create = (db, who, payload) => asUser(db, who, "select public.admin_create_site_post($1) r", [JSON.stringify(payload)]);
const update = (db, who, id, payload, expected) => asUser(db, who, "select public.admin_update_site_post($1, $2, $3) r", [id, JSON.stringify(payload), expected]);
const remove = (db, who, id, expected) => asUser(db, who, "select public.admin_delete_site_post($1, $2) r", [id, expected]);
const auditCount = async (db, id) => (await one(db, "select count(*)::int c from public.site_posts_audit where post_id = $1", [id])).c;

export async function run(db) {
  for (const [name, id] of Object.entries(STAFF)) await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.test`]);
  await db.query(`insert into public.admin_profiles (user_id, name, role) values
    ($1, 'Власник', 'owner'), ($2, 'Менеджер', 'manager'), ($3, 'Контент', 'content_manager')`, [STAFF.owner, STAFF.manager, STAFF.content]);

  // 1. The seed is exactly what blog.html / portfolio.html show without the database, in order.
  const articles = extractFallbackArticles();
  assert.equal(articles.length, 6);
  const blog = await list(db, "article");
  assert.equal(blog.total, 6);
  assert.equal(blog.hasMore, false);
  assert.deepEqual(blog.posts.map(post => ({ category: post.category, title: post.title, excerpt: post.excerpt, cover: post.cover.url })), articles);
  assert.deepEqual(blog.tags.map(tag => tag.name).sort(), articles.map(card => card.category).sort());
  const fallbackCase = extractFallbackCase();
  const cases = await list(db, "case");
  assert.equal(cases.total, 1);
  const [seedCase] = cases.posts;
  assert.deepEqual({ category: seedCase.category, title: seedCase.title, excerpt: seedCase.excerpt, cover: seedCase.cover.url, coverAlt: seedCase.cover.alt }, fallbackCase);
  assert.equal(seedCase.case.object, "Приватний будинок");
  // Every seeded body passes the same validation as admin saves and has links the storefront allows.
  for (const row of (await db.query("select slug, body from public.site_posts")).rows) {
    const cleaned = (await one(db, "select public._site_posts_clean_body($1) r", [JSON.stringify(row.body)])).r;
    assert.deepEqual(cleaned, row.body, `${row.slug}: seed is clean`);
    assert.ok(row.body.length >= 3, `${row.slug}: has a real text`);
  }
  const firstArticle = await getPublic(db, "article", blog.posts[0].slug);
  assert.equal(firstArticle.title, articles[0].title);
  assert.ok(Array.isArray(firstArticle.body) && firstArticle.body.length > 0);
  assert.equal(firstArticle.more.length, 3, "three other articles");
  assert.ok(firstArticle.more.every(post => post.slug !== firstArticle.slug && post.body === undefined), "cards only");
  assert.equal(firstArticle.case, null);
  assert.equal(await getPublic(db, "article", "missing"), null);
  assert.equal(await getPublic(db, "case", blog.posts[0].slug), null, "slug is per kind");
  assert.equal(await list(db, "page"), null, "unknown kind");

  // 2. Tables, helpers and staff RPCs are closed to visitors.
  for (const table of ["site_posts", "site_posts_audit"]) {
    await expectError(as(db, "anon", null, () => db.query(`select * from public.${table}`)), /permission denied/, `anon ${table}`);
    await expectError(as(db, "authenticated", STAFF.owner, () => db.query(`select * from public.${table}`)), /permission denied/, `staff ${table}`);
  }
  await expectError(as(db, "anon", null, () => db.query("select public.admin_list_site_posts()")), /permission denied/, "anon list");
  await expectError(as(db, "anon", null, () => db.query("select public.admin_create_site_post('{}')")), /permission denied/, "anon create");
  await expectError(as(db, "anon", null, () => db.query("select public._site_posts_clean_body('[]')")), /permission denied/, "anon helper");
  await expectError(as(db, "authenticated", STAFF.content, () => db.query("select public._site_posts_vocabulary()")), /permission denied/, "staff helper");

  // 3. Roles: every staff member reads; owner/admin/content manager write; manager is read-only.
  const managerList = await asUser(db, "manager", "select public.admin_list_site_posts() r");
  assert.equal(managerList.canEdit, false);
  assert.equal(managerList.posts.length, 7);
  assert.equal(managerList.posts[0].body, undefined, "list has no bodies");
  assert.equal((await asUser(db, "content", "select public.admin_list_site_posts() r")).canEdit, true);
  await expectError(create(db, "manager", { kind: "article", title: "Нова" }), /власник, адміністратор і контент-менеджер/, "manager create");
  const seedId = managerList.posts.find(post => post.kind === "case").id;
  const seedDetail = await asUser(db, "manager", "select public.admin_get_site_post($1) r", [seedId]);
  assert.equal(seedDetail.post.state, "published");
  assert.ok(seedDetail.vocabulary.tags.includes("Опалення"));
  assert.ok(seedDetail.vocabulary.categories.includes("Комплексна задача"));
  await expectError(update(db, "manager", seedId, { title: "Інше" }, seedDetail.post.updatedAt), /власник, адміністратор і контент-менеджер/, "manager update");
  assert.equal(await asUser(db, "manager", "select public.admin_get_site_post('00000000-0000-4000-8000-000000000999') r"), null);

  // 4. Create: draft, slug from the Ukrainian title, -2 on collision; explicit duplicates refused.
  const draft = await create(db, "content", { kind: "article", title: "Як обрати бойлер непрямого нагріву" });
  assert.equal(draft.post.slug, "iak-obraty-boiler-nepriamoho-nahrivu");
  assert.equal(draft.post.status, "draft");
  assert.equal(draft.post.state, "draft");
  assert.equal(draft.post.updatedBy, "Контент");
  assert.equal(draft.history.length, 1);
  assert.equal(draft.history[0].action, "create");
  const twin = await create(db, "content", { kind: "article", title: "Як обрати бойлер непрямого нагріву" });
  assert.equal(twin.post.slug, "iak-obraty-boiler-nepriamoho-nahrivu-2");
  await expectError(create(db, "content", { kind: "article", title: "Інша", slug: "iak-obraty-boiler-nepriamoho-nahrivu" }), /вже зайнята/, "explicit duplicate");
  const sameSlugOtherKind = await create(db, "content", { kind: "case", title: "Кейс", slug: "iak-obraty-boiler-nepriamoho-nahrivu" });
  assert.equal(sameSlugOtherKind.post.kind, "case");
  await expectError(create(db, "content", { title: "Без типу" }), /стаття або кейс/, "kind required");
  await expectError(create(db, "content", { kind: "article", title: "  " }), /Заголовок: поле обов/, "title required");
  await expectError(create(db, "content", { kind: "article", title: "Ок", slug: "Не латиниця" }), /латиниця/, "slug format");
  assert.equal(await getPublic(db, "article", draft.post.slug), null, "drafts stay off the site");
  assert.equal((await list(db, "article")).total, 6);

  // 5. Publishing needs text; all five block types are cleaned; case fields are ignored on articles.
  await expectError(update(db, "content", draft.post.id, { status: "published" }, draft.post.updatedAt), /додайте текст/, "publish without text");
  const body = [
    { type: "heading", text: "  Коли   потрібен бойлер ", extra: "drop" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html) і [виробника](https://example.com/a).\n<b>не HTML</b>" },
    { type: "list", ordered: true, items: [" Перший ", "", "Другий"] },
    { type: "image", url: "assets/images/hero-heating.webp", alt: " Бойлер ", caption: "Підпис", junk: 1 },
    { type: "quote", text: "Система важливіша за коробку.", author: "Інженер" }
  ];
  const published = await update(db, "content", draft.post.id, {
    body, status: "published", tags: ["Опалення", " опалення ", "Вода", ""], category: "Підбір",
    coverUrl: "https://cdn.example.com/cover.webp", coverAlt: "Обкладинка", excerpt: "Коротко",
    caseObject: "не для статті", caseYear: 2024, equipment: ["X"], seoTitle: "SEO", seoDescription: "Опис"
  }, draft.post.updatedAt);
  assert.deepEqual(published.post.body, [
    { type: "heading", text: "Коли потрібен бойлер" },
    { type: "paragraph", text: "Див. [доставку](/delivery.html) і [виробника](https://example.com/a). <b>не HTML</b>" },
    { type: "list", ordered: true, items: ["Перший", "Другий"] },
    { type: "image", url: "assets/images/hero-heating.webp", alt: "Бойлер", caption: "Підпис" },
    { type: "quote", text: "Система важливіша за коробку.", author: "Інженер" }
  ]);
  assert.deepEqual(published.post.tags, ["Опалення", "Вода"], "tags deduplicated case-insensitively");
  assert.equal(published.post.case, null, "articles carry no case data");
  assert.equal(published.post.state, "published");
  assert.ok(published.post.publishedAt, "publish date set on publish");
  assert.deepEqual(published.history[0].fields,
    ["body", "category", "cover_alt", "cover_url", "excerpt", "published_at", "seo_description", "seo_title", "status", "tags"]);
  const publicPost = await getPublic(db, "article", draft.post.slug);
  assert.equal(publicPost.title, "Як обрати бойлер непрямого нагріву");
  assert.deepEqual(publicPost.seo, { title: "SEO", description: "Опис" });
  assert.equal(publicPost.id, undefined, "no ids in public");
  assert.equal(publicPost.status, undefined, "no status in public");
  assert.equal((await list(db, "article")).posts[0].slug, draft.post.slug, "newest first");

  // A save without changes neither bumps the version nor writes audit.
  const auditBefore = await auditCount(db, draft.post.id);
  const unchanged = await update(db, "content", draft.post.id, { title: published.post.title, body: published.post.body }, published.post.updatedAt);
  assert.equal(unchanged.post.updatedAt, published.post.updatedAt);
  assert.equal(await auditCount(db, draft.post.id), auditBefore);

  // 6. Optimistic lock, kind and slug rules on update.
  await expectError(update(db, "owner", draft.post.id, { title: "Пізно" }, draft.post.updatedAt), /інший працівник/, "stale update");
  await expectError(update(db, "owner", draft.post.id, { title: "Без версії" }, null), /інший працівник/, "update without version");
  const current = published.post.updatedAt;
  await expectError(update(db, "owner", draft.post.id, { kind: "case" }, current), /Тип матеріалу змінити не можна/, "kind change");
  await expectError(update(db, "owner", draft.post.id, { slug: articles.length && blog.posts[1].slug }, current), /вже зайнята/, "slug taken");
  const renamed = await update(db, "owner", draft.post.id, { slug: "boiler-nepriamoho-nahrivu" }, current);
  assert.equal(renamed.post.slug, "boiler-nepriamoho-nahrivu");
  assert.equal(await getPublic(db, "article", draft.post.slug), null, "old address is gone");
  assert.ok(await getPublic(db, "article", "boiler-nepriamoho-nahrivu"));
  assert.ok(await getPublic(db, "article", "BOILER-nepriamoho-nahrivu"), "slug lookup is case-insensitive");

  // 7. Validation errors in Ukrainian, with the block number.
  const version = renamed.post.updatedAt;
  const invalid = (payload, pattern, label) => expectError(update(db, "owner", draft.post.id, payload, version), pattern, label);
  await invalid({ body: [{ type: "html", text: "<script>" }] }, /Блок 1: невідомий тип/, "html block");
  await invalid({ body: [{ type: "heading", text: "Ок" }, { type: "paragraph", text: " " }] }, /Блок 2 \(абзац\): поле обов/, "empty paragraph");
  await invalid({ body: [{ type: "list", items: ["", " "] }] }, /хоча б один пункт/, "empty list");
  await invalid({ body: [{ type: "quote", text: "" }] }, /Блок 1 \(цитата\): поле обов/, "empty quote");
  await invalid({ body: "текст" }, /список блоків/, "body not array");
  for (const url of ["javascript:alert(1)", "//evil.example", "http://insecure.example", "/\\evil.example", "data:text/html,x"]) {
    await invalid({ body: [{ type: "paragraph", text: `[тиць](${url})` }] }, /посилання/, `link ${url}`);
  }
  for (const url of ["javascript:alert(1)", "//evil.example/a.png", "http://insecure.example/a.png", "data:image/png;base64,AAAA", "https://x.test/a b.png", ""]) {
    await invalid({ body: [{ type: "image", url }] }, /Блок 1 \(зображення\)/, `image ${url}`);
  }
  await invalid({ coverUrl: "javascript:alert(1)" }, /Обкладинка/, "cover url");
  await invalid({ tags: Array.from({ length: 13 }, (_, index) => `тег ${index}`) }, /Теги: не більше 12/, "too many tags");
  await invalid({ title: "x".repeat(201) }, /не довше 200/, "long title");
  await invalid({ status: "hidden" }, /чернетка або опубліковано/, "status");
  await invalid({ publishedAt: "вчора" }, /Некоректна дата/, "date");
  await expectError(update(db, "owner", "00000000-0000-4000-8000-000000000999", { title: "x" }, version), /не знайдено/, "unknown post");

  // 8. Scheduling: a future date keeps a published post off the site until then; draft hides it.
  const scheduled = await update(db, "owner", draft.post.id, { publishedAt: "2099-01-01T08:00:00Z" }, version);
  assert.equal(scheduled.post.state, "scheduled");
  assert.equal(await getPublic(db, "article", "boiler-nepriamoho-nahrivu"), null);
  assert.equal((await list(db, "article")).total, 6);
  const live = await update(db, "owner", draft.post.id, { publishedAt: "2026-09-01T08:00:00Z" }, scheduled.post.updatedAt);
  assert.equal(live.post.state, "published");
  assert.equal((await list(db, "article")).total, 7);
  const hidden = await update(db, "owner", draft.post.id, { status: "draft" }, live.post.updatedAt);
  assert.equal(hidden.post.state, "draft");
  assert.equal(hidden.post.publishedAt, live.post.publishedAt, "unpublishing keeps the date");
  assert.equal(await getPublic(db, "article", "boiler-nepriamoho-nahrivu"), null);
  const back = await update(db, "owner", draft.post.id, { status: "published" }, hidden.post.updatedAt);

  // 9. Tags (case-insensitive) and paging.
  const heating = await list(db, "article", 1, "опалення");
  assert.deepEqual(heating.posts.map(post => post.slug).sort(), ["boiler-nepriamoho-nahrivu", "potuzhnist-kotla-lyshe-pochatok"]);
  assert.equal(heating.tag, "опалення");
  assert.equal((await list(db, "article")).tags.find(tag => tag.name === "Опалення").count, 2);
  const firstPage = await list(db, "article", 1, null, 3);
  const thirdPage = await list(db, "article", 3, null, 3);
  assert.equal(firstPage.posts.length, 3);
  assert.equal(firstPage.hasMore, true);
  assert.equal(thirdPage.posts.length, 1);
  assert.equal(thirdPage.hasMore, false);
  assert.equal((await list(db, "article", 1, null, 1000)).pageSize, 48, "page size is capped");

  // 10. Cases: object, place, year, equipment and photos; validation of those fields.
  const caseDraft = sameSlugOtherKind.post;
  await expectError(update(db, "content", caseDraft.id, { caseYear: 1800 }, caseDraft.updatedAt), /Рік/, "year range");
  await expectError(update(db, "content", caseDraft.id, { photos: [{ url: "javascript:alert(1)" }] }, caseDraft.updatedAt), /Фото 1/, "photo url");
  await expectError(update(db, "content", caseDraft.id, { photos: "x" }, caseDraft.updatedAt), /Фото об'єкта: очікується список/, "photos type");
  const caseSaved = await update(db, "content", caseDraft.id, {
    slug: "kotelnia-kyiv", status: "published", body: [{ type: "paragraph", text: "Опис робіт." }],
    caseObject: "Котеджне містечко", caseLocation: "Київська область", caseYear: "2025",
    equipment: ["Котел Baxi", "котел baxi", "Бойлер 200 л"], photos: [{ url: "/assets/images/showroom.webp", alt: "Котельня" }, { url: "https://cdn.example.com/2.webp" }]
  }, caseDraft.updatedAt);
  assert.deepEqual(caseSaved.post.case, {
    object: "Котеджне містечко", location: "Київська область", year: 2025, equipment: ["Котел Baxi", "Бойлер 200 л"],
    photos: [{ url: "/assets/images/showroom.webp", alt: "Котельня" }, { url: "https://cdn.example.com/2.webp", alt: "" }]
  });
  const publicCase = await getPublic(db, "case", "kotelnia-kyiv");
  assert.equal(publicCase.case.year, 2025);
  assert.equal(publicCase.more.length, 1);
  assert.equal((await list(db, "case")).posts[0].case.location, "Київська область");

  // 11. Delete: version checked, row gone, audit kept.
  await expectError(remove(db, "content", caseDraft.id, caseDraft.updatedAt), /інший працівник/, "stale delete");
  await expectError(remove(db, "manager", caseDraft.id, caseSaved.post.updatedAt), /власник, адміністратор і контент-менеджер/, "manager delete");
  const deleted = await remove(db, "content", caseDraft.id, caseSaved.post.updatedAt);
  assert.equal(deleted.deleted, caseDraft.id);
  assert.equal(await getPublic(db, "case", "kotelnia-kyiv"), null);
  assert.equal(await asUser(db, "content", "select public.admin_get_site_post($1) r", [caseDraft.id]), null);
  const deleteAudit = await one(db, "select action, title from public.site_posts_audit where post_id = $1 order by created_at desc limit 1", [caseDraft.id]);
  assert.deepEqual(deleteAudit, { action: "delete", title: "Кейс" });
  await expectError(remove(db, "content", caseDraft.id, caseSaved.post.updatedAt), /не знайдено/, "delete twice");
  assert.ok(back.post.id);

  console.log(JSON.stringify({ status: "ok", scenarios: 11, suite: "blog" }));
}
