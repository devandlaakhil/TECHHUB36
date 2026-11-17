"use strict";

const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { createAccountStore, AccountInputError } = require("./local-preview-accounts");
const { parseQuery } = require("../api/_mongo-data");
const { contentRecords } = require("./seed-mongodb");
const { tierAmount, planOffers } = require("../api/_pricing");
const COOKIE = "kr7_preview_session";
const BANNER = '<aside role="note" style="padding:12px 20px;background:#18364d;color:#e3f3ff;text-align:center;font:14px/1.5 Segoe UI,sans-serif"><strong>KR7Tech Version 1 - LOCAL PREVIEW</strong> | Test account and local content only. No database, email, payment, live AI or remote compiler calls. <a href="/Account.html" style="color:#a7e2ff">Preview account</a></aside>';

function isHosted() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
    Boolean(process.env.VERCEL || process.env.RENDER);
}

function localClient(req) {
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket?.remoteAddress)) return false;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(`http://${req.headers.host}`).hostname); }
  catch { return false; }
}

function createPreview({ username, credential, userId = crypto.randomUUID(), port = 10000, accountFile }) {
  if (isHosted()) throw new Error("Offline preview cannot run on a hosted or production deployment.");
  if (!/^[a-z][a-z0-9_]{2,31}$/i.test(username || "") ||
      !/^scrypt-v1:[a-f0-9]{64}:[a-f0-9]{128}$/.test(credential || "") ||
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(userId) ||
      !Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid private preview settings.");
  const origin = `http://127.0.0.1:${port}`;
  const user = { id: userId, username, email: `${username.toLowerCase()}@local-preview.kr7tech.invalid`,
    role: "admin", localOnly: true, localPreview: true };
  const accounts = createAccountStore({ file: accountFile, bootstrap: { ...user, passwordHash: credential } });
  const records = contentRecords();
  records.entitlements = [user, ...accounts.users()].filter(account => account.role === "admin")
    .map(account => ({ id: crypto.randomUUID(), user_id: account.id, tier: "Pro", active: true }));
  const sessions = new Map();
  const attempts = new Map();
  const environmentNames = ["AUTH_PROVIDER", "MONGODB_URI", "MONGODB_DATABASE", "PUBLIC_APP_URL"];
  const previousEnvironment = Object.fromEntries(environmentNames.map(name => [name, process.env[name]]));
  Object.assign(process.env, {
    AUTH_PROVIDER: "mongodb", MONGODB_URI: "mongodb://offline-preview.invalid",
    MONGODB_DATABASE: "offline-preview", PUBLIC_APP_URL: origin,
  });

  function digest(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
  function readToken(req) {
    return (req.headers.cookie || "").split(";").map(value => value.trim())
      .find(value => value.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  }
  async function authenticatedUser(req) {
    if (!localClient(req)) return null;
    const token = readToken(req);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token || "")) return null;
    const key = digest(token);
    const session = sessions.get(key);
    if (!session) return null;
    if (session.expires <= Date.now()) { sessions.delete(key); return null; }
    return accounts.get(session.userId);
  }
  async function getEntitlements(id) {
    return records.entitlements.filter(record => record.user_id === id && record.active).map(record => ({ ...record }));
  }
  async function rest(value, options = {}) {
    if (value.startsWith("rpc/")) throw new Error("Live database operations are disabled in offline preview.");
    const { table, params, filter, projection, sort } = parseQuery(value);
    if (table === "profiles") {
      const account = accounts.get(filter.id);
      return account ? [{ is_admin: account.role === "admin" }] : [];
    }
    if (!Object.hasOwn(records, table)) throw new Error("That integration is not available in offline preview.");
    const selected = records[table].filter(record => Object.entries(filter).every(([key, match]) => record[key] === match));
    const method = options.method || "GET";
    if (method === "GET") {
      selected.sort((left, right) => {
        for (const [field, direction] of Object.entries(sort)) {
          const compared = String(left[field] ?? "").localeCompare(String(right[field] ?? ""));
          if (compared) return compared * direction;
        }
        return 0;
      });
      const fields = Object.keys(projection).filter(field => projection[field] === 1);
      return selected.slice(0, Number(params.get("limit")) || 10000).map(record => fields.length
        ? Object.fromEntries(fields.filter(field => Object.hasOwn(record, field)).map(field => [field, record[field]]))
        : { ...record });
    }
    if (table !== "entitlements") throw new Error("Only preview access settings can change.");
    const body = JSON.parse(options.body || "{}");
    if (method === "POST") {
      if (!accounts.get(body.user_id)) throw new Error("That local preview account does not exist.");
      const record = { id: crypto.randomUUID(), ...body };
      records.entitlements.push(record);
      return [{ ...record }];
    }
    if (method === "PATCH" && Object.keys(filter).length) {
      selected.forEach(record => Object.assign(record, body));
      return null;
    }
    throw new Error("Unsupported preview operation.");
  }

  // The standalone launcher supplies local services before API modules load.
  // No production authentication code or database client is modified on disk.
  const shared = require("../api/_shared");
  const originalServices = { authenticatedUser: shared.authenticatedUser,
    getEntitlements: shared.getEntitlements, supabaseRest: shared.supabaseRest };
  Object.assign(shared, { authenticatedUser, getEntitlements, supabaseRest: rest });
  const { handleRequest } = require("../server");

  function json(res, status, body) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(JSON.stringify(body));
  }
  async function readBody(req) {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 4096) throw new Error("Request too large.");
    }
    return JSON.parse(text || "{}");
  }
  function rateLimited(kind) {
    const slot = `${kind}:${Math.floor(Date.now() / 900000)}`;
    for (const key of attempts.keys()) {
      if (!key.endsWith(`:${Math.floor(Date.now() / 900000)}`)) attempts.delete(key);
    }
    const count = (attempts.get(slot) || 0) + 1;
    attempts.set(slot, count);
    return count > 10;
  }
  function signIn(req, res, account) {
    const previous = readToken(req);
    if (previous) sessions.delete(digest(previous));
    const token = crypto.randomBytes(32).toString("base64url");
    for (const [key, session] of sessions) if (session.expires <= Date.now()) sessions.delete(key);
    sessions.set(digest(token), { userId: account.id, expires: Date.now() + 3600000 });
    res.setHeader("Set-Cookie", `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600`);
  }
  async function handle(req, res) {
    if (!localClient(req)) return json(res, 403, { error: "Offline preview is available on localhost only." });
    if (!["GET", "HEAD"].includes(req.method) &&
        (req.headers.origin !== origin || req.headers["sec-fetch-site"] === "cross-site")) {
      return json(res, 403, { error: "Use the local preview website." });
    }
    const pathname = new URL(req.url, origin).pathname;
    if (pathname === "/api/account-auth") {
      if (req.method === "GET") return json(res, 200, { enabled: true, localPreview: true });
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
      let input;
      try { input = await readBody(req); }
      catch { return json(res, 400, { error: "Enter a username and password." }); }
      if (!input || !["signup", "login"].includes(input.action) ||
          typeof input.username !== "string" || input.username.length > 32 ||
          typeof input.password !== "string" || !input.password || input.password.length > 256) {
        return json(res, 400, { error: "Choose Create account or Login and enter your username and password." });
      }
      if (rateLimited(input.action)) return json(res, 429, { error: "Too many account attempts. Try again in 15 minutes." });
      let account;
      try {
        account = input.action === "signup" ? await accounts.register(input)
          : await accounts.login(input.username, input.password);
      } catch (error) {
        return json(res, error instanceof AccountInputError ? error.status : 503, {
          error: error instanceof AccountInputError ? error.message : "The private preview account could not be saved.",
        });
      }
      if (!account) return json(res, 401, { error: "Incorrect username or password." });
      signIn(req, res, account);
      return json(res, input.action === "signup" ? 201 : 200, { signedIn: true, localPreview: true, user: account });
    }
    if (pathname === "/api/local-preview-accounts") {
      if (req.method === "GET") return json(res, 200, { enabled: true,
        firstAdminAvailable: accounts.firstAdminAvailable(), signedIn: Boolean(await authenticatedUser(req)) });
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
      if (rateLimited("signup")) return json(res, 429, { error: "Too many account requests. Try again in 15 minutes." });
      let input;
      try { input = await readBody(req); }
      catch { return json(res, 400, { error: "Enter valid account details." }); }
      if (!input || typeof input !== "object" || Array.isArray(input)) return json(res, 400, { error: "Enter valid account details." });
      let account;
      try { account = await accounts.register(input, { grantOwner: true }); }
      catch (error) {
        return json(res, error instanceof AccountInputError ? error.status : 503, {
          error: error instanceof AccountInputError ? error.message : "The private local account could not be saved. No account was created.",
        });
      }
      if (account.role === "admin") records.entitlements.push({
        id: crypto.randomUUID(), user_id: account.id, tier: "Pro", active: true,
      });
      signIn(req, res, account);
      return json(res, 201, { signedIn: true, localPreview: true, user: account });
    }
    if (pathname === "/api/local-admin-auth") {
      if (req.method === "GET") return json(res, 200, { enabled: true, localPreview: true });
      if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });
      if (rateLimited("login")) return json(res, 429, { error: "Too many preview sign-in attempts. Try again in 15 minutes." });
      let body;
      try { body = await readBody(req); }
      catch { return json(res, 400, { error: "Enter the preview username and password." }); }
      if (!body || typeof body.username !== "string" || body.username.length > 254 || typeof body.password !== "string" ||
          body.password.length > 256 || !body.password) {
        return json(res, 400, { error: "Enter the preview username and password." });
      }
      const account = await accounts.login(body.username, body.password);
      if (!account) {
        return json(res, 401, { error: "Incorrect preview username/email or password." });
      }
      signIn(req, res, account);
      return json(res, 200, { signedIn: true, localOnly: true, localPreview: true });
    }
    if (pathname === "/api/session") {
      if (req.method === "DELETE") {
        const token = readToken(req);
        if (token) sessions.delete(digest(token));
        res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
        return json(res, 200, { provider: "mongodb", signedIn: false, localPreview: true });
      }
      if (req.method !== "GET") return json(res, 405, { error: "Use local preview sign-in." });
      const account = await authenticatedUser(req);
      const entitlements = account ? await getEntitlements(account.id) : [];
      const plan = entitlements.some(record => record.tier === "Pro") ? "Pro"
        : entitlements.some(record => record.tier === "Go") ? "Go" : "Free";
      return json(res, 200, { provider: "mongodb", signedIn: Boolean(account), localPreview: true,
        ...(account ? { user: account, plan } : {}) });
    }
    if (pathname === "/api/config") return json(res, 200, {
      authProvider: "mongodb", emailOtpEnabled: false, localPreview: true,
      supabaseUrl: null, supabaseAnonKey: null, compilerConfigured: false,
      providers: { razorpay: false, stripe: false, paypal: false },
      plans: { L1: 500, L2: 500, L3: 500, Go:tierAmount("Go") / 100, Pro:tierAmount("Pro") / 100 },
      planOffers:planOffers(),
      planBenefits: { Go: { interviewQA: true, concepts: false, aiInterview: false },
        Pro: { interviewQA: true, concepts: true, aiInterview: true, allContent: true } },
      paypalAmounts: {}, paypalTiers: { Go: false, Pro: false },
    });
    if (["/api/email-auth", "/api/google-auth", "/api/pro-access", "/api/local-pro-access"].includes(pathname)) {
      return json(res, req.method === "GET" ? 200 : 503, {
        enabled: false, error: "Use the local administrator form for this offline preview.",
      });
    }
    if (pathname === "/api/community") return json(res, req.method === "GET" ? 200 : 503,
      req.method === "GET" ? { enabled: false, supportEmail: null, feedback: [] }
        : { error: "Contact and feedback submissions are disabled in offline preview." });
    if (["/api/checkout", "/api/paypal/capture", "/api/ai-interview", "/api/compile", "/api/admin/roles"].includes(pathname) ||
        pathname.startsWith("/api/webhooks/")) {
      return json(res, 503, { error: "This integration is disabled in offline preview. No external request or real account change was made." });
    }
    const end = res.end;
    res.end = function (body, ...args) {
      if ((typeof body === "string" || Buffer.isBuffer(body)) &&
          String(res.getHeader("Content-Type") || "").startsWith("text/html")) {
        const isBuffer = Buffer.isBuffer(body);
        const html = isBuffer ? body.toString("utf8") : body;
        const previewHtml = html.replace(/<body\b[^>]*>/i, match => `${match}${BANNER}`);
        body = isBuffer ? Buffer.from(previewHtml) : previewHtml;
      }
      return end.call(this, body, ...args);
    };
    return handleRequest(req, res);
  }
  function restore() {
    Object.assign(shared, originalServices);
    for (const key of environmentNames) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnvironment[key];
    }
  }
  return { handle, restore, origin };
}

