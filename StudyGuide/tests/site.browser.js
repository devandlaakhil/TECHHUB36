"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { chromium } = require("playwright");
const { createServer } = require("../server");
const { openNavigation } = require("./helpers/navigation");
const { guidePracticeItems } = require("../api/_guide-preview");
const csharpLockedCount = 177 + guidePracticeItems("C#Dotnet.html").length;

async function openSite(t) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { page, context, base: `http://127.0.0.1:${server.address().port}` };
}

test("homepage navigation, persistent Student Plan, ten-item previews, and Pro PIN work in a browser", async t => {
  const names = ["PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV"];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  t.after(() => {
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  process.env.PUBLIC_APP_URL = base;
  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  t.after(() => browser.close());
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(base);
  assert.equal(await page.locator("#learning-paths .home-goal-card").count(), 3);
  assert.equal(await page.locator("#experience-form, #student-plan-form, [data-free-item]").count(), 0);
  const links = await page.locator("a[href]").evaluateAll(nodes => [...new Set(nodes.map(node => node.href))]);
  for (const url of links) {
    const response = await context.request.get(url);
    assert.equal(response.status(), 200, url);
  }
  assert.equal(await page.locator("header [data-pro-unlock]").count(), 0);
  assert.equal(await page.locator('header .site-pin-button[href="/Membership.html"]').count(), 1);

  await page.locator('#learning-paths a[href="Student-Plan.html"]').click();
  await page.locator('input[name="subjects"]').first().waitFor();
  assert.equal(await page.locator('input[name="subjects"]').count(), 18);
  await page.locator('[name="startDate"]').fill("2026-11-12");
  await page.locator('[name="months"]').fill("2");
  await page.locator('[name="budget"]').fill("6000");
  await page.getByRole("button", { name: "Generate my Student Plan" }).click();
  await page.locator("#student-plan-result:not([hidden])").waitFor();
  assert.equal(await page.locator("#student-plan-result tbody tr").count(), 3);
  assert.match(await page.locator("#student-plan-result").innerText(), /not a course price or payment/);
  assert.match(await page.locator("#student-plan-status").innerText(), /saved in this browser/);
  await page.reload();
  assert.match(await page.locator("#student-plan-status").innerText(), /restored/);
  assert.equal(await page.locator('[name="budget"]').inputValue(), "6000");
  for (const checkbox of await page.locator('input[name="subjects"]').all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "Generate my Student Plan" }).click();
  assert.match(await page.locator("#student-plan-status").innerText(), /at least one/);
  assert.equal(await page.locator("#student-plan-result").isVisible(), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);

  await page.goto(`${base}/C%23Dotnet.html`);
  assert.equal(await page.locator("[data-free-item]").count(), 10);
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount);
  assert.equal(await page.getByText("11. Liskov Substitution Principle?", { exact: true }).count(), 0);
  assert.match(await page.locator(".pro-blur").first().evaluate(node => getComputedStyle(node).filter), /blur/);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("[data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  assert.equal(await page.locator('html[data-guide-access="pro"]').count(), 0);
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount - 1);
  assert.equal(await page.locator("[data-free-item]").count(), 10);
  assert.equal(await page.getByText("11. Liskov Substitution Principle?", { exact: true }).count(), 1);
  assert.equal((await context.cookies()).some(item => item.name === "kr7_pro"), false);
  assert.equal((await context.request.get(`${base}/dotnet-roadmap.js`)).status(), 403);
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("[data-pro-item] [data-pro-unlock]").first().click();
  assert.equal(await page.locator("[data-pin-opened]").count(), 1);
  await page.getByRole("button", { name: "Close and lock this item", exact: true }).click();
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount);
  assert.equal(await page.getByText("11. Liskov Substitution Principle?", { exact: true }).count(), 0);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("[data-pro-item] [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  await page.reload();
  assert.equal(await page.locator("[data-pin-opened]").count(), 0);
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount);
  assert.equal((await context.request.get(`${base}/dotnet-roadmap.js`)).status(), 403);
  assert.deepEqual(errors, []);
});

