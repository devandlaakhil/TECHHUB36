"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { mongoEnabled } = require("./_mongo");
const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function localAdminEnvironment() {
  if (!mongoEnabled() || process.env.LOCAL_ADMIN_LOGIN_ENABLED !== "true" ||
      process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
      process.env.VERCEL || process.env.RENDER || !process.env.MONGODB_URI ||
      !process.env.MONGODB_DATABASE || (process.env.AUTH_OTP_SECRET || "").length < 32) return false;
  try {
    const url = new URL(process.env.PUBLIC_APP_URL);
    return url.protocol === "http:" && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  } catch { return false; }
}

function localAdminAllowed(req) {
  if (!localAdminEnvironment()) return false;
  const address = req.socket?.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(`http://${req.headers.host}`).hostname);
  } catch { return false; }
}

async function passwordHash(password) {
  if (typeof password !== "string" || password.length < 5 || password.length > 256) {
    throw new Error("Provide a password between 5 and 256 characters.");
  }
  const salt = crypto.randomBytes(32).toString("hex");
  const derived = await scrypt(password, Buffer.from(salt, "hex"), 64, SCRYPT_OPTIONS);
  return `scrypt-v1:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password, record) {
  const valid = typeof record === "string" && /^scrypt-v1:[a-f0-9]{64}:[a-f0-9]{128}$/.test(record);
  const [, salt, expected] = valid ? record.split(":") : ["", "0".repeat(64), "0".repeat(128)];
  const derived = await scrypt(password, Buffer.from(salt, "hex"), 64, SCRYPT_OPTIONS);
  return crypto.timingSafeEqual(derived, Buffer.from(expected, "hex")) && valid;
}

async function provisionLocalAdmin(db, username, password) {
  if (!localAdminEnvironment()) throw new Error("Local administrator setup is disabled outside loopback development.");
  if (typeof username !== "string" || !/^[a-z][a-z0-9_]{2,31}$/i.test(username)) {
    throw new Error("Provide a valid local administrator username.");
  }
  const loginName = username.toLowerCase();
  const email = `${loginName}@local-admin.kr7tech.invalid`;
  const existing = await db.collection("users").findOne({ $or: [{ loginName }, { email }] });
  if (existing && (existing.localAdmin !== true || existing.loginName !== loginName)) {
    throw new Error("Refusing to replace an existing non-test account.");
  }
  const credential = await passwordHash(password);
  const user = await db.collection("users").findOneAndUpdate({ loginName }, {
    $set: { username, email, passwordHash: credential, localAdmin: true, localAdminVersion: crypto.randomUUID(),
      role: "admin", disabled: false, credentialUpdatedAt: new Date() },
    $setOnInsert: { id: crypto.randomUUID(), createdAt: new Date() },
  }, { upsert: true, returnDocument: "after" });
  return { id: user.id, username: user.username };
}

module.exports = { localAdminAllowed, localAdminEnvironment, passwordHash, verifyPassword, provisionLocalAdmin };
