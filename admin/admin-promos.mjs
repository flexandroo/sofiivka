// Promo codes (/admin/promo-codes, owner/admin): admin_list_promo_codes, admin_save_promo_code,
// admin_delete_promo_code (20261125170000). The /checkout field appears while at least one code is active;
// the server prices the cart and applies the discount, the page only previews it.

const STATE_LABELS = Object.freeze({
  active: { label: "Діє", tone: "success" },
  scheduled: { label: "Запланований", tone: "info" },
  expired: { label: "Завершився", tone: "" },
  used_up: { label: "Вичерпано", tone: "warning" },
  off: { label: "Вимкнено", tone: "" }
});

export async function createPromoCodesView({ api, signal }) {
  const codes = await api.promoCodes.list({ signal });
  const rows = codes.map(promo => `
    <tr data-promo-row="${escape(promo.id)}" class="${promo.state === "active" || promo.state === "scheduled" ? "" : "is-muted"}">
      <td><strong class="admin-promo-code">${escape(promo.code)}</strong>${promo.note ? `<small>${escape(promo.note)}</small>` : ""}</td>
      <td>${escape(discountLabel(promo))}${promo.minOrderTotal ? `<small>від ${escape(money(promo.minOrderTotal))}</small>` : ""}</td>
      <td>${escape(periodLabel(promo))}</td>
      <td>${promo.usedCount}${promo.maxUses ? ` з ${promo.maxUses}` : ""}${promo.ordersCount ? `<small>знижок на ${escape(money(promo.discountTotal))}</small>` : ""}</td>
      <td><span class="admin-status${STATE_LABELS[promo.state]?.tone ? ` admin-status--${STATE_LABELS[promo.state].tone}` : ""}">${escape(STATE_LABELS[promo.state]?.label || promo.state)}</span></td>
      <td class="admin-promo-actions">
        <button class="admin-button admin-button--secondary" type="button" data-promo-edit>Змінити</button>
        <button class="admin-button admin-button--secondary" type="button" data-promo-toggle>${promo.active ? "Вимкнути" : "Увімкнути"}</button>
        <button class="admin-button admin-button--ghost" type="button" data-promo-delete>Видалити</button>
      </td>
    </tr>`).join("");

  const html = `
    <section class="admin-crm-page admin-promos" data-promos>
      <header class="admin-page-head"><div><p class="admin-kicker">ПРОДАЖІ</p><h1>Промокоди</h1>
        <p>Поле «Промокод» з’являється в оформленні замовлення, поки діє хоча б один код. Знижка рахується лише з товарів з ціною; позиції «за запитом» менеджер оцінює окремо.</p></div></header>
      <form class="admin-panel" data-promo-form novalidate>
        <header class="admin-panel__head"><div><p class="admin-kicker" data-promo-form-kicker>НОВИЙ КОД</p><h2 data-promo-form-title>Створити промокод</h2></div></header>
        <input type="hidden" name="id"><input type="hidden" name="updatedAt">
        <div class="admin-form-grid admin-promo-grid">
          <label class="admin-field"><span>Код</span><div class="admin-promo-code-input"><input name="code" required maxlength="40" pattern="[A-Za-z0-9][A-Za-z0-9_\\-]{2,39}" title="Від 3 до 40 латинських літер і цифр, можна «-» та «_»" autocomplete="off" spellcheck="false"><button class="admin-button admin-button--secondary" type="button" data-promo-generate>Згенерувати</button></div><small>Латинські літери й цифри, можна «-» та «_». Клієнт може вводити малими літерами.</small></label>
          <label class="admin-field"><span>Знижка</span><div class="admin-promo-value"><input name="value" required inputmode="decimal" autocomplete="off"><select name="kind" aria-label="Тип знижки"><option value="percent">%</option><option value="fixed">грн</option></select></div><small>Відсоток — від 1 до 90; сума — не більша за вартість товарів.</small></label>
          <label class="admin-field"><span>Мінімальна сума замовлення, грн</span><input name="minOrderTotal" inputmode="decimal" autocomplete="off" placeholder="Без обмеження"></label>
          <label class="admin-field"><span>Скільки разів можна використати</span><input name="maxUses" inputmode="numeric" autocomplete="off" placeholder="Без обмеження"></label>
          <label class="admin-field"><span>Діє з</span><input name="startsAt" type="date"></label>
          <label class="admin-field"><span>Діє до (включно)</span><input name="endsAt" type="date"></label>
          <label class="admin-field admin-field--full"><span>Нотатка для себе</span><input name="note" maxlength="500" autocomplete="off" placeholder="Наприклад: розсилка листопада, партнер Х"></label>
          <label class="admin-staff-toggle admin-field--full"><input type="checkbox" name="active" checked><span>Код діє</span></label>
        </div>
        <footer class="admin-crm-form-actions">
          <button class="admin-button admin-button--secondary" type="button" data-promo-cancel hidden>Скасувати</button>
          <button class="admin-button admin-button--primary" type="submit" data-promo-submit>Створити</button>
        </footer>
      </form>
      <section class="admin-panel">
        <header class="admin-panel__head"><div><p class="admin-kicker">УСІ КОДИ</p><h2>${codes.length ? `${codes.filter(promo => promo.state === "active").length} діють зараз` : "Кодів ще немає"}</h2></div></header>
        ${codes.length ? `<div class="admin-products-table-wrap"><table class="admin-crm-table admin-promo-table">
          <thead><tr><th>Код</th><th>Знижка</th><th>Термін</th><th>Використано</th><th>Стан</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>` : `<p class="admin-panel-note">Створіть перший код вище — і поле для промокоду з’явиться на сторінці оформлення.</p>`}
      </section>
      <div class="admin-toast" role="status" aria-live="polite" hidden></div>
    </section>`;

  return { html, bind: container => bindPromoCodes(container, api, codes) };
}

