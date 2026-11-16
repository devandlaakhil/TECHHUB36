"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { COURSES } = require("../learning-catalog");
const { renderSiteLayout } = require("../api/_site-layout");
const { workspaceDom } = require("./helpers/workspace-dom");
const root = path.join(__dirname, "..");

function open(page, query = "") {
  const document = workspaceDom(renderSiteLayout(fs.readFileSync(path.join(root, page), "utf8"), page));
  vm.runInNewContext(fs.readFileSync(path.join(root, "training-directory.js"), "utf8"), {
    document, window: { location: { search: query } }, URLSearchParams,
  });
  const directory = document.querySelector("[data-training-directory]");
  return {
    directory, cards: directory.querySelectorAll("[data-training-topic]"),
    search: directory.querySelector("[data-training-search]"),
    category: directory.querySelector("[data-training-category]"),
    reset: directory.querySelector("[data-training-reset]"),
    empty: directory.querySelector("[data-training-empty]"),
    status: directory.querySelector("[data-training-status]"),
  };
}

test("courses and coaching directories cover every Q&A topic with the correct frontend mentor", () => {
  const topics = COURSES.filter(course => course.kind === "Interview Q&A");
  for (const page of ["Courses.html", "Coaching.html"]) {
    const ui = open(page);
    assert.deepEqual(ui.cards.map(card => card.dataset.trainingTopic), topics.map(topic => topic.topic), page);
    for (const [index, card] of ui.cards.entries()) {
      const topic = topics[index];
      const mentor = topic.category === "Frontend" ? "Akhil" : "Krishna";
      assert.equal(card.dataset.trainingCoach, mentor, `${page}: ${topic.topic}`);
      assert.ok(card.textContent.includes(mentor));
      const links = card.querySelectorAll("a");
      if (page === "Coaching.html") {
        const enquiry = new URL(links[0].getAttribute("href"));
        assert.equal(enquiry.origin, "https://wa.me");
        assert.equal(enquiry.pathname, "/918985837483");
        assert.ok(enquiry.searchParams.get("text").includes(`${topic.topic} coaching with ${mentor}`));
        assert.match(enquiry.searchParams.get("text"), /availability.*before I book/);
        assert.equal(links[0].getAttribute("target"), "_blank");
        assert.equal(links[0].getAttribute("rel"), "noopener noreferrer");
      } else {
        const coaching = new URL(links[2].getAttribute("href"), "https://kr7tech.test");
        assert.equal(coaching.searchParams.get("topic"), topic.topic);
      }
    }
    assert.equal(ui.directory.querySelector("[data-training-filters]").hidden, false);
  }
});

test("homepage does not display topic mentoring cards", () => {
  const homepage = renderSiteLayout(fs.readFileSync(path.join(root, "index.html"), "utf8"), "index.html");
  assert.doesNotMatch(homepage, /data-training-directory="topics"|data-training-topic=/);
  assert.doesNotMatch(homepage, /Topic guidance/);
});

test("topic and mentor searches combine with category filtering, explain empty results and reset cleanly", () => {
  const ui = open("Coaching.html");
  ui.search.value = "Akhil";
  ui.search.events.input();
  assert.deepEqual(ui.cards.filter(card => !card.hidden).map(card => card.dataset.trainingTopic),
    ["Angular", "JavaScript / TypeScript"]);
  ui.category.value = "Backend";
  ui.category.events.change();
  assert.equal(ui.cards.filter(card => !card.hidden).length, 0);
  assert.equal(ui.empty.hidden, false);
  assert.match(ui.status.textContent, /^0 of/);
  ui.reset.events.click();
  assert.equal(ui.empty.hidden, true);
  assert.equal(ui.cards.every(card => !card.hidden), true);
  assert.equal(ui.search.value, "");
  assert.equal(ui.category.value, "");
  assert.equal(ui.search.focused, true);
});

test("coaching deep links select only real topics and unknown input cannot replace the catalog", () => {
  const ui = open("Coaching.html", `?${new URLSearchParams({ topic: "Identity & Security" })}`);
  assert.deepEqual(ui.cards.filter(card => !card.hidden).map(card => card.dataset.trainingTopic), ["Identity & Security"]);
  const unknown = open("Coaching.html", "?topic=%3Cscript%3E");
  assert.equal(unknown.search.value, "");
  assert.equal(unknown.cards.every(card => !card.hidden), true);
});
