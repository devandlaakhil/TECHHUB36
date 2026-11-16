"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { renderSiteLayout } = require("./api/_site-layout");
const { mongoEnabled } = require("./api/_mongo");
const { sameOrigin } = require("./api/_mongo-auth");
const { UNAVAILABLE_MESSAGE, sendUnavailable } = require("./api/_availability");

const ROOT = __dirname;
const MAX_API_BODY_BYTES = 1024 * 1024;
const RAW_BODY_ROUTES = new Set([
  "/api/webhooks/stripe",
  "/api/webhooks/razorpay",
]);
const API_ROUTES = new Map([
  ["/api/account-auth", "./api/account-auth.js"],
  ["/api/ai-interview", "./api/ai-interview.js"],
  ["/api/admin/entitlements", "./api/admin/entitlements.js"],
  ["/api/admin/roles", "./api/admin/roles.js"],
  ["/api/email-auth", "./api/email-auth.js"],
  ["/api/local-admin-auth", "./api/local-admin-auth.js"],
  ["/api/checkout", "./api/checkout.js"],
  ["/api/purchases", "./api/purchases.js"],
  ["/api/compile", "./api/compile.js"],
  ["/api/community", "./api/community.js"],
  ["/api/concepts", "./api/concepts.js"],
  ["/api/config", "./api/config.js"],
  ["/api/experience-questions", "./api/experience-questions.js"],
  ["/api/google-auth", "./api/google-auth.js"],
  ["/api/local-pro-access", "./api/local-pro-access.js"],
  ["/api/pro-access", "./api/pro-access.js"],
  ["/api/paypal/capture", "./api/paypal/capture.js"],
  ["/api/questions", "./api/questions.js"],
  ["/api/react-machine-coding", "./api/react-machine-coding.js"],
  ["/api/serve-page", "./api/serve-page.js"],
  ["/api/session", "./api/session.js"],
  ["/api/webhooks/paypal", "./api/webhooks/paypal.js"],
  ["/api/webhooks/razorpay", "./api/webhooks/razorpay.js"],
  ["/api/webhooks/stripe", "./api/webhooks/stripe.js"],
]);
const PAGE_REWRITES = new Map(
  JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).rewrites
    .map(route => [decodeURIComponent(route.source).toLowerCase(), route.destination]),
);
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), clipboard-read=(), clipboard-write=()");
}

function responseAdapter(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(value) {
      if (res.statusCode >= 500 && value && typeof value === "object" && "error" in value) {
        value = { ...value, error:UNAVAILABLE_MESSAGE };
        res.setHeader("Cache-Control", "no-store, max-age=0");
      }
      if (!res.hasHeader("Content-Type")) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(value));
      return this;
    },
    send(value) {
      if (Buffer.isBuffer(value)) {
        res.end(value);
      } else if (typeof value === "string") {
        res.end(value);
      } else {
        this.json(value);
      }
      return this;
    },
  };
}

async function readApiBody(req, raw) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > MAX_API_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (raw) return buffer;
  if (!buffer.length) return {};
  const contentType = req.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function requestQuery(searchParams) {
  const query = {};
  for (const [key, value] of searchParams) query[key] = value;
  return query;
}

async function handleApi(req, res, url, routePath) {
  const modulePath = API_ROUTES.get(routePath);
  if (!modulePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  if (mongoEnabled() && !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !routePath.startsWith("/api/webhooks/") && !sameOrigin(req)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Submit this request from the KR7Tech website." }));
    return;
  }
  let body;
  try {
    body = await readApiBody(req, RAW_BODY_ROUTES.has(routePath));
  } catch (error) {
    res.statusCode = error.statusCode || 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message }));
    return;
  }

  const adaptedReq = req;
  adaptedReq.method = req.method;
  adaptedReq.query = requestQuery(url.searchParams);
  adaptedReq.body = body;

  try {
    const handler = require(path.join(ROOT, modulePath));
    await handler(adaptedReq, responseAdapter(res));
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error("API handler failed.", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.end(JSON.stringify({ error: UNAVAILABLE_MESSAGE }));
    } else {
      res.destroy(error);
    }
  }
}

