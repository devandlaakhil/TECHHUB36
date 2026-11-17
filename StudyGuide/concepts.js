(() => {
  "use strict";

  const results = document.getElementById("concept-results");
  const categories = document.getElementById("concept-categories");
  const search = document.getElementById("concept-search");
  const status = document.getElementById("concept-status");
  const reader = document.getElementById("concept-reader");
  const pathPanel = document.getElementById("concept-learning-path");
  const fixedCategory = document.getElementById("concept-library")?.dataset.conceptCategory;
  const { PATHS, orderLessons } = window.KR7ConceptPaths;
  let lessons = [];
  let premium = false;
  let verificationUnavailable = false;
  let selectedCategory = "All";
  let generation = 0;
  let controller;
  let openedBy;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function authHeaders() {
    try {
      const session = JSON.parse(localStorage.getItem("visual-memory-lab.auth-session") || "null");
      return typeof session?.access_token === "string" ? { Authorization: `Bearer ${session.access_token}` } : {};
    } catch { return {}; }
  }
  function closeLesson() {
    generation++;
    controller?.abort();
    reader.replaceChildren();
    reader.hidden = true;
  }
  function showLesson(lesson, button) {
    if (!button.isConnected || !lessons.some(item => item.id === lesson?.id &&
        button.dataset.conceptId === item.id)) return;
    closeLesson();
    openedBy = button;
    reader.append(node("span", `${lesson.category} | Pro concept lesson`, "badge gold"));
    const heading = node("h2", lesson.title);
    heading.id = "concept-reader-title";
    heading.tabIndex = -1;
    reader.append(heading);
    const paragraph = (title, text, className) => {
      reader.append(node("h3", title), node("p", text, className));
    };
    paragraph("What it means", lesson.what);
    paragraph("Why and when to use it", lesson.why);
    paragraph("How it works, step by step", lesson.how);
    if (lesson.steps?.length) {
      const steps = node("ol", undefined, "concept-steps");
      lesson.steps.forEach(step => steps.append(node("li", step)));
      reader.append(steps);
    }
    paragraph("Mental model / flow", lesson.flow, "concept-flow");
    reader.append(node("h3", "Worked example"));
    const pre = node("pre");
    pre.append(node("code", lesson.example));
    reader.append(pre);
    for (const [title, items] of [["Revision cheat sheet", lesson.cheat], ["Common pitfalls", lesson.pitfalls]]) {
      reader.append(node("h3", title));
      const list = node("ul", undefined, "concept-cheat");
      items.forEach(text => list.append(node("li", text)));
      reader.append(list);
    }
    paragraph("Try it yourself", lesson.exercise);
    const reference = node("a", "Official further reading");
    const url = new URL(lesson.reference);
    if (url.protocol === "https:") {
      reference.href = url.href;
      reference.target = "_blank";
      reference.rel = "noopener noreferrer";
      reader.append(reference);
    }
    const close = node("button", "Close and lock this lesson", "button secondary concept-close");
    close.type = "button";
    close.addEventListener("click", () => {
      closeLesson();
      openedBy?.focus();
    });
    const actions = node("div");
    actions.append(close);
    reader.append(actions);
    reader.hidden = false;
    status.textContent = premium ? "Opened with verified Pro access."
      : "This lesson only is open. Other lessons still require their own PIN.";
    heading.focus();
  }
  async function openPaidLesson(button, id) {
    closeLesson();
    const mine = generation;
    controller = new AbortController();
    const signal = controller.signal;
    button.disabled = true;
    status.textContent = "Opening concept lesson...";
    try {
      const response = await fetch(`/api/concepts?id=${encodeURIComponent(id)}`, {
        headers: authHeaders(), credentials: "same-origin", cache: "no-store", signal,
      });
      const data = await response.json();
      if (mine !== generation || !button.isConnected) return;
      if (!response.ok) throw new Error(data.error || "Could not open this lesson.");
      showLesson(data.lesson, button);
    } catch (error) {
      if (mine === generation && error.name !== "AbortError") status.textContent = error.message;
    } finally { button.disabled = false; }
  }
  function render() {
    closeLesson();
    results.replaceChildren();
    const term = search.value.trim().toLowerCase();
    const ordered = orderLessons(selectedCategory,
      lessons.filter(item => selectedCategory === "All" || item.category === selectedCategory));
    const visible = ordered.filter(item => `${item.title} ${item.category} ${item.summary}`.toLowerCase().includes(term));
    const path = PATHS[selectedCategory];
    pathPanel.replaceChildren();
    pathPanel.hidden = !path || Boolean(term);
    if (!pathPanel.hidden) {
      const heading = node("h3", `${selectedCategory}: step-by-step learning path`);
      heading.id = "concept-path-title";
      const outline = node("ol", undefined, "concept-path-list");
      ordered.forEach(item => {
        const entry = node("li");
        const link = node("a", item.title);
        link.href = `#concept-card-${item.id}`;
        entry.append(link);
        outline.append(entry);
      });
      pathPanel.append(heading, node("p", path.goal),
        node("p", `Before you start: ${path.prerequisite}`), outline,
          node("p", "Follow the order below. Pro includes all full lessons. An owner's item PIN opens one lesson separately."));
    }
    visible.forEach(item => {
      const card = node("article", undefined, "offering-card concept-card");
      card.id = `concept-card-${item.id}`;
      const step = selectedCategory === "All" ? "" : ` | Step ${ordered.indexOf(item) + 1}`;
      card.append(node("span", `${item.category}${step} | PRO`, "badge gold"),
        node("h3", item.title), node("p", item.summary));
      const button = node("button", premium ? "Read full concept" : "Pro - Enter PIN for lesson", "button compact");
      button.type = "button";
      button.dataset.conceptId = item.id;
      if (premium) button.addEventListener("click", () => openPaidLesson(button, item.id));
      else {
        button.dataset.proUnlock = "";
        button.dataset.proResource = `concept:${item.id}`;
        button.dataset.pinKind = "concept";
        button.dataset.pinUrl = `/api/concepts?id=${encodeURIComponent(item.id)}`;
      }
      card.append(button);
      results.append(card);
    });
    status.textContent = visible.length
      ? `${visible.length} concept lessons. ${premium ? "Verified Pro access." : "Full explanations require Pro or a separate lesson PIN."}`
      : "No matching concepts. Try another category or search.";
    if (verificationUnavailable) status.textContent += " Account access is temporarily unavailable; paid lessons stay locked.";
  }
  function syncCategory() {
    const requested = new URLSearchParams(location.search).get("category");
    selectedCategory = fixedCategory || (lessons.some(item => item.category === requested) ? requested : "All");
    categories.querySelectorAll("button").forEach(button =>
      button.setAttribute("aria-pressed", String(button.textContent === selectedCategory)));
    render();
    focusLinkedConcept();
  }
  function focusLinkedConcept() {
    const match = /^#concept-card-([a-z0-9-]+)$/.exec(location.hash);
    const id = match?.[1] || (location.hash === "#concept-library"
      ? new URLSearchParams(location.search).get("lesson") : null);
    if (!lessons.some(item => item.id === id)) return;
    const card = document.getElementById(`concept-card-${id}`);
    card?.scrollIntoView({ block: "start" });
    card?.querySelector("button")?.focus({ preventScroll: true });
  }
  document.addEventListener("click", event => {
    const trigger = event.target.closest("[data-pro-unlock]");
    if (!trigger) return;
    const button = trigger.dataset.proResource ? trigger
      : [...results.querySelectorAll("[data-pin-kind='concept']")].find(item => item.getClientRects().length > 0);
    if (button?.dataset.pinKind !== "concept") return;
    closeLesson();
    button.dataset.pinRequest = String(generation);
  }, true);
  document.addEventListener("kr7:pin-content", event => {
    const { button, data, pinRequest } = event.detail || {};
    if (button?.dataset.pinKind === "concept" && button.isConnected &&
        Number(pinRequest) === generation) showLesson(data?.lesson, button);
  });
  search.addEventListener("input", render);
  window.addEventListener("popstate", syncCategory);
  window.addEventListener("hashchange", focusLinkedConcept);
  window.addEventListener("pagehide", closeLesson);
  (async () => {
    try {
      const response = await fetch("/api/concepts", { headers: authHeaders(), credentials: "same-origin", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load concept outlines.");
      lessons = fixedCategory ? data.lessons.filter(item => item.category === fixedCategory) : data.lessons;
      premium = data.access?.premium === true;
      verificationUnavailable = data.access?.verificationUnavailable === true;
      (fixedCategory ? [fixedCategory] : ["All", ...new Set(lessons.map(item => item.category))]).forEach(category => {
        const button = node("button", category, "button secondary compact");
        button.type = "button";
        button.setAttribute("aria-pressed", String(category === selectedCategory));
        button.addEventListener("click", () => {
          const url = new URL(location.href);
          if (category === "All") url.searchParams.delete("category");
          else url.searchParams.set("category", category);
          history.pushState(null, "", url);
          syncCategory();
        });
        categories.append(button);
      });
      syncCategory();
    } catch (error) { status.textContent = `${error.message} Reload to try again.`; }
  })();
})();