test("subject search, saved lists, reviews, and continue-learning work without unlocking Pro", async t => {
  const { page, context, base } = await openSite(t);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/Subjects.html`);
  assert.equal(await page.locator("#catalog-results .offering-card").count(), 26);
  await page.locator('[name="query"]').fill("no-such-subject");
  assert.match(await page.locator("#catalog-status").innerText(), /No subjects/);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.locator('[name="category"]').selectOption("Frontend");
  assert.equal(await page.locator("#catalog-results .offering-card").count(), 3);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.locator('[data-course-id="dotnet"] [data-save-course]').click();
  await page.locator('[name="savedOnly"]').check();
  assert.equal(await page.locator("#catalog-results .offering-card").count(), 1);
  await page.reload();
  assert.equal(await page.locator("#catalog-results .offering-card").count(), 1);
  assert.equal(await page.locator('[data-save-course="dotnet"]').getAttribute("aria-pressed"), "true");
  await page.getByRole("link", { name: "Open subject", exact: true }).click();
  assert.equal(await page.locator("[data-free-item]").count(), 10);
  await page.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  assert.ok(await page.locator("[data-pro-item]").count() > 0);
  assert.equal((await context.cookies()).some(cookie => cookie.name === "kr7_pro"), false);
  await page.getByRole("link", { name: "My Learning", exact: true }).click();
  assert.equal(await page.locator("#learning-saved-count").innerText(), "1");
  assert.equal(await page.locator("#learning-reviewed-count").innerText(), "1");
  assert.equal(await page.locator("#learning-week-count").innerText(), "1");
  assert.match(await page.locator("#learning-resume").innerText(), /C# & .NET/);
  await page.reload();
  assert.equal(await page.locator("#learning-reviewed-count").innerText(), "1");
  await page.locator("#learning-reviewed [data-review-course]").click();
  assert.equal(await page.locator("#learning-reviewed-count").innerText(), "0");
  await page.locator("#learning-saved [data-save-course]").click();
  assert.equal(await page.locator("#learning-saved-count").innerText(), "0");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.goto(`${base}/Subjects.html`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("saved subjects degrade safely when browser storage is blocked", async t => {
  const { page, base } = await openSite(t);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
  });
  await page.goto(`${base}/Subjects.html`);
  await page.locator('[data-save-course="dotnet"]').click();
  assert.equal(await page.locator('[data-save-course="dotnet"]').getAttribute("aria-pressed"), "true");
  assert.match(await page.locator("[data-learning-status]").innerText(), /unavailable/);
});

test("membership handles sign-in requirements, checkout errors, unsafe links, and configured provider redirects", async t => {
  const { page, context, base } = await openSite(t);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  let providersEnabled = true;
  let checkoutMode = "failure";
  const checkoutCalls = [];
  await page.route("**/api/config", route => route.fulfill({
    json: { providers: { stripe: providersEnabled }, plans: { Pro: 2500 }, paypalAmounts: {} },
  }));
  await page.route("**/api/checkout", async route => {
    checkoutCalls.push({ body: route.request().postDataJSON(), authorization: route.request().headers().authorization });
    if (checkoutMode === "failure") return route.fulfill({ status: 401, json: { error: "Please sign in again." } });
    return route.fulfill({ json: { checkoutUrl: checkoutMode === "unsafe" ? "javascript:alert(1)" : "https://checkout.stripe.com/kr7tech-browser-test" } });
  });
  await page.route("https://checkout.stripe.com/**", route => route.fulfill({
    contentType: "text/html", body: "<h1>Test checkout destination</h1>",
  }));
  await page.goto(`${base}/Membership.html`);
  await page.locator("#membership-provider:not([disabled])").waitFor();
  assert.equal(await page.locator("#membership-buy").isDisabled(), true);
  assert.match(await page.locator("#membership-price").innerText(), /2,500|2500/);
  await page.evaluate(() => localStorage.setItem("visual-memory-lab.auth-session", JSON.stringify({
    access_token: "browser-test-session", expires_at: Math.floor(Date.now() / 1000) + 3600,
  })));
  await page.reload();
  await page.locator("#membership-buy:not([disabled])").waitFor();
  await page.locator("#membership-acknowledge").check();
  await page.locator("#membership-buy").click();
  await page.getByText("Please sign in again.", { exact: true }).waitFor();
  assert.deepEqual(checkoutCalls[0].body, { tier: "Pro", provider: "stripe" });
  assert.equal(checkoutCalls[0].authorization, "Bearer browser-test-session");
  checkoutMode = "unsafe";
  await page.locator("#membership-buy").click();
  await page.getByText("The checkout service returned an invalid payment link.", { exact: true }).waitFor();
  assert.equal((await context.cookies()).some(cookie => cookie.name === "kr7_pro"), false);
  checkoutMode = "success";
  await Promise.all([
    page.waitForURL("https://checkout.stripe.com/kr7tech-browser-test"),
    page.locator("#membership-buy").click(),
  ]);
  providersEnabled = false;
  await page.goto(`${base}/Membership.html`);
  await page.locator("#membership-status").filter({ hasText:"Online checkout is temporarily unavailable." }).waitFor();
  assert.equal(await page.locator("#membership-buy").isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("Go and Pro plan selection changes displayed price and submits the matching checkout tier", async t => {
  const { page, base } = await openSite(t);
  const calls = [];
  await page.route("**/api/config", route => route.fulfill({ json: {
    providers: { stripe: true }, plans: { Go: 750, Pro: 2500 }, paypalAmounts: {},
  } }));
  await page.route("**/api/checkout", route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 503, json: { error: "Test checkout remains pending." } });
  });
  await page.addInitScript(() => localStorage.setItem("visual-memory-lab.auth-session", JSON.stringify({
    access_token: "member-test", expires_at: Math.floor(Date.now() / 1000) + 3600,
  })));
  await page.goto(`${base}/Membership.html?plan=Go#purchase`);
  await page.locator("#membership-buy:not([disabled])").waitFor();
  assert.equal(await page.locator("#membership-plan").inputValue(), "Go");
  assert.match(await page.locator("#membership-price").innerText(), /750/);
  assert.match(await page.locator("#membership-price").innerText(), /Go purchase/);
  await page.locator("#membership-acknowledge").check();
  await page.locator("#membership-buy").click();
  await page.getByText("Test checkout remains pending.", { exact: true }).waitFor();
  await page.locator("#membership-plan").selectOption("Pro");
  assert.match(await page.locator("#membership-price").innerText(), /2,500|2500/);
  assert.match(await page.locator("#membership-price").innerText(), /Pro purchase/);
  await page.locator("#membership-buy").click();
  await page.getByText("Test checkout remains pending.", { exact: true }).waitFor();
  assert.deepEqual(calls, [{ tier: "Go", provider: "stripe" }, { tier: "Pro", provider: "stripe" }]);
});

