"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { once } = require("node:events");
const { Readable, Writable } = require("node:stream");
const { guideTopics, learningGuideTopics, guidePracticeItems } = require("../api/_guide-preview");
const { renderPreviewPage } = require("../api/serve-page");
const { handleRequest } = require("../server");
const { guidePreviewLimit } = require("../api/_pro-policy");
const root = path.join(__dirname, "..");

async function requestPage(url) {
  const req = Readable.from([]);
  req.method = "GET";
  req.url = url;
  req.headers = { host: "127.0.0.1" };
  const chunks = [];
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200;
  const headers = {};
  res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
  res.hasHeader = name => Object.hasOwn(headers, name.toLowerCase());
  const finished = once(res, "finish");
  await handleRequest(req, res);
  await finished;
  return { status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") };
}

test("every guide respects its configured free limit, with no paid titles, answers, or data scripts", () => {
  const pages = require("../vercel.json").rewrites
    .map(route => new URL(route.destination, "http://localhost").searchParams.get("page"))
    .filter(Boolean);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const topics = learningGuideTopics(page, html, root, page);
    const preview = renderPreviewPage(page);
    const items = topics.flatMap(topic => topic.items);
    const limit = guidePreviewLimit(page);
    if (page !== "DSA.html") {
      assert.equal((preview.match(/data-free-item/g) || []).length, Math.min(limit, items.length), page);
      assert.equal((preview.match(/data-pro-item/g) || []).length, Math.max(0, items.length - limit), page);
    } else {
      assert.match(preview, /First 10 DSA problems are free/);
      assert.doesNotMatch(preview, /title: "LRU Cache"|class LRUCache/);
      assert.match(preview, /"title":"Pro problem 50","pattern":"Pro practice","locked":true/);
    }
    for (const item of items.slice(limit)) {
      if (item.title.length > 20 && !items.slice(0, limit).some(free => free.html.includes(item.title))) {
        assert.ok(!preview.includes(item.html), `${page}: paid content must be absent`);
      }
    }
    assert.doesNotMatch(preview, /const (?:DATA|roadmapWeeks) =/);
    if (page !== "DSA.html") assert.doesNotMatch(preview, /const problems =/);
    assert.doesNotMatch(preview, /src="(?:dotnet-roadmap|interview-studio)\.js"/);
    assert.match(preview, /data-pro-unlock/);
  }
});

test("appended concept exercises preserve guide indices and are absent from every public preview", () => {
  for (const page of ["C#Dotnet.html", "Dotnet-Roadmap.html", "System-Design.html", "Amazon-Design.html",
    "Project.html", "AZURECICD.html", "AZURECICD - Copy.html", "DSA.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    const original = guideTopics(page, html, root, page)[0].items;
    const expanded = learningGuideTopics(page, html, root, page)[0].items;
    assert.deepEqual(expanded.slice(0, original.length), original, page);
    assert.deepEqual(expanded.slice(original.length), guidePracticeItems(page), page);
    const preview = renderPreviewPage(page);
    for (const item of guidePracticeItems(page)) {
      assert.ok(!preview.includes(item.title), `${page}: new title must not be sent to a visitor`);
      assert.ok(!preview.includes(item.html), `${page}: new answer must not be sent to a visitor`);
    }
  }
});

test("the production handler prevents protected-page and data-script bypasses through URL casing", async () => {
  for (const page of ["/C%23Dotnet.html", "/c%23dotnet.HTML", "/DSA.HTML", "/AZURECICD.HTML", "/visual-interview-memory-lab.HTML"]) {
    const response = await requestPage(page);
    assert.equal(response.status, 200);
    const html = response.body;
    if (page === "/DSA.HTML") {
      assert.match(html, /"title":"Pro problem 50","pattern":"Pro practice","locked":true/);
      assert.doesNotMatch(html, /class LRUCache/);
    } else assert.equal(html.match(/data-free-item/g)?.length, page.toLowerCase().includes("visual-interview-memory-lab") ? 30 : 10, page);
  }
  for (const asset of ["/dotnet-roadmap.js", "/DOTNET-ROADMAP.JS", "/interview-studio.js"]) {
    const response = await requestPage(asset);
    assert.equal(response.status, 403, asset);
    assert.doesNotMatch(response.body, /roadmapWeeks|incidentStages/);
  }
});

test("nested exercise sections appear once rather than duplicating free questions", () => {
  const preview = renderPreviewPage("Interview-Studio.html");
  assert.equal((preview.match(/data-free-item/g) || []).length, 5);
  assert.equal((preview.match(/id="debugging"/g) || []).length, 1);
});
