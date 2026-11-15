"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { workspaceDom } = require("./helpers/workspace-dom");
const { renderPreviewPage } = require("../api/serve-page");
const { dsaPreviewHtml } = require("../api/_guide-preview");
const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "DSA.html"), "utf8");
const preview = renderPreviewPage("DSA.html");
const tick = () => new Promise(resolve => setImmediate(resolve));

async function openWorkspace({ url = "https://kr7tech.test/DSA.html", html = preview, request } = {}) {
  const document = workspaceDom(html);
  const location = {}, windowEvents = {}, history = [], requests = [];
  function move(url) {
    const next = new URL(url, location.href);
    location.href = next.href;
    location.search = next.search;
  }
  move(url);
  const context = {
    document, location, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, console,
    history: { pushState(state, title, next) { move(next); history.push(location.href); } },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { clipboard: { writeText: async () => {} } },
    addEventListener(name, callback) { windowEvents[name] = callback; },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return request ? request(url, options) : { ok: true, json: async () => ({ compilerConfigured: false }) };
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "coding-runner.js"), "utf8"), context);
  for (const script of document.querySelectorAll("script").filter(script => !script.getAttribute("src"))) {
    await vm.runInContext(script.textContent, context);
  }
  const id = name => document.getElementById(name);
  const workspace = id("active-problem");
  return {
    document, context, workspace, requests, history, windowEvents, move, id,
    evaluate: code => vm.runInContext(code, context),
    click(name) { const button = id(name); if (!button.disabled) button.events.click(); },
    action(action) {
      const target = workspace.querySelector(`[data-action="${action}"]`);
      return workspace.events.click({ target });
    },
    language(language) {
      const target = workspace.querySelector(".editor-language");
      target.value = language;
      workspace.events.change({ target });
    },
  };
}

test("public DSA workspace keeps ten full problems and removes every paid data field before serving", async () => {
  const ui = await openWorkspace();
  const problems = JSON.parse(ui.evaluate("JSON.stringify(problems)"));
  const original = JSON.parse((await openWorkspace({ html: source })).evaluate("JSON.stringify(problems)"));
  assert.equal(problems.length, 50);
  assert.deepEqual(problems.slice(0, 10), original.slice(0, 10));
  assert.ok(problems.slice(10).every(problem => Object.keys(problem).sort().join() === "locked,pattern,title" && problem.locked));
  for (const problem of original.slice(10)) {
    for (const language of ["csharp", "python", "java"]) assert.equal(preview.includes(problem[language]), false);
  }
  assert.equal(ui.id("reference-solution").hidden, true);
  assert.equal(ui.id("problem-navigator").hidden, true);
  assert.equal(ui.id("previous-problem").disabled, true);
  assert.match(ui.id("code-editor").value, /class Program/);
  assert.doesNotMatch(preview, /app-protection\.js/);
  assert.throws(() => dsaPreviewHtml(source.replace("const problems =", "const privateProblems =")), /preview data is missing/);
});

test("problem and language changes preserve drafts and test input; marking practiced does not reset code", async () => {
  const ui = await openWorkspace();
  ui.id("code-editor").value = "// my C# draft";
  ui.id("test-input").value = "custom input";
  ui.id("test-expected").value = "custom output";
  await ui.action("complete");
  assert.equal(ui.id("code-editor").value, "// my C# draft");
  ui.language("javascript");
  ui.id("code-editor").value = 'console.log("my JS draft");';
  ui.click("next-problem");
  assert.match(ui.workspace.textContent, /Contains Duplicate/);
  assert.match(ui.id("code-editor").value, /Implement the solution/);
  ui.click("previous-problem");
  assert.equal(ui.id("code-editor").value, 'console.log("my JS draft");');
  assert.equal(ui.id("test-input").value, "custom input");
  assert.equal(ui.id("test-expected").value, "custom output");
  ui.language("csharp");
  assert.equal(ui.id("code-editor").value, "// my C# draft");
  assert.equal(new URL(ui.history.at(-1)).searchParams.get("problem"), "1");
});