if (require.main === module) {
  if (isHosted()) {
    console.error("Offline preview is not available on production or hosted deployments.");
    process.exitCode = 1;
  } else {
    require("../server").loadLocalEnvironment();
    if (process.env.LOCAL_PREVIEW_ENABLED !== "true") {
      console.error("Run the private local preview setup first.");
      process.exitCode = 1;
    } else {
      try {
        const preview = createPreview({
          username: process.env.LOCAL_PREVIEW_USERNAME, credential: process.env.LOCAL_PREVIEW_PASSWORD_HASH,
          userId: process.env.LOCAL_PREVIEW_ADMIN_ID, port: Number(process.env.LOCAL_PREVIEW_PORT || 10000),
          accountFile: path.join(__dirname, "..", ".local-preview", "accounts.json"),
        });
        const server = http.createServer((req, res) => {
          preview.handle(req, res).catch(() => {
            if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "The local preview request could not be completed." }));
          });
        });
        server.on("error", () => { console.error("The local preview port could not be opened."); process.exitCode = 1; });
        server.listen(Number(process.env.LOCAL_PREVIEW_PORT || 10000), "127.0.0.1",
          () => console.log(`KR7Tech Version 1 preview: ${preview.origin}/Account.html`));
      } catch {
        console.error("Local preview could not start. Check the ignored local preview configuration.");
        process.exitCode = 1;
      }
    }
  }
}

module.exports = { createPreview };