function resolveStaticFile(urlPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decodedPath.includes("\\") || decodedPath.split("/").some(part => part.startsWith("."))) return null;
  const firstSegment = decodedPath.split("/").filter(Boolean)[0]?.toLowerCase();
  if (["api", "node_modules", "scripts", "supabase", "tests"].includes(firstSegment)) return null;
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.slice(1);
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) return null;
  if (["server.js", "package.json", "package-lock.json"].includes(path.basename(filePath).toLowerCase())) return null;
  if (!MIME_TYPES.has(path.extname(filePath).toLowerCase())) return null;
  try {
    return fs.statSync(filePath).isFile() ? filePath : null;
  } catch {
    return null;
  }
}

async function routeRequest(req, res) {
  setSecurityHeaders(res);
  let url;
  try {
    url = new URL(req.url, "http://localhost");
  } catch {
    res.statusCode = 400;
    res.end("Invalid request URL");
    return;
  }

  if (url.pathname === "/api/health") {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  let routePath = url.pathname;
  const decodedPath = (() => {
    try {
      return decodeURIComponent(url.pathname);
    } catch {
      return null;
    }
  })();
  const pageDestination = decodedPath && PAGE_REWRITES.get(decodedPath.toLowerCase());
  if (pageDestination) {
    const rewritten = new URL(pageDestination, "http://localhost");
    url.searchParams.forEach((value, key) => rewritten.searchParams.set(key, value));
    url = rewritten;
    routePath = rewritten.pathname;
  }

  if (routePath.startsWith("/api/")) {
    await handleApi(req, res, url, routePath);
    return;
  }

  const filePath = resolveStaticFile(url.pathname);
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  res.setHeader("Content-Type", MIME_TYPES.get(path.extname(filePath).toLowerCase()));
  if (path.basename(filePath) === "service-worker.js") res.setHeader("Cache-Control", "no-cache");
  if (path.extname(filePath).toLowerCase() === ".html") {
    const html = await fs.promises.readFile(filePath, "utf8");
    res.end(renderSiteLayout(html, path.basename(filePath)));
    return;
  }
  fs.createReadStream(filePath).on("error", error => {
    console.error("Static file read failed.", error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.statusCode = 503;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.end(UNAVAILABLE_MESSAGE);
  }).pipe(res);
}

async function handleRequest(req, res) {
  try {
    await routeRequest(req, res);
  } catch (error) {
    console.error("Request handling failed.", error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    if (req.url.startsWith("/api/")) {
      responseAdapter(res).status(500).json({ error:UNAVAILABLE_MESSAGE });
    } else if (/\.(?:js|css|png|jpg|jpeg|gif|svg|ico|webp|woff2)(?:\?|$)/i.test(req.url)) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.end(UNAVAILABLE_MESSAGE);
    } else {
      sendUnavailable(responseAdapter(res));
    }
  }
}

function createServer() {
  return http.createServer(handleRequest);
}

function loadLocalEnvironment(file = path.join(ROOT, ".env.local"), atlasFile) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return;
  if (arguments.length === 0) atlasFile = path.resolve(ROOT, "..", "atlas-credentials.env");
  for (const envFile of [file, atlasFile].filter(Boolean)) {
    try {
      process.loadEnvFile(envFile);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (atlasFile && process.env.MONGODB_URI &&
      (!process.env.AUTH_PROVIDER || process.env.AUTH_PROVIDER === "mongodb")) {
    process.env.AUTH_PROVIDER = "mongodb";
    if (!process.env.MONGODB_DATABASE) process.env.MONGODB_DATABASE = "kr7tech";
    if (!process.env.PUBLIC_APP_URL) {
      process.env.PUBLIC_APP_URL = `http://127.0.0.1:${Number(process.env.PORT) || 10000}`;
    }
    if (!process.env.AUTH_OTP_SECRET) process.env.AUTH_OTP_SECRET = crypto.randomBytes(32).toString("hex");
  }
}

if (require.main === module) {
  loadLocalEnvironment();
  const server = createServer();
  const port = Number(process.env.PORT) || 10000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`KR7Tech server listening on port ${port}.`);
  });
}

module.exports = { createServer, handleRequest, resolveStaticFile, loadLocalEnvironment };