function bindPromoCodes(container, api, codes) {
  const form = container.querySelector("[data-promo-form]");
  const submit = form.querySelector("[data-promo-submit]");
  const cancel = form.querySelector("[data-promo-cancel]");
  const byId = new Map(codes.map(promo => [promo.id, promo]));
  const fields = form.elements;

  const fill = promo => {
    fields.id.value = promo?.id || "";
    fields.updatedAt.value = promo?.updatedAt || "";
    fields.code.value = promo?.code || "";
    fields.kind.value = promo?.kind || "percent";
    fields.value.value = promo ? String(Number(promo.value)) : "";
    fields.minOrderTotal.value = promo?.minOrderTotal ? String(Number(promo.minOrderTotal)) : "";
    fields.maxUses.value = promo?.maxUses || "";
    fields.startsAt.value = promo?.startsAt ? dateInput(promo.startsAt) : "";
    // The end is stored as the start of the next day; the form shows the last day the code works.
    fields.endsAt.value = promo?.endsAt ? dateInput(new Date(new Date(promo.endsAt).valueOf() - 1)) : "";
    fields.note.value = promo?.note || "";
    fields.active.checked = promo ? promo.active : true;
    fields.code.readOnly = Boolean(promo?.usedCount);
    fields.code.title = promo?.usedCount ? "Код уже є в замовленнях — його не можна перейменувати" : "";
    form.querySelector("[data-promo-form-kicker]").textContent = promo ? "РЕДАГУВАННЯ" : "НОВИЙ КОД";
    form.querySelector("[data-promo-form-title]").textContent = promo ? promo.code : "Створити промокод";
    submit.textContent = promo ? "Зберегти зміни" : "Створити";
    cancel.hidden = !promo;
  };
  const payloadFrom = () => ({
    id: fields.id.value || null,
    code: fields.code.value.trim().toUpperCase(),
    kind: fields.kind.value,
    value: fields.value.value.trim(),
    minOrderTotal: fields.minOrderTotal.value.trim(),
    maxUses: fields.maxUses.value.trim(),
    startsAt: fields.startsAt.value ? new Date(`${fields.startsAt.value}T00:00:00`).toISOString() : "",
    endsAt: fields.endsAt.value ? new Date(new Date(`${fields.endsAt.value}T00:00:00`).valueOf() + 86400000).toISOString() : "",
    note: fields.note.value.trim(),
    active: fields.active.checked
  });
  const payloadOf = promo => ({ id: promo.id, code: promo.code, kind: promo.kind, value: String(promo.value), minOrderTotal: promo.minOrderTotal ? String(promo.minOrderTotal) : "",
    maxUses: promo.maxUses ? String(promo.maxUses) : "", startsAt: promo.startsAt || "", endsAt: promo.endsAt || "", note: promo.note || "", active: promo.active });
  const reload = message => { showToast(container, message); setTimeout(() => goTo(location.pathname, { replace: true }), 600); };

  fields.code.addEventListener("input", () => { fields.code.value = fields.code.value.toUpperCase().replace(/\s+/g, ""); });
  form.querySelector("[data-promo-generate]").addEventListener("click", () => {
    if (fields.code.readOnly) return;
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const random = crypto.getRandomValues(new Uint8Array(6));
    fields.code.value = `SOF-${[...random].map(byte => alphabet[byte % alphabet.length]).join("")}`;
  });
  cancel.addEventListener("click", () => fill(null));

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const payload = payloadFrom();
    submit.disabled = true;
    try {
      const saved = await api.promoCodes.save(payload, fields.updatedAt.value || null);
      reload(payload.id ? `Промокод ${saved.code} збережено.` : `Промокод ${saved.code} створено.`);
    } catch (error) {
      showToast(container, error.message, true);
      submit.disabled = false;
    }
  });

  container.querySelectorAll("[data-promo-row]").forEach(row => {
    const promo = byId.get(row.dataset.promoRow);
    row.querySelector("[data-promo-edit]").addEventListener("click", () => { fill(promo); form.scrollIntoView({ behavior: "smooth", block: "start" }); fields.value.focus({ preventScroll: true }); });
    row.querySelector("[data-promo-toggle]").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      try {
        await api.promoCodes.save({ ...payloadOf(promo), active: !promo.active }, promo.updatedAt);
        reload(promo.active ? `Промокод ${promo.code} вимкнено.` : `Промокод ${promo.code} увімкнено.`);
      } catch (error) { showToast(container, error.message, true); event.currentTarget.disabled = false; }
    });
    row.querySelector("[data-promo-delete]").addEventListener("click", async event => {
      const used = promo.usedCount > 0 || promo.ordersCount > 0;
      if (!window.confirm(used ? `Код ${promo.code} уже є в замовленнях, тому його буде вимкнено, а не видалено. Продовжити?` : `Видалити промокод ${promo.code}?`)) return;
      event.currentTarget.disabled = true;
      try {
        const result = await api.promoCodes.remove(promo.id);
        reload(result.deleted ? `Промокод ${promo.code} видалено.` : `Промокод ${promo.code} вимкнено.`);
      } catch (error) { showToast(container, error.message, true); event.currentTarget.disabled = false; }
    });
  });
}

function discountLabel(promo) {
  return promo.kind === "percent" ? `${Number(promo.value)}%` : money(promo.value);
}

function periodLabel(promo) {
  const from = promo.startsAt ? formatDate(promo.startsAt) : "";
  const to = promo.endsAt ? formatDate(new Date(new Date(promo.endsAt).valueOf() - 1)) : "";
  if (from && to) return `${from} — ${to}`;
  if (from) return `з ${from}`;
  if (to) return `до ${to}`;
  return "Без терміну";
}

function dateInput(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "—" : new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function money(value) {
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value) || 0)} грн`;
}

function goTo(target, { replace = false } = {}) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { target, replace } }));
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

function escape(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
