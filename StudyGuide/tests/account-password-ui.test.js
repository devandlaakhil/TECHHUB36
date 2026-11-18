"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { parse } = require("parse5");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "Account.html"), "utf8");
const source = fs.readFileSync(path.join(root, "account.js"), "utf8");

test("username/password account page clearly requires no email or OTP", () => {
  assert.match(html, /no email address, email verification, or OTP is needed/i);
  assert.match(html, /No email or OTP is used/i);
  assert.doesNotMatch(html, /type=["']email["']|otp-request-form|email-auth/i);
  for (const id of ["signup-password", "setup-password", "setup-confirm-password"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*minlength="5"`));
  }
});

async function open({ enabled = true, existing = false, sessionUnavailable = false, loseSignupSession = false, missingSignupCookie = false, search = "" } = {}) {
  const elements = new Map();
  function node(ast) {
    const attrs = Object.fromEntries((ast.attrs || []).map(attr => [attr.name, attr.value]));
    const element = { tagName: ast.tagName, type: attrs.type, value: attrs.value || "",
      hidden: Object.hasOwn(attrs, "hidden"), disabled: false, textContent: "", children: [], events: new Map(),
      addEventListener(name, callback) { this.events.set(name, callback); },
      reportValidity() { return true; }, focus() { this.focused = true; },
      replaceChildren(...children) { this.children = children; },
      querySelectorAll(selector) {
        const found = [];
        const tags = selector.split(",").map(value => value.trim());
        function visit(parent) {
          for (const child of parent.children) {
            if (tags.includes(child.tagName) || selector === 'input[type="password"]' &&
                child.tagName === "input" && child.type === "password") found.push(child);
            visit(child);
          }
        }
        visit(this);
        return found;
      } };
    if (attrs.id) elements.set(attrs.id, element);
    element.children = (ast.childNodes || []).map(node);
    if (ast.tagName === "select") element.value = element.children.find(child => child.tagName === "option")?.value || "";
    return element;
  }
  node(parse(html));
  const events = new Map();
  const posts = [];
  const requests = [];
  let signedIn = existing;
  let reloads = 0;
  let user = { id: "249d85bb-881f-420e-adc3-22644e44288d", username: existing ? undefined : "Learner",
    email: existing ? "existing@example.test" : null, role: "student", hasPassword: !existing };
  vm.runInNewContext(source, {
    document: {
      getElementById: id => elements.get(id), createElement: tagName => node({ tagName }),
      addEventListener: (name, callback) => events.set(name, callback),
      dispatchEvent: event => events.get(event.type)?.(event),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    localStorage: { removeItem() {} }, location: { search, reload() { reloads++; } }, AbortSignal, URL, URLSearchParams,
    fetch: async (url, options) => {
      requests.push(url);
      assert.equal(options.credentials, "same-origin");
      let ok = true;
      let result;
      if (url === "/api/account-auth") {
        if (options.method === "GET") result = { enabled };
        else {
          const body = JSON.parse(options.body);
          posts.push(body);
          if (!enabled) { ok = false; result = { error: "The server cannot connect to MongoDB." }; }
          else if (body.password === "wrong") { ok = false; result = { error: "Incorrect username or password." }; }
          else { signedIn = true; user = { ...user, username: body.username, hasPassword: true }; result = { signedIn, user }; }
        }
      } else if (url === "/api/session") {
        if (sessionUnavailable) throw new Error("Session service unavailable.");
        if (loseSignupSession && posts.some(body => body.action === "signup")) {
          loseSignupSession = false;
          throw new Error("Session response failed after account creation.");
        }
        if (options.method === "DELETE") signedIn = false;
        result = { provider: "mongodb", signedIn, ...(signedIn ? { user, plan: "Free" } : {}) };
        if (missingSignupCookie && posts.some(body => body.action === "signup")) {
          missingSignupCookie = false;
          result = { signedIn: false };
        }
      } else throw new Error("OTP and Admin-test endpoints must never be needed.");
      return { ok, json: async () => result };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  const element = id => elements.get(id);
  return { element, posts, requests, reloads: () => reloads,
    submit: id => element(id).events.get("submit")({ preventDefault() {} }),
    click: id => element(id).events.get("click")({ target: element(id) }) };
}

test("normal users create an account, sign out, switch to Login and reuse their credentials without Admin UI", async () => {
  const ui = await open();
  assert.equal(ui.element("password-account-panel").hidden, false);
  assert.equal(ui.element("password-signup-form").hidden, false);
  assert.equal(ui.element("password-login-form").hidden, true);
  assert.equal(ui.element("local-admin-panel"), undefined);
  assert.equal(ui.element("otp-request-form"), undefined);
  assert.equal(ui.element("signup-role"), undefined);
  ui.element("signup-username").value = "Learner";
  ui.element("signup-password").value = "a memorable test passphrase";
  await ui.submit("password-signup-form");
  assert.equal(ui.posts[0].action, "signup");
  assert.deepEqual(Object.keys(ui.posts[0]).sort(), ["action", "password", "username"]);
  assert.equal(ui.element("account-dashboard").hidden, false);
  assert.equal(ui.element("account-admin").hidden, true);
  assert.equal(ui.element("signup-password").value, "");
  await ui.click("account-sign-out");
  assert.equal(ui.reloads(), 1);
  assert.equal(ui.element("account-dashboard").hidden, true);
  ui.click("password-show-login");
  assert.equal(ui.element("password-login-form").hidden, false);
  assert.equal(ui.element("password-signup-form").hidden, true);
  ui.element("login-username").value = "Learner";
  ui.element("login-password").value = "a memorable test passphrase";
  await ui.submit("password-login-form");
  assert.equal(ui.posts.at(-1).action, "login");
  assert.equal(ui.element("account-dashboard").hidden, false);
  assert.equal(ui.element("account-identity").textContent, "Signed in as Learner.");
  assert.equal(ui.element("login-password").value, "");
  assert.equal(ui.requests.some(url => /email-auth|local-admin-auth/.test(url)), false);
});

test("failed login clears the password and does not display a dashboard or successful login", async () => {
  const ui = await open();
  ui.click("password-show-login");
  ui.element("login-username").value = "Learner";
  ui.element("login-password").value = "wrong";
  await ui.submit("password-login-form");
  assert.equal(ui.element("account-status").textContent, "Incorrect username or password.");
  assert.equal(ui.element("account-dashboard").hidden, true);
  assert.equal(ui.element("login-password").value, "");
  assert.equal(ui.element("login-username").disabled, false);
});

test("signup preserves the selected checkout destination and signed-out users cannot continue", async () => {
  const ui = await open({ search: `?${new URLSearchParams({ next: "/Membership.html?plan=Go#purchase" })}` });
  assert.equal(ui.element("account-continue").hidden, true);
  ui.element("signup-username").value = "Learner";
  ui.element("signup-password").value = "a memorable test passphrase";
  await ui.submit("password-signup-form");
  assert.equal(ui.element("account-continue").hidden, false);
  assert.equal(ui.element("account-continue").href, "/Membership.html?plan=Go#purchase");
  assert.equal(ui.element("account-continue").textContent, "Continue to checkout");
});

test("existing signed-in accounts can add passwords and database errors do not hide the signup forms", async () => {
  const ui = await open({ existing: true });
  assert.equal(ui.element("account-password-setup").hidden, false);
  ui.element("setup-username").value = "Existing";
  ui.element("setup-password").value = "a memorable test passphrase";
  ui.element("setup-confirm-password").value = "a memorable test passphrase";
  await ui.submit("account-password-setup");
  assert.equal(ui.posts[0].action, "set-password");
  assert.equal(ui.element("account-password-setup").hidden, true);
  const unavailable = await open({ enabled: false });
  assert.equal(unavailable.element("password-account-panel").hidden, false);
  unavailable.element("signup-username").value = "Learner";
  unavailable.element("signup-password").value = "a memorable test passphrase";
  await unavailable.submit("password-signup-form");
  assert.match(unavailable.element("account-status").textContent, /cannot connect to MongoDB/);
  assert.equal(unavailable.element("account-dashboard").hidden, true);
});

test("signup accepts the five-character minimum", async () => {
  const ui = await open();
  ui.element("signup-username").value = "Learner";
  ui.element("signup-password").value = "12345";
  await ui.submit("password-signup-form");
  assert.equal(ui.posts[0].password, "12345");
  assert.equal(ui.element("account-dashboard").hidden, false);
});

test("a failed initial session check cannot block Create account or Login and short passwords explain the requirement", async () => {
  const ui = await open({ sessionUnavailable: true });
  assert.equal(ui.element("password-account-panel").hidden, false);
  assert.equal(ui.element("signup-username").disabled, false);
  ui.element("signup-username").value = "Learner";
  ui.element("signup-password").value = "four";
  await ui.submit("password-signup-form");
  assert.equal(ui.posts.length, 0);
  assert.match(ui.element("account-status").textContent, /at least 5/);
  ui.click("password-show-login");
  assert.equal(ui.element("password-login-form").hidden, false);
});

test("saved accounts remain usable when the next session fetch fails or the sign-in cookie is not accepted", async () => {
  for (const options of [{ loseSignupSession: true }, { missingSignupCookie: true }]) {
    const ui = await open(options);
    ui.element("signup-username").value = "Learner";
    ui.element("signup-password").value = "a memorable test passphrase";
    await ui.submit("password-signup-form");
    assert.match(ui.element("account-status").textContent, /account was created/);
    assert.equal(ui.element("password-login-form").hidden, false);
    assert.equal(ui.element("login-username").value, "Learner");
    assert.equal(ui.element("account-dashboard").hidden, true);
    ui.element("login-password").value = "a memorable test passphrase";
    await ui.submit("password-login-form");
    assert.equal(ui.posts.length, 2);
    assert.equal(ui.posts[1].action, "login");
    assert.equal(ui.element("account-dashboard").hidden, false);
  }
});
