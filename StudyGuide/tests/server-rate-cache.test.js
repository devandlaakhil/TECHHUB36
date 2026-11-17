"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const mongodb = require("mongodb");
const { createDatabase } = require("./helpers/mongo-fixture");

const db = createDatabase();
const mongoClientDescriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
Object.defineProperty(mongodb, "MongoClient", { configurable: true, value: class {
  async connect() {}
  db() { return db; }
  async close() {}
  async withSession(work) { return work({ withTransaction: callback => db.transaction(callback) }); }
} });

const { createServer } = require("../server");
const envNames = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "AUTH_OTP_SECRET",
  "NODE_ENV", "PUBLIC_APP_URL", "VERCEL", "RENDER"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

test.beforeEach(() => {
  db.reset();
  Object.assign(process.env, {
    AUTH_PROVIDER: "mongodb",
    MONGODB_URI: "mongodb://fixture.invalid",
    MONGODB_DATABASE: "fixture",
    AUTH_OTP_SECRET: "a".repeat(64),
    NODE_ENV: "production",
  });
  for (const name of ["PUBLIC_APP_URL", "VERCEL", "RENDER"]) delete process.env[name];
});

test.after(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  Object.defineProperty(mongodb, "MongoClient", mongoClientDescriptor);
});

async function startServer(t) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("public assets use bounded caching and ETags while HTML revalidates", async t => {
  const base = await startServer(t);
  const asset = await fetch(`${base}/site.css`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control"), /public, max-age=300/);
  const etag = asset.headers.get("etag");
  assert.ok(etag);
  assert.ok((await asset.text()).length > 100);

  const cachedAsset = await fetch(`${base}/site.css`, { headers: { "If-None-Match": etag } });
  assert.equal(cachedAsset.status, 304);
  assert.equal(await cachedAsset.text(), "");

  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-cache");
  const cachedPage = await fetch(`${base}/`, { headers: { "If-None-Match": page.headers.get("etag") } });
  assert.equal(cachedPage.status, 304);

  const worker = await fetch(`${base}/service-worker.js`);
  assert.equal(worker.headers.get("cache-control"), "no-cache");
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.headers.get("cache-control"), "no-store, max-age=0");
});

test("expensive API writes are rate limited across requests using MongoDB", async t => {
  const base = await startServer(t);
  process.env.NODE_ENV = "development";
  process.env.PUBLIC_APP_URL = base;
  const sendCheckout = () => fetch(`${base}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: "{}",
  });

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await sendCheckout();
    assert.equal(response.status, 401);
  }
  const limited = await sendCheckout();
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(limited.headers.get("ratelimit-limit"), "10");
  assert.equal(limited.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal(db.collection("auth_rate_limits").rows.filter(row => row._id.startsWith("api:")).length, 1);
});
