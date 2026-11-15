"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { parse } = require("parse5");
const { renderSiteLayout } = require("../api/_site-layout");

const root = path.join(__dirname, "..");
const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)];
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;

test("shared layout replaces site chrome without changing lesson bodies, scripts, or content footers", () => {
  const content = '<main id="original"><header class="hero">Keep the lesson heading</header><pre>&lt;T&gt;</pre><footer>Keep this learning disclaimer.</footer></main>';
  const script = '<script>const text = "<header>not markup</header>";</script>';
  const source = `<!doctype html><html><head><title>Guide</title></head><body><header><nav aria-label="Primary navigation">Old navigation</nav></header>${content}<footer>Old site links</footer>${script}</body></html>`;
  const rendered = renderSiteLayout(source, "DSA.html");
  assert.ok(rendered.includes(content.slice(content.indexOf(">") + 1)));
  assert.ok(rendered.includes(script));
  assert.ok(!rendered.includes("Old navigation"));
  assert.ok(!rendered.includes("Old site links"));
  assert.match(rendered, /class="site-skip-link" href="#original"/);
  assert.match(rendered, /href="\/DSA.html" aria-current="page"/);
  assert.equal(renderSiteLayout(rendered, "DSA.html"), rendered);
});

test("shared branding updates existing metadata, preserves escaped page names and stays idempotent", () => {
  const source = '<html><head><title>Coding &amp; examples</title><meta name="application-name" content="Old name"><meta property="og:site_name" content="Old name"></head><body><main>Lesson</main></body></html>';
  const rendered = renderSiteLayout(source, "DSA.html");
  const elements = nodes(parse(rendered));
  for (const [key, value] of [["name", "application-name"], ["property", "og:site_name"]]) {
    const meta = elements.filter(node => node.tagName === "meta" && attr(node, key) === value);
    assert.equal(meta.length, 1);
    assert.equal(attr(meta[0], "content"), "KR7Tech");
  }
  assert.match(rendered, /<title>TechHub365 \| Coding &amp; examples<\/title>/);
  assert.equal(renderSiteLayout(rendered, "DSA.html"), rendered);
  const missing = renderSiteLayout("<html><head></head><body><main>Lesson</main></body></html>", "DSA.html");
  assert.match(missing, /<title>TechHub365<\/title>/);
  const legacyIcon = renderSiteLayout('<html><head><title>1:1 | KR7Tech</title><link rel="icon" href="/old.ico"></head><body><main>Coaching</main></body></html>', "Coaching.html");
  assert.match(legacyIcon, /<title>TechHub365 \| 1:1<\/title>/);
  assert.doesNotMatch(legacyIcon, /old\.ico/);
  assert.equal(nodes(parse(legacyIcon)).filter(node => attr(node, "rel") === "icon").length, 1);
});

