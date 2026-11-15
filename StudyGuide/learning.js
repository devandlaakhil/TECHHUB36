(() => {
  "use strict";

  const catalog = typeof module !== "undefined" && module.exports ? require("./learning-catalog") : window.KR7Catalog;
  const STORAGE_KEY = "kr7tech.learning.v1";
  const emptyState = () => ({ saved: [], reviewed: [], recent: [], studyDays: [] });
  const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  function normalizeState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return emptyState();
    const ids = list => Array.isArray(list) ? [...new Set(list.filter(id => catalog.getCourse(id)))] : [];
    const studyDays = Array.isArray(value.studyDays) ? [...new Set(value.studyDays.filter(day =>
      typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
      Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day))].sort().slice(-366) : [];
    return { saved: ids(value.saved), reviewed: ids(value.reviewed), recent: ids(value.recent).slice(0, 10), studyDays };
  }

  function createStore(storage, now = () => new Date()) {
    let fallback = emptyState();
    let message = "";
    let volatile = false;
    function read() {
      if (volatile) return normalizeState(fallback);
      try {
        const raw = storage.getItem(STORAGE_KEY);
        fallback = raw ? normalizeState(JSON.parse(raw)) : emptyState();
      } catch {
        volatile = true;
        message = "Browser storage is unavailable or invalid. Learning activity is kept only for this page session.";
      }
      return normalizeState(fallback);
    }
    function update(change) {
      const state = read();
      change(state);
      fallback = normalizeState(state);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(fallback));
        volatile = false;
        message = "";
      } catch {
        volatile = true;
        message = "Browser storage is unavailable. Changes are kept only for this page session.";
      }
      return normalizeState(fallback);
    }
    function toggle(field, id) {
      if (!catalog.getCourse(id)) throw new Error("Choose a supported learning subject.");
      return update(state => {
        state[field] = state[field].includes(id) ? state[field].filter(value => value !== id) : [...state[field], id];
      });
    }
    return {
      read,
      message: () => message,
      toggleSaved: id => toggle("saved", id),
      toggleReviewed: id => toggle("reviewed", id),
      visit(id) {
        if (!catalog.getCourse(id)) return read();
        return update(state => {
          state.recent = [id, ...state.recent.filter(value => value !== id)].slice(0, 10);
          state.studyDays.push(localDate(now()));
        });
      },
    };
  }

  function activitySummary(state, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - (start.getDay() + 6) % 7);
    const weekStart = localDate(start);
    const today = localDate(now);
    return {
      saved: state.saved.length,
      reviewed: state.reviewed.length,
      studyDaysThisWeek: state.studyDays.filter(day => day >= weekStart && day <= today).length,
      lastCourse: catalog.getCourse(state.recent[0]),
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createStore, normalizeState, activitySummary };
    return;
  }

  // Access to localStorage itself can throw when browser storage is disabled.
  const storage = {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  };
  const store = createStore(storage);
  window.KR7Learning = store;
  const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };

  function saveButton(id) {
    const button = element("button", "", "button secondary compact");
    button.type = "button";
    button.dataset.saveCourse = id;
    return button;
  }

  function courseCard(course) {
    const card = element("article", undefined, "offering-card");
    card.dataset.courseId = course.id;
    card.append(element("span", `${course.kind} | ${course.level}`, "badge"));
    card.append(element("h3", course.title), element("p", course.description));
    const actions = element("div", undefined, "actions");
    const link = element("a", "Open subject", "button");
    link.href = course.href;
    actions.append(link, saveButton(course.id));
    card.append(actions);
    return card;
  }

  const topicToolbar = document.querySelector("[data-learning-topic]");
  const toolbar = topicToolbar || document.querySelector("[data-learning-course]");
  function renderToolbar(id) {
    if (!toolbar) return;
    toolbar.replaceChildren();
    const course = catalog.getCourse(id);
    if (!course) {
      delete toolbar.dataset.learningCourse;
      const link = element("a", "My Learning");
      link.href = "My-Learning.html";
      toolbar.append(element("span", "Choose one topic to save it or track a review. "), link);
      return;
    }
    toolbar.dataset.learningCourse = id;
    store.visit(id);
    const label = element("span", course.title);
    const review = element("button", "", "button secondary compact");
    review.type = "button";
    review.dataset.reviewCourse = id;
    const dashboard = element("a", "My Learning", "button secondary compact");
    dashboard.href = "/My-Learning.html";
    toolbar.append(label, saveButton(id), review, dashboard);
    toolbar.append(element("small", "Reviewed is self-reported, not a certificate or proof of Pro access.", "muted"));
  }
  if (topicToolbar) {
    const topicId = topic => catalog.COURSES.find(item => item.kind === "Interview Q&A" &&
      new URL(item.href, location.href).searchParams.get("topic") === topic)?.id;
    renderToolbar(topicId(new URLSearchParams(location.search).get("topic")));
    const topicSelect = document.getElementById("subject-topic") || document.getElementById("topic-filter");
    topicSelect?.addEventListener("change", event => {
      renderToolbar(topicId(event.target.value));
      refreshButtons();
    });
    document.addEventListener("kr7:subject-change", event => {
      renderToolbar(topicId(event.detail.topic));
      refreshButtons();
    });
    window.addEventListener("popstate", () => {
      renderToolbar(topicId(new URLSearchParams(location.search).get("topic")));
      refreshButtons();
    });
  } else if (toolbar) {
    renderToolbar(toolbar.dataset.learningCourse);
  }

  const filterForm = document.getElementById("catalog-filters");
  if (filterForm) {
    const params = new URLSearchParams(location.search);
    for (const [field, property] of [["category", "category"], ["level", "level"], ["kind", "kind"]]) {
      const select = filterForm.elements.namedItem(field);
      const values = field === "level" ? ["Beginner", "Intermediate", "Advanced"] :
        [...new Set(catalog.COURSES.map(course => course[property]))].sort();
      values.forEach(value => {
        const option = element("option", value);
        option.value = value;
        select.append(option);
      });
      select.value = params.get(field) || "";
      if (select.selectedIndex === -1) select.value = "";
    }
    filterForm.elements.namedItem("query").value = params.get("q") || "";
    filterForm.elements.namedItem("savedOnly").checked = params.get("saved") === "1";
    filterForm.addEventListener("input", () => renderCatalog(true));
    filterForm.addEventListener("submit", event => { event.preventDefault(); renderCatalog(true); });
    document.getElementById("catalog-reset").addEventListener("click", () => {
      filterForm.reset();
      renderCatalog(true);
    });
  }

  function renderCatalog(updateUrl = false) {
    if (!filterForm) return;
    const fields = filterForm.elements;
    const query = fields.namedItem("query").value;
    const category = fields.namedItem("category").value;
    const level = fields.namedItem("level").value;
    const kind = fields.namedItem("kind").value;
    const savedOnly = fields.namedItem("savedOnly").checked;
    const courses = catalog.filterCourses({ query, category, level, kind, savedIds: savedOnly ? store.read().saved : null });
    document.getElementById("catalog-results").replaceChildren(...courses.map(courseCard));
    document.getElementById("catalog-status").textContent = courses.length
      ? `${courses.length} matching subject${courses.length === 1 ? "" : "s"}. Each topic has up to 10 free questions and answers; remaining content is Pro only.`
      : "No subjects match your choices. Clear a filter or save a subject first.";
    if (updateUrl) {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (category) params.set("category", category);
      if (level) params.set("level", level);
      if (kind) params.set("kind", kind);
      if (savedOnly) params.set("saved", "1");
      history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
    }
  }

  function renderDashboard() {
    const dashboard = document.getElementById("learning-dashboard");
    if (!dashboard) return;
    const state = store.read();
    const summary = activitySummary(state);
    for (const [id, value] of [["learning-saved-count", summary.saved], ["learning-reviewed-count", summary.reviewed], ["learning-week-count", summary.studyDaysThisWeek]]) {
      document.getElementById(id).textContent = value;
    }
    const resume = document.getElementById("learning-resume");
    resume.replaceChildren();
    if (summary.lastCourse) {
      resume.append(element("h3", `Continue: ${summary.lastCourse.title}`));
      const link = element("a", "Continue learning", "button");
      link.href = summary.lastCourse.href;
      resume.append(link);
    } else {
      resume.append(element("p", "Open a subject to start your learning history. Your next visit will appear here."));
    }
    const saved = document.getElementById("learning-saved");
    saved.replaceChildren(...state.saved.map(id => courseCard(catalog.getCourse(id))));
    if (!state.saved.length) saved.append(element("p", "No saved subjects yet. Browse the catalog and select Save subject.", "muted"));
    const reviewed = document.getElementById("learning-reviewed");
    reviewed.replaceChildren(...state.reviewed.map(id => {
      const item = element("li");
      const course = catalog.getCourse(id);
      const link = element("a", course.title);
      link.href = course.href;
      const button = element("button", "Undo review", "button secondary compact");
      button.type = "button";
      button.dataset.reviewCourse = id;
      item.append(link, document.createTextNode(" "), button);
      return item;
    }));
    if (!state.reviewed.length) reviewed.append(element("li", "Mark subjects reviewed from their learning toolbar. This is your own progress, not an assessed qualification."));
  }

  function refreshButtons() {
    const state = store.read();
    document.querySelectorAll("[data-save-course]").forEach(button => {
      const active = state.saved.includes(button.dataset.saveCourse);
      button.textContent = active ? "Saved - remove" : "Save subject";
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-review-course]").forEach(button => {
      const active = state.reviewed.includes(button.dataset.reviewCourse);
      button.textContent = active ? "Undo review" : "Mark reviewed";
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-learning-status]").forEach(node => {
      node.textContent = store.message() || "Saved in this browser on this device only. Saving or reviewing does not unlock Pro.";
    });
  }

  document.addEventListener("click", event => {
    const save = event.target.closest("[data-save-course]");
    const review = event.target.closest("[data-review-course]");
    if (!save && !review) return;
    if (save) store.toggleSaved(save.dataset.saveCourse);
    else store.toggleReviewed(review.dataset.reviewCourse);
    renderCatalog();
    renderDashboard();
    refreshButtons();
  });
  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    renderCatalog();
    renderDashboard();
    refreshButtons();
  });
  renderCatalog();
  renderDashboard();
  refreshButtons();
})();
