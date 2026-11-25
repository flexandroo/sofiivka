/* Nova Poshta pickers on /checkout: the settlement first, then a branch or parcel locker in it.
 * Address lookups of the public Nova Poshta API work without a key and allow browser calls (CORS), so the page
 * asks the API directly. If the API does not answer, both fields stay plain text inputs, as before.
 *   window.sofievkaNovaPoshta.bind({ city, branch, hint })  // the two inputs and an optional hint paragraph */
(function () {
  "use strict";

  const API = "https://api.novaposhta.ua/v2.0/json/";
  const cache = new Map();

  function call(calledMethod, methodProperties) {
    const key = `${calledMethod}:${JSON.stringify(methodProperties)}`;
    if (!cache.has(key)) {
      const request = fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "", modelName: "Address", calledMethod, methodProperties }),
        signal: AbortSignal.timeout(8000)
      }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then(body => {
          if (!body || !body.success) throw new Error((body && body.errors || []).join(", ") || "Nova Poshta error");
          return body;
        });
      cache.set(key, request);
      request.catch(() => cache.delete(key));
    }
    return cache.get(key);
  }

  // Typographic apostrophes (’ ʼ ‘ and the backtick) become the ASCII one before a search or a name comparison.
  const apostrophes = text => String(text || "").replace(/[’ʼ‘`]/g, "'");
  // The API answers «CityName has invalid characters» for Latin letters and symbols.
  const settlementQuery = text => apostrophes(text).trim().replace(/^(м|с|смт|сел|селище)(\.\s*|\s+)/i, "").split(",")[0]
    .replace(/[^0-9a-zа-яіїєґ'\-\s]/gi, " ").replace(/\s+/g, " ").trim();
  const sameName = text => apostrophes(text).toLocaleLowerCase("uk").replace(/\s+/g, " ").trim();

  async function searchSettlements(text) {
    const query = settlementQuery(text);
    if (query.length < 2 || /[a-z]/i.test(query)) return [];
    const body = await call("searchSettlements", { CityName: query, Limit: "20", Page: "1" });
    return ((body.data && body.data[0] && body.data[0].Addresses) || []).map(item => ({
      label: item.Present,
      detail: Number(item.Warehouses) > 0 ? `Відділень і поштоматів: ${item.Warehouses}` : "Немає відділень Нової пошти",
      value: item.Present,
      ref: item.DeliveryCity,
      name: item.MainDescription,
      warehouses: Number(item.Warehouses) || 0
    }));
  }

  async function searchBranches(cityRef, text) {
    const query = apostrophes(text).replace(/^№\s*/, "").trim();
    const properties = { CityRef: cityRef, Limit: "30", Page: "1", Language: "UA" };
    // «15» or «№15» is a branch number; anything else is a street or a name.
    if (/^\d{1,6}$/.test(query)) properties.WarehouseId = query;
    else if (query) properties.FindByString = query.slice(0, 60);
    const body = await call("getWarehouses", properties);
    return (body.data || []).map(item => ({ label: item.Description, value: item.Description, ref: item.Ref }));
  }

  // Accessible combobox (input + listbox): arrows move, Enter picks, Escape closes; the typed text is kept
  // when nothing is picked, so a customer can still write an address by hand.
  function combobox({ input, minLength, search, onPick, onType }) {
    const list = document.getElementById(input.getAttribute("aria-controls"));
    if (!list) return { open() {} };
    let options = [];
    let active = -1;
    let timer = 0;
    let blurTimer = 0;
    let requestId = 0;
    // typed: the customer typed since the list opened (a list opened by focus only shows the current value's matches);
    // stale: the shown options belong to an older text, a search for the new one is pending or running;
    // pendingEnter: Enter was pressed meanwhile, so the first fresh option is taken when it arrives.
    let typed = false;
    let stale = false;
    let pendingEnter = false;
    // A pending (debounced) or running search must not reopen a list the customer has already left or closed.
    const cancel = () => { clearTimeout(timer); requestId += 1; pendingEnter = false; };
    const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
    // On a phone the list opens below the fold (tab bar, keyboard): scroll just enough to show it, keeping the field
    // under the sticky header.
    const reveal = () => {
      const viewport = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
      const overflow = list.getBoundingClientRect().bottom - (viewport - 72);
      if (overflow > 0) window.scrollBy({ top: Math.min(overflow, input.getBoundingClientRect().top - 132), behavior: "smooth" });
    };
    const state = text => { options = []; list.innerHTML = `<li class="np-options__state" role="presentation">${text}</li>`; list.hidden = false; input.setAttribute("aria-expanded", "true"); };
    const highlight = index => {
      active = index;
      [...list.querySelectorAll("[role=option]")].forEach((node, position) => node.setAttribute("aria-selected", String(position === index)));
      const node = list.querySelector(`[data-index="${index}"]`);
      if (node) { input.setAttribute("aria-activedescendant", node.id); node.scrollIntoView({ block: "nearest" }); }
    };
    const pick = index => {
      const option = options[index];
      if (!option) return;
      input.value = option.value;
      cancel();
      close();
      typed = false;
      onPick(option);
    };
    const run = async () => {
      if (document.activeElement !== input) return;
      const text = input.value.trim();
      if (text.length < minLength) { cancel(); close(); return; }
      clearTimeout(timer);
      const id = ++requestId;
      state("Шукаємо…");
      let found;
      try { found = await search(text); } catch {
        // A failed search ends the Enter intent: the next Enter closes the error list, the one after submits.
        if (id === requestId) { stale = false; pendingEnter = false; }
        if (id === requestId && document.activeElement === input) state("Не вдалося завантажити список — впишіть вручну");
        return;
      }
      // An answer counts only for the text that is still in the field.
      if (id !== requestId || document.activeElement !== input || input.value.trim() !== text) return;
      stale = false;
      const enter = pendingEnter;
      pendingEnter = false;
      if (!found) { close(); return; }
      if (!found.length) { state("Нічого не знайдено"); return; }
      options = found;
      list.innerHTML = found.map((option, index) => `<li role="option" id="${list.id}-${index}" data-index="${index}" aria-selected="false">${escape(option.label)}${option.detail ? `<small>${escape(option.detail)}</small>` : ""}</li>`).join("");
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      active = -1;
      if (enter && typed) { pick(0); return; }
      reveal();
    };
    input.addEventListener("input", () => { onType(); typed = true; stale = true; pendingEnter = false; clearTimeout(timer); timer = setTimeout(run, 250); });
    input.addEventListener("focus", () => { clearTimeout(blurTimer); typed = false; stale = false; if (input.value.trim().length >= minLength || minLength === 0) run(); });
    input.addEventListener("blur", () => { cancel(); clearTimeout(blurTimer); blurTimer = setTimeout(close, 150); });
    input.addEventListener("keydown", event => {
      if (event.key === "Escape") { if (!list.hidden) event.preventDefault(); cancel(); close(); return; }
      if (list.hidden) { if (event.key === "ArrowDown") run(); return; }
      // While the list is open Enter never submits the form. It takes the highlighted option; after typing, the first
      // option of the search for the typed text (waiting for it if it is still running); in a list opened by focus
      // alone it keeps the current value («Бровари» picked earlier is not swapped for the first «Бровари»).
      if (event.key === "Enter") {
        event.preventDefault();
        if (stale && typed) { pendingEnter = true; if (input.value.trim().length >= minLength) run(); else { cancel(); close(); } return; }
        if (active >= 0 && options[active]) { pick(active); return; }
        const same = options.findIndex(option => option.value === input.value.trim());
        if (same >= 0 && typed) pick(same);
        else if (same < 0 && typed && options.length) pick(0);
        else { cancel(); close(); }
        return;
      }
      if (!options.length) return;
      if (event.key === "ArrowDown") { event.preventDefault(); highlight(Math.min(options.length - 1, active + 1)); }
      else if (event.key === "ArrowUp") { event.preventDefault(); highlight(Math.max(0, active - 1)); }
    });
    // mousedown keeps the focus in the input, so blur does not close the list before the click.
    list.addEventListener("mousedown", event => event.preventDefault());
    list.addEventListener("click", event => { const node = event.target.closest("[role=option]"); if (node) pick(Number(node.dataset.index)); });
    return { open: run, close };
  }
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function bind({ city, branch, hint }) {
    if (!city || !branch || city.dataset.npBound) return;
    city.dataset.npBound = "1";
    let cityRef = "";
    const showHint = text => { if (!hint) return; hint.textContent = text || ""; hint.hidden = !text; };
    // A city typed or prefilled without picking it from the list is looked up once the branch field is used: the
    // whole value against each result's full name («м. Бровари, Броварський р-н, Київська обл.»), else a bare
    // name («Бровари», «смт Гостомель») when exactly one settlement has it.
    const resolveCity = async () => {
      const value = city.value.trim();
      if (cityRef || !value) return cityRef;
      const found = await searchSettlements(value).catch(() => []);
      if (cityRef || city.value.trim() !== value) return cityRef;
      let match = found.find(item => sameName(item.label) === sameName(value));
      if (!match && !value.includes(",")) {
        const name = sameName(settlementQuery(value));
        const named = found.filter(item => sameName(item.name) === name);
        if (named.length === 1) match = named[0];
      }
      if (match && match.warehouses > 0) cityRef = match.ref;
      return cityRef;
    };
    combobox({
      input: city,
      minLength: 2,
      search: searchSettlements,
      onType: () => { if (cityRef) { cityRef = ""; branch.value = ""; } showHint(""); },
      onPick: option => {
        cityRef = option.warehouses > 0 ? option.ref : "";
        branch.value = "";
        showHint(option.warehouses > 0 ? "" : "У цьому населеному пункті немає відділень Нової пошти — впишіть адресу або найближче відділення.");
        if (cityRef) branch.focus();
      }
    });
    combobox({
      input: branch,
      minLength: 0,
      search: async text => {
        const ref = await resolveCity();
        if (!ref) return null;
        return searchBranches(ref, text);
      },
      onType: () => {},
      onPick: () => showHint("")
    });
  }

  window.sofievkaNovaPoshta = Object.freeze({ bind, searchSettlements, searchBranches });
})();
