"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const test = require("node:test");
const mongodb = require("mongodb");
const { createDatabase } = require("./helpers/mongo-fixture");

const db = createDatabase();
const descriptor = Object.getOwnPropertyDescriptor(mongodb, "MongoClient");
Object.defineProperty(mongodb, "MongoClient", { configurable: true, value: class {
  async connect() {}
  db() { return db; }
  async close() {}
  async withSession(work) { return work({ withTransaction: callback => db.transaction(callback) }); }
} });
const auth = require("../api/_mongo-auth");
const emailAuth = require("../api/email-auth");
const sessionHandler = require("../api/session");
const roles = require("../api/admin/roles");
const entitlements = require("../api/admin/entitlements");
const concepts = require("../api/concepts");
const { authenticatedUser, getEntitlements, markPaymentPaid } = require("../api/_shared");
const { claimSession, settleSession } = require("../api/_ai-sessions");
const { handleRequest } = require("../server");
const { renderSiteLayout } = require("../api/_site-layout");
const { provisionLocalAdmin, passwordHash, verifyPassword, localAdminAllowed } = require("../api/_local-admin");
const localAdminAuth = require("../api/local-admin-auth");
const { localSettings } = require("../scripts/setup-local-admin");
const originalFetch = global.fetch;
const envNames = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "AUTH_OTP_SECRET",
  "RESEND_API_KEY", "AUTH_EMAIL_FROM", "PUBLIC_APP_URL", "MONGODB_ADMIN_EMAILS", "ADMIN_USER_IDS",
  "NODE_ENV", "VERCEL_ENV", "LOCAL_ADMIN_LOGIN_ENABLED", "VERCEL", "RENDER"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
let messages = [];

