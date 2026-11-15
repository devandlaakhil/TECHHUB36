"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");
const { build } = require("../scripts/build-vercel");
const root = path.join(__dirname, "..");

async function invoke(handler, url) {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = url;
  req.headers = { host: "127.0.0.1" };
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200;
  const headers = {};
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.hasHeader = name => Object.hasOwn(headers, name.toLowerCase());
  const finished = once(res, "finish");
  await handler(req, res);
  await finished;
  return { status: res.statusCode, headers, body: Buffer.concat(chunks).toString("utf8") };
}

test("deployment artifact loads the MongoDB driver and serves password-only account assets without public private modules", async t => {
  const names = ["AUTH_PROVIDER", "MONGODB_URI"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  process.env.AUTH_PROVIDER = "mongodb";
  delete process.env.MONGODB_URI;
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  build();
  const app = path.join(root, ".vercel", "output", "functions", "index.func", "app");
  const handler = require(path.join(app, "server")).handleRequest;
  assert.equal(fs.existsSync(path.join(app, "scripts", "local-preview.js")), false);
  assert.equal(fs.existsSync(path.join(app, "scripts", "setup-local-preview.js")), false);
  assert.equal(fs.existsSync(path.join(app, "scripts", "local-preview-accounts.js")), false);
  assert.equal(fs.existsSync(path.join(app, "scripts", "local-preview-account.js")), false);
  assert.equal(fs.existsSync(path.join(app, ".local-preview")), false);
  assert.equal(fs.existsSync(path.join(app, ".env.local")), false);
  assert.equal(fs.readFileSync(path.join(app, "api", "_shared.js"), "utf8").includes("offline-preview"), false);
  assert.equal(typeof require(path.join(app, "node_modules", "mongodb")).MongoClient, "function");
  for (const route of ["/Account.html", "/account.js", "/account.css", "/site-navigation.js", "/site-navigation.css",
    "/site-theme.js", "/site-theme.css", "/coding-runner.js", "/dsa-workspace.css",
    "/training-directory.js", "/training.css", "/visual-memory-lab.css", "/assets/kr7tech-icon.svg"]) {
    const result = await invoke(handler, route);
    assert.equal(result.status, 200, route);
    if (route === "/site-theme.js" || route === "/site-theme.css") {
      assert.equal(result.body, fs.readFileSync(path.join(root, route.slice(1)), "utf8"), route);
    }
    if (route.endsWith(".svg")) assert.equal(result.headers["content-type"], "image/svg+xml");
    const lab = await invoke(handler, "/Visual-Interview-Memory-Lab.html");
    assert.equal(lab.status, 200);
    assert.equal((lab.body.match(/data-free-item/g) || []).length, 30);
    assert.match(lab.body, /Visual Interview Memory Lab/);
    assert.doesNotMatch(lab.body, /Transient vs Scoped vs Singleton/);
    const coaching = await invoke(handler, "/Coaching.html");
    assert.equal(coaching.status, 200);
    assert.match(coaching.body, /data-training-coach="Akhil"/);
    assert.match(coaching.body, /data-training-coach="Krishna"/);
    if (route.endsWith(".html")) {
      assert.match(result.body, /data-site-header/);
      assert.doesNotMatch(result.body, /otp-request-form|local-admin-form/);
      assert.match(result.body, /password-signup-form/);
      assert.match(result.body, /Already have an account\? Login/);
    }
  }
  const availability = await invoke(handler, "/api/email-auth");
  assert.equal(availability.status, 200);
  assert.equal(JSON.parse(availability.body).enabled, false);
  const passwordAvailability = await invoke(handler, "/api/account-auth");
  assert.equal(passwordAvailability.status, 200);
  assert.equal(JSON.parse(passwordAvailability.body).enabled, false);
  const localAvailability = await invoke(handler, "/api/local-admin-auth");
  assert.equal(JSON.parse(localAvailability.body).enabled, false);
  const home = await invoke(handler, "/");
  assert.equal(home.status, 200);
  assert.match(home.body, /class="home-topic-search"/);
  assert.doesNotMatch(home.body, /data-learning-sections/);
  const interview = await invoke(handler, "/Subject-QA.html?topic=SQL");
  assert.equal(interview.status, 200);
  assert.match(interview.body, /class="interview-sidebar"/);
  assert.match(interview.body, /<option value="visual-memory-lab">/);
  assert.match(interview.body, /id="interview-topic-search"/);
  for (const route of ["/DSA.html", "/DSA.HTML?problem=50", "/DSA.html?topic=SQL&question=sql-1"]) {
    const practice = await invoke(handler, route);
    assert.equal(practice.status, 200, route);
    assert.match(practice.body, /src="\/coding-runner.js"/);
    assert.match(practice.body, /id="toggle-problems"/);
    assert.match(practice.body, /"title":"Pro problem 50","pattern":"Pro practice","locked":true/);
    assert.doesNotMatch(practice.body, /class LRUCache/);
  }
  const cluster = await invoke(handler, "/Fullstack-Angular-Dotnet.html");
  assert.equal(cluster.status, 200);
  assert.match(cluster.body, /data-site-header/);
  assert.match(cluster.body, /data-concept-category="Angular \+ \.NET Fullstack"/);
  const fullstack = require("../api/_concept-fullstack");
  const patterns = require("../api/_concept-patterns");
  assert.ok(patterns.every(lesson => !cluster.body.includes(lesson.what) && !cluster.body.includes(lesson.example)));
  assert.ok(fullstack.every(lesson => !cluster.body.includes(lesson.what) &&
    !cluster.body.includes(lesson.example)));
  for (const route of ["/Membership.html", "/Purchase.html", "/purchase.js", "/Terms.html", "/Refund.html", "/Contact.html",
    "/Unavailable.html", "/service-status.js", "/service-status.css", "/service-worker.js"]) {
    const result = await invoke(handler, route);
    assert.equal(result.status, 200, route);
    if (route.endsWith(".html")) {
      assert.match(result.body, /data-site-header/);
      assert.match(result.body, /src="\/service-status.js"/);
    }
    if (route === "/service-worker.js") assert.equal(result.headers["cache-control"], "no-cache");
  }
  assert.equal((await invoke(handler, "/api/purchases")).status, 401);
  for (const [route, field, count] of [
    [`/api/questions?${new URLSearchParams({ topic: "C# / .NET" })}`, "questions", 10],
    ["/api/concepts", "lessons", null],
    [`/api/experience-questions?${new URLSearchParams({ topic: "C# / .NET", level: "6-10 years" })}`, "questions", null],
    ["/api/react-machine-coding", "questions", 10],
  ]) {
    const result = await invoke(handler, route);
    assert.equal(result.status, 200, route);
    const content = JSON.parse(result.body);
    assert.equal(content.access.premium, false);
    assert.ok(content[field].length > 0, route);
    if (count !== null) assert.equal(content[field].length, count, route);
    if (content.locked) assert.ok(content.locked.every(item => !("answer" in item) && !("example" in item)));
    if (field === "lessons") {
      assert.ok(content.lessons.every(item => !("what" in item)));
      assert.deepEqual(content.lessons.filter(item => item.category === "Angular + .NET Fullstack")
        .map(item => item.id), fullstack.map(item => item.id));
    }
  }
  for (const route of ["/api/_mongo.js", "/api/_mongo-auth.js", "/api/_mongo-data.js",
    "/api/_local-admin.js", "/api/_password-auth.js", "/api/_learning-content.js", "/api/_concept-fullstack.js", "/api/_commerce.js",
    "/scripts/seed-mongodb.js", "/scripts/setup-local-admin.js",
    "/scripts/local-preview.js", "/scripts/setup-local-preview.js",
    "/local-preview-account.js", "/api/local-preview-accounts", "/.local-preview/accounts.json"]) {
    assert.equal((await invoke(handler, route)).status, 404, route);
  }
  for (const route of ["/api/_concept-patterns.js", "/api/_pricing.js"]) {
    assert.equal((await invoke(handler, route)).status, 404, route);
  }
});
