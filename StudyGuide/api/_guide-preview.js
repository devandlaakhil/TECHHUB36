"use strict";

const fs = require("node:fs");
const path = require("node:path");
const acorn = require("acorn");
const { parse, serializeOuter } = require("parse5");
const { FREE_PREVIEW_LIMIT, VISUAL_MEMORY_PAGE, guidePreviewLimit } = require("./_pro-policy");
const interviewPractice = require("./_interview-practice");

const FREE_ITEMS_PER_TOPIC = FREE_PREVIEW_LIMIT;
const ITEM_CLASSES = new Set([
  "card", "pattern-card", "lld-card", "lesson", "term", "concept-card", "deep-lab", "exercise",
]);

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function descendants(node, predicate) {
  const found = [];
  for (const child of node.childNodes || []) {
    if (predicate(child)) found.push(child);
    found.push(...descendants(child, predicate));
  }
  return found;
}

function text(node) {
  return node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
}

function hasClass(node, names) {
  return (node.attrs?.find(attr => attr.name === "class")?.value || "")
    .split(/\s+/).some(name => names.has(name));
}

function readLiteral(node) {
  if (node.type === "Literal") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  if (node.type === "ArrayExpression") return node.elements.map(readLiteral);
  if (node.type === "ObjectExpression") {
    return Object.fromEntries(node.properties.map(property => {
      if (property.type !== "Property" || property.computed || property.kind !== "init") {
        throw new Error("Guide data must contain plain literal properties.");
      }
      return [property.key.name ?? property.key.value, readLiteral(property.value)];
    }));
  }
  throw new Error(`Unsupported guide data expression: ${node.type}`);
}

function dataVariable(source, name) {
  const ast = acorn.parse(source, { ecmaVersion: "latest" });
  let value;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && node.id.name === name) value = readLiteral(node.init);
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  visit(ast);
  return value;
}

function dsaPreviewHtml(html) {
  const document = parse(html, { sourceCodeLocationInfo: true });
  const scripts = descendants(document, node => node.tagName === "script" && !node.attrs?.some(attr => attr.name === "src"));
  for (const script of scripts) {
    const source = text(script);
    const ast = acorn.parse(source, { ecmaVersion: "latest" });
    const declaration = ast.body.flatMap(node => node.declarations || [])
      .find(node => node.id.name === "problems");
    if (!declaration) continue;
    const problems = readLiteral(declaration.init);
    const preview = problems.map((problem, index) => index < FREE_ITEMS_PER_TOPIC ? problem
      : { title: `Pro problem ${index + 1}`, pattern: "Pro practice", locked: true });
    const serialized = JSON.stringify(preview).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const start = script.sourceCodeLocation.startTag.endOffset;
    return html.slice(0, start + declaration.init.start) + serialized +
      html.slice(start + declaration.init.end);
  }
  throw new Error("DSA preview data is missing; private guide cannot be served.");
}

