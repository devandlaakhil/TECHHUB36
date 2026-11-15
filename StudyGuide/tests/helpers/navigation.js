"use strict";

async function openNavigation(page, group) {
  const nav = page.getByRole("navigation", { name: "Main navigation", exact: true });
  const toggle = page.getByRole("button", { name: "Menu", exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  if (group) {
    const summary = nav.locator("summary").filter({ hasText: new RegExp(`^${group}\\s`) });
    if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
  }
  return nav;
}

module.exports = { openNavigation };
