"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createAccountStore } = require("../scripts/local-preview-accounts");

function fixture(t) {
  const parent = path.join(__dirname, "..", ".local-preview");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "test-accounts-"));
  const file = path.join(directory, "accounts.json");
  t.after(() => {
    for (const name of ["accounts.json", "blocked"]) {
      const target = path.join(directory, name);
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(directory);
  });
  const bootstrap = { id: crypto.randomUUID(), username: "Bootstrap", role: "admin" };
  return { file, bootstrap, directory };
}

test("local signup persists salted hashes and keeps exactly one first Admin across restart and concurrent signups", async t => {
  const settings = fixture(t);
  const password = crypto.randomBytes(20).toString("base64url");
  const store = createAccountStore(settings);
  const [owner, learner] = await Promise.all([
    store.register({ username: "Owner", email: "owner@example.test", password }, { grantOwner: true }),
    store.register({ username: "Learner", email: "learner@example.test", password }),
  ]);
  assert.equal(owner.role, "admin");
  assert.equal(learner.role, "student");
  assert.equal(store.get(settings.bootstrap.id), null);
  const saved = fs.readFileSync(settings.file, "utf8");
  assert.equal(saved.includes(password), false);
  const records = JSON.parse(saved).accounts;
  assert.notEqual(records[0].passwordHash, records[1].passwordHash);
  assert.equal(records.filter(account => account.role === "admin").length, 1);
  const restarted = createAccountStore(settings);
  assert.equal(restarted.firstAdminAvailable(), false);
  assert.deepEqual(await restarted.login("OWNER@EXAMPLE.TEST", password), owner);
  assert.equal(await restarted.login("Owner", "incorrect"), null);
  assert.equal(restarted.get(owner.id).passwordHash, undefined);
  await assert.rejects(restarted.register({ username: "Other", email: "other@example.test", password, role: "admin" }),
    { status: 400 });
  await assert.rejects(restarted.register({ username: "Another", email: "OWNER@example.test", password }),
    { status: 409 });
});

test("duplicate concurrent usernames create one account, and a damaged store never resets Admin ownership", async t => {
  const settings = fixture(t);
  const store = createAccountStore(settings);
  const password = crypto.randomBytes(20).toString("base64url");
  const results = await Promise.allSettled([
    store.register({ username: "Owner", email: "first@example.test", password }, { grantOwner: true }),
    store.register({ username: "OWNER", email: "second@example.test", password }),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(store.users().length, 1);
  fs.writeFileSync(settings.file, JSON.stringify({ version: 1, accounts: [] }));
  assert.throws(() => createAccountStore(settings), /refusing to reset/);
});

test("a failed private write does not create an account or consume the first Admin slot", async t => {
  const settings = fixture(t);
  const blocked = path.join(settings.directory, "blocked");
  const store = createAccountStore({ ...settings, file: path.join(blocked, "accounts.json") });
  fs.writeFileSync(blocked, "fixture");
  await assert.rejects(store.register({ username: "Owner", email: "owner@example.test",
    password: crypto.randomBytes(20).toString("base64url") }));
  assert.equal(store.users().length, 0);
  assert.equal(store.firstAdminAvailable(), true);
});

test("ordinary username-only preview accounts start Free as Students and survive restarting the account store", async t => {
  const settings = fixture(t);
  const password = crypto.randomBytes(20).toString("base64url");
  const created = await createAccountStore(settings).register({ username: "Learner", password });
  assert.equal(created.role, "student");
  const restarted = createAccountStore(settings);
  assert.equal((await restarted.login("Learner", password)).id, created.id);
  assert.equal(restarted.users().some(user => user.role === "admin"), false);
});

test("local preview signup accepts five characters and rejects shorter passwords", async t => {
  const settings = fixture(t);
  const store = createAccountStore(settings);
  await assert.rejects(store.register({ username: "TooShort", password: "1234" }), { status: 400 });
  const created = await store.register({ username: "Minimum", password: "12345" });
  assert.equal(created.role, "student");
  assert.equal((await store.login("Minimum", "12345")).id, created.id);
});
