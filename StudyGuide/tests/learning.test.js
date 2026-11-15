"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { COURSES, filterCourses, courseForPage } = require("../learning-catalog");
const { createStore, normalizeState, activitySummary } = require("../learning");

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test("subject discovery combines search words, category, level, kind, and saved filters", () => {
  assert.equal(COURSES.length, 28);
  assert.equal(new Set(COURSES.map(course => course.id)).size, COURSES.length);
  assert.deepEqual(filterCourses({ query: "SQL interview", category: "Data", kind: "Interview Q&A" }).map(item => item.id), ["sql-qa"]);
  assert.ok(filterCourses({ level: "Beginner" }).some(item => item.id === "dotnet"));
  assert.ok(!filterCourses({ level: "Beginner" }).some(item => item.id === "marketplace"));
  assert.deepEqual(filterCourses({ savedIds: ["react"], category: "Frontend" }).map(item => item.id), ["react"]);
  assert.deepEqual(filterCourses({ query: "no-such-subject" }), []);
  assert.deepEqual(filterCourses({ savedIds: [] }), []);
  assert.equal(courseForPage("C#Dotnet.html").id, "dotnet");
  assert.equal(courseForPage("AZURECICD - Copy.html").id, "azure");
  assert.equal(courseForPage("Fullstack-Angular-Dotnet.html").id, "angular-dotnet-fullstack");
  assert.equal(courseForPage("Visual-Interview-Memory-Lab.html").id, "visual-memory-lab");
  assert.deepEqual(filterCourses({ query: "Angular .NET", kind: "Roadmap" })
    .map(course => course.id), ["angular-dotnet-fullstack"]);
});

test("saved subjects, reviews, and recent learning persist without duplicate study days", () => {
  const storage = memoryStorage();
  let now = new Date("2026-11-12T12:00:00");
  const store = createStore(storage, () => now);
  store.toggleSaved("dotnet");
  store.toggleReviewed("dotnet");
  store.visit("dotnet");
  store.visit("dotnet");
  now = new Date("2026-11-13T12:00:00");
  store.visit("sql-qa");
  const state = createStore(storage).read();
  assert.deepEqual(state.saved, ["dotnet"]);
  assert.deepEqual(state.reviewed, ["dotnet"]);
  assert.deepEqual(state.recent, ["sql-qa", "dotnet"]);
  assert.deepEqual(state.studyDays, ["2026-11-12", "2026-11-13"]);
  store.toggleSaved("dotnet");
  assert.deepEqual(store.read().saved, []);
  assert.throws(() => store.toggleReviewed("unsupported-subject"));
});

test("invalid saved data cannot inject arbitrary subjects, URLs, or impossible dates", () => {
  const state = normalizeState({
    saved: ["dotnet", "dotnet", "javascript:alert(1)", null, {}],
    reviewed: "not-an-array", recent: ["not-a-course", "azure"],
    studyDays: ["2026-02-30", "2026-11-12", "2026-11-12", "bad-date", 123],
  });
  assert.deepEqual(state.saved, ["dotnet"]);
  assert.deepEqual(state.reviewed, []);
  assert.deepEqual(state.recent, ["azure"]);
  assert.deepEqual(state.studyDays, ["2026-11-12"]);
  assert.equal("premium" in state, false);
});

test("blocked storage preserves page-session actions and reports that persistence is unavailable", () => {
  const store = createStore({
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
  });
  store.toggleSaved("dotnet");
  store.toggleReviewed("azure");
  assert.deepEqual(store.read().saved, ["dotnet"]);
  assert.deepEqual(store.read().reviewed, ["azure"]);
  assert.match(store.message(), /unavailable/);
  const writeBlocked = createStore({ getItem: () => null, setItem() { throw new Error("quota"); } });
  writeBlocked.toggleSaved("sql-qa");
  assert.deepEqual(writeBlocked.read().saved, ["sql-qa"]);
});

test("weekly activity counts local calendar days from Monday and excludes future activity", () => {
  const state = normalizeState({
    saved: ["dotnet"], reviewed: ["azure"], recent: ["sql-qa"],
    studyDays: ["2026-11-08", "2026-11-09", "2026-11-12", "2026-11-13"],
  });
  const summary = activitySummary(state, new Date("2026-11-12T12:00:00"));
  assert.equal(summary.studyDaysThisWeek, 2);
  assert.equal(summary.saved, 1);
  assert.equal(summary.reviewed, 1);
  assert.equal(summary.lastCourse.id, "sql-qa");
});
