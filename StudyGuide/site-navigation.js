(() => {
  "use strict";
  const header = document.querySelector("[data-site-header]");
  if (!header) return;
  const navigation = header.querySelector("#site-primary-navigation");
  const toggle = header.querySelector(".site-menu-toggle");
  const groups = [...header.querySelectorAll(".site-nav-group")];
  const mobile = window.matchMedia("(max-width:1100px)");

  function closeGroups(except) {
    groups.forEach(group => { if (group !== except) group.open = false; });
  }
  function setExpanded(expanded, focus = false) {
    navigation.dataset.mobileOpen = String(expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    if (!expanded) closeGroups();
    if (focus) toggle.focus();
  }
  function resize() {
    toggle.hidden = !mobile.matches;
    setExpanded(false);
  }
  toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
  navigation.addEventListener("click", event => {
    if (!event.target.closest("a")) return;
    closeGroups();
    if (mobile.matches) setExpanded(false);
  });
  groups.forEach(group => group.addEventListener("toggle", () => {
    if (group.open) closeGroups(group);
  }));
  document.addEventListener("click", event => {
    groups.forEach(group => { if (!group.contains(event.target)) group.open = false; });
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const opened = groups.find(group => group.open);
    if (opened) {
      opened.open = false;
      opened.querySelector("summary").focus();
    } else if (mobile.matches && toggle.getAttribute("aria-expanded") === "true") {
      setExpanded(false, true);
    }
  });
  mobile.addEventListener("change", resize);
  window.addEventListener("pageshow", resize);
  resize();
  document.documentElement.classList.add("site-nav-ready");
})();
