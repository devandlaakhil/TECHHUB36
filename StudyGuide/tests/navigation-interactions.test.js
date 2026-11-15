"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.join(__dirname, "..");

function element(tagName = "div") {
  return {
    tagName, children: [], events: {}, attrs: {}, dataset: {}, value: "", hidden: false, open: false,
    addEventListener(name, callback) { this.events[name] = callback; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name]; },
    removeAttribute(name) { delete this.attrs[name]; },
    focus() { this.focused = true; },
    contains(target) { return this === target || this.children.some(child => child.contains?.(target)); },
    querySelectorAll(tag) {
      return this.children.flatMap(child => [
        ...(child.tagName === tag ? [child] : []), ...(child.querySelectorAll?.(tag) || []),
      ]);
    },
    querySelector(tag) { return this.querySelectorAll(tag)[0]; },
    closest() { return this.tagName === "a" ? this : null; },
  };
}

function openNavigation() {
  const toggle = element("button"), navigation = element("nav");
  const groups = [element("details"), element("details")];
  groups.forEach(group => group.append(element("summary")));
  const header = {
    querySelector: selector => selector === ".site-menu-toggle" ? toggle : navigation,
    querySelectorAll: () => groups,
  };
  const documentEvents = {}, windowEvents = {}, media = { matches: true };
  media.addEventListener = (name, callback) => { media.change = callback; };
  vm.runInNewContext(fs.readFileSync(path.join(root, "site-navigation.js"), "utf8"), {
    document: {
      querySelector: () => header, documentElement: { classList: { add() {} } },
      addEventListener: (name, callback) => { documentEvents[name] = callback; },
    },
    window: { matchMedia: () => media, addEventListener: (name, callback) => { windowEvents[name] = callback; } },
  });
  return { toggle, navigation, groups, media, documentEvents, windowEvents };
}

test("named navigation groups are exclusive and Escape dismisses the dropdown before the mobile menu", () => {
  const ui = openNavigation();
  assert.equal(ui.navigation.dataset.mobileOpen, "false");
  assert.equal(ui.toggle.hidden, false);
  ui.toggle.events.click();
  ui.groups[0].open = true;
  ui.groups[0].events.toggle();
  ui.groups[1].open = true;
  ui.groups[1].events.toggle();
  assert.equal(ui.groups[0].open, false);
  ui.documentEvents.keydown({ key: "Escape" });
  assert.equal(ui.groups[1].open, false);
  assert.equal(ui.groups[1].querySelector("summary").focused, true);
  assert.equal(ui.navigation.dataset.mobileOpen, "true");
  ui.documentEvents.keydown({ key: "Escape" });
  assert.equal(ui.navigation.dataset.mobileOpen, "false");
  assert.equal(ui.toggle.focused, true);
});

test("outside clicks, mobile link navigation and history restoration never leave menus open", () => {
  const ui = openNavigation();
  ui.groups[0].open = true;
  ui.documentEvents.click({ target: element() });
  assert.equal(ui.groups[0].open, false);
  ui.toggle.events.click();
  ui.navigation.events.click({ target: element("a") });
  assert.equal(ui.navigation.dataset.mobileOpen, "false");
  ui.toggle.events.click();
  ui.groups[0].open = true;
  ui.windowEvents.pageshow();
  assert.equal(ui.groups[0].open, false);
  assert.equal(ui.navigation.dataset.mobileOpen, "false");
  ui.media.matches = false;
  ui.media.change();
  assert.equal(ui.toggle.hidden, true);
});

