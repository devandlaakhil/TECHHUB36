"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("parse5");
const servePage = require("../api/serve-page");
const { learningGuideTopics } = require("../api/_guide-preview");
const { createGrant } = require("../api/_pin-grants");

const root = path.join(__dirname, "..");
const page = "Visual-Interview-Memory-Lab.html";
const source = fs.readFileSync(path.join(root, page), "utf8");
const items = learningGuideTopics(page, source, root, page)[0].items;
const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const attr = (node, name) => node.attrs?.find(attr => attr.name === name)?.value;
const envNames = ["AUTH_PROVIDER", "MONGODB_URI", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
  "PRO_ACCESS_PIN", "PRO_ACCESS_SECRET", "LOCAL_PRO_ACCESS_PIN", "LOCAL_PRO_ACCESS_SECRET"];
let saved, originalFetch;

test.beforeEach(() => {
  saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  envNames.forEach(name => { delete process.env[name]; });
  originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("Anonymous lab requests must not need an external service."); };
});
test.afterEach(() => {
  for (const name of envNames) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  global.fetch = originalFetch;
});

async function request(query = {}, headers = {}) {
  const result = {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
  await servePage({ method: "GET", query: { page, ...query }, headers }, result);
  return result;
}

test("the lab serves thirty complete visual cards without sending any remaining question content", async () => {
  const result = await request();
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["Cache-Control"], "private, no-store, max-age=0");
  const elements = nodes(parse(result.body));
  const free = elements.filter(node => attr(node, "data-free-item") !== undefined);
  assert.equal(free.length, 30);
  for (const card of free) {
    for (const name of ["memory", "diagram", "one", "interview"]) {
      assert.ok(nodes(card).some(node => attr(node, "class")?.split(/\s+/).includes(name)), name);
    }
  }
  assert.ok(result.body.includes(items[29].html));
  for (const item of items.slice(30)) assert.equal(result.body.includes(item.html), false, item.title);
  assert.equal(elements.filter(node => attr(node, "data-pro-item") !== undefined).length, items.length - 30);
  assert.match(result.body, /Visual Interview Memory Lab/);
  assert.equal(source.includes(items[0].html), false, "the public shell cannot contain the private bank");
});

test("the item API allows question thirty, rejects question thirty-one and ignores client-supplied preview limits", async () => {
  const free = await request({ item: "29" });
  assert.equal(free.statusCode, 200);
  assert.equal(free.body.html, items[29].html);
  const paid = await request({ item: "30", freeLimit: "999", unlocked: "true" });
  assert.equal(paid.statusCode, 403);
  assert.equal(paid.body.html, undefined);
  assert.equal((await request({ item: "-1" })).statusCode, 400);
});

test("a PIN grant opens only its chosen paid lab question and cannot be replayed", async () => {
  process.env.PRO_ACCESS_PIN = "test-lab-pin";
  process.env.PRO_ACCESS_SECRET = "test-only-lab-secret-".repeat(4);
  const grant = createGrant({ headers: {} }, `guide:${page}:30`);
  const opened = await request({ item: "30" }, { "x-pro-grant": grant });
  assert.equal(opened.statusCode, 200);
  assert.equal(opened.body.html, items[30].html);
  assert.equal((await request({ item: "31" }, { "x-pro-grant": grant })).statusCode, 403);
  assert.equal((await request({ item: "30" }, { "x-pro-grant": grant })).statusCode, 403);
});

test("only Pro unlocks the rest of the lab; Go keeps the thirty-question preview", async () => {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  for (const tier of ["Go", "Pro"]) {
    global.fetch = async url => {
      if (url.endsWith("/auth/v1/user")) return { ok: true, json: async () => ({ id: "lab-learner" }) };
      if (url.includes("/rest/v1/entitlements?")) return { ok: true, text: async () => JSON.stringify([{ tier }]) };
      throw new Error("Unexpected lab dependency.");
    };
    const result = await request({}, { cookie: "visual_pro_session=lab-token" });
    assert.equal(result.statusCode, 200, tier);
    assert.equal((result.body.match(/data-free-item/g) || []).length, 30, tier);
    assert.equal(result.body.includes(items[30].html), tier === "Pro", tier);
    if (tier === "Pro") {
      assert.match(result.body, /data-guide-access="pro"/);
      assert.equal((result.body.match(/data-member-item/g) || []).length, items.length - 30);
      assert.doesNotMatch(result.body, /data-pro-item/);
    }
  }
});