function response() {
  return {
    statusCode: 200, headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}
function request(body = {}, cookie = "") {
  return { method: "POST", body, headers: { origin: "https://kr7tech.test", cookie }, socket: { remoteAddress: "127.0.0.1" } };
}
function cookieHeader(res) {
  const cookies = res.headers["set-cookie"];
  return (Array.isArray(cookies) ? cookies : [cookies]).filter(Boolean).map(value => value.split(";")[0]).join("; ");
}
async function login(email = "student@example.test", role = "student") {
  const start = response();
  await emailAuth(request({ action: "request", email, role }), start);
  assert.equal(start.statusCode, 202);
  const code = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  const finish = response();
  await emailAuth(request({ action: "verify", email, code }, cookieHeader(start)), finish);
  assert.equal(finish.statusCode, 200);
  return { cookie: cookieHeader(finish), user: finish.body.user, start, finish, code };
}

test.beforeEach(() => {
  db.reset();
  messages = [];
  Object.assign(process.env, {
    AUTH_PROVIDER: "mongodb", MONGODB_URI: "mongodb://fixture.invalid", MONGODB_DATABASE: "fixture",
    AUTH_OTP_SECRET: "a".repeat(64), RESEND_API_KEY: "test-mail-key", AUTH_EMAIL_FROM: "login@example.test",
    PUBLIC_APP_URL: "https://kr7tech.test", MONGODB_ADMIN_EMAILS: "owner@example.test", ADMIN_USER_IDS: "",
    NODE_ENV: "production",
  });
  delete process.env.VERCEL_ENV;
  delete process.env.LOCAL_ADMIN_LOGIN_ENABLED;
  delete process.env.VERCEL;
  delete process.env.RENDER;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails", "MongoDB sign-in must not contact Supabase");
    messages.push(JSON.parse(options.body));
    return { ok: true };
  };
});
test.after(() => {
  global.fetch = originalFetch;
  Object.defineProperty(mongodb, "MongoClient", descriptor);
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("email OTP creates an account with hashed credentials, HTTP-only cookies, and no paid access", async () => {
  const result = await login("Student@Example.test", "expert");
  assert.equal(result.user.email, "student@example.test");
  assert.equal(result.user.role, "expert");
  assert.equal(db.collection("users").rows.length, 1);
  assert.equal(db.collection("auth_sessions").rows.length, 1);
  assert.equal(JSON.stringify(result.finish.body).includes("token"), false);
  assert.equal(JSON.stringify(db.collection("otp_challenges").rows).includes(result.code), false);
  const sessionCookie = result.finish.headers["set-cookie"][0];
  assert.match(sessionCookie, /^__Host-kr7_session=kr7_/);
  assert.match(sessionCookie, /HttpOnly; SameSite=Lax; Max-Age=604800; Secure/);
  assert.equal(JSON.stringify(db.collection("auth_sessions").rows).includes(result.cookie.split("=")[1]), false);
  assert.equal(result.start.body.flow, undefined);
  const session = response();
  await sessionHandler({ ...request({}, result.cookie), method: "GET" }, session);
  assert.equal(session.body.signedIn, true);
  assert.equal(session.body.plan, "Free");
  assert.deepEqual(await getEntitlements(result.user.id), []);
  const lesson = response();
  await concepts({ ...request({}, result.cookie), method: "GET", query: { id: require("../api/_concept-lessons")[0].id } }, lesson);
  assert.equal(lesson.statusCode, 403);
});

test("OTP verification rejects another browser, enforces five attempts, and blocks replay", async () => {
  const result = await login();
  const replay = response();
  await emailAuth(request({ action: "verify", email: result.user.email, code: result.code }, cookieHeader(result.start)), replay);
  assert.equal(replay.statusCode, 401);
  assert.equal(db.collection("auth_sessions").rows.length, 1);
  db.reset();
  const start = response();
  await emailAuth(request({ action: "request", email: "other@example.test" }), start);
  const code = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  const noFlow = response();
  await emailAuth(request({ action: "verify", email: "other@example.test", code }), noFlow);
  assert.equal(noFlow.statusCode, 400);
  assert.equal(db.collection("otp_challenges").rows[0].attempts, 0);
  for (let index = 0; index < 5; index++) {
    const wrong = response();
    await emailAuth(request({ action: "verify", email: "other@example.test", code: code === "999999" ? "999998" : "999999" }, cookieHeader(start)), wrong);
    assert.equal(wrong.statusCode, 401);
  }
  const exhausted = response();
  await emailAuth(request({ action: "verify", email: "other@example.test", code }, cookieHeader(start)), exhausted);
  assert.equal(exhausted.statusCode, 401);
  assert.equal(db.collection("auth_sessions").rows.length, 0);
});

test("expired OTPs fail even before TTL cleanup and resend invalidates the previous browser flow", async () => {
  let time = new Date();
  const deliveries = [];
  const service = auth.createOtpService({ db, now: () => time, deliver: async (email, code) => deliveries.push(code) });
  const first = await service.request("person@example.test", "student", "ip");
  const cooldown = await service.request("person@example.test", "student", "ip");
  assert.equal(cooldown.status, 429);
  time = new Date(time.getTime() + 61000);
  const second = await service.request("person@example.test", "expert", "ip");
  assert.equal(second.status, 202);
  assert.equal((await service.verify("person@example.test", deliveries[0], first.flow, "ip")).status, 401);
  time = new Date(time.getTime() + 601000);
  assert.equal((await service.verify("person@example.test", deliveries[1], second.flow, "ip")).status, 401);
  assert.equal(db.collection("users").rows.length, 0);
});

test("simultaneous valid OTP submissions consume a challenge only once", async () => {
  let code;
  const service = auth.createOtpService({ db, deliver: async (email, value) => { code = value; } });
  const start = await service.request("person@example.test", "student", "ip");
  const attempts = await Promise.all([
    service.verify("person@example.test", code, start.flow, "ip"),
    service.verify("person@example.test", code, start.flow, "ip"),
  ]);
  assert.deepEqual(attempts.map(result => result.status).sort(), [200, 401]);
  assert.equal(db.collection("users").rows.length, 1);
  assert.equal(db.collection("auth_sessions").rows.length, 1);
});

test("OTP mail failures, request limits, cross-origin requests, and role injection fail safely", async () => {
  const injected = response();
  await emailAuth(request({ action: "request", email: "person@example.test", role: "admin" }), injected);
  assert.equal(injected.statusCode, 400);
  const crossOrigin = response();
  const req = request({ action: "request", email: "person@example.test" });
  req.headers.origin = "https://attacker.test";
  await emailAuth(req, crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);
  assert.equal(messages.length, 0);
  const failed = auth.createOtpService({ db, deliver: async () => { throw new Error("mail failed"); } });
  assert.equal((await failed.request("failed@example.test", "student", "ip")).status, 503);
  assert.equal(db.collection("otp_challenges").rows[0].used, true);
  db.reset();
  const service = auth.createOtpService({ db, deliver: async () => {} });
  for (let index = 0; index < 10; index++) assert.equal((await service.request(`person${index}@example.test`, "student", "same-ip")).status, 202);
  assert.equal((await service.request("overflow@example.test", "student", "same-ip")).status, 429);
});

test("existing roles survive signup choices; only a verified administrator assigns roles and entitlements", async () => {
  const student = await login();
  const forbidden = response();
  await roles(request({ userId: student.user.id, role: "expert" }, student.cookie), forbidden);
  assert.equal(forbidden.statusCode, 403);
  const forbiddenPlan = response();
  await entitlements(request({ userId: student.user.id, tier: "Pro", active: true }, student.cookie), forbiddenPlan);
  assert.equal(forbiddenPlan.statusCode, 403);
  const owner = await login("owner@example.test");
  assert.equal(owner.user.role, "admin");
  const assignment = response();
  await roles(request({ userId: student.user.id, role: "expert" }, owner.cookie), assignment);
  assert.equal(assignment.statusCode, 200);
  assert.equal((await authenticatedUser(request({}, student.cookie))).role, "expert");
  const challenge = db.collection("otp_challenges").rows.find(row => row.email === student.user.email);
  challenge.nextSendAt = new Date(0);
  const relogin = await login(student.user.email, "student");
  assert.equal(relogin.user.role, "expert");
  const grant = response();
  await entitlements(request({ userId: student.user.id, tier: "Go", active: true }, owner.cookie), grant);
  assert.equal(grant.statusCode, 200);
  const session = response();
  await sessionHandler({ ...request({}, student.cookie), method: "GET" }, session);
  assert.equal(session.body.plan, "Go");
  const invalidAdmin = response();
  await roles(request({ userId: student.user.id, role: "admin" }, owner.cookie), invalidAdmin);
  assert.equal(invalidAdmin.statusCode, 400);
});

test("sign-out revokes the server session; expiry and disabled accounts ignore forged bearer credentials", async () => {
  const result = await login();
  const expired = db.collection("auth_sessions").rows[0];
  expired.expiresAt = new Date(0);
  assert.equal(await authenticatedUser(request({}, result.cookie)), null);
  expired.expiresAt = new Date(Date.now() + 60000);
  db.collection("users").rows[0].disabled = true;
  assert.equal(await authenticatedUser(request({}, result.cookie)), null);
  db.collection("users").rows[0].disabled = false;
  const noCookie = request();
  noCookie.headers.authorization = `Bearer ${result.cookie.split("=")[1]}`;
  assert.equal(await authenticatedUser(noCookie), null);
  const logout = response();
  await sessionHandler({ ...request({}, result.cookie), method: "DELETE" }, logout);
  assert.equal(logout.body.signedIn, false);
  assert.equal(await authenticatedUser(request({}, result.cookie)), null);
  assert.equal(db.collection("auth_sessions").rows.length, 0);
});

test("MongoDB Go cannot start AI interviews; Pro sessions preserve retries and ownership", async () => {
  const student = await login();
  const userId = student.user.id;
  await db.collection("entitlements").insertOne({ id: crypto.randomUUID(), user_id: userId, tier: "Go", active: true });
  const body = { action: "start", topic: "SQL", experience: "3-5 years", role: "Developer", turns: [] };
  assert.equal((await claimSession(userId, body)).status, 403);
  await db.collection("entitlements").insertOne({ id: crypto.randomUUID(), user_id: userId, tier: "Pro", active: true });
  const first = await claimSession(userId, body);
  assert.equal(first.plan, "Pro");
  assert.equal(await settleSession(userId, first, 0, false), true);
  const next = await claimSession(userId, body);
  assert.equal(next.plan, "Pro");
  assert.equal(await settleSession(userId, next, 0, true), true);
  const another = await claimSession(userId, body);
  assert.equal(another.plan, "Pro");
  const answer = { ...body, action: "answer", interviewId: next.sessionId, turns: [{}] };
  const claim = await claimSession(userId, answer);
  assert.equal(claim.plan, "Pro");
  assert.equal((await claimSession(userId, answer)).status, 409);
  assert.equal(await settleSession("other-user", claim, 1, true), false);
  assert.equal(await settleSession(userId, claim, 1, true), true);
  assert.equal((await claimSession(userId, answer)).status, 409);
});

test("payment activation matches stored purchases and remains idempotent after a manual revocation", async () => {
  const student = await login();
  const id = crypto.randomUUID();
  await db.collection("payments").insertOne({ id, user_id: student.user.id, provider: "stripe",
    provider_reference: "checkout-verified", tier: "Pro", status: "pending", amount_minor: 500000, currency: "INR" });
  await assert.rejects(markPaymentPaid("stripe", "checkout-verified", id, "Pro", student.user.id, 100000, "INR"));
  assert.equal(db.collection("payments").rows[0].status, "pending");
  assert.deepEqual(await getEntitlements(student.user.id), []);
  await markPaymentPaid("stripe", "checkout-verified", id, "Pro", student.user.id, 500000, "INR");
  assert.equal(db.collection("payments").rows[0].status, "paid");
  assert.equal((await getEntitlements(student.user.id))[0].tier, "Pro");
  db.collection("entitlements").rows[0].active = false;
  await markPaymentPaid("stripe", "checkout-verified", id, "Pro", student.user.id, 500000, "INR");
  assert.deepEqual(await getEntitlements(student.user.id), []);
});

test("MongoDB website rendering directs account links to OTP and request routing rejects cross-origin writes", async () => {
  const html = '<html><head></head><body><header><nav>Old</nav></header><main><a href="Company-Interviews.html#access-heading">Sign in</a></main></body></html>';
  const rendered = renderSiteLayout(html, "AI-Interview.html");
  assert.match(rendered, /data-auth-provider="mongodb"/);
  assert.match(rendered, /href="\/Account.html">Sign in/);
  assert.match(rendered, /href="\/Account.html">Account/);
  const req = Readable.from([JSON.stringify({ action: "request", email: "person@example.test" })]);
  req.method = "POST";
  req.url = "/api/email-auth";
  req.headers = { host: "kr7tech.test", origin: "https://attacker.test", "content-type": "application/json" };
  const res = response();
  res.end = function (body) { this.body = JSON.parse(body); this.writableEnded = true; };
  await handleRequest(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(messages.length, 0);
  const google = response();
  await require("../api/google-auth")({ method: "GET", headers: {} }, google);
  assert.equal(google.body.enabled, false);
});

test("MongoDB community submission limits retain the rolling five-per-hour allowance", async () => {
  const { mongoRest } = require("../api/_mongo-data");
  const take = () => mongoRest("rpc/kr7_take_community_slot", { method: "POST",
    body: JSON.stringify({ p_fingerprint: "hashed-network" }) });
  for (let index = 0; index < 5; index++) assert.equal(await take(), true);
  assert.equal(await take(), false);
  db.collection("auth_rate_limits").rows[0].expiresAt = new Date(0);
  assert.equal(await take(), true);
});

function enableLocalAdmin() {
  process.env.NODE_ENV = "development";
  process.env.LOCAL_ADMIN_LOGIN_ENABLED = "true";
  process.env.PUBLIC_APP_URL = "http://127.0.0.1:10000";
}

function localRequest(body, cookie = "") {
  const req = request(body, cookie);
  req.headers.origin = "http://127.0.0.1:10000";
  req.headers.host = "127.0.0.1:10000";
  return req;
}

test("local administrator credentials are salted hashes and an issued cookie opens the administrator dashboard", async () => {
  enableLocalAdmin();
  const password = crypto.randomBytes(16).toString("base64url");
  const firstHash = await passwordHash(password);
  assert.notEqual(await passwordHash(password), firstHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword("incorrect", firstHash), false);
  const admin = await provisionLocalAdmin(db, "Admin", password);
  assert.equal(db.collection("users").rows[0].passwordHash.includes(password), false);
  const res = response();
  await localAdminAuth(localRequest({ username: "Admin", password }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.localOnly, true);
  assert.equal(res.body.token, undefined);
  assert.match(res.headers["set-cookie"], /HttpOnly; SameSite=Lax; Max-Age=3600/);
  const session = response();
  await sessionHandler({ ...localRequest({}, cookieHeader(res)), method: "GET" }, session);
  assert.equal(session.body.user.role, "admin");
  assert.equal(session.body.user.username, "Admin");
  assert.equal(session.body.user.localOnly, true);
  assert.equal(session.body.user.passwordHash, undefined);
  const role = response();
  await roles(localRequest({ userId: admin.id, role: "expert" }, cookieHeader(res)), role);
  assert.equal(role.statusCode, 200);
});

test("local administrator login and existing cookies are denied in production, on hosted services, and off loopback", async () => {
  enableLocalAdmin();
  const password = crypto.randomBytes(16).toString("base64url");
  await provisionLocalAdmin(db, "Admin", password);
  const login = response();
  await localAdminAuth(localRequest({ username: "Admin", password }), login);
  const cookie = cookieHeader(login);
  for (const [name, value] of [["NODE_ENV", "production"], ["VERCEL_ENV", "production"], ["VERCEL", "1"], ["RENDER", "true"]]) {
    const previous = process.env[name];
    process.env[name] = value;
    const denied = response();
    await localAdminAuth(localRequest({ username: "Admin", password }), denied);
    assert.equal(denied.statusCode, 404, name);
    assert.equal(await authenticatedUser(localRequest({}, cookie)), null, name);
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
  const remote = localRequest({ username: "Admin", password }, cookie);
  remote.socket.remoteAddress = "192.0.2.1";
  assert.equal(localAdminAllowed(remote), false);
  assert.equal(await authenticatedUser(remote), null);
  remote.socket.remoteAddress = "127.0.0.1";
  remote.headers.host = "kr7tech.test";
  assert.equal(localAdminAllowed(remote), false);
  assert.equal(await authenticatedUser(remote), null);
});

test("local administrator login rejects cross-site and wrong passwords, rate-limits attempts, and rotates sessions on reprovision", async () => {
  enableLocalAdmin();
  const password = crypto.randomBytes(16).toString("base64url");
  await provisionLocalAdmin(db, "Admin", password);
  const cross = localRequest({ username: "Admin", password });
  cross.headers.origin = "https://attacker.test";
  const rejected = response();
  await localAdminAuth(cross, rejected);
  assert.equal(rejected.statusCode, 403);
  const good = response();
  await localAdminAuth(localRequest({ username: "Admin", password }), good);
  const cookie = cookieHeader(good);
  const wrong = response();
  await localAdminAuth(localRequest({ username: "Admin", password: "incorrect" }), wrong);
  assert.equal(wrong.statusCode, 401);
  await provisionLocalAdmin(db, "Admin", crypto.randomBytes(16).toString("base64url"));
  assert.equal(await authenticatedUser(localRequest({}, cookie)), null);
  for (let index = 0; index < 8; index++) {
    await localAdminAuth(localRequest({ username: "Admin", password: "incorrect" }), response());
  }
  const limited = response();
  await localAdminAuth(localRequest({ username: "Admin", password: "incorrect" }), limited);
  assert.equal(limited.statusCode, 429);
});

test("local provisioning never overwrites a normal account, and a test admin cannot obtain an email OTP session", async () => {
  enableLocalAdmin();
  const password = crypto.randomBytes(16).toString("base64url");
  await db.collection("users").insertOne({ id: crypto.randomUUID(), loginName: "admin", email: "student@example.test",
    role: "student", disabled: false });
  await assert.rejects(provisionLocalAdmin(db, "Admin", password), /Refusing/);
  db.reset();
  await provisionLocalAdmin(db, "Admin", password);
  const start = response();
  await emailAuth(localRequest({ action: "request", email: "admin@local-admin.kr7tech.invalid" }), start);
  const code = messages.at(-1).text.match(/\b\d{6}\b/)[0];
  const finish = response();
  await emailAuth(localRequest({ action: "verify", email: "admin@local-admin.kr7tech.invalid", code }, cookieHeader(start)), finish);
  assert.equal(finish.statusCode, 403);
  assert.equal(db.collection("auth_sessions").rows.length, 0);
});

test("local environment provisioning preserves unrelated settings without duplicating private keys", () => {
  const source = "UNRELATED_KEY=keep\nAUTH_PROVIDER=supabase\nAUTH_PROVIDER=supabase\n";
  const result = localSettings(source, { AUTH_PROVIDER: "mongodb", MONGODB_URI: "mongodb://fixture.invalid" });
  assert.match(result, /UNRELATED_KEY=keep/);
  assert.equal(result.match(/^AUTH_PROVIDER=/gm).length, 1);
  assert.match(result, /AUTH_PROVIDER="mongodb"/);
  assert.match(result, /MONGODB_URI="mongodb:\/\/fixture.invalid"/);
});
