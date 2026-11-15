"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { chromium } = require("playwright");
const { createServer } = require("../server");
const { openNavigation } = require("./helpers/navigation");
const lessons = require("../api/_concept-lessons");
const { PATHS, orderLessons } = require("../concept-paths");

async function openSite(t, { paid = false } = {}) {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV",
    "JUDGE0_API_URL", "JUDGE0_API_TOKEN"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  for (const name of names) delete process.env[name];
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  if (paid) {
    process.env.SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_ANON_KEY = "test-anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
    global.fetch = async url => String(url).endsWith("/auth/v1/user")
      ? { ok: true, json: async () => ({ id: "paid-learner" }) }
      : { ok: true, text: async () => JSON.stringify(String(url).includes("/entitlements?")
        ? [{ tier: paid === true ? "Pro" : paid }] : []) };
  }
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = base;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  t.after(async () => {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    global.fetch = originalFetch;
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  if (paid) {
    await context.addCookies([{ name: "visual_pro_session", value: "paid-session", url: base, httpOnly: true }]);
    await page.addInitScript(() => localStorage.setItem("visual-memory-lab.auth-session", JSON.stringify({ access_token: "paid-session" })));
  }
  return { page, context, base, pin, errors };
}

test("Concepts is a separate searchable lesson library with per-item PIN and relocking", async t => {
  const { page, context, base, pin, errors } = await openSite(t);
  await page.goto(base);
  await (await openNavigation(page, "Learn")).getByRole("link", { name: "Concepts NEW", exact: true }).click();
  await page.locator(".concept-card").first().waitFor();
  assert.equal(await page.locator(".concept-card").count(), lessons.length);
  assert.equal(await page.locator("#concept-categories button").count(), 1 + new Set(lessons.map(item => item.category)).size);
  assert.equal(await page.locator(".qa-card").count(), 0);
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  assert.ok(!(await page.locator("body").innerText()).includes(lessons[0].what));
  const lesson = page.locator(`[data-concept-id="${lessons[0].id}"]`);
  page.once("dialog", dialog => dialog.accept(pin));
  await lesson.click();
  await page.locator("#concept-reader:not([hidden])").waitFor();
  assert.equal(await page.locator("#concept-reader-title").innerText(), lessons[0].title);
  assert.ok((await page.locator("#concept-reader").innerText()).includes(lessons[0].what));
  assert.equal(await page.locator("#concept-reader h3").count(), 8);
  const other = await context.request.get(`${base}/api/concepts?id=${lessons[1].id}`);
  assert.equal(other.status(), 403);
  await page.getByRole("button", { name: "Close and lock this lesson", exact: true }).click();
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  assert.equal(await page.locator("#concept-reader").innerText(), "");
  page.once("dialog", dialog => dialog.accept(pin));
  await lesson.click();
  await page.locator("#concept-reader:not([hidden])").waitFor();
  await page.getByRole("navigation", { name: "Concept categories" }).getByRole("button", { name: "SQL", exact: true }).click();
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  assert.equal(await page.locator(".concept-card").count(), lessons.filter(item => item.category === "SQL").length);
  await page.locator("#concept-search").fill("transactions");
  assert.equal(await page.locator(".concept-card").count(), 1);
  await page.locator("#concept-search").fill("nonexistent-concept");
  assert.match(await page.locator("#concept-status").innerText(), /No matching/);
  await page.locator("#concept-search").fill("");
  await page.getByRole("navigation", { name: "Concept categories" }).getByRole("button", { name: "All", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator("#compiler-status, #interview-reference-guides").count(), 0);
  assert.equal(await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "DSA + Compiler", exact: true }).getAttribute("href"), "/DSA.html");
  assert.equal((await context.request.get(`${base}/api/_concept-lessons.js`)).status(), 404);
  assert.deepEqual(errors, []);
});

test("late PIN responses cannot replace a newer lesson or reopen a filtered selection", async t => {
  const { page, base, pin, errors } = await openSite(t);
  let release;
  let started;
  const gate = new Promise(resolve => { release = resolve; });
  const intercepted = new Promise(resolve => { started = resolve; });
  t.after(() => release());
  await page.route(`**/api/concepts?id=${lessons[0].id}`, async route => {
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  await page.goto(`${base}/Concepts.html`);
  const first = page.locator(`[data-concept-id="${lessons[0].id}"]`);
  await first.waitFor();
  page.once("dialog", dialog => dialog.accept(pin));
  await first.click();
  await intercepted;
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator(`[data-concept-id="${lessons[1].id}"]`).click();
  await page.getByRole("heading", { name: lessons[1].title, exact: true }).last().waitFor();
  await page.waitForFunction(title => document.getElementById("concept-reader-title")?.textContent === title, lessons[1].title);
  release();
  await page.waitForFunction(id => !document.querySelector(`[data-concept-id="${id}"]`).disabled, lessons[0].id);
  assert.equal(await page.locator("#concept-reader-title").innerText(), lessons[1].title);

  await page.unroute(`**/api/concepts?id=${lessons[0].id}`);
  let releaseFiltered;
  let startedFiltered;
  const filteredGate = new Promise(resolve => { releaseFiltered = resolve; });
  const filteredStarted = new Promise(resolve => { startedFiltered = resolve; });
  t.after(() => releaseFiltered());
  await page.route(`**/api/concepts?id=${lessons[0].id}`, async route => {
    const response = await route.fetch();
    startedFiltered();
    await filteredGate;
    await route.fulfill({ response });
  });
  await page.evaluate(id => { window.oldConceptButton = document.querySelector(`[data-concept-id="${id}"]`); }, lessons[0].id);
  page.once("dialog", dialog => dialog.accept(pin));
  await first.click();
  await filteredStarted;
  await page.getByRole("navigation", { name: "Concept categories" }).getByRole("button", { name: "AI", exact: true }).click();
  releaseFiltered();
  await page.waitForFunction(() => window.oldConceptButton.disabled === false);
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  assert.equal(await page.locator("#concept-reader").innerText(), "");
  assert.deepEqual(errors, []);
});

test("paid Pro opens full concepts and reaches the existing DSA compiler with honest setup and polling", async t => {
  const { page, base, errors } = await openSite(t, { paid: true });
  page.on("dialog", dialog => {
    errors.push(`Unexpected dialog: ${dialog.message()}`);
    return dialog.dismiss();
  });
  await page.goto(`${base}/Concepts.html`);
  await page.getByRole("button", { name: "Read full concept", exact: true }).first().click();
  await page.locator("#concept-reader:not([hidden])").waitFor();
  assert.match(await page.locator("#concept-status").innerText(), /verified Pro/);
  await (await openNavigation(page, "Practice")).getByRole("link", { name: "DSA + Compiler", exact: true }).click();
  await page.locator("#code-editor").waitFor();
  assert.equal(await page.locator("#reference-solution").isVisible(), false);
  assert.equal(await page.locator("#problem-navigator").isVisible(), false);
  await page.locator("#toggle-solution").click();
  assert.equal(await page.locator("#reference-solution").isVisible(), true);
  await page.locator("#toggle-solution").click();
  await page.locator("#next-problem").click();
  await page.locator("#code-editor").fill("// browser draft");
  await page.locator("#previous-problem").click();
  await page.locator("#next-problem").click();
  assert.equal(await page.locator("#code-editor").inputValue(), "// browser draft");
  await page.locator("#previous-problem").click();
  let submissions = 0;
  await page.route("**/api/compile*", async route => {
    if (route.request().method() === "POST") {
      submissions++;
      const body = route.request().postDataJSON();
      assert.equal(body.language, "csharp");
      assert.match(body.sourceCode, /class Program/);
      assert.equal(body.expectedOutput, "[0,1]");
      return route.fulfill({ json: { state: "pending", token: "browser-submission" } });
    }
    assert.equal(new URL(route.request().url()).searchParams.get("token"), "browser-submission");
    return route.fulfill({ json: { state: "pass", status: "Accepted", stdout: "[0,1]\n", memory: 2048, time: "0.01" } });
  });
  await page.locator('[data-action="run"]').click();
  await page.waitForFunction(() => document.querySelector("#run-output").textContent.includes("not configured"));
  assert.equal(submissions, 0);
  await page.route("**/api/config", route => route.fulfill({ json: { compilerConfigured: true } }));
  await page.locator('[data-action="run"]').click();
  await page.waitForFunction(() => document.querySelector("#run-output").textContent.startsWith("PASS"));
  assert.equal(submissions, 1);
  assert.deepEqual(errors, []);
});

test("course topic notes open explanations only, while interview banks stay in their own hub", async t => {
  const { page, base, pin, errors } = await openSite(t);
  const questionRequests = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/questions") questionRequests.push(request.url());
  });
  await page.goto(`${base}/Courses.html`);
  await page.locator(".course-note").first().waitFor();
  assert.equal(await page.locator(".course-note").count(), new Set(lessons.map(item => item.category)).size);
  assert.equal(await page.locator(".qa-card, #subject-qa-results").count(), 0);
  const links = await page.locator(".course-note a").evaluateAll(nodes => nodes.map(node => node.href));
  for (const href of links) {
    const url = new URL(href);
    assert.equal(url.pathname, "/Concepts.html");
    assert.ok(lessons.some(item => item.category === url.searchParams.get("category")));
  }
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  assert.equal(await navigation.locator(".nav-course-link").getAttribute("aria-current"), "page");
  await page.locator("#course-search").fill("SQL & Database Engineering");
  assert.equal(await page.locator(".course-note").count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("link", { name: "Explore topic explanations", exact: true }).click();
  await page.locator(".concept-card").first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get("category"), "SQL");
  assert.equal(await page.locator(".concept-card").count(), lessons.filter(item => item.category === "SQL").length);
  assert.equal(await page.locator("#concept-categories [aria-pressed=true]").innerText(), "SQL");
  assert.equal(questionRequests.length, 0);
  const sqlLesson = lessons.find(item => item.category === "SQL");
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator(`[data-concept-id="${sqlLesson.id}"]`).click();
  await page.locator("#concept-reader:not([hidden])").waitFor();
  assert.ok((await page.locator("#concept-reader").innerText()).includes(sqlLesson.what));
  const categories = page.getByRole("navigation", { name: "Concept categories" });
  await categories.getByRole("button", { name: "C#", exact: true }).click();
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector("#concept-categories [aria-pressed=true]")?.textContent === "SQL");
  assert.equal(await page.locator("#concept-reader").isVisible(), false);
  assert.equal(await page.locator(".concept-card").count(), lessons.filter(item => item.category === "SQL").length);
  await page.goto(`${base}/Concepts.html?category=unsupported`);
  await page.locator(".concept-card").first().waitFor();
  assert.equal(await page.locator(".concept-card").count(), lessons.length);
  assert.equal(await page.locator("#concept-categories [aria-pressed=true]").innerText(), "All");
  await (await openNavigation(page)).getByRole("link", { name: "Interview Q&A", exact: true }).click();
  await page.locator("#interview-subjects .interview-topic-link").first().waitFor();
  const subjects = require("../learning-catalog").COURSES.filter(item => item.kind === "Interview Q&A");
  assert.equal(await page.locator("#interview-subjects .interview-topic-link").count(), subjects.length);
  assert.equal(await page.locator("#subject-qa-results .qa-card").count(), 0);
  assert.equal(questionRequests.length, 0);
  assert.equal(await page.locator("#compiler-status, #interview-reference-guides, #dsa-compiler").count(), 0);
  await page.locator('[data-interview-subject="SQL"]').click();
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.equal(await page.locator("#subject-qa-heading").innerText(), "SQL Interview Q&A");
  assert.equal(await page.locator("#subject-qa-results .qa-card").count(), 10);
  assert.equal(questionRequests.length, 1);
  assert.equal(new URL(questionRequests[0]).searchParams.get("topic"), "SQL");
  await page.goto(`${base}/Interview-Preparation.html#interview-reference-guides`);
  assert.equal(await page.locator("#interview-reference-guides").getByRole("link", { name: "C# & .NET reference bank", exact: true }).getAttribute("href"), "C%23Dotnet.html");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("unavailable course outlines do not substitute interview questions", async t => {
  const { page, base, errors } = await openSite(t);
  await page.route("**/api/concepts", route => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await page.goto(`${base}/Courses.html`);
  await page.getByText(/Course outlines are temporarily unavailable/).waitFor();
  assert.equal(await page.locator(".course-note, .qa-card").count(), 0);
  assert.equal(await page.locator("#course-search").isDisabled(), true);
  assert.deepEqual(errors, []);
});

test("expanded course outlines open protected teaching lessons with matching blue NEW badges", async t => {
  const { page, context, base, errors } = await openSite(t, { paid: true });
  const advanced = require("../api/_concept-advanced");
  page.on("dialog", dialog => {
    errors.push(`Unexpected dialog: ${dialog.message()}`);
    return dialog.dismiss();
  });
  for (const category of [".NET", "Microservices", "System Design"]) {
    const added = advanced.filter(item => item.category === category);
    await page.goto(`${base}/Courses.html`);
    const card = page.locator(`[data-course-category="${category}"]`);
    await card.waitFor();
    assert.deepEqual(await card.locator(".course-outline li").allTextContents(),
      orderLessons(category, lessons.filter(item => item.category === category)).map(item => item.title));
    await page.locator("#course-search").fill(added[0].title);
    assert.equal(await page.locator(".course-note").count(), 1);
    await card.getByRole("link", { name: "Explore topic explanations", exact: true }).click();
    await page.locator(".concept-card").first().waitFor();
    assert.equal(await page.locator(".concept-card").count(),
      lessons.filter(item => item.category === category).length);
    await page.locator("#concept-search").fill(added[0].title);
    await page.locator(`[data-concept-id="${added[0].id}"]`).click();
    await page.locator("#concept-reader:not([hidden])").waitFor();
    const body = await page.locator("#concept-reader").innerText();
    for (const field of ["what", "why", "how", "flow", "example", "exercise"]) {
      assert.ok(body.includes(added[0][field]), `${category}: ${field}`);
    }
    assert.equal(await page.locator("#concept-reader h3").count(), 8);
    const badgeStyles = await page.locator(".topnav .nav-new").evaluateAll(nodes =>
      nodes.map(node => {
        const style = getComputedStyle(node);
        return { text: node.textContent, background: style.backgroundColor, color: style.color };
      }));
    assert.deepEqual(badgeStyles, Array.from({ length: 2 }, () => ({
      text: "NEW", background: "rgb(29, 78, 216)", color: "rgb(255, 255, 255)",
    })));
    assert.equal(await page.locator("[data-learning-sections]").count(), 0);
    assert.equal(await page.locator('header .nav-course-link .nav-new').textContent(), "NEW");
    assert.equal(await page.locator('header .nav-concept-link .nav-new').textContent(), "NEW");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.equal((await context.request.get(`${base}/api/_concept-advanced.js`)).status(), 404);
  assert.deepEqual(errors, []);
});

test("new subject deep dives appear in Courses and open only after their own lesson PIN", async t => {
  const { page, context, base, pin, errors } = await openSite(t);
  const deepDives = require("../api/_concept-deep-dives");
  for (const category of ["SQL", "Angular", "AI", "DSA"]) {
    const selected = deepDives.find(item => item.category === category);
    await page.goto(`${base}/Courses.html`);
    const course = page.locator(`[data-course-category="${category}"]`);
    await course.waitFor();
    assert.ok((await course.locator(".course-outline li").allTextContents()).includes(selected.title));
    await page.locator("#course-search").fill(selected.title);
    assert.equal(await page.locator(".course-note").count(), 1);
    await course.getByRole("link", { name: "Explore topic explanations", exact: true }).click();
    const lesson = page.locator(`[data-concept-id="${selected.id}"]`);
    await lesson.waitFor();
    assert.ok(!(await page.locator("body").innerText()).includes(selected.what));
    await page.locator("#concept-search").fill(selected.title);
    assert.equal(await page.locator(".concept-card").count(), 1);
    page.once("dialog", dialog => dialog.accept(pin));
    await lesson.click();
    await page.locator("#concept-reader:not([hidden])").waitFor();
    const body = await page.locator("#concept-reader").innerText();
    for (const field of ["what", "why", "how", "flow", "example", "exercise"]) {
      assert.ok(body.includes(selected[field]), `${selected.id}.${field}`);
    }
    const other = deepDives.find(item => item.id !== selected.id);
    assert.equal((await context.request.get(`${base}/api/concepts?id=${other.id}`)).status(), 403);
    await page.getByRole("button", { name: "Close and lock this lesson", exact: true }).click();
    assert.equal(await page.locator("#concept-reader").innerText(), "");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.equal((await context.request.get(`${base}/api/_concept-deep-dives.js`)).status(), 404);
  assert.deepEqual(errors, []);
});

test("AI and DevOps explain concepts in a guided order without becoming interview banks", async t => {
  const { page, context, base, pin, errors } = await openSite(t);
  const guided = require("../api/_concept-guided");
  let questionRequests = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname === "/api/questions") questionRequests++;
  });
  for (const [category, search, selectedId] of [
    ["AI", "LangGraph", "ai-langgraph-state"],
    ["DevOps", "DevOps", "devops-linux"],
  ]) {
    await page.goto(`${base}/Courses.html`);
    const course = page.locator(`[data-course-category="${category}"]`);
    await course.waitFor();
    await page.locator("#course-search").fill(search);
    assert.equal(await page.locator(".course-note").count(), 1);
    assert.match(await course.locator(".course-prerequisite").innerText(), /Before you start/);
    assert.equal(await course.locator("ol.course-outline").count(), 1);
    const expected = PATHS[category].lessonIds.map(id => lessons.find(item => item.id === id));
    assert.deepEqual(await course.locator(".course-outline li").allTextContents(), expected.map(item => item.title));
    await course.getByRole("link", { name: "Explore topic explanations", exact: true }).click();
    await page.locator("#concept-learning-path:not([hidden])").waitFor();
    assert.deepEqual(await page.locator(".concept-path-list a").allTextContents(), expected.map(item => item.title));
    assert.deepEqual(await page.locator(".concept-card h3").allTextContents(), expected.map(item => item.title));
    assert.equal(await page.locator(".qa-card").count(), 0);
    assert.equal(await page.locator(".concept-card .badge").first().innerText(), `${category} | Step 1 | PRO`);
    const selected = guided.find(item => item.id === selectedId);
    await page.locator(`.concept-path-list a[href="#concept-card-${selected.id}"]`).click();
    assert.equal(await page.locator("#concept-reader").isVisible(), false);
    const button = page.locator(`[data-concept-id="${selected.id}"]`);
    await button.waitFor();
    page.once("dialog", dialog => dialog.accept(pin));
    await button.click();
    await page.locator("#concept-reader:not([hidden])").waitFor();
    assert.deepEqual(await page.locator("#concept-reader .concept-steps li").allTextContents(), selected.steps);
    assert.ok((await page.locator("#concept-reader").innerText()).includes(selected.what));
    assert.equal((await context.request.get(`${base}/api/concepts?id=${selected.id}`)).status(), 403);
    await page.locator("#concept-search").fill("no-such-learning-topic");
    assert.equal(await page.locator("#concept-reader").isVisible(), false);
    assert.equal(await page.locator("#concept-learning-path").isVisible(), false);
    await page.locator("#concept-search").fill("");
    await page.locator("#concept-learning-path:not([hidden])").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  assert.equal(questionRequests, 0);
  assert.equal((await context.request.get(`${base}/api/_concept-guided.js`)).status(), 404);
  const publicPaths = await (await context.request.get(`${base}/concept-paths.js`)).text();
  for (const lesson of guided) {
    assert.ok(!publicPaths.includes(lesson.what) && !publicPaths.includes(lesson.example));
    assert.ok(lesson.steps.every(step => !publicPaths.includes(step)));
  }
  assert.deepEqual(errors, []);
});

test("Redis, concurrency, microservices, HLD, and LLD remain private ordered concept lessons", async t => {
  const { page, context, base, pin, errors } = await openSite(t);
  const enterprise = require("../api/_concept-enterprise");
  const requests = [];
  page.on("request", request => requests.push(new URL(request.url())));
  for (const id of ["redis-cache-aside-races", "sql-isolation-anomalies", "micro-outbox-inbox",
    "design-enterprise-hld", "design-booking-hld", "lld-parking-lot"]) {
    const selected = enterprise.find(item => item.id === id);
    await page.goto(`${base}/Courses.html`);
    const course = page.locator(`[data-course-category="${selected.category}"]`);
    await course.waitFor();
    await page.locator("#course-search").fill(selected.title);
    assert.equal(await page.locator(".course-note").count(), 1);
    assert.ok((await course.locator(".course-outline li").allTextContents()).includes(selected.title));
    await course.getByRole("link", { name: "Explore topic explanations", exact: true }).click();
    await page.locator("#concept-learning-path:not([hidden])").waitFor();
    const expected = orderLessons(selected.category, lessons.filter(item => item.category === selected.category));
    assert.deepEqual(await page.locator(".concept-path-list a").allTextContents(), expected.map(item => item.title));
    assert.ok(!(await page.locator("body").innerText()).includes(selected.what));
    const before = requests.filter(url => url.pathname === "/api/concepts" && url.searchParams.has("id")).length;
    await page.locator(`.concept-path-list a[href="#concept-card-${selected.id}"]`).click();
    assert.equal(await page.locator("#concept-reader").isVisible(), false);
    assert.equal(requests.filter(url => url.pathname === "/api/concepts" && url.searchParams.has("id")).length, before);
    await page.locator("#concept-search").fill(selected.title);
    assert.equal(await page.locator(".concept-card").count(), 1);
    page.once("dialog", dialog => dialog.accept(pin));
    await page.locator(`[data-concept-id="${selected.id}"]`).click();
    await page.locator("#concept-reader:not([hidden])").waitFor();
    const body = await page.locator("#concept-reader").innerText();
    for (const field of ["what", "why", "how", "flow", "example", "exercise"]) {
      assert.ok(body.includes(selected[field]), `${id}.${field}`);
    }
    assert.deepEqual(await page.locator(".concept-steps li").allTextContents(), selected.steps);
    assert.equal((await context.request.get(`${base}/api/concepts?id=${selected.id}`)).status(), 403);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "Close and lock this lesson", exact: true }).click();
    assert.equal(await page.locator("#concept-reader").innerText(), "");
  }
  assert.equal(requests.filter(url => url.pathname === "/api/questions").length, 0);
  assert.equal((await context.request.get(`${base}/api/_concept-enterprise.js`)).status(), 404);
  const publicAssets = await Promise.all(["/concept-paths.js", "/courses.js", "/concepts.js"].map(async route =>
    (await context.request.get(`${base}${route}`)).text()));
  for (const lesson of enterprise) {
    for (const asset of publicAssets) {
      assert.ok(!asset.includes(lesson.what) && !asset.includes(lesson.example), lesson.id);
      assert.ok(lesson.steps.every(step => !asset.includes(step)), lesson.id);
    }
  }
  assert.deepEqual(errors, []);
});

test("Go reads its included concept lessons without a PIN but cannot fetch the rest", async t => {
  const { page, context, base, errors } = await openSite(t, { paid: "Go" });
  const ids = PATHS.SQL.lessonIds;
  await page.goto(`${base}/Concepts.html?category=SQL`);
  const first = page.locator(`[data-concept-id="${ids[0]}"]`);
  await first.waitFor();
  assert.equal(await first.innerText(), "Read full concept");
  assert.equal(await page.locator(`[data-concept-id="${ids[1]}"]`).innerText(), "Read full concept");
  assert.equal(await page.locator(`[data-concept-id="${ids[2]}"]`).innerText(), "Pro - Enter PIN for lesson");
  page.on("dialog", dialog => { errors.push("Included Go lesson unexpectedly requested a PIN"); return dialog.dismiss(); });
  await first.click();
  await page.locator("#concept-reader:not([hidden])").waitFor();
  assert.equal(await page.locator("#concept-reader-title").innerText(), lessons.find(item => item.id === ids[0]).title);
  assert.match(await page.locator("#concept-status").innerText(), /Go access/);
  assert.equal((await context.request.get(`${base}/api/concepts?id=${ids[2]}`, {
    headers: { authorization: "Bearer paid-session" },
  })).status(), 403);
  await page.goto(`${base}/Subject-QA.html?topic=SQL`);
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.ok(await page.locator(".qa-card").count() > 10);
  assert.equal(await page.locator("#subject-qa-results .locked").count(), 0);
  assert.equal(await page.locator("#compiler-status, #interview-reference-guides, #dsa-compiler").count(), 0);
  assert.deepEqual(errors, []);
});