function fieldsItem(title, fields) {
  return {
    title,
    html: `<h3>${escapeHtml(title)}</h3>${fields.map(([label, value]) =>
      `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}`,
  };
}

function dynamicTopics(page, document, directory) {
  const scripts = descendants(document, node => node.tagName === "script" && !node.attrs?.some(attr => attr.name === "src"));
  if (page.startsWith("AZURECICD")) {
    const data = scripts.map(script => dataVariable(text(script), "DATA")).find(Boolean);
    return Object.entries(data).map(([title, topic]) => ({
      title,
      items: topic.q.map(([question, memory, answer, interview, diagram]) =>
        fieldsItem(question, [["Memory", memory], ["Answer", answer], ["Interview answer", interview], ["Flow", diagram]])),
    }));
  }
  if (page === "DSA.html") {
    const problems = scripts.map(script => dataVariable(text(script), "problems")).find(Boolean);
    return [{
      title: "Data structures and algorithms",
      items: problems.map(problem => ({
        title: problem.title,
        html: `<h3>${escapeHtml(problem.title)}</h3><p>${escapeHtml(problem.pattern)} &middot; ${escapeHtml(problem.complexity)}</p>
          <p>${escapeHtml(problem.visual)}</p>${["csharp", "python", "java"].map(language =>
          `<details><summary>${escapeHtml(language)} solution</summary><pre><code>${escapeHtml(problem[language])}</code></pre></details>`).join("")}`,
      })),
    }];
  }
  if (page === "Dotnet-Roadmap.html") {
    const source = fs.readFileSync(path.join(directory, "dotnet-roadmap.js"), "utf8");
    const weeks = dataVariable(source, "roadmapWeeks");
    return [{
      title: "C#/.NET roadmap lessons",
      items: weeks.map(week => fieldsItem(week.title, [
        ["Concepts", week.concept], ["Lab", week.lab], ["Debugging", week.failure],
        ["Apply", week.apply], ["Interview question", week.interview], ["Outcome", week.outcome],
      ])),
    }];
  }
  return null;
}

function cleanPreviewNode(node) {
  if (node.childNodes) {
    node.childNodes = node.childNodes.filter(child =>
      !["script", "style", "iframe", "object", "embed", "form", "button", "input", "select", "textarea"].includes(child.tagName));
    node.childNodes.forEach(cleanPreviewNode);
  }
  if (node.attrs) node.attrs = node.attrs.filter(attr =>
    !attr.name.startsWith("on") && !["style", "hidden"].includes(attr.name) &&
    !(["href", "src"].includes(attr.name) && /^\s*javascript:/i.test(attr.value)));
}

function staticTopics(document, title) {
  const main = descendants(document, node => node.tagName === "main")[0] || document;
  const isItem = node => hasClass(node, ITEM_CLASSES);
  const hasItemAncestor = node => {
    for (let parent = node.parentNode; parent && parent !== main; parent = parent.parentNode) {
      if (isItem(parent)) return true;
    }
    return false;
  };
  const allItems = descendants(main, isItem);
  const items = allItems.filter(node => !hasItemAncestor(node));
  const sections = descendants(main, node => node.tagName === "section");
  for (const section of sections) {
    if (isItem(section) || hasItemAncestor(section) ||
        hasClass(section, new Set(["hero"])) || descendants(section, isItem).length ||
        descendants(section, node => node.tagName === "section").length) continue;
    if (descendants(section, node => /^h[2-4]$/.test(node.tagName)).length) items.push(section);
  }
  // Restore document order after adding sections that contain tables or diagrams instead of cards.
  const order = descendants(main, () => true);
  items.sort((left, right) => order.indexOf(left) - order.indexOf(right));
  return [{
    title,
    items: items.map(node => {
      cleanPreviewNode(node);
      return {
        title: text(descendants(node, child => /^h[2-4]$/.test(child.tagName))[0] || node).trim(),
        html: serializeOuter(node),
      };
    }),
  }];
}

function guideTopics(page, html, directory, title) {
  if (page === VISUAL_MEMORY_PAGE) html = fs.readFileSync(path.join(directory, "C#Dotnet.html"), "utf8");
  const document = parse(html);
  const dynamic = dynamicTopics(page, document, directory);
  if (dynamic) return [{ title, items: dynamic.flatMap(topic => topic.items) }];
  const topics = staticTopics(document, title);
  if (page === "How AI work.html") {
    const scripts = descendants(document, node => node.tagName === "script" && !node.attrs?.some(attr => attr.name === "src"));
    const data = scripts.map(script => dataVariable(text(script), "DATA")).find(Boolean);
    topics.push(...data.map(([name, , , questions]) => ({
      title: name,
      items: questions.map(([question, why, answer, flow, detail]) =>
        fieldsItem(question, [["Purpose", why], ["Answer", answer], ["Flow", flow], ["Details", detail]])),
    })));
  }
  return [{ title, items: topics.flatMap(topic => topic.items) }];
}

function renderTopics(topics, page = "", { unlocked = false } = {}) {
  const limit = guidePreviewLimit(page);
  return topics.map((topic, topicIndex) => `<section class="preview-topic" aria-labelledby="topic-${topicIndex}">
    <h2 id="topic-${topicIndex}">${escapeHtml(topic.title)}</h2>
    <p>${Math.min(limit, topic.items.length)} free of ${topic.items.length} questions / lessons${unlocked ? " &middot; Pro access active" : ""}</p>
    <div class="preview-grid">${topic.items.map((item, index) => {
      if (index < limit || unlocked) return `<article class="preview-item" ${index < limit ? "data-free-item" : "data-member-item"}>${item.html}</article>`;
      return `<article class="preview-item guide-pro-placeholder" data-pro-item aria-label="Pro item ${index + 1}">
        <div class="pro-blur" aria-hidden="true"><h3>Premium question ${index + 1}</h3><p>Detailed answer, worked example, and practice explanation.</p></div>
        <div class="pro-overlay"><strong>Pro only</strong><button class="button" type="button" data-pro-unlock data-pro-resource="${escapeHtml(`guide:${page}:${index}`)}" data-pin-kind="guide" data-pin-url="${escapeHtml(`/api/serve-page?${new URLSearchParams({ page, item: String(index) })}`)}">Enter PIN for this item</button></div>
      </article>`;
    }).join("")}</div></section>`).join("");
}

const DOTNET_PRACTICE = ["C# / .NET", "ASP.NET Core", "EF Core", "LINQ", "Identity & Security", "Testing"];
const DESIGN_PRACTICE = ["Microservices", "SQL", "System Design", "REST APIs"];
const GUIDE_PRACTICE = {
  "C#Dotnet.html": DOTNET_PRACTICE,
  "Dotnet-Roadmap.html": DOTNET_PRACTICE,
  "System-Design.html": DESIGN_PRACTICE,
  "Amazon-Design.html": DESIGN_PRACTICE,
  "Project.html": ["Microservices", "System Design", "REST APIs", "Angular", "JavaScript / TypeScript", "Behavioral"],
  "AZURECICD.html": ["Azure", "DevOps"],
  "AZURECICD - Copy.html": ["Azure", "DevOps"],
  "DSA.html": ["Data Structures & Algorithms"],
};

function guidePracticeItems(page) {
  const subjects = GUIDE_PRACTICE[page] || [];
  return interviewPractice.filter(item => subjects.includes(item.topic)).map(item => ({
    title: item.question,
    html: `<article class="card pro-practice-card">
      <p class="pro-practice-concept">${escapeHtml(item.topic)} &middot; ${escapeHtml(item.concept)} &middot; Pro</p>
      <h3>${escapeHtml(item.question)}</h3>
      <p><strong>Concept and interview answer</strong></p><p>${escapeHtml(item.answer)}</p>
      <p><strong>Practical example</strong></p><pre><code>${escapeHtml(item.example)}</code></pre>
    </article>`,
  }));
}

function learningGuideTopics(page, html, directory, title) {
  const topics = guideTopics(page, html, directory, title);
  const additions = guidePracticeItems(page);
  if (additions.length && topics[0].items.length < FREE_PREVIEW_LIMIT) {
    throw new Error("Expanded guides must preserve their existing ten-item free preview.");
  }
  topics[0].items.push(...additions);
  return topics;
}

function renderGuidePractice(page) {
  const items = guidePracticeItems(page);
  return items.length ? `<section class="pro-practice" aria-labelledby="pro-practice-heading">
    <h2 id="pro-practice-heading">Pro interview questions and concepts</h2>
    <p>${items.length} additional questions with concept explanations and practical examples.</p>
    <div class="pro-practice-grid">${items.map(item => item.html).join("")}</div>
  </section>` : "";
}

module.exports = {
  escapeHtml, FREE_ITEMS_PER_TOPIC, guideTopics, renderTopics,
  learningGuideTopics, guidePracticeItems, renderGuidePractice,
  dsaPreviewHtml,
};
