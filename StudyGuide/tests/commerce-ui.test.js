"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { parse } = require("parse5");
const root = path.join(__dirname, "..");

async function open(page, query, respond) {
  const elements = new Map();
  function node(ast) {
    const attrs = Object.fromEntries((ast.attrs || []).map(attr => [attr.name, attr.value]));
    const item = { tagName: ast.tagName, value: attrs.value || "", href: attrs.href, textContent: "", children: [], events: new Map(),
      hidden: Object.hasOwn(attrs, "hidden"), checked: false, disabled: Object.hasOwn(attrs, "disabled"),
      append(...children) { this.children.push(...children); if (this.tagName === "select" && !this.value) this.value = children[0].value; },
      replaceChildren(...children) { this.children = children; if (this.tagName === "select") this.value = ""; },
      addEventListener(name, callback) { this.events.set(name, callback); },
      reportValidity() { return elements.get("membership-acknowledge")?.checked === true; } };
    if (attrs.id) elements.set(attrs.id, item);
    item.children = (ast.childNodes || []).map(node);
    if (item.tagName === "select") item.value = item.children.find(child => child.tagName === "option")?.value || "";
    return item;
  }
  node(parse(fs.readFileSync(path.join(root, page), "utf8")));
  const events = new Map();
  const requests = [];
  const redirects = [];
  const location = new URL(`${page}${query}`, "https://kr7tech.test/");
  vm.runInNewContext(fs.readFileSync(path.join(root, page === "Membership.html" ? "membership.js" : "purchase.js"), "utf8"), {
    document: { getElementById: id => elements.get(id), createElement: tagName => node({ tagName }) },
    window: { addEventListener: (name, callback) => events.set(name, callback),
      location: { assign: url => redirects.push(url) } },
    location, localStorage: { getItem() { return null; } },
    URL, URLSearchParams, Intl, AbortController, AbortSignal,
    setTimeout: resolve => { resolve(); },
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      const { status = 200, body } = await respond(url, options, requests);
      return { status, ok: status >= 200 && status < 300, json: async () => body };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  return { element: id => elements.get(id), events, requests, redirects };
}
const configuration = { authProvider: "mongodb", providers: { stripe: true },
  plans: { Go: 750, Pro: 2500 },
  planOffers: {
    Go:{ currency:"INR", regularAmount:1500, amount:750, discountPercent:50 },
    Pro:{ currency:"INR", regularAmount:5000, amount:2500, discountPercent:50 },
  } };

test("unavailable checkout exposes a WhatsApp admin contact without enabling payment", async () => {
  for (const unavailableConfig of [false, true]) {
    const ui = await open("Membership.html", "", async url => url === "/api/config"
      ? unavailableConfig
        ? { status: 503, body: { error: "Unavailable" } }
        : { body: { ...configuration, providers: {} } }
      : { body: { signedIn: true, plan: "Free" } });
    assert.equal(ui.element("membership-admin-contact").hidden, false);
    const contact = new URL(ui.element("membership-admin-whatsapp").href);
    assert.equal(contact.origin, "https://wa.me");
    assert.equal(contact.pathname, "/918985837483");
    assert.equal(contact.searchParams.get("text"), "Hello KR7Tech admin, I need help with my membership or checkout.");
    assert.equal(ui.element("membership-buy").disabled, true);
    assert.match(ui.element("membership-price").textContent, /WhatsApp.*free previews/);
    assert.equal(ui.requests.filter(item => item.url === "/api/checkout").length, 0);
  }
});

test("a failed checkout shows admin assistance and a deliberate retry clears it", async () => {
  let attempts = 0;
  const ui = await open("Membership.html", "?plan=Go", async url => {
    if (url === "/api/config") return { body: configuration };
    if (url === "/api/session") return { body: { signedIn: true, plan: "Free" } };
    attempts++;
    return attempts === 1 ? { status: 503, body: { error: "Checkout is temporarily unavailable." } }
      : { body: { checkoutUrl: "https://checkout.stripe.com/verified" } };
  });
  assert.equal(ui.element("membership-admin-contact").hidden, true);
  ui.element("membership-acknowledge").checked = true;
  await ui.element("membership-form").events.get("submit")({ preventDefault() {} });
  assert.equal(ui.element("membership-admin-contact").hidden, false);
  assert.deepEqual(ui.redirects, []);
  await ui.element("membership-form").events.get("submit")({ preventDefault() {} });
  assert.equal(ui.element("membership-admin-contact").hidden, true);
  assert.deepEqual(ui.redirects, ["https://checkout.stripe.com/verified"]);
});

test("the INR offer is explained at checkout and never represented as a PayPal USD discount", async () => {
  const config = { ...configuration, providers:{ stripe:true, paypal:true },
    paypalTiers:{ Go:true, Pro:true }, paypalAmounts:{ Go:"10.00", Pro:"20.00" } };
  const ui = await open("Membership.html", "?plan=Go", async url => ({
    body:url === "/api/config" ? config : { signedIn:true, plan:"Free" },
  }));
  assert.match(ui.element("membership-price").textContent, /750/);
  assert.match(ui.element("membership-offer-note").textContent, /50% off.*1,500/);
  ui.element("membership-provider").value = "paypal";
  ui.element("membership-provider").events.get("change")();
  assert.match(ui.element("membership-price").textContent, /10.00/);
  assert.match(ui.element("membership-offer-note").textContent, /USD.*does not apply/);
  ui.element("membership-provider").value = "stripe";
  ui.element("membership-provider").events.get("change")();
  assert.match(ui.element("membership-offer-note").textContent, /50% off/);
});

test("membership preserves the selected plan through signup and submits only an acknowledged, signed-in checkout", async () => {
  let signedIn = false;
  const ui = await open("Membership.html", "?plan=Go", async url => ({ body: url === "/api/config" ? configuration
    : url === "/api/session" ? { signedIn, plan: "Free" } : { checkoutUrl: "https://checkout.stripe.com/verified" } }));
  assert.equal(ui.element("membership-buy").disabled, true);
  const next = new URL(ui.element("membership-sign-in").href, "https://kr7tech.test/").searchParams.get("next");
  assert.equal(next, "/Membership.html?plan=Go#purchase");
  signedIn = true;
  await ui.events.get("focus")();
  assert.equal(ui.element("membership-buy").disabled, false);
  await ui.element("membership-form").events.get("submit")({ preventDefault() {} });
  assert.equal(ui.requests.filter(item => item.url === "/api/checkout").length, 0);
  ui.element("membership-acknowledge").checked = true;
  await ui.element("membership-form").events.get("submit")({ preventDefault() {} });
  const post = ui.requests.find(item => item.url === "/api/checkout");
  assert.deepEqual(JSON.parse(post.options.body), { tier: "Go", provider: "stripe" });
  assert.equal(post.options.credentials, "same-origin");
  assert.deepEqual(ui.redirects, ["https://checkout.stripe.com/verified"]);
});

test("a failed account check does not hide checkout availability or permit a charge, and an owned plan cannot be rebought", async () => {
  const ui = await open("Membership.html", "?plan=Pro", async url => {
    if (url === "/api/session") throw new Error("Session outage");
    return { body: configuration };
  });
  assert.equal(ui.element("membership-provider").disabled, false);
  assert.equal(ui.element("membership-buy").disabled, true);
  const paid = await open("Membership.html", "?plan=Go", async url => ({
    body: url === "/api/config" ? configuration : { signedIn: true, plan: "Pro" },
  }));
  assert.equal(paid.element("membership-buy").disabled, true);
  assert.match(paid.element("membership-account").textContent, /already includes/);
});

test("PayPal capture is requested once and access appears only after owned payment and membership confirmation", async () => {
  let checks = 0;
  const ui = await open("Purchase.html", "?payment=pending&tier=Go&purchase=a&token=ORDER12345", async url => {
    if (url === "/api/paypal/capture") return { body: { status: "captured" } };
    checks++;
    return { body: { plan: checks > 1 ? "Go" : "Free", purchases: [{
      id: "a", plan: "Go", status: checks > 1 ? "paid" : "pending", amountMinor: 150000, currency: "INR",
    }] } };
  });
  assert.equal(ui.requests.filter(item => item.url === "/api/paypal/capture").length, 1);
  assert.match(ui.element("purchase-status").textContent, /Payment confirmed/);
  assert.equal(ui.requests.filter(item => item.url === "/api/checkout").length, 0);
  await ui.element("purchase-refresh").events.get("click")();
  assert.equal(ui.requests.filter(item => item.url === "/api/paypal/capture").length, 1);
});

test("an expired purchase session offers login with its return context and never attempts capture", async () => {
  const ui = await open("Purchase.html", "?payment=pending&purchase=a&token=ORDER12345",
    async () => ({ status: 401, body: { error: "Log in." } }));
  assert.equal(ui.element("purchase-login").hidden, false);
  assert.equal(new URL(ui.element("purchase-login").href, "https://kr7tech.test/").searchParams.get("next"),
    "/Purchase.html?payment=pending&purchase=a&token=ORDER12345");
  assert.match(ui.element("purchase-status").textContent, /Log in/);
  assert.equal(ui.requests.filter(item => item.url === "/api/paypal/capture").length, 0);
});

test("locked content directs buyers to membership when item codes are disabled and preserves configured PIN entry", async () => {
  for (const enabled of [false, true]) {
    const clicks = [];
    const redirects = [];
    let prompts = 0;
    const node = () => ({ dataset: {}, append() {}, setAttribute() {} });
    vm.runInNewContext(fs.readFileSync(path.join(root, "pro-access.js"), "utf8"), {
      document: { createElement: node, head: { append() {} }, body: { prepend() {} },
        addEventListener(name, callback) { if (name === "click") clicks.push(callback); },
        querySelectorAll: () => [] },
      window: { addEventListener() {}, location: { assign: url => redirects.push(url) },
        prompt() { prompts++; return null; } },
      fetch: async (url, options) => {
        assert.equal(options.method, undefined);
        return { ok: true, json: async () => ({ enabled }) };
      },
    });
    await new Promise(resolve => setImmediate(resolve));
    const button = { dataset: { proResource: "concept:example" } };
    await clicks[0]({ preventDefault() {}, target: { closest: () => button } });
    assert.equal(prompts, enabled ? 1 : 0);
    assert.deepEqual(redirects, enabled ? [] : ["/Membership.html#purchase"]);
  }
});