function openTopics({ mobile = false } = {}) {
  const ids = new Map([
    "subject-topic", "subject-qa-heading", "subject-qa-description", "subject-qa-status", "subject-qa-results",
    "interview-directory", "interview-subjects", "interview-topic-search", "interview-topic-count",
    "interview-current-subject", "subject-picker-heading",
  ].map(id => [id, element()]));
  const documentEvents = {}, windowEvents = {}, dispatched = [], requests = [];
  const location = { href: "https://kr7tech.test/Subject-QA.html", search: "" };
  const move = url => {
    const target = new URL(url, location.href);
    location.href = target.href;
    location.search = target.search;
  };
  location.assign = move;
  vm.runInNewContext(fs.readFileSync(path.join(root, "subject-qa.js"), "utf8"), {
    window: {
      KR7Catalog: require("../learning-catalog"), matchMedia: () => ({ matches: mobile }),
      addEventListener: (name, callback) => { windowEvents[name] = callback; },
    },
    document: {
      getElementById: id => ids.get(id), createElement: element,
      addEventListener: (name, callback) => { documentEvents[name] = callback; },
      dispatchEvent: event => { dispatched.push(event); documentEvents[event.type]?.(event); },
    },
    location, history: { pushState: (state, title, url) => move(url) },
    localStorage: { getItem: () => null }, URL, URLSearchParams, AbortController,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async url => { requests.push(url); return { ok: true, json: async () => ({ questions: [], locked: [] }) }; },
  });
  return { ids, requests, dispatched, location, windowEvents, move };
}

test("the visual memory topic opens its separate thirty-free-question page without querying a fake subject", () => {
  const ui = openTopics();
  const select = ui.ids.get("subject-topic");
  select.value = "visual-memory-lab";
  select.events.change();
  assert.equal(new URL(ui.location.href).pathname, "/Visual-Interview-Memory-Lab.html");
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.dispatched.length, 0);
});

test("topic search makes no API requests and sidebar selection updates history, highlighting and progress events", async () => {
  const ui = openTopics();
  const search = ui.ids.get("interview-topic-search"), directory = ui.ids.get("interview-subjects");
  search.value = "sql";
  search.events.input();
  assert.equal(ui.requests.length, 0);
  const visible = directory.children.filter(link => !link.hidden);
  assert.deepEqual(visible.map(link => link.dataset.interviewSubject), ["SQL"]);
  let prevented = false;
  directory.events.click({ target: visible[0], button: 0, preventDefault() { prevented = true; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.equal(new URL(ui.location.href).searchParams.get("topic"), "SQL");
  assert.equal(ui.requests.length, 1);
  assert.equal(new URL(ui.requests[0], ui.location.href).searchParams.get("topic"), "SQL");
  assert.equal(visible[0].getAttribute("aria-current"), "page");
  assert.equal(ui.ids.get("interview-directory").open, true);
  assert.equal(ui.ids.get("subject-topic").value, "SQL");
  assert.equal(ui.dispatched[0].type, "kr7:subject-change");
  assert.equal(ui.dispatched[0].detail.topic, "SQL");
  assert.equal(ui.ids.get("subject-picker-heading").focused, true);
  ui.move("/Subject-QA.html");
  ui.windowEvents.popstate();
  assert.equal(ui.ids.get("subject-topic").value, "");
  assert.equal(visible[0].getAttribute("aria-current"), undefined);
  assert.equal(ui.requests.length, 1);
});

test("empty topic searches are explained, modified clicks stay native, and mobile selection collapses the topic list", async () => {
  const ui = openTopics({ mobile: true });
  const search = ui.ids.get("interview-topic-search"), directory = ui.ids.get("interview-subjects");
  search.value = "not-a-topic";
  search.events.input();
  assert.equal(directory.children.every(link => link.hidden), true);
  assert.match(ui.ids.get("interview-topic-count").textContent, /No topics match/);
  const link = directory.children.find(item => item.dataset.interviewSubject === "Angular");
  let prevented = false;
  directory.events.click({ target: link, button: 0, ctrlKey: true, preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(ui.requests.length, 0);
  search.value = "";
  search.events.input();
  directory.events.click({ target: link, button: 0, preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.ids.get("interview-directory").open, false);
  assert.equal(ui.requests.length, 1);
});
