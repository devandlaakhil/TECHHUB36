"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("parse5");
const { COURSES } = require("../learning-catalog");
const { selectedTopic, filterSubjects } = require("../subject-qa");
const questions = require("../api/questions");
const projectBank = require("../api/_project-questions");
const { mergeQuestions } = require("../api/_question-bank");
const root = path.join(__dirname, "..");
const subjects = COURSES.filter(course => course.kind === "Interview Q&A");
const originalFetch = global.fetch;
const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_USER_IDS"];
const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));

function nodes(node) {
  return [node, ...(node.childNodes || []).flatMap(nodes)];
}

function response() {
  return {
    statusCode: 200, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; return this; },
  };
}

function configure() {
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service";
  process.env.ADMIN_USER_IDS = "";
}

const bank = subjects.flatMap(subject => Array.from({ length: 12 }, (_, index) => ({
  id: `${subject.id}-${index}`, company: "Microsoft", topic: subject.topic,
  question: `${subject.topic} question ${index}`, answer: `${subject.topic} answer ${index}`,
  example: `Example ${index}`, is_free: false, access_level: null,
})));

test.afterEach(() => {
  global.fetch = originalFetch;
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
});

test("every subject deep link targets its dedicated subject view, not Company Interviews", () => {
  for (const subject of subjects) {
    const url = new URL(subject.href, "http://kr7tech.test");
    assert.equal(url.pathname, "/Subject-QA.html");
    assert.equal(selectedTopic(url.search), subject.topic);
  }
  assert.equal(selectedTopic("?topic=EF%20Core"), "EF Core");
  assert.equal(selectedTopic("?topic=JavaScript%20%2F%20TypeScript"), "JavaScript / TypeScript");
  assert.equal(selectedTopic("?topic=unknown"), null);
  assert.equal(selectedTopic(""), null);
});

test("interview topic discovery searches public topic names and categories without loading question banks", () => {
  assert.equal(filterSubjects().length, subjects.length);
  assert.deepEqual(filterSubjects("  sQl  ").map(subject => subject.topic), ["SQL"]);
  assert.deepEqual(filterSubjects("backend core").map(subject => subject.topic), ["ASP.NET Core", "EF Core"]);
  assert.ok(filterSubjects("frontEND").every(subject => subject.category === "Frontend"));
  assert.deepEqual(filterSubjects("no matching topic"), []);
  assert.deepEqual(filterSubjects("<script>"), []);
});

test("all static local HTML navigation links and anchor targets exist", () => {
  const documents = new Map(fs.readdirSync(root).filter(file => file.endsWith(".html"))
    .map(file => [file, nodes(parse(fs.readFileSync(path.join(root, file), "utf8")))]));
  const broken = [];
  for (const [file, elements] of documents) {
    for (const element of elements) {
      const href = element.attrs?.find(attr => attr.name === "href")?.value;
      if (!href || /^(https?:|mailto:|tel:|javascript:)/i.test(href)) continue;
      const url = new URL(href, `http://kr7tech.test/${encodeURIComponent(file)}`);
      const target = decodeURIComponent(url.pathname.slice(1));
      if (!target.endsWith(".html")) continue;
      const targetNodes = documents.get(target);
      if (!targetNodes) broken.push(`${file}: missing page ${href}`);
      else if (url.hash && !targetNodes.some(node => node.attrs?.some(attr =>
        attr.name === "id" && attr.value === decodeURIComponent(url.hash.slice(1))))) {
        broken.push(`${file}: missing anchor ${href}`);
      }
      if (target === "Company-Interviews.html" && url.searchParams.has("topic")) {
        broken.push(`${file}: subject link still points to Company Interviews`);
      }
    }
  }
  assert.deepEqual(broken, []);
});

test("each subject API request returns only its own first ten questions and locked metadata", async () => {
  configure();
  for (const subject of subjects) {
    global.fetch = async url => {
      const query = new URL(url);
      assert.equal(query.pathname, "/rest/v1/questions");
      assert.equal(query.searchParams.get("topic"), `eq.${subject.topic}`);
      return { ok: true, text: async () => JSON.stringify(bank) };
    };
    const res = response();
    await questions({ method: "GET", headers: {}, query: { topic: subject.topic } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.questions.length, 10);
    const expected = mergeQuestions(bank.filter(item => item.topic === subject.topic),
      projectBank.subjects.filter(item => item.topic === subject.topic));
    assert.equal(res.body.locked.length, expected.length - 10);
    assert.ok([...res.body.questions, ...res.body.locked].every(item => item.topic === subject.topic));
    assert.ok(res.body.locked.every(item => !("question" in item) && !("answer" in item)));
    assert.equal(JSON.stringify(res.body).includes(`${subject.topic} answer 10`), false);
  }
});

test("Pro unlocks the selected subject only; the separate company request retains all topics", async () => {
  configure();
  global.fetch = async url => {
    const pathname = new URL(url).pathname;
    const data = pathname === "/auth/v1/user" ? { id: "user-123" }
      : pathname === "/rest/v1/entitlements" ? [{ tier: "Pro" }]
        : pathname === "/rest/v1/profiles" ? [{ is_admin: false }] : bank;
    return { ok: true, json: async () => data, text: async () => JSON.stringify(data) };
  };
  const res = response();
  await questions({ method: "GET", headers: { authorization: "Bearer test-session" }, query: { topic: "EF Core" } }, res);
  assert.deepEqual(res.body.questions, mergeQuestions(bank.filter(item => item.topic === "EF Core"),
    projectBank.subjects.filter(item => item.topic === "EF Core"))
    .map(({ access_level, is_free, ...question }) => question));
  assert.deepEqual(res.body.locked, []);
  assert.ok(res.body.questions.every(item => item.topic === "EF Core"));
  const company = response();
  await questions({ method: "GET", headers: {}, query: {} }, company);
  assert.equal(company.body.questions.length, 10);
  assert.equal(new Set([...company.body.questions, ...company.body.locked].map(item => item.topic)).size, subjects.length);
});

test("invalid topic inputs fail before database or authorization requests", async () => {
  global.fetch = async () => { throw new Error("No database call is allowed."); };
  for (const topic of ["unknown", "", ["EF Core", "SQL"], { name: "EF Core" }]) {
    const res = response();
    await questions({ method: "GET", headers: {}, query: { topic } }, res);
    assert.equal(res.statusCode, 400);
  }
});