test("solution, problem visibility, filtered navigation, and history work without discarding the editor", async () => {
  const ui = await openWorkspace();
  ui.click("toggle-solution");
  assert.equal(ui.id("reference-solution").hidden, false);
  assert.equal(ui.id("problem-description-body").hidden, true);
  ui.click("toggle-description");
  assert.equal(ui.workspace.querySelector(".problem-description").hidden, true);
  ui.click("toggle-solution");
  assert.equal(ui.workspace.querySelector(".problem-description").hidden, false);
  assert.equal(ui.id("problem-description-body").hidden, false);
  const search = ui.id("problem-search");
  search.value = "anagram";
  search.events.input();
  assert.match(ui.workspace.textContent, /Valid Anagram/);
  assert.equal(ui.id("previous-problem").disabled, true);
  ui.click("next-problem");
  assert.match(ui.workspace.textContent, /Group Anagrams/);
  assert.equal(ui.id("next-problem").disabled, true);
  search.value = "no matching problem";
  search.events.input();
  assert.equal(ui.id("previous-problem").disabled, true);
  assert.equal(ui.id("next-problem").disabled, true);
  assert.match(ui.id("problem-position").textContent, /No matching problems/);
  ui.move("/DSA.html?problem=1");
  ui.windowEvents.popstate();
  assert.match(ui.workspace.textContent, /Two Sum/);
  assert.equal(ui.id("problem-list").children.filter(item => !item.hidden).length, 50);
  ui.click("toggle-problems");
  assert.equal(ui.id("problem-navigator").hidden, false);
  ui.document.events.keydown({ key: "Escape" });
  assert.equal(ui.id("problem-navigator").hidden, true);
});

test("locked deep links expose only an item-scoped PIN action, never an editor or another solution", async () => {
  const ui = await openWorkspace({ url: "https://kr7tech.test/DSA.html?problem=50" });
  assert.equal(ui.id("code-editor"), null);
  const button = ui.workspace.querySelector("[data-pro-unlock]");
  assert.equal(button.dataset.proResource, "guide:DSA.html:49");
  assert.equal(button.dataset.pinUrl, "/api/serve-page?page=DSA.html&item=49");
  assert.doesNotMatch(ui.workspace.textContent, /LRU|LinkedHashMap/);
  assert.equal(ui.id("toggle-solution").disabled, true);
  assert.equal(ui.id("next-problem").disabled, true);
});

test("Q&A practice loads only the requested topic/question and keeps reference snippets separate from runnable code", async () => {
  const topic = "JavaScript / TypeScript";
  const unsafeExample = '</pre><script>window.injected = true;</script>';
  const ui = await openWorkspace({
    url: `https://kr7tech.test/DSA.html?${new URLSearchParams({ topic, question: "qa-2" })}`,
    request: async () => ({
      ok: true, json: async () => ({
        questions: [
          { id: "qa-1", topic, question: "First question", answer: "First answer", example: "first reference" },
          { id: "qa-2", topic, question: "Second question", answer: "Second answer", example: unsafeExample },
          { id: "other-topic", topic: "SQL", question: "Must not appear" },
        ],
        locked: [{ id: "qa-3", topic }],
      }),
    }),
  });
  assert.equal(ui.requests.length, 1);
  assert.equal(new URL(ui.requests[0].url, ui.context.location.href).searchParams.get("topic"), topic);
  assert.match(ui.workspace.textContent, /Second question/);
  assert.equal(ui.workspace.querySelector(".editor-language").value, "javascript");
  assert.equal(ui.id("reference-solution").hidden, true);
  assert.equal(ui.id("code-editor").value.includes(unsafeExample), false);
  ui.click("toggle-solution");
  assert.equal(ui.workspace.querySelector(".solution-code code").textContent, unsafeExample);
  assert.equal(ui.workspace.querySelectorAll("script").length, 0);
  assert.equal(ui.context.injected, undefined);
  ui.click("next-problem");
  assert.equal(ui.workspace.querySelector("[data-pro-unlock]").dataset.proResource, `subject:${topic}:qa-3`);
  assert.equal(ui.id("code-editor"), null);
  assert.doesNotMatch(ui.workspace.textContent, /Second answer|first reference|Must not appear/);
});

