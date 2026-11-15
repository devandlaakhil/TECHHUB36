(() => {
  "use strict";
  const results = document.getElementById("course-topics");
  const search = document.getElementById("course-search");
  const status = document.getElementById("course-status");
  const { PATHS, orderLessons } = window.KR7ConceptPaths;
  const titles = new Map([
    ["Angular + .NET Fullstack", "Angular + .NET Fullstack: 0-5 Year Cluster"],
    ["C#", "C# Language Foundations"], [".NET", ".NET Application Development"],
    ["EF Core & LINQ", "Data Access with EF Core & LINQ"],
    ["Microservices", "Microservices & Design Patterns"], ["System Design", "System Design: HLD, LLD & Redis"],
    ["Azure", "Azure Cloud Fundamentals"], ["SQL", "SQL & Database Engineering"],
    ["Angular", "Angular Application Development"], ["AI", "AI, LangChain & LangGraph"],
    ["JavaScript / TypeScript", "JavaScript & TypeScript Fundamentals"],
    ["DevOps", "DevOps: Step-by-Step Learning"], ["Identity & Security", "Identity & Application Security"],
    ["Testing", "Software Testing & Quality"], ["DSA", "Data Structures & Algorithms Foundations"],
  ]);
  let courses = [];
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function render() {
    const term = search.value.trim().toLowerCase();
    const visible = courses.filter(course =>
      `${course.title} ${course.category} ${course.lessons.map(item => `${item.title} ${item.summary}`).join(" ")}`.toLowerCase().includes(term));
    results.replaceChildren(...visible.map(course => {
      const card = node("article", undefined, "study-note course-note");
      card.dataset.courseCategory = course.category;
      card.append(node("span", `${course.category} | Go: first 2 lessons / Pro: all`, "note-label"),
        node("h3", course.title, "note-title"),
        node("p", course.path?.goal || "Understand the concept, follow the flow, and learn from worked examples.", "note-copy"));
      card.append(node("p", course.category === "Angular + .NET Fullstack"
        ? "Topic guidance: Akhil (frontend) and Krishna (backend)"
        : `Topic guidance: ${window.KR7Catalog.coachForCategory(course.category)}`, "course-prerequisite"));
      if (course.path) card.append(node("p", `Before you start: ${course.path.prerequisite}`, "course-prerequisite"));
      card.append(node("p", "Recommended reading order", "course-path-label"));
      const outline = node("ol", undefined, "course-outline");
      course.lessons.forEach(lesson => outline.append(node("li", lesson.title)));
      const link = node("a", "Explore topic explanations", "button secondary compact");
      link.href = course.category === "Angular + .NET Fullstack" ? "Fullstack-Angular-Dotnet.html"
        : `Concepts.html?${new URLSearchParams({ category: course.category })}#concept-library`;
      card.append(outline, link);
      return card;
    }));
    status.textContent = visible.length
      ? `${visible.length} concept courses. Outlines are public; Go includes 2 lessons per subject, Pro includes all, and an item PIN opens one lesson.`
      : "No matching courses. Try a subject or concept name.";
  }
  search.addEventListener("input", render);
  (async () => {
    try {
      const response = await fetch("/api/concepts", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Course outlines are temporarily unavailable.");
      const data = await response.json();
      const groups = new Map();
      for (const lesson of data.lessons) {
        if (!groups.has(lesson.category)) groups.set(lesson.category, []);
        groups.get(lesson.category).push(lesson);
      }
      courses = [...groups].map(([category, lessons]) => ({
        category, title: titles.get(category) || `${category} Foundations`,
        path: PATHS[category], lessons: orderLessons(category, lessons),
      }));
      search.disabled = false;
      render();
    } catch (error) {
      status.textContent = `${error.message} Reload to try again. No interview questions have been substituted.`;
    }
  })();
})();
