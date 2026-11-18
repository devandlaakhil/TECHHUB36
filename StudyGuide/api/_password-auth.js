"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const { mongoEnabled, databaseConfigured } = require("./_mongo");
const { appOrigin, issueSession, publicUser } = require("./_mongo-auth");
const scrypt = promisify(crypto.scrypt);
const OPTIONS = { N: 65536, r: 8, p: 2, maxmem: 96 * 1024 * 1024 };
const USERNAME = /^[a-z][a-z0-9_]{2,31}$/i;
const HASH = /^scrypt-v2:([a-f0-9]{64}):([a-f0-9]{128})$/;
let hashing = 0;

function passwordConfigured() {
  return Boolean(mongoEnabled() && databaseConfigured() && appOrigin() &&
    (process.env.AUTH_OTP_SECRET || "").length >= 32);
}

async function derive(password, salt) {
  if (hashing >= 2) throw new Error("Password sign-in is busy.");
  hashing++;
  try { return await scrypt(password, Buffer.from(salt, "hex"), 64, OPTIONS); }
  finally { hashing--; }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(32).toString("hex");
  return `scrypt-v2:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const match = typeof stored === "string" && HASH.exec(stored);
  const actual = await derive(password, match ? match[1] : "0".repeat(64));
  return crypto.timingSafeEqual(actual, Buffer.from(match ? match[2] : "0".repeat(128), "hex")) && Boolean(match);
}

function createPasswordService({ db, now = () => new Date() }) {
  async function limit(key, maximum) {
    const time = now().getTime();
    const slot = Math.floor(time / 900000);
    const id = crypto.createHmac("sha256", process.env.AUTH_OTP_SECRET)
      .update(`password:${key}:${slot}`).digest("hex");
    const result = await db.collection("auth_rate_limits").findOneAndUpdate({ _id: id },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((slot + 1) * 900000) } },
      { upsert: true, returnDocument: "after" });
    return result.count <= maximum;
  }
  async function perform(action, input, fingerprint, authenticatedId) {
    if (typeof input.username !== "string" || !USERNAME.test(input.username.trim()) ||
        typeof input.password !== "string" || !input.password || input.password.length > 256) {
      return { status: 400, error: "Enter a username of 3-32 letters, numbers or underscores, starting with a letter, and a password." };
    }
    const username = input.username.trim();
    const loginName = username.toLowerCase();
    if (action !== "login" && input.password.length < 5) {
      return { status: 400, error: "Choose a password with at least 5 characters." };
    }
    if (action === "signup" && input.role !== undefined && !["student", "expert"].includes(input.role)) {
      return { status: 400, error: "Choose Student or Expert. Admin access cannot be requested." };
    }
    if (!await limit(`${action}:ip:${fingerprint}`, 20) ||
        !await limit(`${action}:name:${loginName}`, 10)) {
      return { status: 429, error: "Too many account attempts. Try again in 15 minutes." };
    }
    let user;
    if (action === "login") {
      user = await db.collection("users").findOne({ loginName });
      const correct = await verifyPassword(input.password, user?.passwordHash);
      if (!correct || user.disabled || user.localAdmin === true) {
        return { status: 401, error: "Incorrect username or password." };
      }
      await db.collection("users").updateOne({ id: user.id }, { $set: { lastLoginAt: now() } });
    } else {
      if (action === "set-password") {
        user = authenticatedId && await db.collection("users").findOne({ id: authenticatedId, disabled: { $ne: true } });
        if (!user || user.localAdmin === true || user.emailVerified === false) {
          return { status: 403, error: "Sign in to your verified email account before adding login details." };
        }
        if (user.passwordHash) return { status: 409, error: "This account already has username/password login." };
      }
      if (await db.collection("users").findOne({ loginName })) {
        return { status: 409, error: "That username is already registered. Log in or choose another username." };
      }
      const passwordHash = await hashPassword(input.password);
      const credentialVersion = crypto.randomUUID();
      try {
        if (action === "signup") {
          const id = crypto.randomUUID();
          user = { id, username, loginName, passwordHash, credentialVersion,
            email: `${id}@password-account.kr7tech.invalid`, emailVerified: false,
            role: input.role || "student", disabled: false, createdAt: now(), lastLoginAt: now() };
          await db.collection("users").insertOne(user);
        } else {
          user = await db.collection("users").findOneAndUpdate({
            id: user.id, disabled: { $ne: true }, passwordHash: { $exists: false },
          }, { $set: { username, loginName, passwordHash, credentialVersion } }, { returnDocument: "after" });
          if (!user) return { status: 409, error: "Login details have already changed. Sign in again." };
        }
      } catch (error) {
        if (error.code === 11000) return { status: 409, error: "That username is already registered. Log in or choose another username." };
        throw error;
      }
    }
    return { status: action === "signup" ? 201 : 200,
      token: await issueSession(db, user, now()), user: publicUser(user) };
  }
  return { perform };
}

module.exports = { passwordConfigured, createPasswordService };
