"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { renderSiteLayout } = require("../api/_site-layout");
const { workspaceDom } = require("./helpers/workspace-dom");

const script = fs.readFileSync(path.join(__dirname, "..", "site-theme.js"), "utf8");

function openTheme({ storage = new Map(), blockedRead = false, blockedWrite = false, mount = true } = {}) {
  const source = '<html><head><meta name="theme-color" content="#101923"></head><body><main>Lesson</main></body></html>';
  const rendered = renderSiteLayout(source, "index.html");
  const document = workspaceDom(source);
  document.documentElement = document.querySelector("html");
  document.readyState = "loading";
  const events = {};
  const window = {
    localStorage: {
      getItem(key) {
        if (blockedRead) throw new Error("Storage unavailable");
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        if (blockedWrite) throw new Error("Storage unavailable");
        storage.set(key, value);
      },
    },
    addEventListener(name, callback) { events[name] = callback; },
  };
  vm.runInNewContext(script, { document, window });
  const ui = {
    document, root: document.documentElement, storage, events,
    mount() {
      document.querySelector("body").innerHTML = rendered.match(/<body>([\s\S]*)<\/body>/)[1];
      document.readyState = "interactive";
      document.events.DOMContentLoaded();
      this.button = document.querySelector("[data-theme-toggle]");
    },
    click() { document.events.click({ target: this.button.querySelector("svg") }); },
  };
  if (mount) ui.mount();
  return ui;
}

test("stored white theme applies before the header exists, then initializes its accessible control", () => {
  const ui = openTheme({ storage: new Map([["kr7tech.theme", "light"]]), mount: false });
  assert.equal(ui.root.dataset.theme, "light");
  assert.equal(ui.root.style.colorScheme, "light");
  assert.equal(ui.document.querySelector("[data-theme-toggle]"), null);
  ui.mount();
  assert.equal(ui.button.hidden, false);
  assert.equal(ui.button.getAttribute("aria-label"), "White theme");
  assert.equal(ui.button.getAttribute("aria-pressed"), "true");
  assert.equal(ui.button.getAttribute("title"), "Switch to dark theme");
  assert.equal(ui.document.querySelector('meta[name="theme-color"]').getAttribute("content"), "#ffffff");
});

test("sun or moon clicks toggle both directions and the preference survives navigation", () => {
  const ui = openTheme();
  assert.equal(ui.root.dataset.theme, "dark");
  ui.click();
  assert.equal(ui.root.dataset.theme, "light");
  assert.equal(ui.button.getAttribute("aria-pressed"), "true");
  assert.equal(openTheme({ storage: ui.storage }).root.dataset.theme, "light");
  ui.click();
  assert.equal(ui.root.dataset.theme, "dark");
  assert.equal(ui.button.getAttribute("aria-pressed"), "false");
  assert.equal(ui.button.getAttribute("title"), "Switch to white theme");
  assert.equal(openTheme({ storage: ui.storage }).root.dataset.theme, "dark");
  ui.document.events.click({ target: ui.document.querySelector(".site-support-link") });
  assert.equal(ui.root.dataset.theme, "dark");
});

test("denied storage does not prevent toggling or reset the in-memory choice on pageshow", () => {
  for (const blockedRead of [false, true]) {
    const ui = openTheme({ blockedRead, blockedWrite: true });
    ui.click();
    assert.equal(ui.root.dataset.theme, "light");
    ui.events.pageshow();
    assert.equal(ui.root.dataset.theme, "light");
    ui.click();
    assert.equal(ui.root.dataset.theme, "dark");
  }
});

test("cross-tab preference changes, storage clearing and history restore synchronize controls", () => {
  const ui = openTheme();
  ui.storage.set("kr7tech.theme", "light");
  ui.events.storage({ key: "unrelated-setting" });
  assert.equal(ui.root.dataset.theme, "dark");
  ui.events.storage({ key: "kr7tech.theme" });
  assert.equal(ui.root.dataset.theme, "light");
  assert.equal(ui.button.getAttribute("aria-pressed"), "true");
  ui.storage.clear();
  ui.events.storage({ key: null });
  assert.equal(ui.root.dataset.theme, "dark");
  ui.storage.set("kr7tech.theme", "light");
  ui.events.pageshow();
  assert.equal(ui.root.dataset.theme, "light");
  assert.equal(ui.button.getAttribute("aria-pressed"), "true");
  assert.equal(openTheme({ storage: new Map([["kr7tech.theme", "invalid"]]) }).root.dataset.theme, "dark");
});
