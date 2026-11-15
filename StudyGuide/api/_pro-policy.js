"use strict";

const FREE_PREVIEW_LIMIT = 10;
const GO_CONCEPT_LIMIT = 2;
const VISUAL_MEMORY_PAGE = "Visual-Interview-Memory-Lab.html";

function guidePreviewLimit(page) {
  return page === VISUAL_MEMORY_PAGE ? 30 : FREE_PREVIEW_LIMIT;
}

function membershipTier(entitlements) {
  const active = entitlements.filter(item => item.active !== false);
  if (active.some(item => item.tier === "Pro")) return "Pro";
  return active.some(item => item.tier === "Go") ? "Go" : "Free";
}

function hasInterviewAccess(entitlements) {
  return membershipTier(entitlements) !== "Free";
}

function goConceptIds(lessons) {
  const { orderLessons } = require("../concept-paths");
  return [...new Set(lessons.map(item => item.category))]
    .flatMap(category => orderLessons(category, lessons.filter(item => item.category === category))
      .slice(0, GO_CONCEPT_LIMIT).map(item => item.id));
}

function freePreviewIds(items, groupBy = () => "") {
  const counts = new Map();
  const free = new Set();
  for (const item of items) {
    const group = groupBy(item);
    const count = counts.get(group) || 0;
    if (count < FREE_PREVIEW_LIMIT) free.add(item.id);
    counts.set(group, count + 1);
  }
  return free;
}

module.exports = { FREE_PREVIEW_LIMIT, GO_CONCEPT_LIMIT, freePreviewIds, membershipTier,
  hasInterviewAccess, goConceptIds, VISUAL_MEMORY_PAGE, guidePreviewLimit };
