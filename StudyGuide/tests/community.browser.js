"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { chromium } = require("playwright");
const { createServer } = require("../server");
const { openNavigation } = require("./helpers/navigation");

async function openSite(t) {
  const server = createServer();
  let browser;
  t.after(async () => {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined),
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return { page, context, base: `http://127.0.0.1:${server.address().port}` };
}

test("interest forms submit consent and keep signup kinds separate; feedback is rendered as text", async t => {
  const { page, base } = await openSite(t);
  const posts = [];
  await page.route("**/api/community**", async route => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { message: "Your request is saved privately." } });
    }
    return route.fulfill({ json: route.request().url().includes("action=feedback")
      ? { feedback: [{ name: "<img src=x>", rating: 3, courseId: "dotnet", feedback: "Honest feedback, not executable <script>markup</script>." }] }
      : { enabled: true, supportEmail: "support@example.test" } });
  });
  for (const [file, kind] of [["Newsletter.html", "newsletter"], ["Masterclass.html", "masterclass"]]) {
    await page.goto(`${base}/${file}`);
    const form = page.locator("[data-community-form]");
    await form.locator("fieldset:not([disabled])").waitFor();
    await form.locator('[name="email"]').fill("learner@example.test");
    await form.locator("button[type=submit]").click();
    assert.equal(posts.length, kind === "newsletter" ? 0 : 1);
    await form.locator('[name="consent"]').check();
    await form.locator("button[type=submit]").click();
    await form.getByText("Your request is saved privately.", { exact: true }).waitFor();
    assert.equal(posts.at(-1).kind, kind);
    assert.equal(posts.at(-1).consent, true);
  }
  await page.goto(`${base}/Feedback.html`);
  const form = page.locator("[data-community-form]");
  await form.locator("fieldset:not([disabled])").waitFor();
  await form.locator('[name="name"]').fill("A learner");
  await form.locator('[name="rating"]').selectOption("3");
  await form.locator('[name="feedback"]').fill("The examples helped, but more prerequisites would be useful.");
  await form.locator('[name="consent"]').check();
  await form.locator("button[type=submit]").click();
  await form.getByText("Your request is saved privately.", { exact: true }).waitFor();
  assert.equal(posts.at(-1).publicConsent, false);
  await page.goto(`${base}/Courses.html`);
  await page.locator("[data-community-feedback] .offering-card").waitFor();
  assert.equal(await page.locator("[data-community-feedback] img, [data-community-feedback] script").count(), 0);
  assert.match(await page.locator("[data-community-feedback]").innerText(), /<img src=x>/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test("Courses NEW navigation and consented learner stories work on the homepage and courses page", async t => {
  const { page, base } = await openSite(t);
  const feedback = [
    { name: "Test Learner One", rating: 4, feedback: "The async examples helped me explain cancellation. More practice tasks would help." },
    { name: "Test Learner Two", rating: 2, feedback: "I would like clearer prerequisites before the advanced sections." },
  ];
  await page.route("**/api/community**", route => route.fulfill({
    json: route.request().url().includes("action=feedback")
      ? { feedback } : { enabled: true, supportEmail: "support@example.test" },
  }));
  await page.goto(base);
  await page.locator(".feedback-card").first().waitFor();
  const coursesLink = page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Courses NEW", exact: true });
  assert.equal(await coursesLink.getAttribute("href"), "/Courses.html");
  assert.equal(await coursesLink.locator(".nav-new").innerText(), "NEW");
  const badge = await coursesLink.locator(".nav-new").evaluate(node => {
    const style = getComputedStyle(node);
    return { radius: parseFloat(style.borderRadius), background: style.backgroundColor, color: style.color };
  });
  assert.ok(badge.radius > 10);
  assert.notEqual(badge.background, "rgba(0, 0, 0, 0)");
  assert.notEqual(badge.background, badge.color);
  assert.equal(await page.locator(".learning-encouragement h3").count(), 3);
  for (const [index, item] of feedback.entries()) {
    const card = page.locator(".feedback-card").nth(index);
    assert.equal(await card.locator(".feedback-name").innerText(), item.name);
    assert.equal(await card.locator("blockquote").innerText(), item.feedback);
    assert.equal(await card.locator('[role="img"]').getAttribute("aria-label"), `Rated ${item.rating} out of 5`);
    assert.equal(await card.locator(".feedback-star.filled").count(), item.rating);
    assert.match(await card.locator(".feedback-consent").innerText(), /Shared with permission/);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await openNavigation(page, "Learn");
  await coursesLink.click();
  await page.locator(".feedback-card").first().waitFor();
  assert.equal(await page.locator(".feedback-card").count(), feedback.length);
  assert.equal(await page.locator(".nav-course-link").getAttribute("aria-current"), "page");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole("link", { name: "Share your learning experience", exact: true }).click();
  await page.locator(".community-form fieldset:not([disabled])").waitFor();
  assert.equal(await page.locator('[name="publicConsent"]').isChecked(), false);
  assert.match(await page.locator(".feedback-prompt").innerText(), /only if it really happened/);
});

test("empty or unavailable learner feedback never becomes fabricated endorsements", async t => {
  const { page, base } = await openSite(t);
  let unavailable = false;
  await page.route("**/api/community**", route => {
    if (!route.request().url().includes("action=feedback")) return route.fulfill({ json: { enabled: false } });
    return route.fulfill(unavailable
      ? { status: 503, json: { error: "Feedback is temporarily unavailable." } }
      : { json: { feedback: [] } });
  });
  await page.goto(base);
  await page.locator(".feedback-empty").waitFor();
  assert.match(await page.locator(".feedback-empty").innerText(), /No public learner stories yet/);
  assert.equal(await page.locator(".feedback-card").count(), 0);
  assert.equal(await page.locator('[data-community-feedback] [role="img"]').count(), 0);
  assert.equal(await page.locator("#learning-paths .home-goal-card").count(), 3);
  unavailable = true;
  await page.reload();
  await page.getByText("Learner feedback is temporarily unavailable.", { exact: true }).waitFor();
  assert.equal(await page.locator(".feedback-card").count(), 0);
  assert.equal(await page.locator(".feedback-empty").count(), 0);
});

test("assistant replies after two seconds, keeps suggestion-only answers, and uses the existing Pro price", async t => {
  const { page, base } = await openSite(t);
  await page.route("**/api/community**", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/api/config", route => route.fulfill({ json: { plans: { Pro: 1500 }, providers: {}, paypalAmounts: {} } }));
  await page.goto(`${base}/Membership.html`);
  await page.getByText("₹1,500 one-time", { exact: true }).waitFor();
  await page.locator(".support-launcher").click();
  const panel = page.locator(".support-panel");
  assert.equal(await panel.locator("h2").innerText(), "AskKR7Tech");
  assert.equal(await panel.locator(".support-disclosure").innerText(), "Automated support");
  assert.equal((await panel.innerText()).includes("guided answer"), false);
  assert.equal(await panel.locator("textarea, [name=message], [name=question]").count(), 0);
  assert.equal(await panel.locator("[data-support-question]").count(), 8);
  await page.clock.install({ time: new Date("2026-11-12T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-12T10:01:00Z"));
  await panel.locator('[data-support-question="price"]').click();
  assert.equal(await panel.locator(".support-typing").count(), 1);
  assert.equal(await panel.locator(".support-typing").innerText(), "Typing...");
  await page.clock.fastForward(1999);
  assert.equal(await panel.locator(".support-answer").count(), 0);
  await page.clock.fastForward(1);
  await panel.locator(".support-answer").waitFor();
  assert.match(await panel.locator(".support-answer").innerText(), /1,500/);
  assert.match(await panel.locator(".support-answer").innerText(), /not enabled/);
  assert.equal(await panel.locator(".support-typing").count(), 0);
  await panel.press("Escape");
  assert.equal(await panel.isVisible(), false);
});

test("Pro inclusions and AskKR7Tech answers agree without hiding pending service setup", async t => {
  const { page, base } = await openSite(t);
  await page.route("**/api/community**", route => route.fulfill({ json: { enabled: false } }));
  await page.route("**/api/config", route => route.fulfill({
    json: { plans: { Pro: 1500 }, providers: {}, paypalAmounts: {}, compilerConfigured: false },
  }));
  await page.goto(`${base}/Membership.html`);
  const comparison = page.getByRole("table", { name: "What each access option includes" });
  for (const feature of ["Remote code runner", "Live 1:1 coaching or certificates"]) {
    const row = comparison.getByRole("row").filter({ has: page.getByRole("rowheader", { name: feature, exact: true }) });
    assert.deepEqual(await row.locator("td").allTextContents(), ["Not included", "Not included", "Included"]);
  }
  assert.match(await page.locator("#pro-benefit-availability").innerText(), /configured compiler service/);
  assert.match(await page.locator("#pro-benefit-availability").innerText(), /details are pending/);
  const launcher = page.getByRole("button", { name: "AskKR7Tech", exact: true });
  await launcher.click();
  const panel = page.getByRole("dialog", { name: "AskKR7Tech", exact: true });
  await panel.waitFor();
  assert.equal(await panel.locator(".support-disclosure").innerText(), "Automated support");
  await page.clock.install({ time: new Date("2026-11-12T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-12T10:01:00Z"));
  await panel.locator('[data-support-question="benefits"]').click();
  await page.clock.fastForward(1999);
  assert.equal(await panel.locator(".support-answer").count(), 0);
  await page.clock.fastForward(1);
  await panel.locator(".support-answer").waitFor();
  const answer = await panel.locator(".support-answer").innerText();
  assert.match(answer, /Pro includes.*remote code runner.*live 1:1 coaching.*completion certificates/);
  assert.match(answer, /details are pending/);
  assert.match(answer, /does not book a session or issue a certificate/);
  await panel.locator('[data-support-question="courses"]').click();
  await page.clock.fastForward(2000);
  await panel.locator(".support-answer").nth(1).waitFor();
  assert.match(await panel.locator(".support-answer").last().innerText(), /not interview question banks/);
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  assert.equal(await launcher.getAttribute("aria-expanded"), "false");
});

test("assistant does not wait beyond two seconds for pending pricing configuration", async t => {
  const { page, base } = await openSite(t);
  let pricingRequest;
  await page.route("**/api/config", route => { pricingRequest = route; });
  await page.goto(base);
  await page.locator(".support-launcher").click();
  await page.clock.install({ time: new Date("2026-11-12T10:00:00Z") });
  await page.clock.pauseAt(new Date("2026-11-12T10:01:00Z"));
  const panel = page.locator(".support-panel");
  await panel.locator('[data-support-question="price"]').click();
  await page.clock.fastForward(2000);
  await panel.locator(".support-answer").waitFor();
  assert.match(await panel.locator(".support-answer").innerText(), /cannot confirm the current Pro price/);
  assert.equal(await panel.locator(".support-typing").count(), 0);
  if (pricingRequest) await pricingRequest.fulfill({ json: { plans: { Pro: 1500 }, providers: {} } }).catch(() => {});
});

test("chat contact capture is optional, consent-based, and never saves contact details to local storage", async t => {
  const { page, base } = await openSite(t);
  const posts = [];
  await page.route("**/api/community**", async route => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ status: 202, json: { message: "Contact request saved." } });
    }
    return route.fulfill({ json: { enabled: true, supportEmail: "support@example.test" } });
  });
  await page.goto(base);
  await page.locator(".support-launcher").click();
  await page.getByText("Optional: request owner follow-up", { exact: true }).click();
  const form = page.locator(".support-callback form");
  await form.locator("fieldset:not([disabled])").waitFor();
  await form.locator('[name="name"]').fill("Learner");
  await form.locator('[name="email"]').fill("learner@example.test");
  await form.locator('[name="phone"]').fill("+919876543210");
  await form.getByRole("button", { name: "Send contact request", exact: true }).click();
  assert.equal(posts.length, 0);
  await form.locator('[name="consent"]').check();
  await form.getByRole("button", { name: "Send contact request", exact: true }).click();
  await form.getByText("Contact request saved.", { exact: true }).waitFor();
  assert.equal(posts[0].kind, "enquiry");
  assert.equal(posts[0].phone, "+919876543210");
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes("learner@example.test")), false);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});
