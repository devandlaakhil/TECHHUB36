"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { parse } = require("parse5");
const lessons = require("../api/_concept-lessons");
const fullstack = require("../api/_concept-fullstack");
const paths = require("../concept-paths");
const root = path.join(__dirname, "..");
const category = "Angular + .NET Fullstack";
const catalog = lessons.map(({ id, category, title, summary }) => ({ id, category, title, summary }));

function descendants(element) {
  return [element, ...element.children.flatMap(descendants)];
}

async function open(page, query = "", { access = {} } = {}) {
  const events = new Map();
  const requests = [];
  let activeElement;
  let documentRoot;
  function node(ast = {}) {
    const attrs = Object.fromEntries((ast.attrs || []).map(attr => [attr.name, attr.value]));
    const element = {
      tagName: ast.tagName, id: attrs.id, dataset: {}, children: [], events: new Map(),
      value: attrs.value || "", hidden: Object.hasOwn(attrs, "hidden"), disabled: false,
      _text: ast.value || "",
      get textContent() { return this._text + this.children.map(child => child.textContent).join(""); },
      set textContent(value) { this._text = String(value); this.replaceChildren(); },
      get isConnected() { return descendants(documentRoot).includes(this); },
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { attrs[name] = value; },
      getAttribute(name) { return attrs[name]; },
      addEventListener(name, callback) { this.events.set(name, callback); },
      querySelectorAll(selector) { return descendants(this).slice(1).filter(child => child.tagName === selector); },
      querySelector(selector) { return this.querySelectorAll(selector)[0]; },
      scrollIntoView() { this.scrolled = true; },
      focus() { activeElement = this; },
    };
    for (const [name, value] of Object.entries(attrs)) {
      if (name.startsWith("data-")) element.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    element.children = (ast.childNodes || []).map(node);
    return element;
  }
  documentRoot = node(parse(fs.readFileSync(path.join(root, page), "utf8")));
  const element = id => descendants(documentRoot).find(item => item.id === id);
  const location = new URL(`${page}${query}`, "https://kr7tech.test/");
  vm.runInNewContext(fs.readFileSync(path.join(root, page === "Courses.html" ? "courses.js" : "concepts.js"), "utf8"), {
    document: {
      getElementById: element, createElement: tagName => node({ tagName }),
      addEventListener: (name, callback) => events.set(`document:${name}`, callback),
    },
    window: { KR7ConceptPaths: paths, KR7Catalog: require("../learning-catalog"), addEventListener: (name, callback) => events.set(name, callback) },
    location, URL, URLSearchParams, AbortController,
    history: { pushState(_, __, url) { location.href = url.href; } },
    localStorage: { getItem() { return null; } },
    fetch: async (url, options) => {
      requests.push(url);
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      const id = new URL(url, location).searchParams.get("id");
      return { ok: true, json: async () => id
        ? { lesson: lessons.find(item => item.id === id) }
        : { lessons: catalog, access } };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { element, events, requests, location, active: () => activeElement };
}

test("the dedicated reader stays scoped even with a competing category URL, search, or history", async () => {
  const ui = await open("Fullstack-Angular-Dotnet.html", "?category=AI");
  assert.equal(ui.element("concept-results").children.length, 18);
  assert.deepEqual(ui.element("concept-results").children.map(card => card.id),
    paths.PATHS[category].lessonIds.map(id => `concept-card-${id}`));
  assert.deepEqual(ui.element("concept-categories").children.map(button => button.textContent), [category]);
  const search = ui.element("concept-search");
  search.value = "concurrency";
  search.events.get("input")();
  assert.ok(ui.element("concept-results").children.length > 0);
  assert.ok(ui.element("concept-results").children.length < 18);
  assert.ok(ui.element("concept-results").children.every(card => card.id.startsWith("concept-card-fullstack-")));
  search.value = "";
  ui.location.search = "?category=.NET";
  ui.events.get("popstate")();
  assert.equal(ui.element("concept-results").children.length, 18);
  assert.equal(ui.element("concept-reader").hidden, true);
  assert.deepEqual(ui.requests, ["/api/concepts"]);
});

test("the ordinary Concept Library retains All and subject-specific browsing", async () => {
  const ui = await open("Concepts.html");
  assert.equal(ui.element("concept-results").children.length, lessons.length);
  assert.equal(ui.element("concept-categories").children[0].textContent, "All");
  for (const category of ["Angular", ".NET"]) {
    ui.location.search = `?${new URLSearchParams({ category })}`;
    ui.events.get("popstate")();
    assert.deepEqual(ui.element("concept-results").children.map(card => card.id),
      paths.orderLessons(category, lessons.filter(item => item.category === category))
        .map(lesson => `concept-card-${lesson.id}`));
  }
});

test("stage links focus the right card after asynchronous catalog loading without opening a lesson", async () => {
  const ast = parse(fs.readFileSync(path.join(root, "Fullstack-Angular-Dotnet.html"), "utf8"));
  function walk(node) { return [node, ...(node.childNodes || []).flatMap(walk)]; }
  const links = walk(ast).flatMap(node => (node.attrs || []).filter(attr => attr.name === "href")
    .map(attr => attr.value)).filter(href => href.startsWith("?lesson="));
  assert.equal(new Set(links).size, 3);
  for (const href of new Set(links)) {
    const ui = await open("Fullstack-Angular-Dotnet.html", href);
    const id = ui.location.searchParams.get("lesson");
    const card = ui.element(`concept-card-${id}`);
    assert.equal(card.scrolled, true);
    assert.equal(ui.active(), card.querySelector("button"));
    assert.equal(ui.element("concept-reader").hidden, true);
    assert.deepEqual(ui.requests, ["/api/concepts"]);
    ui.location.hash = "#concept-card-fullstack-production-capstone";
    ui.events.get("hashchange")();
    assert.equal(ui.active().dataset.conceptId, "fullstack-production-capstone");
  }
});

test("Go opens its included lesson through the API and leaves later fullstack lessons PIN-scoped", async () => {
  const ui = await open("Fullstack-Angular-Dotnet.html", "", {
    access: { includedLessonIds: fullstack.slice(0, 2).map(lesson => lesson.id) },
  });
  const cards = ui.element("concept-results").children;
  assert.equal(cards[0].querySelector("button").dataset.proUnlock, undefined);
  const locked = cards[2].querySelector("button");
  assert.equal(locked.dataset.proResource, `concept:${fullstack[2].id}`);
  assert.equal(locked.events.has("click"), false);
  await cards[0].querySelector("button").events.get("click")();
  assert.equal(ui.element("concept-reader").hidden, false);
  assert.ok(ui.element("concept-reader").textContent.includes(fullstack[0].what));
  assert.match(ui.element("concept-status").textContent, /Go access/);
  ui.element("concept-search").events.get("input")();
  assert.equal(ui.element("concept-reader").hidden, true);
  assert.equal(ui.element("concept-reader").children.length, 0);
});

test("Courses sends the fullstack course to its dedicated cluster and keeps other courses in Concepts", async () => {
  const ui = await open("Courses.html");
  const cards = ui.element("course-topics").children;
  assert.equal(cards.find(card => card.dataset.courseCategory === category).querySelector("a").href,
    "Fullstack-Angular-Dotnet.html");
  for (const card of cards.filter(card => card.dataset.courseCategory !== category)) {
    const url = new URL(card.querySelector("a").href, ui.location);
    assert.equal(url.pathname, "/Concepts.html");
    assert.equal(url.searchParams.get("category"), card.dataset.courseCategory);
  }
});
