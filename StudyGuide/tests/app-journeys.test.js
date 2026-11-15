"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const test = require("node:test");
const { parse } = require("parse5");
const mongodb = require("mongodb");
const { createDatabase } = require("./helpers/mongo-fixture");

// Exercise the real HTTP handler without sockets; MongoDB and merchant services are fixtures.
const db = createDatabase();
const descriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
Object.defineProperty(mongodb, "MongoClient", { configurable:true, value:class {
  async connect() {}
  db() { return db; }
  async close() {}
  async withSession(work) { return work({ withTransaction:callback => db.transaction(callback) }); }
} });
const { handleRequest } = require("../server");
const root = path.join(__dirname, "..");
const origin = "https://kr7tech.test";
const password = crypto.randomBytes(24).toString("base64url");
const secret = crypto.randomBytes(32).toString("hex");
const names = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "AUTH_OTP_SECRET",
  "PUBLIC_APP_URL", "NODE_ENV", "VERCEL_ENV", "VERCEL", "RENDER", "SALES_ENABLED", "SUPPORT_EMAIL",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "MONGODB_ADMIN_EMAILS", "ADMIN_USER_IDS",
  "PRO_ACCESS_PIN", "LOCAL_PRO_ACCESS_ENABLED"];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const originalFetch = global.fetch;
const merchantCalls = [];
const allNodes = node => [node, ...(node.childNodes || []).flatMap(allNodes)];
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

function client() {
  const cookies = new Map();
  return {
    cookie() { return [...cookies].map(([key, value]) => `${key}=${value}`).join("; "); },
    async request(url, { method = "GET", body, rawBody, headers = {} } = {}) {
      const payload = rawBody ?? (body === undefined ? "" : JSON.stringify(body));
      const req = Readable.from(payload ? [Buffer.from(payload)] : []);
      req.url = url;
      req.method = method;
      req.socket = { remoteAddress:"127.0.0.1", encrypted:true };
      req.headers = { host:"kr7tech.test", origin, cookie:this.cookie(),
        ...(payload ? { "content-type":"application/json" } : {}), ...headers };
      const chunks = [], responseHeaders = {};
      const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
      res.statusCode = 200;
      res.setHeader = (name, value) => { responseHeaders[name.toLowerCase()] = value; };
      res.hasHeader = name => Object.hasOwn(responseHeaders, name.toLowerCase());
      const finished = once(res, "finish");
      await handleRequest(req, res);
      await finished;
      const text = Buffer.concat(chunks).toString("utf8");
      const setCookies = responseHeaders["set-cookie"];
      for (const value of setCookies ? (Array.isArray(setCookies) ? setCookies : [setCookies]) : []) {
        const [pair] = value.split(";");
        const index = pair.indexOf("=");
        const key = pair.slice(0, index), token = pair.slice(index + 1);
        if (/;\s*Max-Age=0(?:;|$)/i.test(value)) cookies.delete(key);
        else cookies.set(key, token);
      }
      return { status:res.statusCode, headers:responseHeaders, text,
        json:responseHeaders["content-type"]?.includes("application/json") ? JSON.parse(text) : null };
    },
  };
}

test.before(() => {
  for (const name of names) delete process.env[name];
  Object.assign(process.env, { AUTH_PROVIDER:"mongodb", MONGODB_URI:"mongodb://fixture.invalid",
    MONGODB_DATABASE:"journey-fixture", AUTH_OTP_SECRET:crypto.randomBytes(32).toString("hex"),
    PUBLIC_APP_URL:origin, NODE_ENV:"production", SALES_ENABLED:"true",
    SUPPORT_EMAIL:"support@example.test", STRIPE_SECRET_KEY:"fixture-key", STRIPE_WEBHOOK_SECRET:secret });
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions", "Unexpected external dependency");
    const form = new URLSearchParams(options.body);
    merchantCalls.push(form);
    return { ok:true, json:async () => ({
      id:`checkout-${form.get("metadata[payment_id]")}`, url:"https://checkout.stripe.com/fixture",
    }) };
  };
});

