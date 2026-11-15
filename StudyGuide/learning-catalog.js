(function (root, factory) {
  const catalog = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = catalog;
  else root.KR7Catalog = catalog;
})(globalThis, () => {
  "use strict";

  const COURSES = [
    { id: "visual-memory-lab", title: "Visual Interview Memory Lab", href: "Visual-Interview-Memory-Lab.html", category: "Backend", level: "All levels", kind: "Guide", description: "Thirty free C#/.NET questions with visual memory cues, diagrams, one-line answers and interview explanations. Pro unlocks the remaining lab." },
    { id: "angular-dotnet-fullstack", title: "Angular + .NET Fullstack: 0-5 years", href: "Fullstack-Angular-Dotnet.html", category: "Fullstack", level: "All levels", kind: "Roadmap", description: "A dedicated concept cluster: browser-to-database foundations, Angular and ASP.NET Core feature delivery, SQL, tests, security, and production recovery." },
    { id: "dotnet", title: "C# & .NET", href: "C%23Dotnet.html", category: "Backend", level: "All levels", kind: "Guide", description: "Programming foundations, async, APIs, data access, and runtime concepts." },
    { id: "azure", title: "Azure & CI/CD", href: "AZURECICD.html", category: "Cloud & DevOps", level: "All levels", kind: "Guide", description: "Cloud services, identity, messaging, deployment, and delivery fundamentals." },
    { id: "system-design", title: "System design", href: "System-Design.html", category: "Architecture", level: "All levels", kind: "Guide", description: "Work through requirements, APIs, data boundaries, scale, and reliability." },
    { id: "marketplace", title: "Marketplace architecture", href: "Amazon-Design.html", category: "Architecture", level: "Advanced", kind: "Guide", description: "Explore a marketplace case study with high- and low-level design trade-offs." },
    { id: "dsa", title: "Data structures & algorithms", href: "DSA.html", category: "Problem solving", level: "All levels", kind: "Practice", description: "Study problem-solving patterns, traces, complexity, and code solutions." },
    { id: "ai", title: "AI, RAG & agents", href: "How%20AI%20work.html", category: "AI", level: "All levels", kind: "Guide", description: "Understand models, retrieval, tool use, evaluation, and responsible implementation." },
    { id: "projects", title: "Project architecture", href: "Project.html", category: "Architecture", level: "Intermediate", kind: "Guide", description: "Connect CRM and application scenarios to practical architecture patterns." },
    { id: "react", title: "React machine coding", href: "React-Machine-Coding.html", category: "Frontend", level: "Intermediate", kind: "Practice", description: "Practice component-based challenges with requirements and implementation guides." },
    { id: "roadmap", title: "365-day .NET roadmap", href: "Dotnet-Roadmap.html", category: "Backend", level: "All levels", kind: "Roadmap", description: "Follow a structured foundation-to-senior curriculum with weekly outcomes." },
    { id: "studio", title: "Interview practice studio", href: "Interview-Studio.html", category: "Interview preparation", level: "Advanced", kind: "Practice", description: "Practice debugging, SQL review, incident response, and project stories." },
    ...[
      ["dotnet-qa", "C# / .NET", "Backend"], ["aspnet-qa", "ASP.NET Core", "Backend"],
      ["efcore-qa", "EF Core", "Backend"], ["linq-qa", "LINQ", "Backend"],
      ["angular-qa", "Angular", "Frontend"], ["javascript-qa", "JavaScript / TypeScript", "Frontend"],
      ["azure-qa", "Azure", "Cloud & DevOps"], ["devops-qa", "DevOps", "Cloud & DevOps"],
      ["sql-qa", "SQL", "Data"], ["design-qa", "System Design", "Architecture"],
      ["rest-qa", "REST APIs", "Backend"], ["microservices-qa", "Microservices", "Architecture"],
      ["security-qa", "Identity & Security", "Backend"], ["testing-qa", "Testing", "Backend"],
      ["dsa-qa", "Data Structures & Algorithms", "Problem solving"], ["behavioral-qa", "Behavioral", "Interview preparation"],
    ].map(([id, topic, category]) => ({
      id, topic, title: `${topic} interview Q&A`, href: `Subject-QA.html?topic=${encodeURIComponent(topic)}`,
      category, level: "All levels", kind: "Interview Q&A",
      description: `Study only ${topic} questions, concise answers, and worked examples.`,
    })),
  ];

  function filterCourses({ query = "", category = "", level = "", kind = "", savedIds = null } = {}) {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return COURSES.filter(course => {
      const searchable = `${course.title} ${course.description} ${course.category} ${course.kind}`.toLocaleLowerCase();
      return words.every(word => searchable.includes(word)) &&
        (!category || course.category === category) &&
        (!level || course.level === level || course.level === "All levels") &&
        (!kind || course.kind === kind) &&
        (!savedIds || savedIds.includes(course.id));
    });
  }

  function coachForCategory(category) {
    return ["Frontend", "Angular", "JavaScript / TypeScript", "React"].includes(category) ? "Akhil" : "Krishna";
  }

  return {
    COURSES,
    coachForCategory,
    filterCourses,
    getCourse: id => COURSES.find(course => course.id === id),
    courseForPage: page => COURSES.find(course => decodeURIComponent(course.href) ===
      (page === "AZURECICD - Copy.html" ? "AZURECICD.html" : page)),
  };
});
