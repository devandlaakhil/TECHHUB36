"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const mongodb = require("mongodb");
const { createDatabase } = require("./helpers/mongo-fixture");
const db = createDatabase();
const descriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
Object.defineProperty(mongodb, "MongoClient", { configurable: true, value: class {
  async connect() {}
  db() { return db; }
  async close() {}
} });
const handler = require("../api/account-auth");
const sessionHandler = require("../api/session");
const auth = require("../api/_mongo-auth");
const { createPasswordService } = require("../api/_password-auth");
const { getEntitlements } = require("../api/_shared");
const checkout = require("../api/checkout");
const names = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "PUBLIC_APP_URL", "AUTH_OTP_SECRET",
  "NODE_ENV", "VERCEL", "RENDER", "VERCEL_ENV", "MONGODB_ADMIN_EMAILS", "RESEND_API_KEY", "AUTH_EMAIL_FROM",
  "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET", "SALES_ENABLED", "SUPPORT_EMAIL"];
const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
const fetch = global.fetch;
const password = crypto.randomBytes(24).toString("base64url");
function response() {
  return { statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}
function request(body = {}, cookie = "") {
  return { method: "POST", body, headers: { origin: "https://kr7tech.test", cookie },
    socket: { remoteAddress: "127.0.0.1" } };
}
function cookie(res) { return res.headers["set-cookie"]?.[0]?.split(";")[0] || ""; }
async function action(body, session = "") {
  const res = response();
  await handler(request(body, session), res);
  return res;
}
async function session(value) {
  const res = response();
  await sessionHandler({ ...request({}, value), method: "GET" }, res);
  return res.body;
}
test.beforeEach(() => {
  db.reset();
  Object.assign(process.env, { AUTH_PROVIDER: "mongodb", MONGODB_URI: "mongodb://fixture.invalid",
    MONGODB_DATABASE: "fixture", AUTH_OTP_SECRET: "a".repeat(64), PUBLIC_APP_URL: "https://kr7tech.test",
    NODE_ENV: "production", MONGODB_ADMIN_EMAILS: "owner@example.test" });
  for (const name of ["VERCEL", "RENDER", "VERCEL_ENV", "RESEND_API_KEY", "AUTH_EMAIL_FROM"]) delete process.env[name];
  global.fetch = async () => { throw new Error("Username/password login must not send email or contact Supabase."); };
});
test.after(() => {
  Object.defineProperty(mongodb, "MongoClient", descriptor);
  global.fetch = fetch;
  for (const name of names) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

test("signup stores salted MongoDB password hashes and issues a normal Free account without email setup", async () => {
  const availability = response();
  await handler({ ...request(), method: "GET" }, availability);
  assert.equal(availability.body.enabled, true);
  const created = await action({ action: "signup", username: "Learner", password, role: "expert",
    email: "owner@example.test", plan: "Pro", is_admin: true });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.user.username, "Learner");
  assert.equal(created.body.user.role, "expert");
  assert.equal(created.body.user.email, null);
  assert.equal(created.body.user.hasPassword, true);
  assert.equal(created.body.token, undefined);
  assert.equal(created.body.user.passwordHash, undefined);
  assert.match(db.collection("users").rows[0].passwordHash, /^scrypt-v2:/);
  assert.equal(JSON.stringify(db.collection("users").rows).includes(password), false);
  assert.equal(db.collection("users").rows[0].loginName, "learner");
  assert.match(created.headers["set-cookie"][0], /HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
  assert.equal((await session(cookie(created))).plan, "Free");
  assert.deepEqual(await getEntitlements(created.body.user.id), []);
  const second = await action({ action: "signup", username: "Other", password });
  assert.notEqual(db.collection("users").rows[0].passwordHash, db.collection("users").rows[1].passwordHash);
  assert.equal(second.body.user.role, "student");
});

test("logout revokes the session and a fresh service logs in using persisted username/password details", async () => {
  const created = await action({ action: "signup", username: "Learner", password });
  const logout = response();
  await sessionHandler({ ...request({}, cookie(created)), method: "DELETE" }, logout);
  assert.equal((await session(cookie(created))).signedIn, false);
  const freshService = createPasswordService({ db });
  const result = await freshService.perform("login", { username: "LEARNER", password }, "fresh-instance");
  assert.equal(result.status, 200);
  assert.equal(result.user.id, created.body.user.id);
  const loggedIn = await action({ action: "login", username: "Learner", password });
  assert.equal(loggedIn.statusCode, 200);
  assert.equal((await session(cookie(loggedIn))).user.id, created.body.user.id);
  const replaced = await action({ action: "login", username: "Learner", password }, cookie(loggedIn));
  assert.equal(replaced.statusCode, 200);
  assert.equal((await session(cookie(loggedIn))).signedIn, false);
  assert.equal((await session(cookie(replaced))).signedIn, true);
});

test("concurrent duplicate usernames cannot create two accounts and public signup cannot choose Admin", async () => {
  const admin = await action({ action: "signup", username: "Owner", password, role: "admin" });
  assert.equal(admin.statusCode, 400);
  const attempts = await Promise.all([
    action({ action: "signup", username: "Learner", password }),
    action({ action: "signup", username: "LEARNER", password }),
  ]);
  assert.deepEqual(attempts.map(result => result.statusCode).sort(), [201, 409]);
  assert.equal(db.collection("users").rows.length, 1);
});

test("missing, wrong, disabled and test-admin logins share a generic failure and cannot set a cookie", async () => {
  await action({ action: "signup", username: "Learner", password });
  const invalid = await action({ action: "login", username: "Learner", password: "wrong" });
  const absent = await action({ action: "login", username: "Missing", password: "wrong" });
  db.collection("users").rows[0].disabled = true;
  const disabled = await action({ action: "login", username: "Learner", password });
  db.collection("users").rows[0].disabled = false;
  db.collection("users").rows[0].localAdmin = true;
  const local = await action({ action: "login", username: "Learner", password });
  for (const result of [invalid, absent, disabled, local]) {
    assert.equal(result.statusCode, 401);
    assert.equal(result.headers["set-cookie"], undefined);
    assert.deepEqual(result.body, invalid.body);
  }
});

test("existing verified email accounts add login details without changing their identity, role or purchases", async () => {
  const user = { id: crypto.randomUUID(), email: "owner@example.test", emailVerified: true, role: "expert", disabled: false };
  await db.collection("users").insertOne(user);
  await db.collection("entitlements").insertOne({ user_id: user.id, tier: "Pro", active: true });
  const token = await auth.issueSession(db, user);
  const previous = auth.makeCookie("session", token, auth.SESSION_SECONDS).split(";")[0];
  const savedLogin = await action({ action: "set-password", username: "Owner", password }, previous);
  assert.equal(savedLogin.statusCode, 200);
  assert.equal(savedLogin.body.user.id, user.id);
  assert.equal(savedLogin.body.user.role, "admin");
  assert.equal((await session(previous)).signedIn, false);
  assert.equal((await session(cookie(savedLogin))).plan, "Pro");
  const login = await action({ action: "login", username: "Owner", password });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.user.id, user.id);
  const noSession = await action({ action: "set-password", username: "Someone", password });
  assert.equal(noSession.statusCode, 403);
  const overwrite = await action({ action: "set-password", username: "Another", password }, cookie(login));
  assert.equal(overwrite.statusCode, 409);
});

test("short passwords, MongoDB operator injection, cross-site requests and missing setup fail closed", async () => {
  assert.equal((await action({ action: "signup", username: "Learner", password: "four" })).statusCode, 400);
  const minimum = await action({ action: "signup", username: "Minimum", password: "12345" });
  assert.equal(minimum.statusCode, 201);
  assert.equal((await action({ action: "login", username: { $ne: null }, password })).statusCode, 400);
  const cross = response();
  await handler({ ...request({ action: "signup", username: "Learner", password }),
    headers: { origin: "https://attacker.test" } }, cross);
  assert.equal(cross.statusCode, 403);
  assert.equal(db.collection("users").rows.length, 1);
  delete process.env.MONGODB_URI;
  assert.equal((await action({ action: "signup", username: "Learner", password })).statusCode, 503);
});

test("password attempts use persistent identity limits and do not store raw network identifiers", async () => {
  const service = createPasswordService({ db });
  for (let count = 0; count < 10; count++) {
    assert.equal((await service.perform("login", { username: "Missing", password }, "raw-client-address")).status, 401);
  }
  const fresh = createPasswordService({ db });
  assert.equal((await fresh.perform("login", { username: "Missing", password }, "another-client")).status, 429);
  assert.equal(JSON.stringify(db.collection("auth_rate_limits").rows).includes("raw-client-address"), false);
});

test("username-only checkout does not send an internal identifier as a customer email", async () => {
  const created = await action({ action: "signup", username: "Learner", password });
  Object.assign(process.env, { RAZORPAY_KEY_ID: "fixture", RAZORPAY_KEY_SECRET: "fixture", RAZORPAY_WEBHOOK_SECRET: "fixture",
    SALES_ENABLED: "true", SUPPORT_EMAIL: "support@example.test" });
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.razorpay.com/v1/payment_links");
    const payload = JSON.parse(options.body);
    assert.equal(payload.customer, undefined);
    assert.deepEqual(payload.notify, { email: false, sms: false });
    assert.equal(payload.notes.user_id, created.body.user.id);
    return { ok: true, json: async () => ({ id: "fixture-link", short_url: "https://pay.example.test/fixture" }) };
  };
  const res = response();
  await checkout(request({ provider: "razorpay", tier: "Go" }, cookie(created)), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.collection("payments").rows[0].user_id, created.body.user.id);
});