test("Interview Q&A navigation opens only its subject bank and preserves separate destinations", async t => {
  const { page, base } = await openSite(t);
  const questionRequests = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === "/api/questions") questionRequests.push(url);
  });
  await page.goto(base);
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Interview Q&A", exact: true }).click();
  await page.locator("#interview-subjects .interview-topic-link").first().waitFor();
  assert.equal(new URL(page.url()).pathname, "/Subject-QA.html");
  assert.equal(await page.locator("#course-topics, #concept-results, #dsa-compiler, #question-list").count(), 0);
  assert.equal(questionRequests.length, 0);
  await page.locator('[data-interview-subject="SQL"]').click();
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.equal(questionRequests.length, 1);
  assert.equal(questionRequests[0].searchParams.get("topic"), "SQL");
  for (const [name, destination, group] of [["Courses", "/Courses.html", "Learn"], ["Concepts", "/Concepts.html", "Learn"],
    ["Company Interviews", "/Company-Interviews.html", "Practice"], ["Interview Preparation", "/Interview-Preparation.html", "Practice"]]) {
    await page.goto(`${base}/Subject-QA.html`);
    await (await openNavigation(page, group)).getByRole("link", { name: new RegExp(`^${name}`) }).click();
    assert.equal(new URL(page.url()).pathname, destination);
  }
});

test("AI interview retains its server session and does not simulate around quota denial", async t => {
  const { page, base } = await openSite(t);
  const payloads = [];
  let starts = 0;
  await page.route("**/api/ai-interview", route => {
    const payload = route.request().postDataJSON();
    payloads.push(payload);
    if (payload.action === "start") {
      starts++;
      return route.fulfill(starts === 1 ? { json: {
        question: "Explain a safe retry.", interviewId: "00000000-0000-4000-8000-000000000001",
      } } : { status: 429, json: { error: "Go daily interview allowance used." } });
    }
    return route.fulfill({ json: { summary: "Review idempotency.", strengths: [], improvements: [],
      exampleRevision: "Use a stable operation key.", nextQuestion: null, complete: true, practiceOnly: true } });
  });
  await page.goto(`${base}/AI-Interview.html`);
  await page.locator("#consent").check();
  await page.locator("#start").click();
  await page.locator("#interview-panel:not([hidden])").waitFor();
  await page.locator("#topic").selectOption("SQL");
  await page.locator("#answer").fill("I use a stable operation identity and enforce uniqueness in a transaction.");
  await page.locator("#submit-answer").click();
  await page.locator("#final-panel:not([hidden])").waitFor();
  assert.equal(payloads[1].interviewId, "00000000-0000-4000-8000-000000000001");
  assert.equal(payloads[1].topic, "C# / .NET");
  await page.locator("#start").click();
  await page.getByText("Go daily interview allowance used.", { exact: true }).waitFor();
  assert.equal(await page.locator("#interview-panel").isVisible(), false);
  assert.equal(payloads.length, 3);
});

