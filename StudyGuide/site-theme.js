(() => {
  "use strict";

  const key = "kr7tech.theme";
  const root = document.documentElement;
  let theme = "dark";
  let persisted = true;

  function savedTheme() {
    try {
      const saved = window.localStorage.getItem(key);
      return saved === "light" || saved === "dark" ? saved : "dark";
    } catch {
      return theme;
    }
  }

  function syncControls() {
    document.querySelectorAll("[data-theme-toggle]").forEach(button => {
      const label = theme === "dark" ? "Switch to white theme" : "Switch to dark theme";
      button.setAttribute("aria-label", "White theme");
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(theme === "light"));
      button.hidden = false;
    });
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.setAttribute("content", theme === "light" ? "#ffffff" : "#101923");
  }

  function apply(next, persist = false) {
    theme = next;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try {
        window.localStorage.setItem(key, theme);
        persisted = true;
      } catch {
        persisted = false;
      }
    }
    syncControls();
  }

  apply(savedTheme());
  document.addEventListener("click", event => {
    if (!event.target?.closest?.("[data-theme-toggle]")) return;
    apply(theme === "dark" ? "light" : "dark", true);
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncControls, { once: true });
  }
  window.addEventListener("pageshow", () => { if (persisted) apply(savedTheme()); });
  window.addEventListener("storage", event => {
    if (event.key === key || event.key === null) apply(savedTheme());
  });
})();
