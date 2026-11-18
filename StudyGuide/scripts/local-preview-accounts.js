"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { passwordHash, verifyPassword } = require("../api/_local-admin");
const USERNAME = /^[a-z][a-z0-9_]{2,31}$/i;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const HASH = /^scrypt-v1:[a-f0-9]{64}:[a-f0-9]{128}$/;

class AccountInputError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function publicUser(account) {
  return account ? { id: account.id, username: account.username, email: account.email,
    role: account.role, localOnly: true, localPreview: true } : null;
}

function createAccountStore({ file, bootstrap }) {
  let accounts = [];
  if (file && fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    if (saved.version !== 1 || !Array.isArray(saved.accounts) ||
        saved.accounts.some(account => !UUID.test(account.id) || !USERNAME.test(account.username) ||
          !EMAIL.test(account.email) || !HASH.test(account.passwordHash) ||
          !["admin", "student", "expert"].includes(account.role)) ||
        new Set(saved.accounts.map(account => account.username.toLowerCase())).size !== saved.accounts.length ||
        new Set(saved.accounts.map(account => account.email.toLowerCase())).size !== saved.accounts.length ||
        new Set(saved.accounts.map(account => account.id)).size !== saved.accounts.length ||
        saved.accounts.length === 0 || saved.accounts.filter(account => account.role === "admin").length > 1) {
      throw new Error("The private local account store is invalid; refusing to reset it.");
    }
    accounts = saved.accounts;
  }
  let pending = Promise.resolve();
  const firstAdminAvailable = () => accounts.length === 0;
  function get(id) {
    return publicUser(accounts.find(account => account.id === id) ||
      (firstAdminAvailable() && bootstrap.id === id ? bootstrap : null));
  }
  async function login(identity, password) {
    const normalized = identity.trim().toLowerCase();
    const account = accounts.find(value => value.username.toLowerCase() === normalized || value.email.toLowerCase() === normalized) ||
      (firstAdminAvailable() && bootstrap.username.toLowerCase() === normalized ? bootstrap : null);
    const valid = await verifyPassword(password, account?.passwordHash);
    return valid ? publicUser(account) : null;
  }
  async function register(input, { grantOwner = false } = {}) {
    const id = crypto.randomUUID();
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const email = input.email === undefined ? `${id}@preview-account.kr7tech.invalid`
      : typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!USERNAME.test(username) || email.length > 254 || !EMAIL.test(email) ||
        typeof input.password !== "string" || input.password.length < 5 || input.password.length > 256 ||
        (input.role !== undefined && !["student", "expert"].includes(input.role))) {
      throw new AccountInputError(400, "Use a 3-32 character username and a password of 5-256 characters. Admin access cannot be requested.");
    }
    const operation = pending.then(async () => {
      if (accounts.some(account => account.username.toLowerCase() === username.toLowerCase() || account.email === email)) {
        throw new AccountInputError(409, "That username or email already has a local account. Log in instead.");
      }
      const account = { id, username, email,
        passwordHash: await passwordHash(input.password),
        role: grantOwner && firstAdminAvailable() ? "admin" : input.role || "student", createdAt: new Date().toISOString() };
      const next = [...accounts, account];
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = `${file}.${crypto.randomUUID()}.tmp`;
        try {
          fs.writeFileSync(temporary, `${JSON.stringify({ version: 1, accounts: next }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
          fs.renameSync(temporary, file);
        } finally {
          if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
        }
      }
      accounts = next;
      return publicUser(account);
    });
    pending = operation.catch(() => {});
    return operation;
  }
  return { get, login, register, firstAdminAvailable,
    users: () => accounts.map(publicUser) };
}

module.exports = { createAccountStore, AccountInputError };