test("EF Core and every subject deep link stay subject-specific, with company practice separate", async t => {
  const { page, base } = await openSite(t);
  const { COURSES } = require("../learning-catalog");
  const subjects = COURSES.filter(course => course.kind === "Interview Q&A");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/questions?*", route => {
    const topic = new URL(route.request().url()).searchParams.get("topic");
    const questions = Array.from({ length: 10 }, (_, index) => ({
      id: `${topic}-${index}`, topic, question: `${topic} question ${index}`,
      answer: `${topic} answer ${index}`, example: `${topic} example ${index}`,
    }));
    return route.fulfill({ json: {
      questions: [...questions, { id: "unrelated", topic: "Other subject", question: "Unrelated question" }],
      locked: [{ id: `${topic}-locked`, topic }], access: { premium: false },
    } });
  });
  await page.goto(`${base}/Subjects.html`);
  await page.locator('[data-course-id="efcore-qa"]').getByRole("link", { name: "Open subject", exact: true }).click();
  await page.locator("#subject-qa-results[aria-busy=false] .experience-card").first().waitFor();
  assert.match(page.url(), /Subject-QA\.html\?topic=EF(?:%20|\+)Core/);
  assert.equal(await page.locator("#subject-qa-heading").innerText(), "EF Core Interview Q&A");
  assert.equal(await page.locator("#subject-qa-results .experience-card").count(), 11);
  assert.equal(await page.getByText("Unrelated question", { exact: true }).count(), 0);
  assert.equal(await page.locator("#company-filter").count(), 0);
  assert.equal(await page.getByText("EF Core answer 0", { exact: true }).isVisible(), true);
  await page.locator("#subject-topic").selectOption("SQL");
  await page.getByText("SQL question 0", { exact: true }).waitFor();
  assert.equal(await page.getByText("EF Core question 0", { exact: true }).count(), 0);
  assert.equal(await page.locator("[data-save-course]").getAttribute("data-save-course"), "sql-qa");
  await page.goBack();
  await page.getByText("EF Core question 0", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-save-course]").getAttribute("data-save-course"), "efcore-qa");
  for (const subject of subjects) {
    await page.goto(`${base}/${subject.href}`);
    await page.locator("#subject-qa-results[aria-busy=false] .experience-card").first().waitFor();
    assert.equal(await page.locator("#subject-qa-heading").innerText(), `${subject.topic} Interview Q&A`);
    const topics = await page.locator("#subject-qa-results [data-topic]").evaluateAll(nodes =>
      [...new Set(nodes.map(node => node.dataset.topic))]);
    assert.deepEqual(topics, [subject.topic]);
  }
  await page.goto(`${base}/Subject-QA.html?topic=unknown`);
  assert.equal(await page.locator("#subject-qa-results .experience-card").count(), 0);
  assert.equal(await page.locator("#subject-topic").inputValue(), "");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("real subject APIs keep ten free answers and require a fresh PIN for each Pro question and subject", async t => {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV"];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  for (const name of names.filter(name => name.startsWith("SUPABASE_"))) delete process.env[name];
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  const { page, context, base } = await openSite(t);
  process.env.PUBLIC_APP_URL = base;
  const { COURSES } = require("../learning-catalog");
  const { subjects: bank } = require("../api/_project-questions");
  const subjects = COURSES.filter(course => course.kind === "Interview Q&A");
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const subject of subjects) {
    await page.goto(`${base}/${subject.href}`);
    await page.locator("#subject-qa-results[aria-busy=false] .experience-card").first().waitFor();
    assert.equal(await page.locator(".experience-card:not(.locked)").count(), 10, subject.topic);
    assert.ok(await page.locator(".experience-card.locked").count() > 0, subject.topic);
    assert.equal(await page.locator(".experience-answer:visible").count(), 10, subject.topic);
    assert.equal(await page.locator(".experience-example:visible").count(), 10, subject.topic);
    const response = await context.request.get(`${base}/api/questions?${new URLSearchParams({ topic: subject.topic })}`);
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.questions.length, 10);
    assert.equal(body.access.premium, false);
    assert.ok(body.questions.every(item => item.topic === subject.topic));
    assert.deepEqual(body.questions, bank.filter(item => item.topic === subject.topic).slice(0, 10));
    assert.deepEqual(Object.keys(body).sort(), ["access", "locked", "questions"]);
    assert.equal(await page.locator(".qa-source").count(), 0);
    const visibleTitles = await page.locator("#subject-qa-results .qa-title").allTextContents();
    for (const locked of body.locked) {
      assert.deepEqual(Object.keys(locked).sort(), ["company", "id", "topic"]);
      const original = bank.find(item => item.id === locked.id);
      assert.equal(visibleTitles.includes(original.question), false);
    }
  }
  for (const url of ["/api/_project-questions.js", "/API/_project-questions.js",
    "/experience-questions-seed.sql", "/supabase/seed.sql"]) {
    assert.equal((await context.request.get(`${base}${url}`)).status(), 404, url);
  }

  await page.goto(`${base}/Subject-QA.html?topic=EF%20Core`);
  await page.locator(".experience-card.locked").first().waitFor();
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("#subject-qa-results [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  const total = bank.filter(item => item.topic === "EF Core").length;
  assert.equal(await page.locator(".qa-card").count(), 11);
  assert.equal(await page.locator(".experience-card.locked").count(), total - 11);
  const imported = bank.find(item => item.topic === "EF Core" && item.source_page === "C#Dotnet.html");
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator(`[data-pro-resource="subject:EF Core:${imported.id}"]`).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-pin-opened]").length === 2);
  assert.equal(await page.locator(".qa-card").count(), 12);
  assert.equal(await page.locator('.qa-source a[href="C%23Dotnet.html"]').count(), 1);
  const guide = await context.request.get(`${base}/C%23Dotnet.html`);
  assert.equal(guide.status(), 200);
  assert.equal((await guide.text()).includes("Liskov Substitution Principle"), false);
  assert.equal((await context.cookies()).some(cookie => cookie.name === "kr7_pro"), false);
  for (const subject of subjects) {
    const response = await context.request.get(`${base}/api/questions?${new URLSearchParams({ topic: subject.topic })}`);
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.access.premium, false);
    assert.ok(body.locked.length > 0);
    assert.deepEqual(body.questions, bank.filter(item => item.topic === subject.topic).slice(0, 10));
  }
  await page.locator("[data-pin-opened] summary").first().click();
  await page.waitForFunction(() => document.querySelectorAll("[data-pin-opened]").length === 1);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("#subject-qa-results [data-pro-unlock]").first().click();
  await page.waitForFunction(() => document.querySelectorAll("[data-pin-opened]").length === 2);
  await page.locator("#subject-topic").selectOption("SQL");
  await page.getByRole("heading", { name: "SQL Interview Q&A", exact: true }).waitFor();
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.equal(await page.locator("[data-pin-opened]").count(), 0);
  assert.equal(await page.locator(".qa-card").count(), 10);
  await page.goBack();
  await page.getByRole("heading", { name: "EF Core Interview Q&A", exact: true }).waitFor();
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.equal(await page.locator(".qa-card").count(), 10);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("#subject-qa-results [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  await page.reload();
  await page.locator(".experience-card.locked").first().waitFor();
  assert.equal(await page.locator(".experience-answer:visible").count(), 10);
  assert.deepEqual(errors, []);
});

