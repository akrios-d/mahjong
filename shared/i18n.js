"use strict";
/* Minimal i18n core: a flat key -> {locale: text} dictionary, a t(key,
   params) formatter with {placeholder} substitution, persistence via
   localStorage, and a couple of small DOM helpers (data-i18n walker +
   language <select> injector). Individual games register their own
   strings into the shared dictionary via registerDict() before calling
   applyStaticI18n(). Browser-only (the server never needs to render
   text — it just ships {key, params} log entries and lets each viewer's
   own client translate them). */
(function (root) {
  const LOCALES = ["pt-BR", "en", "zh", "fr", "es"];
  const LOCALE_LABELS = { "pt-BR": "Português", en: "English", zh: "中文", fr: "Français", es: "Español" };
  const DICT = {};

  function getLocale() {
    try {
      const saved = localStorage.getItem("lang");
      if (saved && LOCALES.includes(saved)) return saved;
    } catch { /* ignore */ }
    return "pt-BR";
  }
  function setLocale(loc) {
    try { localStorage.setItem("lang", loc); } catch { /* ignore */ }
  }

  function registerDict(entries) { Object.assign(DICT, entries); }

  function format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined && params[k] !== null ? params[k] : m));
  }

  function t(key, params) {
    if (!key) return "";
    const entry = DICT[key];
    if (!entry) return key;
    const loc = getLocale();
    const str = entry[loc] || entry["pt-BR"] || Object.values(entry)[0] || key;
    return format(str, params);
  }

  function applyStaticI18n(scope) {
    const root2 = scope || document;
    root2.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    root2.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.getAttribute("data-i18n-placeholder")); });
    root2.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.getAttribute("data-i18n-title")); });
  }

  function injectLanguageSwitcher(container, onChange) {
    if (!container || container.querySelector(".lang-switcher")) return null;
    const select = document.createElement("select");
    select.className = "lang-switcher";
    LOCALES.forEach((loc) => {
      const opt = document.createElement("option");
      opt.value = loc;
      opt.textContent = LOCALE_LABELS[loc];
      if (loc === getLocale()) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => {
      setLocale(select.value);
      applyStaticI18n();
      if (onChange) onChange();
    });
    container.appendChild(select);
    return select;
  }

  const api = { LOCALES, LOCALE_LABELS, getLocale, setLocale, registerDict, t, applyStaticI18n, injectLanguageSwitcher };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.I18N = api;
})(typeof window !== "undefined" ? window : globalThis);
