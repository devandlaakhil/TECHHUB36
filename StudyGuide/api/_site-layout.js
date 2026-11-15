"use strict";

const { parse } = require("parse5");
const { mongoEnabled } = require("./_mongo");
const { planOffers } = require("./_pricing");
const { renderTrainingDirectory } = require("./_training-catalog");

const PRIMARY = [
  ["index.html", "Home"],
  ["Subject-QA.html", "Interview Q&A"],
  ["AI-Interview.html", "AI Interviews"],
  ["Membership.html", "Pricing", "site-pin-button"],
];
const GROUPS = [
  ["Learn", [
    ["Subjects.html", "Browse all topics"],
    ["Courses.html", "Courses", "nav-course-link"],
    ["Concepts.html", "Concepts", "nav-concept-link"],
    ["Fullstack-Angular-Dotnet.html", "Angular + .NET: 0-5 years"],
    ["My-Learning.html", "My Learning"],
    ["Student-Plan.html", "Student study planner"],
    ["Expert-Plan.html", "Experienced developer path"],
    ["Coaching.html", "1:1 Coaching"],
  ]],
  ["Practice", [
    ["DSA.html", "DSA + Compiler"],
    ["React-Machine-Coding.html", "Frontend Coding"],
    ["Company-Interviews.html", "Company Interviews"],
    ["Interview-Preparation.html", "Interview Preparation"],
    ["Interview-Studio.html", "Interview Studio"],
    ["Visual-Interview-Memory-Lab.html", "Visual Interview Memory Lab"],
  ]],
];
const CONNECT = [
  ["Masterclass.html", "Masterclasses"],
  ["Newsletter.html", "Newsletter"],
  ["Feedback.html", "Feedback"],
];
const GUIDE_NAMES = {
  "c#dotnet.html": "C# and .NET guide",
  "dotnet-roadmap.html": ".NET learning roadmap",
  "system-design.html": "System Design guide",
  "amazon-design.html": "Marketplace Design guide",
  "azurecicd.html": "Azure and CI/CD guide",
  "azurecicd - copy.html": "Azure and CI/CD guide",
  "how ai work.html": "AI concepts guide",
  "project.html": "Application Architecture guide",
  "privacy.html": "Privacy",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function attribute(node, name) {
  return node.attrs?.find(attr => attr.name === name)?.value;
}

function walk(node, result = []) {
  result.push(node);
  for (const child of node.childNodes || []) walk(child, result);
  return result;
}

function renderLink([href, label, className], page, badges = false, current = true) {
  const active = current && href.toLowerCase() === page;
  const badge = badges && /^nav-(course|concept)-link$/.test(className || "") ? ' <span class="nav-new">NEW</span>' : "";
  return `<a href="/${encodeURI(href).replace(/#/g, "%23")}"${className && current ? ` class="${className}"` : ""}${active ? ' aria-current="page"' : ""}>${escapeHtml(label)}${badge}</a>`;
}

function renderHeader(page, mainId) {
  const groups = GROUPS.map(([heading, links]) => {
    const active = links.some(([href]) => href.toLowerCase() === page);
    return `<details class="site-nav-group"${active ? ' data-current-section="true"' : ""}>
        <summary>${heading} <span class="site-chevron" aria-hidden="true"></span></summary>
        <div class="site-group-panel">${links.map(item => renderLink(item, page, true)).join("")}</div>
      </details>`;
  }).join("\n      ");
  return `<a class="site-skip-link" href="#${escapeHtml(encodeURIComponent(mainId))}">Skip to content</a>
<header class="site-header" data-site-header>
  <div class="site-header-inner">
    <a class="site-brand" href="/index.html" aria-label="KR7Tech home">KR7<span>Tech</span></a>
    <button class="site-menu-toggle" type="button" aria-controls="site-primary-navigation" aria-expanded="false" hidden>Menu</button>
    <nav id="site-primary-navigation" class="site-primary-nav topnav" aria-label="Main navigation">
      ${PRIMARY.slice(0, 2).map(item => renderLink(item, page)).join("\n      ")}
      ${groups}
      ${PRIMARY.slice(2).map(item => renderLink(item, page)).join("\n      ")}
      <a class="site-account-link" href="/Account.html"${page === "account.html" ? ' aria-current="page"' : ""}>Account</a>
    </nav>
    <div class="site-header-actions">
      <button class="site-theme-toggle" type="button" data-theme-toggle aria-label="White theme" aria-pressed="false" title="Switch to white theme" hidden>
        <svg class="site-theme-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
        <svg class="site-theme-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>
      </button>
      <a class="site-support-link" href="https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU" target="_blank" rel="noopener noreferrer" aria-label="Support - WhatsApp community (opens in a new tab)" title="Support - WhatsApp community">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 13v-2a8 8 0 0 1 16 0v2M4 12H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Zm0 7c0 2-2 3-5 3h-3"/></svg>
        <span class="site-support-label">Support</span>
      </a>
    </div>
  </div>
  ${page === "unavailable.html" ? "" : renderOffer()}
</header>`;
}

function renderOffer() {
  const offers = planOffers();
  const price = tier => new Intl.NumberFormat("en-IN").format(offers[tier].amount);
  return `<aside class="site-offer" aria-label="Membership offer"><strong>Grab ${offers.Go.discountPercent}% off Go &amp; Pro</strong>
    <span>Go INR ${price("Go")} &middot; Pro INR ${price("Pro")} &middot; One-time INR purchases only</span>
    <a href="/Membership.html#purchase">Grab the offer</a></aside>`;
}

function renderFooter(page) {
  const groups = [
    ["Learn", GROUPS[0][1]],
    ["Practice", [PRIMARY[1], PRIMARY[2], ...GROUPS[1][1]]],
    ["Connect", CONNECT],
    ["Support", [["Contact.html", "Contact support"], ["Purchase.html", "My purchases"], PRIMARY[3],
      ["Account.html", "Account"], ["Terms.html", "Terms of use"], ["Refund.html", "Payments & refunds"], ["Privacy.html", "Privacy"]]],
  ];
  return `<footer class="site-footer" data-site-footer>
  <div class="site-footer-inner">
    <div class="site-footer-intro"><a class="site-brand" href="/index.html" aria-label="KR7Tech home">KR7<span>Tech</span></a>
      <p>Learn the concepts. Practise your answers. Build with confidence.</p>
      <p>Courses explain topics; Interview Q&amp;A and AI Interviews help you practise.</p>
    </div>
    <nav class="site-footer-links" aria-label="Footer navigation">${groups.map(([heading, links]) =>
      `<section><h2>${heading}</h2>${links.map(item => renderLink(item, page, false, false)).join("")}</section>`).join("")}</nav>
    <aside class="site-footer-community" aria-labelledby="site-community-heading">
      <div><h2 id="site-community-heading">Learn together. Stay updated.</h2>
        <p>Join our WhatsApp community for daily learning updates, interview-preparation tips, and new content announcements.</p>
        <p class="site-community-note">For account or payment help, <a href="/Contact.html">contact the admin privately</a>. Do not share personal or payment details in the community.</p>
      </div>
      <a class="site-whatsapp-link" href="https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU" target="_blank" rel="noopener noreferrer">Join our WhatsApp community</a>
    </aside>
    <p class="site-footer-note">Try free previews. Choose Go or Pro for more access. One-time payments; no automatic renewal. Learning and practice do not guarantee a job or interview result.</p>
  </div>
</footer>`;
}

function renderSiteLayout(html, filename) {
  const nodes = walk(parse(html, { sourceCodeLocationInfo: true }));
  if (nodes.some(node => node.tagName === "header" && attribute(node, "data-site-header") !== undefined)) return html;
  const body = nodes.find(node => node.tagName === "body");
  const head = nodes.find(node => node.tagName === "head");
  if (!body?.sourceCodeLocation?.startTag || !head?.sourceCodeLocation?.endTag) return html;
  const page = String(filename).toLowerCase();
  const main = nodes.find(node => node.tagName === "main" && node.sourceCodeLocation);
  const mainId = attribute(main || {}, "id") || "site-main-content";
  const header = (body.childNodes || []).find(node => node.tagName === "header") ||
    nodes.find(node => node.tagName === "header" && walk(node).some(child =>
      child.tagName === "nav" && /^(main|primary) navigation$/i.test(attribute(child, "aria-label") || "")));
  const footer = (body.childNodes || []).find(node => node.tagName === "footer");
  const edits = [];
  function insert(offset, text) {
    edits.push({ start: offset, end: offset, text });
  }
  function replace(node, text) {
    const location = node.sourceCodeLocation;
    edits.push({ start: location.startOffset, end: location.endOffset, text });
  }
  for (const [key, value] of [["name", "application-name"], ["property", "og:site_name"]]) {
    const meta = nodes.find(node => node.tagName === "meta" && attribute(node, key) === value);
    const markup = `<meta ${key}="${value}" content="KR7Tech">`;
    if (meta) replace(meta, markup);
    else insert(head.sourceCodeLocation.startTag.endOffset, `${markup}\n`);
  }
  const title = nodes.find(node => node.tagName === "title");
  if (title) {
    const label = (title.childNodes || []).map(node => node.value || "").join("").trim();
    const pageTitle = label.replace(/\b(?:KR7Tech|TechHub365)\b/gi, "").replace(/^[\s|:-]+|[\s|:-]+$/g, "").trim();
    replace(title, `<title>${escapeHtml(pageTitle ? `TechHub365 | ${pageTitle}` : "TechHub365")}</title>`);
  } else {
    insert(head.sourceCodeLocation.startTag.endOffset, "<title>TechHub365</title>\n");
  }
  const icon = '<link rel="icon" type="image/svg+xml" href="/assets/kr7tech-icon.svg">';
  const icons = nodes.filter(node => node.tagName === "link" && /^(?:shortcut\s+)?icon$/i.test(attribute(node, "rel") || ""));
  if (icons.length) {
    replace(icons[0], icon);
    icons.slice(1).forEach(node => replace(node, ""));
  } else insert(head.sourceCodeLocation.startTag.endOffset, `${icon}\n`);
  insert(head.sourceCodeLocation.startTag.endOffset,
    '\n<script src="/site-theme.js"></script><link rel="stylesheet" href="/service-status.css"><script src="/service-status.js"></script>\n');
  insert(head.sourceCodeLocation.endTag.startOffset,
    '<link rel="stylesheet" href="/site-navigation.css"><link rel="stylesheet" href="/site-theme.css"><script src="/site-navigation.js" defer></script>\n');
  if (header) replace(header, renderHeader(page, mainId));
  else insert(body.sourceCodeLocation.startTag.endOffset, renderHeader(page, mainId));
  if (footer) replace(footer, renderFooter(page));
  else insert(body.sourceCodeLocation.endTag?.startOffset || html.length, renderFooter(page));
  for (const node of nodes) {
    const trainingMode = attribute(node, "data-training-directory");
    if (["topics", "coaching"].includes(trainingMode) && node.sourceCodeLocation?.endTag) {
      edits.push({
        start: node.sourceCodeLocation.startTag.endOffset, end: node.sourceCodeLocation.endTag.startOffset,
        text: renderTrainingDirectory(trainingMode),
      });
    }
    if (node.tagName === "nav" && attribute(node, "data-learning-sections") !== undefined ||
        node.tagName === "script" && /^\/?learning-sections\.js$/i.test(attribute(node, "src") || "")) {
      replace(node, "");
    }
  }
  if (mongoEnabled()) {
    const root = nodes.find(node => node.tagName === "html");
    if (root?.sourceCodeLocation?.startTag) insert(root.sourceCodeLocation.startTag.endOffset - 1, ' data-auth-provider="mongodb"');
    for (const node of nodes) {
      if (node.tagName !== "a" || !/^\/?Company-Interviews\.html#access-heading$/i.test(attribute(node, "href") || "")) continue;
      const location = node.sourceCodeLocation?.attrs?.href;
      if (!location || [header, footer].some(container => container &&
          location.startOffset >= container.sourceCodeLocation.startOffset &&
          location.endOffset <= container.sourceCodeLocation.endOffset)) continue;
      edits.push({ start: location.startOffset, end: location.endOffset, text: 'href="/Account.html"' });
    }
  }
  if (main) {
    if (!attribute(main, "id")) insert(main.sourceCodeLocation.startTag.endOffset - 1, ' id="site-main-content" tabindex="-1"');
    const label = [...PRIMARY, ...GROUPS.flatMap(([, links]) => links), ...CONNECT, ["Account.html", "Account"],
      ["Purchase.html", "My purchases"], ["Terms.html", "Terms of use"], ["Refund.html", "Payments & refunds"], ["Contact.html", "Contact support"]]
      .find(([href]) => href.toLowerCase() === page)?.[1] || GUIDE_NAMES[page];
    if (page !== "index.html" && label) {
      insert(main.sourceCodeLocation.startTag.endOffset,
        `<nav class="site-breadcrumb" aria-label="Breadcrumb"><a href="/index.html">Home</a><span aria-hidden="true">/</span><span>${escapeHtml(label)}</span></nav>`);
    }
  } else {
    insert(body.sourceCodeLocation.startTag.endOffset, '<span id="site-main-content" tabindex="-1"></span>');
  }
  // Source offsets preserve scripts and guide bodies exactly as authored.
  return edits.sort((a, b) => b.start - a.start).reduce((result, edit) =>
    result.slice(0, edit.start) + edit.text + result.slice(edit.end), html);
}

module.exports = { renderSiteLayout };