test("global Pro controls protect company questions and respect active company filters", async t => {
  const names = ["PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  });
  for (const name of names) delete process.env[name];
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  const { page, context, base } = await openSite(t);
  process.env.PUBLIC_APP_URL = base;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  for (const route of ["/Concepts.html", "/Subjects.html", "/Coaching.html", "/C%23Dotnet.html", "/Company-Interviews.html"]) {
    await page.goto(`${base}${route}`);
    await page.locator("[data-global-pro]").waitFor();
    assert.equal(await page.locator("[data-global-pro]").count(), 1);
    assert.equal(await page.locator("[data-global-pro] [data-pro-unlock]").isVisible(), true);
  }
  await page.locator("#question-list .locked-card").first().waitFor();
  assert.equal(await page.locator("#question-list .qa-card").count(), 10);
  assert.equal(await page.locator("#question-list .locked-card").count(), 86);
  assert.equal(await page.locator("#count").innerText(), "10 readable questions; 86 Pro questions locked.");
  await page.locator("#company-filter").selectOption("Amazon");
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("[data-global-pro] [data-pro-unlock]").click();
  await page.locator("[data-pin-opened]").waitFor();
  assert.equal(await page.locator("[data-pin-opened]").getAttribute("data-company"), "Amazon");
  assert.equal((await context.cookies()).some(cookie => cookie.name === "kr7_pro"), false);
  const bank = await (await context.request.get(`${base}/api/questions`)).json();
  assert.equal(bank.questions.length, 10);
  assert.equal(bank.locked.length, 86);
  await page.locator("#company-filter").selectOption("Google");
  await page.waitForFunction(() => document.querySelectorAll("[data-pin-opened]").length === 0);
  await page.locator("#company-filter").selectOption("Amazon");
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator("[data-global-pro] [data-pro-unlock]").click();
  assert.equal(await page.locator("[data-pin-opened]").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator("[data-global-pro] [data-pro-unlock]").isVisible(), true);
  assert.deepEqual(errors, []);
});

test("interview cards distinguish questions, answers, and examples, and company logos move accessibly", async t => {
  const { page, base } = await openSite(t);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });

  async function checkCard(card) {
    assert.match(await card.locator(".qa-question-label").innerText(), /^QUESTION \d+$/);
    assert.equal(await card.locator(".qa-answer-block > .qa-label").innerText(), "ANSWER");
    assert.equal(await card.locator(".qa-code-block > .qa-label").innerText(), "PRACTICAL EXAMPLE");
    const appearance = await card.evaluate(element => {
      const luminance = color => {
        const [red, green, blue] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
          value /= 255;
          return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
        });
        return .2126 * red + .7152 * green + .0722 * blue;
      };
      const pairs = [[".qa-title", ".qa-question-block"], [".experience-answer", ".qa-answer-block"],
        [".experience-example", ".qa-code-block"]];
      return {
        backgrounds: pairs.map(([, selector]) => getComputedStyle(element.querySelector(selector)).backgroundColor),
        contrasts: pairs.map(([text, background]) => {
          const foreground = luminance(getComputedStyle(element.querySelector(text)).color);
          const behind = luminance(getComputedStyle(element.querySelector(background)).backgroundColor);
          return (Math.max(foreground, behind) + .05) / (Math.min(foreground, behind) + .05);
        }),
      };
    });
    assert.equal(new Set(appearance.backgrounds).size, 3);
    assert.ok(appearance.contrasts.every(ratio => ratio >= 4.5), JSON.stringify(appearance));
  }

  await page.goto(`${base}/Subject-QA.html?topic=EF%20Core`);
  await page.locator("#subject-qa-results[aria-busy=false] .qa-card").first().waitFor();
  assert.equal(await page.locator(".qa-card").count(), 10);
  await checkCard(page.locator(".qa-card").first());
  const firstCard = await page.locator(".qa-card").first().boundingBox();
  const results = await page.locator("#subject-qa-results").boundingBox();
  assert.ok(firstCard.width >= results.width * .95);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.goto(base);
  const group = page.locator(".company-strip-group:not([aria-hidden])");
  assert.equal(await group.locator("li").count(), 6);
  await page.waitForFunction(() => [...document.querySelectorAll(".company-strip img")]
    .every(image => image.complete && image.naturalWidth > 0));
  const track = page.locator(".company-strip-track");
  const motion = await track.evaluate(async element => {
    const before = getComputedStyle(element).transform;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { before, after: getComputedStyle(element).transform };
  });
  assert.notEqual(motion.before, motion.after);
  assert.equal(await page.locator(".company-strip-toggle").count(), 0);
  await page.locator(".company-strip-viewport").hover();
  assert.equal(await track.evaluate(element => getComputedStyle(element).animationPlayState), "running");
  await page.keyboard.press("Tab");
  await page.locator(".company-strip-viewport").focus();
  assert.equal(await track.evaluate(element => getComputedStyle(element).animationPlayState), "paused");
  await page.locator(".company-strip-viewport").evaluate(element => element.blur());
  assert.equal(await track.evaluate(element => getComputedStyle(element).animationPlayState), "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await track.evaluate(element => getComputedStyle(element).animationName), "none");
  assert.equal(await page.locator('.company-strip-group[aria-hidden="true"]').isVisible(), false);
  await page.locator(".company-strip-viewport").focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => document.querySelector(".company-strip-viewport").scrollLeft > 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.route("**/api/config", route => route.fulfill({
    json: { supabaseUrl: "", supabaseAnonKey: "", providers: {}, plans: {}, paypalAmounts: {} },
  }));
  await page.goto(`${base}/Company-Interviews.html`);
  await page.locator("#question-list .qa-card").first().waitFor();
  await page.locator("#question-list .qa-card > summary").first().click();
  await checkCard(page.locator("#question-list .qa-card").first());
  assert.equal(await page.locator(".company-strip-group:not([aria-hidden]) li").count(), 6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  await page.route("**/api/experience-questions?*", route => route.fulfill({ json: {
    questions: [{ id: "visual-qa", topic: "EF Core", experience_band: "0-2 years",
      question: "How do you load related records?", answer: "Project the fields you need and avoid unnecessary queries.",
      example: "context.Orders.Select(order => new { order.Id, order.Customer.Name });", is_free: true }],
    locked: [], access: { premium: false },
  } }));
  await page.goto(`${base}/Interview-Preparation.html`);
  await page.locator("#experience-topic").selectOption("EF Core");
  await page.getByRole("button", { name: "Show my questions", exact: true }).click();
  await page.locator("#experience-results .qa-card").first().waitFor();
  await checkCard(page.locator("#experience-results .qa-card").first());
  assert.equal(await page.locator(".company-strip-group:not([aria-hidden]) li").count(), 6);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
});