test.after(() => {
  Object.defineProperty(mongodb, "MongoClient", descriptor);
  global.fetch = originalFetch;
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("every page and every shared navigation destination is served through the production handler", async () => {
  const visitor = client(), destinations = new Set(), scripts = new Set();
  for (const file of fs.readdirSync(root).filter(name => name.endsWith(".html"))) {
    const response = await visitor.request(`/${encodeURIComponent(file)}`);
    assert.equal(response.status, 200, file);
    assert.equal(response.headers["x-content-type-options"], "nosniff", file);
    const nodes = allNodes(parse(response.text));
    const header = nodes.find(node => attr(node, "data-site-header") !== undefined);
    const footer = nodes.find(node => attr(node, "data-site-footer") !== undefined);
    assert.ok(header && footer, file);
    for (const link of [...allNodes(header), ...allNodes(footer)].filter(node => node.tagName === "a")) {
      const url = new URL(attr(link, "href"), origin);
      if (url.origin !== origin) {
        assert.equal(url.href, "https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU");
        assert.equal(attr(link, "target"), "_blank");
        assert.match(attr(link, "rel"), /\bnoopener\b/);
        assert.match(attr(link, "rel"), /\bnoreferrer\b/);
        continue;
      }
      destinations.add(`${url.pathname}${url.search}`);
    }
    for (const script of nodes.filter(node => node.tagName === "script" && attr(node, "src"))) {
      const url = new URL(attr(script, "src"), `${origin}/${encodeURIComponent(file)}`);
      if (url.origin === origin) scripts.add(`${url.pathname}${url.search}`);
    }
  }
  for (const url of destinations) assert.equal((await visitor.request(url)).status, 200, url);
  for (const url of scripts) {
    const protectedAsset = ["/dotnet-roadmap.js", "/interview-studio.js"].includes(url);
    assert.equal((await visitor.request(url)).status, protectedAsset ? 403 : 200, url);
  }
  for (const url of ["/api/_password-auth.js", "/api/_concept-patterns.js", "/.env.local", "/server.js"]) {
    assert.equal((await visitor.request(url)).status, 404, url);
  }
});

test("account, membership and logout journey uses real handlers, signed webhooks and persistent fixture records", async t => {
  db.reset();
  merchantCalls.length = 0;
  const learner = client();
  let userId, lastCookie;

  await t.test("create a normal account, reject duplicates, sign out, then reuse the stored password", async () => {
    assert.equal((await learner.request("/api/session")).json.signedIn, false);
    assert.equal((await learner.request("/api/concepts?id=micro-pattern-strategy")).status, 403);
    const created = await learner.request("/api/account-auth", { method:"POST",
      body:{ action:"signup", username:"FlowLearner", password, plan:"Pro", is_admin:true } });
    assert.equal(created.status, 201);
    userId = created.json.user.id;
    assert.equal(created.json.user.role, "student");
    assert.equal(created.json.user.hasPassword, true);
    assert.match(created.headers["set-cookie"][0], /__Host-kr7_session=.*HttpOnly.*Secure/);
    assert.equal(JSON.stringify(db.collection("users").rows).includes(password), false);
    assert.equal((await learner.request("/api/session")).json.plan, "Free");
    assert.equal((await learner.request("/api/account-auth", { method:"POST",
      body:{ action:"signup", username:"flowlearner", password } })).status, 409);
    const oldCookie = learner.cookie();
    assert.equal((await learner.request("/api/session", { method:"DELETE" })).status, 200);
    assert.equal(learner.cookie(), "");
    assert.equal((await learner.request("/api/session", { headers:{ cookie:oldCookie } })).json.signedIn, false);
    assert.equal((await learner.request("/api/account-auth", { method:"POST",
      body:{ action:"login", username:"FlowLearner", password:"incorrect" } })).status, 401);
    assert.equal((await learner.request("/api/session")).json.signedIn, false);
    const login = await learner.request("/api/account-auth", { method:"POST",
      body:{ action:"login", username:"FLOWLEARNER", password } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.id, userId);
  });

  async function pay(tier, expectedAmount) {
    const checkout = await learner.request("/api/checkout", { method:"POST",
      body:{ tier, provider:"stripe", amount:1, discountPercent:100 } });
    assert.equal(checkout.status, 200);
    const payment = db.collection("payments").rows.find(row => row.tier === tier);
    assert.equal(payment.amount_minor, expectedAmount);
    assert.equal(payment.status, "pending");
    assert.equal(merchantCalls.at(-1).get("line_items[0][price_data][unit_amount]"), String(expectedAmount));
    assert.equal((await learner.request("/api/concepts?id=micro-pattern-strategy")).status, 403);
    const rawBody = JSON.stringify({ type:"checkout.session.completed", data:{ object:{
      id:payment.provider_reference, payment_status:"paid", amount_total:expectedAmount, currency:"inr",
      metadata:{ payment_id:payment.id, tier, user_id:userId },
    } } });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const bad = await learner.request("/api/webhooks/stripe", { method:"POST", rawBody,
      headers:{ "stripe-signature":`t=${timestamp},v1=${"0".repeat(64)}` } });
    assert.equal(bad.status, 401);
    assert.equal(payment.status, "pending");
    const event = { method:"POST", rawBody, headers:{ "stripe-signature":`t=${timestamp},v1=${signature}` } };
    assert.equal((await learner.request("/api/webhooks/stripe", event)).status, 200);
    assert.equal((await learner.request("/api/webhooks/stripe", event)).status, 200);
    assert.equal((await learner.request("/api/session")).json.plan, tier);
  }

  await t.test("Go activates only after the signed payment and cannot be purchased twice", async () => {
    await pay("Go", 75000);
    const questions = await learner.request("/api/questions?topic=C%23%20%2F%20.NET");
    assert.equal(questions.status, 200);
    assert.ok(questions.json.questions.length > 10);
    assert.equal((await learner.request("/api/concepts?id=micro-boundaries")).status, 200);
    assert.equal((await learner.request("/api/concepts?id=micro-pattern-strategy")).status, 403);
    const practice = await learner.request("/DSA.html");
    assert.match(practice.text, /"title":"Pro problem 50","pattern":"Pro practice","locked":true/);
    assert.doesNotMatch(practice.text, /class LRUCache/);
    assert.equal((await learner.request("/api/compile", { method:"POST",
      body:{ language:"javascript", sourceCode:"console.log(1)", stdin:"", expectedOutput:"1" } })).status, 403);
    assert.equal((await learner.request("/api/checkout", { method:"POST",
      body:{ tier:"Go", provider:"stripe" } })).status, 409);
    assert.equal(merchantCalls.length, 1);
  });

  await t.test("Pro activates full patterns and purchase history contains only the owning account's records", async () => {
    await pay("Pro", 250000);
    const lesson = await learner.request("/api/concepts?id=micro-pattern-strategy");
    assert.equal(lesson.status, 200);
    assert.match(lesson.json.lesson.example, /PercentageDiscount/);
    const practice = await learner.request("/DSA.html");
    assert.match(practice.text, /data-guide-access="pro"/);
    assert.match(practice.text, /class LRUCache/);
    assert.match(practice.text, /src="\/coding-runner.js"/);
    const purchases = await learner.request("/api/purchases");
    assert.equal(purchases.status, 200);
    assert.equal(purchases.json.plan, "Pro");
    assert.deepEqual(purchases.json.purchases.map(row => row.amountMinor).sort((a, b) => a - b), [75000, 250000]);
    assert.doesNotMatch(purchases.text, /provider_reference|passwordHash/);
    assert.equal(db.collection("entitlements").rows.length, 2);
    const other = client();
    assert.equal((await other.request("/api/account-auth", { method:"POST",
      body:{ action:"signup", username:"OtherLearner", password } })).status, 201);
    assert.deepEqual((await other.request("/api/purchases")).json.purchases, []);
  });

  await t.test("sign out removes paid access, blocks checkout and revokes the old cookie", async () => {
    lastCookie = learner.cookie();
    assert.equal((await learner.request("/api/session", { method:"DELETE" })).status, 200);
    assert.equal((await learner.request("/api/session")).json.signedIn, false);
    assert.equal((await learner.request("/api/session", { headers:{ cookie:lastCookie } })).json.signedIn, false);
    assert.equal((await learner.request("/api/concepts?id=micro-pattern-strategy")).status, 403);
    assert.equal((await learner.request("/api/purchases")).status, 401);
    assert.equal((await learner.request("/api/checkout", { method:"POST",
      body:{ tier:"Pro", provider:"stripe" } })).status, 401);
    assert.equal((await learner.request("/api/questions?topic=C%23%20%2F%20.NET")).json.questions.length, 10);
    assert.doesNotMatch((await learner.request("/DSA.html")).text, /class LRUCache/);
    assert.equal((await learner.request("/api/compile", { method:"POST",
      body:{ language:"javascript", sourceCode:"console.log(1)", stdin:"", expectedOutput:"1" } })).status, 401);
  });

  await t.test("a new login restores the same account and purchased membership", async () => {
    const login = await learner.request("/api/account-auth", { method:"POST",
      body:{ action:"login", username:"FlowLearner", password } });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.id, userId);
    assert.notEqual(learner.cookie(), lastCookie);
    assert.equal((await learner.request("/api/session")).json.plan, "Pro");
    assert.equal((await learner.request("/api/concepts?id=micro-pattern-strategy")).status, 200);
    assert.equal(db.collection("users").rows.length, 2);
  });
});
