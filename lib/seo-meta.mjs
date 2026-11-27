export const SITE_NAME = "ТД «Софіївка»";

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

export const jsonForScript = data => JSON.stringify(data).replace(/</g, "\\u003c");

export function seoText(value, limit = Infinity) {
  const text = String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const fragment = text.slice(0, limit - 1);
  const space = fragment.lastIndexOf(" ");
  return `${space > limit * 0.8 ? fragment.slice(0, space) : fragment.trimEnd()}…`;
}

export function snippetTitle(value, model = "") {
  const title = seoText(value);
  if (title.length <= 60) return title;
  const withoutStore = title.replace(/\s*\|\s*ТД «Софіївка»$/, "");
  if (withoutStore.length <= 60) return withoutStore;
  if (model && model.length <= 24 && withoutStore.includes(model) && !withoutStore.slice(0, 60).includes(model)) {
    return `${seoText(withoutStore.split(model)[0], 59 - model.length)} ${model}`;
  }
  return seoText(withoutStore, 60);
}

export function organizationSchema(origin) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: "Торговий дім «Софіївка»",
    url: `${origin}/`,
    logo: `${origin}/assets/icon-512.png`
  };
}

export function schemaMarkup(id, data) {
  return `<script type="application/ld+json" id="${id}">${jsonForScript(data)}</script>`;
}

export function faqSchema(questions) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(([question, answer]) => ({
      "@type": "Question", name: question,
      acceptedAnswer: { "@type": "Answer", text: answer }
    }))
  };
}