test("short localhost PINs open individual items only, with no reusable browser session", async t => {
  const names = ["LOCAL_PRO_ACCESS_ENABLED", "LOCAL_PRO_ACCESS_PIN", "LOCAL_PRO_ACCESS_SECRET",
    "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  for (const name of ["PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "VERCEL_ENV",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[name];
  const pin = String(crypto.randomInt(1000, 10000));
  process.env.NODE_ENV = "development";
  process.env.LOCAL_PRO_ACCESS_ENABLED = "true";
  process.env.LOCAL_PRO_ACCESS_PIN = pin;
  process.env.LOCAL_PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  const { page, context, base } = await openSite(t);
  process.env.PUBLIC_APP_URL = base;
  const { subjects } = require("../api/_project-questions");
  await page.goto(`${base}/Subject-QA.html?topic=EF%20Core`);
  await page.locator(".experience-card.locked").first().waitFor();
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("#subject-qa-results [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  assert.equal(await page.locator(".qa-card").count(), 11);
  assert.equal(await page.locator(".experience-card.locked").count(),
    subjects.filter(item => item.topic === "EF Core").length - 11);
  assert.equal((await context.cookies()).some(cookie => cookie.name === "kr7_local_pro"), false);
  await page.goto(base);
  await page.getByText("Enter the PIN separately for each Pro question or lesson. No website-wide PIN unlock.", { exact: true }).waitFor();
  await page.goBack();
  await page.locator(".experience-card.locked").first().waitFor();
  assert.equal(await page.locator(".qa-card").count(), 10);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("#subject-qa-results [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  await page.goto(`${base}/C%23Dotnet.html`);
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount);
  page.once("dialog", dialog => dialog.accept(pin));
  await page.locator("[data-pro-item] [data-pro-unlock]").first().click();
  await page.locator("[data-pin-opened]").waitFor();
  assert.equal(await page.locator("[data-pro-item]").count(), csharpLockedCount - 1);
  assert.equal((await context.cookies()).some(cookie => /kr7.*pro/.test(cookie.name)), false);
});

test("new Pro exercises show their concepts only after individual SQL and guide PIN confirmations", async t => {
  const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
    "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ENV"]) delete process.env[name];
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  const { page, base } = await openSite(t);
  process.env.PUBLIC_APP_URL = base;
  const bank = require("../api/_project-questions").subjects;
  const sql = bank.find(item => item.topic === "SQL" && item.id.startsWith("kr7-interview-"));
  await page.goto(`${base}/Subject-QA.html?topic=SQL`);
  const button = page.locator(`[data-pro-resource="subject:SQL:${sql.id}"]`);
  await button.waitFor();
  assert.equal(await page.getByRole("heading", { name: sql.question, exact: true }).count(), 0);
  page.once("dialog", dialog => dialog.accept(pin));
  await button.click();
  const opened = page.locator("[data-pin-opened]");
  await opened.waitFor();
  assert.equal(await opened.locator(".qa-title").innerText(), sql.question);
  assert.match(await opened.locator(".qa-source").innerText(), /Outer joins and filter placement/);
  assert.equal(await opened.locator(".experience-answer").innerText(), sql.answer);
  assert.equal(await page.locator(".qa-card").count(), 11);
  await opened.locator("summary").click();
  await button.waitFor();
  assert.equal(await page.getByRole("heading", { name: sql.question, exact: true }).count(), 0);

  await page.goto(`${base}/C%23Dotnet.html`);
  const guideButton = page.locator('[data-pro-resource="guide:C#Dotnet.html:187"]');
  await guideButton.waitFor();
  assert.equal(await page.locator(".pro-practice-card").count(), 0);
  page.once("dialog", dialog => dialog.accept(pin));
  await guideButton.click();
  await page.locator("[data-pin-opened] .pro-practice-card").waitFor();
  assert.match(await page.locator("[data-pin-opened]").innerText(), /Value and reference semantics/);
  assert.equal(await page.locator("[data-pin-opened]").count(), 1);
  await page.getByRole("button", { name: "Close and lock this item", exact: true }).click();
  await guideButton.waitFor();
  assert.equal(await page.locator(".pro-practice-card").count(), 0);
  assert.equal(await page.locator("[data-free-item]").count(), 10);
});

