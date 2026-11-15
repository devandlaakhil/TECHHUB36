(() => {
  "use strict";

  const catalog = typeof module !== "undefined" && module.exports ? require("./learning-catalog") : window.KR7Catalog;
  const subjects = catalog.COURSES.filter(course => course.kind === "Interview Q&A");
  const selectedTopic = search => {
    const topic = new URLSearchParams(search).get("topic");
    return subjects.some(subject => subject.topic === topic) ? topic : null;
  };
  const filterSubjects = (query = "") => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return subjects.filter(subject => words.every(word =>
      `${subject.topic} ${subject.category}`.toLocaleLowerCase().includes(word)));
  };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { selectedTopic, filterSubjects };
    return;
  }

  const select = document.getElementById("subject-topic");
  const heading = document.getElementById("subject-qa-heading");
  const description = document.getElementById("subject-qa-description");
  const status = document.getElementById("subject-qa-status");
  const list = document.getElementById("subject-qa-results");
  let controller;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };

  subjects.forEach(subject => {
    const option = node("option", subject.topic);
    option.value = subject.topic;
    select.append(option);
  });
  const directory = document.getElementById("interview-directory");
  const subjectNotes = document.getElementById("interview-subjects");
  if (subjectNotes) subjects.forEach(subject => {
    const link = node("a", undefined, "interview-topic-link");
    link.href = subject.href;
    link.dataset.interviewSubject = subject.topic;
    link.append(node("span", subject.topic), node("small", subject.category));
    subjectNotes.append(link);
  });
  const topicSearch = document.getElementById("interview-topic-search");
  function filterDirectory() {
    const matching = new Set(filterSubjects(topicSearch?.value || "").map(subject => subject.topic));
    subjectNotes?.querySelectorAll("a").forEach(link => {
      link.hidden = !matching.has(link.dataset.interviewSubject);
    });
    const count = document.getElementById("interview-topic-count");
    if (count) count.textContent = matching.size
      ? `${matching.size} topic${matching.size === 1 ? "" : "s"}`
      : "No topics match. Try another search.";
  }
  topicSearch?.addEventListener("input", filterDirectory);
  filterDirectory();

  function accessToken() {
    try {
      const session = JSON.parse(localStorage.getItem("visual-memory-lab.auth-session") || "null");
      return typeof session?.access_token === "string" ? session.access_token : null;
    } catch {
      return null;
    }
  }

  function questionCard(question, index, premium) {
    const card = node("article", undefined, "experience-card qa-card");
    card.dataset.topic = question.topic;
    const header = node("header", undefined, "qa-question-block");
    const meta = node("div", undefined, "qa-meta");
    const isPaid = premium && index >= 10;
    meta.append(node("span", `Question ${String(index + 1).padStart(2, "0")}`, "qa-label qa-question-label"),
      node("span", isPaid ? "PRO" : "FREE PREVIEW", isPaid ? "qa-access pro" : "qa-access"));
    header.append(meta, node("h3", question.question, "qa-title"));
    if (question.practice_type) {
      const source = node("p", question.concept
        ? `${question.practice_type} | ${question.concept}` : question.practice_type, "qa-source");
      const course = catalog.COURSES.find(item => decodeURIComponent(item.href) === question.source_page);
      const href = course?.href || (question.source_page === "Company-Interviews.html" ? "Company-Interviews.html" : null);
      if (href) {
        const link = node("a", `Open source: ${course?.title || "Company practice"}`);
        const anchor = /^[A-Za-z][\w:-]*$/.test(question.source_anchor || "") ? `#${question.source_anchor}` : "";
        link.href = href + anchor;
        source.append(document.createTextNode(" | "), link);
      }
      header.append(source);
    }
    const details = node("details");
    details.className = "qa-details";
    details.open = index < 10;
    details.append(node("summary", "Answer & practical example"));
    const answer = node("div", undefined, "qa-answer-block");
    answer.append(node("p", "Answer", "qa-label"), node("p", question.answer, "experience-answer"));
    details.append(answer);
    if (question.example) {
      const example = node("div", undefined, "qa-code-block");
      example.append(node("p", "Practical example", "qa-label"), node("pre", question.example, "experience-example"));
      const practice = node("a", "Open code practice", "qa-practice-link");
      practice.href = `/DSA.html?${new URLSearchParams({ topic: question.topic, question: question.id })}`;
      example.append(practice);
      details.append(example);
    }
    card.append(header, details);
    return card;
  }

  function lockedCard(question, index) {
    const topic = question.topic;
    const card = node("article", undefined, "experience-card locked");
    card.dataset.topic = topic;
    card.dataset.questionIndex = String(index);
    const preview = node("p", `${topic} Pro question and answer`, "experience-locked-preview");
    preview.setAttribute("aria-hidden", "true");
    card.append(preview, node("h3", "Pro only"), node("p", "Unlock Pro to read this question, answer, and worked example."));
    const button = node("button", "Unlock Pro - Enter PIN", "experience-upgrade");
    button.type = "button";
    button.dataset.proUnlock = "";
    button.dataset.proResource = `subject:${topic}:${question.id}`;
    button.dataset.pinKind = "subject";
    button.dataset.pinUrl = `/api/questions?${new URLSearchParams({ topic, questionId: question.id })}`;
    card.append(button);
    return card;
  }

  async function loadTopic() {
    controller?.abort();
    const request = new AbortController();
    controller = request;
    const topic = selectedTopic(location.search);
    if (directory) directory.open = !topic || !window.matchMedia("(max-width:800px)").matches;
    const currentSubject = document.getElementById("interview-current-subject");
    if (currentSubject) currentSubject.textContent = topic || "Choose a subject";
    subjectNotes?.querySelectorAll("a").forEach(link => {
      if (link.dataset.interviewSubject === topic) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    select.value = topic || "";
    list.replaceChildren();
    list.setAttribute("aria-busy", String(Boolean(topic)));
    heading.textContent = topic ? `${topic} Interview Q&A` : "Choose your interview topic.";
    document.title = topic ? `TechHub365 | ${topic} Interview Q&A` : "TechHub365 | Interview Q&A";
    description.textContent = topic
      ? `Study only ${topic} questions and answers here. For company-focused question banks, open the separate Company Interviews section.`
      : "Pick a topic from the list to read its questions and answers. Switch topics here without going back to another page.";
    if (!topic) {
      status.textContent = "Choose a supported subject above. No other subjects' questions will be loaded.";
      return;
    }
    status.textContent = `Loading ${topic} questions...`;
    try {
      const token = accessToken();
      const response = await fetch(`/api/questions?${new URLSearchParams({ topic })}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "same-origin", cache: "no-store", signal: request.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${topic} questions.`);
      if (request.signal.aborted) return;
      const available = (data.questions || []).filter(question => question.topic === topic);
      const locked = (data.locked || []).filter(question => question.topic === topic);
      list.replaceChildren(...available.map((question, index) => questionCard(question, index, data.access?.premium === true)),
        ...locked.map((question, index) => lockedCard(question, available.length + index)));
      status.textContent = available.length || locked.length
        ? `${topic}: ${available.length} question${available.length === 1 ? "" : "s"} available${locked.length ? ` | ${locked.length} Pro questions locked` : ""}.`
        : `No ${topic} questions are configured yet. Other subjects will not be substituted.`;
      if (data.access?.verificationUnavailable) {
        status.textContent += " Account access is temporarily unavailable. Showing free previews; paid content stays locked.";
      }
    } catch (error) {
      if (request.signal.aborted) return;
      status.textContent = `${topic} questions could not be loaded: ${error.message}`;
    } finally {
      if (!request.signal.aborted) list.setAttribute("aria-busy", "false");
    }
  }

  select.addEventListener("change", () => {
    if (select.value === "visual-memory-lab") {
      location.assign("/Visual-Interview-Memory-Lab.html");
      return;
    }
    const url = new URL(location.href);
    if (select.value) url.searchParams.set("topic", select.value);
    else url.searchParams.delete("topic");
    url.hash = "";
    history.pushState(null, "", url);
    loadTopic();
  });
  subjectNotes?.addEventListener("click", event => {
    const link = event.target.closest("a[data-interview-subject]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = new URL(link.href, location.href);
    history.pushState(null, "", url);
    loadTopic();
    document.dispatchEvent(new CustomEvent("kr7:subject-change", {
      detail: { topic: link.dataset.interviewSubject },
    }));
    document.getElementById("subject-picker-heading")?.focus({ preventScroll: true });
  });
  window.addEventListener("popstate", loadTopic);
  document.addEventListener("kr7:pin-content", event => {
    const { button, data } = event.detail;
    if (button.dataset.pinKind !== "subject") return;
    const locked = button.closest(".experience-card.locked");
    const question = data.questions?.[0];
    if (!locked || !question || question.topic !== selectedTopic(location.search)) return;
    const opened = questionCard(question, Number(locked.dataset.questionIndex), true);
    opened.dataset.pinOpened = "";
    const details = opened.querySelector("details");
    details.open = true;
    details.addEventListener("toggle", () => {
      if (!details.open && opened.isConnected) opened.replaceWith(locked);
    });
    locked.replaceWith(opened);
  });
  loadTopic();
})();
