"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const handler = require("../api/concepts");
const config = require("../api/config");
const lessons = require("../api/_concept-lessons");
const advanced = require("../api/_concept-advanced");
const deepDives = require("../api/_concept-deep-dives");
const guided = require("../api/_concept-guided");
const enterprise = require("../api/_concept-enterprise");
const fullstack = require("../api/_concept-fullstack");
const patterns = require("../api/_concept-patterns");
const { PATHS, orderLessons } = require("../concept-paths");
const { createGrant } = require("../api/_pin-grants");
const { pinCookie } = require("../api/_pin-access");
const originalFetch = global.fetch;
const names = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "JUDGE0_API_URL", "JUDGE0_API_TOKEN"];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
function response() {
  return {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}
async function get(id, headers = {}) {
  const res = response();
  await handler({ method: "GET", headers, query: id === undefined ? {} : { id } }, res);
  return res;
}
test.beforeEach(() => {
  for (const name of names) delete process.env[name];
  global.fetch = async () => { throw new Error("Unconfigured concept access must not contact a provider."); };
});
test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});
test("catalog exposes only navigation metadata, including with an unconfigured saved session", async () => {
  const res = await get(undefined, { authorization: "Bearer stale-token" });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["Cache-Control"], /no-store/);
  assert.equal(res.body.access.premium, false);
  assert.equal(res.body.lessons.length, lessons.length);
  for (const item of res.body.lessons) {
    assert.deepEqual(Object.keys(item).sort(), ["category", "id", "summary", "title"]);
    assert.equal((await get(item.id)).statusCode, 403);
  }
  const publicJson = JSON.stringify(res.body);
  assert.ok(lessons.every(item => !publicJson.includes(item.what) && !publicJson.includes(item.example)));
});
test("expanded lessons retain distinct routable identities and complete teaching sections", () => {
  assert.equal(new Set(lessons.map(item => item.id)).size, lessons.length);
  for (const lesson of [...advanced, ...deepDives, ...guided, ...enterprise, ...fullstack, ...patterns]) {
    assert.ok(lessons.includes(lesson), `Missing appended lesson: ${lesson.id}`);
    assert.match(lesson.id, /^[a-z0-9-]{1,80}$/);
    for (const field of ["category", "title", "summary", "what", "why", "how", "flow", "example", "exercise"]) {
      assert.equal(typeof lesson[field], "string", `${lesson.id}.${field}`);
      assert.ok(lesson[field].trim(), `${lesson.id}.${field}`);
    }
    for (const field of ["cheat", "pitfalls"]) {
      assert.ok(Array.isArray(lesson[field]) && lesson[field].length > 0, `${lesson.id}.${field}`);
      assert.ok(lesson[field].every(value => typeof value === "string" && value.trim()));
    }
    assert.equal(new URL(lesson.reference).protocol, "https:");
    if (guided.includes(lesson) || enterprise.includes(lesson) || fullstack.includes(lesson) || patterns.includes(lesson)) {
      assert.ok(Array.isArray(lesson.steps) && lesson.steps.length > 1, `${lesson.id}.steps`);
      assert.ok(lesson.steps.every(step => typeof step === "string" && step.trim()));
    }
  }
});
test("every subject has a complete, non-mutating learning order with no private lesson bodies", () => {
  assert.deepEqual(Object.keys(PATHS).sort(), [...new Set(lessons.map(item => item.category))].sort());
  for (const [category, path] of Object.entries(PATHS)) {
    const categoryLessons = lessons.filter(item => item.category === category);
    const original = categoryLessons.map(item => item.id);
    assert.equal(new Set(path.lessonIds).size, path.lessonIds.length, category);
    assert.deepEqual([...path.lessonIds].sort(), [...original].sort(), category);
    assert.deepEqual(orderLessons(category, categoryLessons).map(item => item.id), path.lessonIds);
    assert.deepEqual(categoryLessons.map(item => item.id), original);
    const publicPath = JSON.stringify(path);
    assert.ok(categoryLessons.every(item => !publicPath.includes(item.what) && !publicPath.includes(item.example)));
  }
  const future = { id: "future-devops-topic" };
  const sample = [future, lessons.find(item => item.id === "devops-git"),
    lessons.find(item => item.id === "devops-linux")];
  assert.deepEqual(orderLessons("DevOps", sample).map(item => item.id),
    ["devops-linux", "devops-git", "future-devops-topic"]);
  assert.equal(sample[0], future);
});
test("additional subject deep dives expose outlines but authorize only one complete lesson per grant", async () => {
  process.env.PRO_ACCESS_PIN = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  const catalog = await get();
  for (const lesson of [...deepDives, ...guided, ...enterprise, ...fullstack, ...patterns]) {
    const outline = catalog.body.lessons.find(item => item.id === lesson.id);
    assert.deepEqual(outline, {
      id: lesson.id, category: lesson.category, title: lesson.title, summary: lesson.summary,
    });
    assert.equal((await get(lesson.id)).statusCode, 403);
    const headers = { "x-pro-grant": createGrant({ headers: {} }, `concept:${lesson.id}`) };
    const other = deepDives.find(item => item.id !== lesson.id);
    assert.equal((await get(other.id, headers)).statusCode, 403);
    const opened = await get(lesson.id, headers);
    assert.equal(opened.statusCode, 200);
    assert.deepEqual(opened.body.lesson, lesson);
    assert.equal((await get(lesson.id, headers)).statusCode, 403);
  }
});
test("new .NET, microservices, and system design lessons require independent grants", async () => {
  process.env.PRO_ACCESS_PIN = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  const selected = [".NET", "Microservices", "System Design"]
    .map(category => advanced.find(lesson => lesson.category === category));
  const catalog = await get();
  for (const lesson of selected) {
    assert.ok(catalog.body.lessons.some(item => item.id === lesson.id));
    assert.equal((await get(lesson.id)).statusCode, 403);
    const grant = createGrant({ headers: {} }, `concept:${lesson.id}`);
    const headers = { "x-pro-grant": grant };
    const other = selected.find(item => item.id !== lesson.id);
    assert.equal((await get(other.id, headers)).statusCode, 403);
    const opened = await get(lesson.id, headers);
    assert.equal(opened.statusCode, 200);
    assert.deepEqual(opened.body.lesson, lesson);
    assert.equal((await get(lesson.id, headers)).statusCode, 403);
  }
});
test("a concept grant authorizes only the selected lesson once, not the catalog or another lesson", async () => {
  process.env.PRO_ACCESS_PIN = crypto.randomBytes(16).toString("hex");
  process.env.PRO_ACCESS_SECRET = crypto.randomBytes(32).toString("hex");
  const grant = createGrant({ headers: {} }, `concept:${lessons[0].id}`);
  const headers = { "x-pro-grant": grant };
  assert.equal((await get(lessons[1].id, headers)).statusCode, 403);
  const catalog = await get(undefined, headers);
  assert.ok(!("lesson" in catalog.body));
  assert.equal(catalog.body.access.pinActive, false);
  const opened = await get(lessons[0].id, headers);
  assert.equal(opened.statusCode, 200);
  assert.deepEqual(opened.body.lesson, lessons[0]);
  assert.deepEqual(opened.body.access, { premium: false, pinActive: true });
  assert.equal((await get(lessons[0].id, headers)).statusCode, 403);
  const cookie = `kr7_pro=${pinCookie(Math.floor(Date.now() / 1000) + 3600)}`;
  assert.equal((await get(lessons[1].id, { cookie })).statusCode, 403);
});
test("only active verified paid Pro can open full lessons without an item grant", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  for (const entitlement of [{ tier: "L1" }, { tier: "L2" }, { tier: "L3" },
    { tier: "Pro", active: false }, { tier: "Pro", active: true }]) {
    global.fetch = async url => String(url).endsWith("/auth/v1/user")
      ? { ok: true, json: async () => ({ id: "learner" }) }
      : { ok: true, text: async () => JSON.stringify([entitlement]) };
    const res = await get(lessons[1].id, { authorization: "Bearer verified-session" });
    const allowed = entitlement.tier === "Pro" && entitlement.active !== false;
    assert.equal(res.statusCode, allowed ? 200 : 403);
    if (allowed) {
      assert.deepEqual(res.body.lesson, lessons[1]);
      assert.equal(res.body.access.premium, true);
      assert.equal(res.body.access.pinActive, false);
    }
  }
  global.fetch = async () => ({ ok: false });
  assert.equal((await get(lessons[0].id, { authorization: "Bearer forged-session" })).statusCode, 403);
});
test("concept API rejects malformed selections, unknown lessons, and write methods", async () => {
  for (const id of ["", ["cs-async"], "../api", "x".repeat(81)]) {
    assert.equal((await get(id)).statusCode, 400);
  }
  assert.equal((await get("missing-concept")).statusCode, 404);
  const res = response();
  await handler({ method: "POST", headers: {}, query: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});
test("Go cannot open full concept lessons, while inactive Go remains locked", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  let entitlement = { tier: "Go", active: true };
  global.fetch = async url => String(url).endsWith("/auth/v1/user")
    ? { ok: true, json: async () => ({ id: "go-learner" }) }
    : { ok: true, text: async () => JSON.stringify([entitlement]) };
  const headers = { authorization: "Bearer verified-go" };
  const catalog = await get(undefined, headers);
  assert.equal(catalog.body.access.premium, false);
  assert.equal(catalog.body.access.plan, undefined);
  assert.equal(catalog.body.access.includedLessonIds, undefined);
  for (const [category, path] of Object.entries(PATHS)) {
    for (const id of path.lessonIds) {
      const res = await get(id, headers);
      assert.equal(res.statusCode, 403, `${category}: ${id}`);
    }
  }
  entitlement = { tier: "Go", active: false };
  assert.equal((await get(PATHS[".NET"].lessonIds[0], headers)).statusCode, 403);
});
test("compiler configuration status is honest and does not expose provider settings", async () => {
  const absent = response();
  await config({ method: "GET" }, absent);
  assert.equal(absent.body.compilerConfigured, false);
  assert.deepEqual(absent.body.planBenefits.Go, { interviewQA: true, concepts: false, aiInterview: false });
  assert.deepEqual(absent.body.planBenefits.Pro, {
    interviewQA: true, concepts: true, aiInterview: true, allContent: true,
  });
  process.env.JUDGE0_API_URL = "https://private-compiler.test";
  process.env.JUDGE0_API_TOKEN = "private-test-token";
  const configured = response();
  await config({ method: "GET" }, configured);
  assert.equal(configured.body.compilerConfigured, true);
  assert.ok(!JSON.stringify(configured.body).includes(process.env.JUDGE0_API_URL));
  assert.ok(!JSON.stringify(configured.body).includes(process.env.JUDGE0_API_TOKEN));
});