test("the JavaScript Two Sum starter is a runnable standalone program, including the no-pair case", async () => {
  const ui = await openWorkspace();
  ui.language("javascript");
  const code = ui.id("code-editor").value;
  for (const [stdin, expected] of [["2 7 11 15\n9", "[0,1]"], ["1 2 3\n99", "[]"], ["3 3\n6", "[0,1]"]]) {
    const output = [];
    vm.runInNewContext(code, {
      require(name) { assert.equal(name, "fs"); return { readFileSync: () => stdin }; },
      console: { log: text => output.push(text) },
    }, { timeout: 1000 });
    assert.deepEqual(output, [expected]);
  }
});

test("compiler-not-configured feedback appears without submitting or fabricating a result", async () => {
  const ui = await openWorkspace();
  await ui.action("run");
  await tick();
  assert.match(ui.id("run-output").textContent, /not configured/);
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].url, "/api/config");
  assert.equal(ui.workspace.querySelector('[data-action="run"]').disabled, false);
});

test("switching problems while configuration is pending cancels the run and preserves the new results panel", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const ui = await openWorkspace({ request: async () => pending });
  await ui.action("run");
  ui.click("next-problem");
  const newOutput = ui.id("run-output").textContent;
  release({ ok: true, json: async () => ({ compilerConfigured: true }) });
  await tick();
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].options.signal.aborted, true);
  assert.equal(ui.id("run-output").textContent, newOutput);
  assert.equal(ui.workspace.querySelector('[data-action="run"]').disabled, false);
});

test("PIN-opened interview practice relocks when leaving and never opens another question", async () => {
  const topic = "SQL";
  const ui = await openWorkspace({
    url: `https://kr7tech.test/DSA.html?${new URLSearchParams({ topic, question: "paid-1" })}`,
    request: async () => ({ ok: true, json: async () => ({
      questions: [{ id: "free-1", topic, question: "Free question", answer: "Free answer" }],
      locked: [{ id: "paid-1", topic }, { id: "paid-2", topic }],
    }) }),
  });
  const button = ui.workspace.querySelector("[data-pro-unlock]");
  ui.document.events["kr7:pin-content"]({ detail: { button, data: {
    questions: [{ id: "paid-1", topic, question: "One opened question", answer: "One opened answer", example: "SELECT 1;" }],
  } } });
  assert.ok(ui.id("code-editor"));
  ui.click("toggle-solution");
  assert.match(ui.workspace.textContent, /One opened answer/);
  ui.click("next-problem");
  assert.equal(ui.id("code-editor"), null);
  assert.equal(ui.workspace.querySelector("[data-pro-unlock]").dataset.proResource, "subject:SQL:paid-2");
  ui.click("previous-problem");
  assert.equal(ui.id("code-editor"), null);
  assert.doesNotMatch(ui.document.getElementById("problem-list").textContent, /One opened question/);
  assert.doesNotMatch(ui.workspace.textContent, /One opened answer|SELECT 1/);
});

test("available Q&A examples link by topic and question ID without placing protected code in the URL", async () => {
  const document = workspaceDom(fs.readFileSync(path.join(root, "Subject-QA.html"), "utf8"));
  const context = {
    document, location: { search: "?topic=SQL" }, URLSearchParams, AbortController,
    localStorage: { getItem: () => null },
    window: { KR7Catalog: require("../learning-catalog"), matchMedia: () => ({ matches: false }), addEventListener() {} },
    fetch: async () => ({ ok: true, json: async () => ({
      questions: [
        { id: "sql-free", topic: "SQL", question: "A question", answer: "An answer", example: "SELECT 'reference';" },
        { id: "sql-no-code", topic: "SQL", question: "A discussion", answer: "An answer" },
      ],
      locked: [{ id: "sql-paid", topic: "SQL" }],
    }) }),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "subject-qa.js"), "utf8"), context);
  await tick();
  const links = document.querySelectorAll(".qa-practice-link");
  assert.equal(links.length, 1);
  const target = new URL(links[0].href, "https://kr7tech.test");
  assert.equal(target.pathname, "/DSA.html");
  assert.equal(target.searchParams.get("topic"), "SQL");
  assert.equal(target.searchParams.get("question"), "sql-free");
  assert.equal([...target.searchParams].length, 2);
  assert.equal(target.href.includes("reference"), false);
});