test("company, experience, and React Pro questions each ask again without unlocking their banks", async t => {
  const names = ["PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV",
    "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  const pin = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_PIN = pin;
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "development";
  delete process.env.VERCEL_ENV;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "anon-test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test";
  global.fetch = async url => {
    if (String(url).endsWith("/auth/v1/settings")) {
      return { ok: true, json: async () => ({ external: { google: false } }) };
    }
    const experience = String(url).includes("/experience_questions?");
    const react = String(url).includes("company=eq.React");
    const kind = experience ? "Experience" : react ? "React" : "Company";
    assert.match(String(url), /^https:\/\/supabase\.test\/rest\/v1\/(?:questions|experience_questions)\?/);
    return { ok: true, text: async () => JSON.stringify(Array.from({ length: 12 }, (_, index) => ({
      id: `${kind}-${index}`, company: react ? "React" : "Practice",
      topic: experience ? "EF Core" : react ? "React Machine Coding" : "Testing", experience_band: "0-2 years",
      question: `${kind} prompt ${String(index).padStart(2, "0")}`, answer: `${kind} answer ${index}`,
      example: `${kind} example ${index}`,
    }))) };
  };
  const { page, context, base } = await openSite(t);
  process.env.PUBLIC_APP_URL = base;
  const errors = [];
  let confirmations = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", async dialog => {
    assert.equal(dialog.type(), "prompt", dialog.message());
    confirmations++;
    await dialog.accept(pin);
  });
  await page.goto(`${base}/Company-Interviews.html`);
  await page.locator(".locked-card").first().waitFor();
  await page.locator(".locked-card [data-pro-unlock]").first().click();
  await page.getByText("Company answer 10", { exact: true }).waitFor();
  assert.equal(confirmations, 1);
  assert.equal(await page.locator(".locked-card").count(), 1);
  await page.locator("[data-pin-opened] summary").click();
  await page.waitForFunction(() => document.querySelectorAll(".locked-card").length === 2);
  await page.locator(".locked-card [data-pro-unlock]").first().click();
  await page.getByText("Company answer 10", { exact: true }).waitFor();
  assert.equal(confirmations, 2);

  await page.goto(`${base}/Interview-Preparation.html`);
  await page.locator("#experience-topic").selectOption("EF Core");
  await page.getByRole("button", { name: "Show my questions", exact: true }).click();
  await page.locator("#experience-results .locked").first().waitFor();
  await page.locator("#experience-results [data-pro-unlock]").first().click();
  await page.getByText("Experience answer 10", { exact: true }).waitFor();
  assert.equal(confirmations, 3);
  assert.equal(await page.locator("#experience-results .locked").count(), 1);
  await page.getByRole("button", { name: "Close and lock this question", exact: true }).click();
  assert.equal(await page.locator("#experience-results .locked").count(), 2);
  await page.locator("#experience-results [data-pro-unlock]").first().click();
  await page.getByText("Experience answer 10", { exact: true }).waitFor();
  assert.equal(confirmations, 4);

  await page.goto(`${base}/React-Machine-Coding.html`);
  await page.locator(".question-button.locked").first().waitFor();
  await page.locator(".question-button.locked").first().click();
  await page.locator("#workspace-content [data-pro-unlock]").click();
  await page.getByText("React answer 10", { exact: true }).waitFor();
  assert.equal(confirmations, 5);
  assert.equal(await page.locator(".question-button.locked").count(), 2);
  await page.locator(".question-button.locked").last().click();
  assert.equal(await page.getByText("React answer 10", { exact: true }).count(), 0);
  await page.locator("#workspace-content [data-pro-unlock]").click();
  await page.getByText("React answer 11", { exact: true }).waitFor();
  assert.equal(confirmations, 6);
  await page.getByRole("button", { name: "Close and lock this challenge", exact: true }).click();
  await page.locator("#workspace-content [data-pro-unlock]").click();
  await page.getByText("React answer 11", { exact: true }).waitFor();
  assert.equal(confirmations, 7);
  const preview = await context.request.get(`${base}/api/react-machine-coding`);
  assert.equal((await preview.json()).questions.length, 10);
  assert.equal((await context.cookies()).some(cookie => /kr7.*pro/.test(cookie.name)), false);
  assert.deepEqual(errors, []);
});
