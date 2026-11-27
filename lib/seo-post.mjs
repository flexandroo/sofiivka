import { escapeHtml as escape, organizationSchema, seoText, SITE_NAME } from "./seo-meta.mjs";

const POST_KINDS = {
  article: { base: "/blog", label: "Корисно знати", related: "Інші матеріали" },
  case: { base: "/portfolio", label: "Інженерні задачі", related: "Інші об'єкти" }
};
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Match the URL rules in site-posts.js and the structured content editor.
const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
const SAFE_URL = /^(https:\/\/[^\s<>"\\]+|\/([^/\s<>"\\][^\s<>"\\]*)?|mailto:[^\s<>"\\]+|tel:\+?[0-9-]+)$/;
const IMAGE_URL = /^(https:\/\/[^\s<>"\\]+|\/[^/\\\s<>"][^\s<>"\\]*)$/i;
const DATE_FORMAT = new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv" });

const text = value => typeof value === "string" ? value.trim() : "";
const array = value => Array.isArray(value) ? value : [];
const dateOf = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : "";

export function isPostSlug(slug) {
  return typeof slug === "string" && slug.length <= 120 && SLUG.test(slug);
}

function imageUrl(value) {
  const url = text(value).replace(/^assets\//, "/assets/");
  return IMAGE_URL.test(url) && URL.canParse(url, "https://site.invalid") ? url : "";
}

function inline(value) {
  const source = typeof value === "string" ? value : "";
  let html = "";
  let offset = 0;
  for (const match of source.matchAll(LINK)) {
    const [whole, label, url] = match;
    if (!SAFE_URL.test(url)) continue;
    html += escape(source.slice(offset, match.index));
    const external = url.startsWith("https:") ? ' target="_blank" rel="noopener noreferrer"' : "";
    html += `<a href="${escape(url)}"${external}>${escape(label)}</a>`;
    offset = match.index + whole.length;
  }
  return html + escape(source.slice(offset));
}

function figure(url, alt, caption) {
  const src = imageUrl(url);
  if (!src) return "";
  return `<figure><img src="${escape(src)}" alt="${escape(text(alt))}" loading="lazy">${text(caption) ? `<figcaption>${escape(caption)}</figcaption>` : ""}</figure>`;
}

function renderBlock(block) {
  switch (block?.type) {
    case "heading": return `<h2>${escape(text(block.text))}</h2>`;
    case "paragraph": return `<p>${inline(block.text)}</p>`;
    case "list": {
      const name = block.ordered ? "ol" : "ul";
      return `<${name}>${array(block.items).map(item => `<li>${inline(item)}</li>`).join("")}</${name}>`;
    }
    case "image": return figure(block.url, block.alt, block.caption);
    case "quote": return `<blockquote><p>${escape(text(block.text))}</p>${text(block.author) ? `<cite>${escape(block.author)}</cite>` : ""}</blockquote>`;
    default: return "";
  }
}

export function renderPostPage({ post, origin, crumbsMarkup, breadcrumbSchema }) {
  const kind = POST_KINDS[post.kind];
  const headline = text(post.title);
  const path = `${kind.base}/${post.slug}`;
  const canonical = new URL(path, origin).href;
  const excerpt = text(post.excerpt);
  const blocks = array(post.body);
  const firstParagraph = text(blocks.find(block => block?.type === "paragraph")?.text).replace(LINK, "$1");
  const description = seoText(text(post.seo?.description) || excerpt || firstParagraph || headline, 160);
  const cover = imageUrl(post.cover?.url);
  const image = cover ? new URL(cover, origin).href : "";
  const published = dateOf(post.publishedAt);
  const modified = dateOf(post.updatedAt);
  const crumbs = [{ name: "Головна", href: "/" }, { name: kind.label, href: kind.base }, { name: headline, href: path }];
  const { "@context": context, ...publisher } = organizationSchema(origin);
  const article = {
    "@context": context,
    "@type": "Article",
    headline,
    url: canonical,
    mainEntityOfPage: canonical,
    inLanguage: "uk-UA",
    author: { "@type": "Organization", "@id": publisher["@id"], name: SITE_NAME, url: publisher.url },
    publisher,
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(published ? { datePublished: published } : {}),
    ...(modified && (!published || Date.parse(modified) >= Date.parse(published)) ? { dateModified: modified } : {})
  };
  const details = post.kind === "case" ? post.case : null;
  const facts = [["Об'єкт", text(details?.object)], ["Місце", text(details?.location)], ["Рік", details?.year]]
    .filter(([, value]) => value)
    .map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("");
  const equipment = array(details?.equipment).map(text).filter(Boolean).map(item => `<li>${escape(item)}</li>`).join("");
  const gallery = array(details?.photos).map(photo => figure(photo?.url, photo?.alt, photo?.alt)).join("");
  const related = array(post.more).filter(item => item?.kind === post.kind && isPostSlug(item.slug) && text(item.title))
    .map(item => `<li><a href="${kind.base}/${item.slug}">${escape(item.title)}</a></li>`).join("");
  const body = `<article class="ssr-page"><div class="container">${crumbsMarkup(crumbs)}
<h1>${escape(headline)}</h1>
<p>${escape(SITE_NAME)}</p>
${published ? `<time datetime="${escape(published)}">${escape(DATE_FORMAT.format(new Date(published)))}</time>` : ""}
${excerpt ? `<p>${escape(excerpt)}</p>` : ""}
${cover ? `<img src="${escape(cover)}" alt="${escape(text(post.cover?.alt))}">` : ""}
${blocks.map(renderBlock).join("\n")}
${facts ? `<dl>${facts}</dl>` : ""}
${equipment ? `<h2>Обладнання</h2><ul>${equipment}</ul>` : ""}
${gallery}
${related ? `<h2>${escape(kind.related)}</h2><ul>${related}</ul>` : ""}
</div></article>`;
  return {
    title: text(post.seo?.title) || `${headline} | ${SITE_NAME}`,
    description, canonical, robots: "index,follow", ogType: "article", image,
    schemas: { "schema-article": article, "schema-breadcrumbs": breadcrumbSchema(crumbs, origin) },
    body, postData: post
  };
}