test("WhatsApp community invites use the supplied link and keep account support private", () => {
  const invite = "https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU";
  const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
  for (const file of ["index.html", "Membership.html", "Contact.html", "DSA.html"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const elements = nodes(parse(renderSiteLayout(source, file)));
    const footer = elements.find(node => attr(node, "data-site-footer") !== undefined);
    const link = nodes(footer).find(node => attr(node, "class") === "site-whatsapp-link");
    assert.equal(attr(link, "href"), invite, file);
    assert.equal(attr(link, "target"), "_blank", file);
    assert.match(attr(link, "rel"), /\bnoopener\b/);
    assert.match(attr(link, "rel"), /\bnoreferrer\b/);
    assert.match(text(footer), /daily learning updates/);
    assert.match(text(footer), /contact the admin privately/);
    assert.match(text(footer), /Do not share personal or payment details/);
  }
  for (const file of ["Membership.html", "Contact.html"]) {
    const elements = nodes(parse(fs.readFileSync(path.join(root, file), "utf8")));
    const supportLinks = elements.filter(node => attr(node, "href")?.startsWith("https://wa.me/"));
    assert.ok(supportLinks.length > 0, file);
    for (const link of supportLinks) {
      const url = new URL(attr(link, "href"));
      assert.equal(url.pathname, "/918985837483");
      assert.equal(url.searchParams.get("text"), "Hello KR7Tech admin, I need help with my membership or checkout.");
      assert.equal(attr(link, "target"), "_blank");
      assert.match(attr(link, "rel"), /\bnoopener\b/);
      assert.match(attr(link, "rel"), /\bnoreferrer\b/);
    }
    assert.equal(elements.some(node => attr(node, "href")?.startsWith("tel:")), false);
    assert.match(text(elements[0]), /Direct calls may not be available|direct calls may not be available/);
  }
  const contact = nodes(parse(fs.readFileSync(path.join(root, "Contact.html"), "utf8")));
  assert.ok(contact.some(node => attr(node, "href") === invite));
});

test("every page gets one shared primary navigation with working destinations and a valid content skip target", () => {
  const documents = new Map(fs.readdirSync(root).filter(file => file.endsWith(".html"))
    .map(file => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  for (const [file, source] of documents) {
    const elements = nodes(parse(renderSiteLayout(source, file)));
    const title = elements.find(node => node.tagName === "title");
    assert.match((title?.childNodes || []).map(node => node.value || "").join(""), /^TechHub365(?: \||$)/, file);
    assert.ok(elements.some(node => attr(node, "rel") === "icon" && attr(node, "href") === "/assets/kr7tech-icon.svg"), file);
    assert.ok(elements.some(node => attr(node, "name") === "application-name" && attr(node, "content") === "KR7Tech"), file);
    assert.ok(elements.some(node => attr(node, "property") === "og:site_name" && attr(node, "content") === "KR7Tech"), file);
    const headers = elements.filter(node => attr(node, "data-site-header") !== undefined);
    assert.equal(headers.length, 1, file);
    assert.equal(elements.filter(node => attr(node, "aria-label") === "Main navigation").length, 1, file);
    assert.equal(elements.filter(node => attr(node, "data-site-footer") !== undefined).length, 1, file);
    const footer = elements.find(node => attr(node, "data-site-footer") !== undefined);
    if (file !== "index.html" && nodes(footer).some(node => attr(node, "href") === `/${encodeURI(file)}`)) {
      assert.equal(elements.filter(node => attr(node, "aria-label") === "Breadcrumb").length, 1, file);
    }
    assert.equal(elements.some(node => attr(node, "data-learning-sections") !== undefined), false, file);
    assert.equal(elements.some(node => node.tagName === "script" && attr(node, "src") === "learning-sections.js"), false, file);
    const headerNodes = nodes(headers[0]);
    const navigation = headerNodes.find(node => attr(node, "aria-label") === "Main navigation");
    const destinations = navigation.childNodes.filter(node => node.tagName === "a");
    assert.deepEqual(destinations.slice(0, 2).map(node => attr(node, "href")),
      ["/index.html", "/Subject-QA.html"], file);
    const support = headerNodes.find(node => attr(node, "class") === "site-support-link");
    assert.equal(attr(support, "href"), "https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU", file);
    assert.equal(attr(support, "target"), "_blank", file);
    assert.equal(attr(support, "rel"), "noopener noreferrer", file);
    assert.match(attr(support, "aria-label"), /Support.*WhatsApp community/);
    assert.equal(nodes(navigation).includes(support), false, `${file}: support stays outside the mobile menu`);
    const theme = headerNodes.find(node => attr(node, "data-theme-toggle") !== undefined);
    assert.equal(theme.tagName, "button", file);
    assert.equal(nodes(navigation).includes(theme), false, `${file}: theme stays outside the mobile menu`);
    const primaryLinks = headerNodes.filter(node => node.tagName === "a");
    for (const destination of ["Subject-QA.html", "AI-Interview.html", "Courses.html", "Concepts.html", "Membership.html"]) {
      assert.ok(primaryLinks.some(node => attr(node, "href") === `/${destination}`), `${file}: ${destination}`);
    }
    for (const link of primaryLinks) {
      const url = new URL(attr(link, "href"), "http://site.test");
      if (url.origin !== "http://site.test") {
        assert.equal(link, support, file);
        continue;
      }
      const target = decodeURIComponent(url.pathname.slice(1));
      assert.ok(documents.has(target), `${file}: ${target}`);
      if (url.hash) assert.ok(nodes(parse(documents.get(target))).some(node =>
        attr(node, "id") === decodeURIComponent(url.hash.slice(1))), `${file}: ${url.hash}`);
    }
    const active = primaryLinks.filter(node => attr(node, "aria-current") === "page");
    assert.ok(active.length <= 1, file);
    if (active.length) assert.equal(decodeURIComponent(attr(active[0], "href")).slice(1), file);
    const skip = elements.find(node => attr(node, "class") === "site-skip-link");
    assert.ok(elements.some(node => attr(node, "id") === decodeURIComponent(attr(skip, "href").slice(1))), file);
  }
});

test("the early theme initializer runs before page styles and overrides load after them without duplication", () => {
  const source = '<html><head><style>body { color: white; }</style><link rel="stylesheet" href="/account.css"></head><body><main>Account</main></body></html>';
  const rendered = renderSiteLayout(source, "Account.html");
  const head = nodes(parse(rendered)).find(node => node.tagName === "head");
  const children = head.childNodes.filter(node => node.tagName);
  const initializer = children.find(node => attr(node, "src") === "/site-theme.js");
  assert.ok(children.indexOf(initializer) < children.findIndex(node => node.tagName === "style"));
  assert.equal(attr(initializer, "defer"), undefined);
  assert.equal(attr(initializer, "async"), undefined);
  const styles = children.filter(node => node.tagName === "style" || attr(node, "rel") === "stylesheet");
  assert.equal(attr(styles.at(-1), "href"), "/site-theme.css");
  assert.equal(nodes(parse(rendered)).filter(node => attr(node, "src") === "/site-theme.js").length, 1);
  assert.equal(renderSiteLayout(rendered, "Account.html"), rendered);
});

test("named Learn and Practice menus expose the right destinations and identify the current group", () => {
  for (const [file, currentGroup] of [["Concepts.html", "Learn"], ["Courses.html", "Learn"],
    ["Subjects.html", "Learn"], ["DSA.html", "Practice"], ["Company-Interviews.html", "Practice"]]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    const elements = nodes(parse(renderSiteLayout(source, file)));
    const header = elements.find(node => attr(node, "data-site-header") !== undefined);
    const groups = nodes(header).filter(node => node.tagName === "details");
    const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
    assert.deepEqual(groups.map(group => text(group.childNodes.find(node => node.tagName === "summary")).trim()),
      ["Learn", "Practice"]);
    assert.equal(groups.filter(group => attr(group, "data-current-section") === "true").length, 1);
    const active = groups.find(group => attr(group, "data-current-section") === "true");
    assert.equal(text(active.childNodes.find(node => node.tagName === "summary")).trim(), currentGroup);
    assert.ok(nodes(active).some(node => attr(node, "href") === `/${file}` && attr(node, "aria-current") === "page"));
    assert.equal(nodes(header).filter(node => attr(node, "href") === "/Membership.html").length, 1);
    assert.equal(nodes(header).some(node => text(node).trim() === "More"), false);
  }
});

test("homepage discovery matches every interview topic and keeps learning, questions and coaching separate", () => {
  const elements = nodes(parse(renderSiteLayout(fs.readFileSync(path.join(root, "index.html"), "utf8"), "index.html")));
  const search = elements.find(node => node.tagName === "form" && attr(node, "role") === "search");
  assert.equal(attr(search, "action"), "Subjects.html");
  assert.equal(attr(search, "method"), "get");
  assert.ok(nodes(search).some(node => node.tagName === "input" && attr(node, "name") === "q"));
  const { COURSES, filterCourses } = require("../learning-catalog");
  assert.ok(filterCourses({ query: "SQL" }).length > 0);
  const categories = new Set(require("../api/_concept-lessons").map(lesson => lesson.category));
  const cards = elements.filter(node => attr(node, "class") === "home-topic-card");
  assert.equal(cards.length, COURSES.filter(course => course.kind === "Interview Q&A").length);
  for (const card of cards) {
    const links = nodes(card).filter(node => node.tagName === "a");
    assert.equal(links.length, 3);
    const learn = new URL(attr(links[0], "href"), "http://site.test");
    const interview = new URL(attr(links[1], "href"), "http://site.test");
    if (attr(card, "data-training-topic") === "Behavioral") {
      assert.equal(learn.pathname, "/Interview-Preparation.html");
    } else {
      assert.equal(learn.pathname, "/Concepts.html");
      assert.ok(categories.has(learn.searchParams.get("category")));
    }
    assert.equal(interview.pathname, "/Subject-QA.html");
    assert.ok(COURSES.some(course => course.kind === "Interview Q&A" && course.topic === interview.searchParams.get("topic")));
    const coaching = new URL(attr(links[2], "href"), "http://site.test");
    assert.equal(coaching.pathname, "/Coaching.html");
    assert.equal(coaching.searchParams.get("topic"), interview.searchParams.get("topic"));
  }
});
