"use strict";

const FREE_PREVIEW_LIMIT = 10;
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

module.exports = { FREE_PREVIEW_LIMIT, freePreviewIds, membershipTier,
  hasInterviewAccess, VISUAL_MEMORY_PAGE, guidePreviewLimit };
