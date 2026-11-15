const fs = require("node:fs");
const path = require("node:path");
const { sendError, supabaseUrl, authenticatedUser } = require("./_shared");
const { learningAccess } = require("./_learning-content");
const { mongoEnabled } = require("./_mongo");
const { consumeGrant } = require("./_pin-grants");
const { escapeHtml, learningGuideTopics: guideTopics, renderTopics, renderGuidePractice, dsaPreviewHtml } = require("./_guide-preview");
const { courseForPage } = require("../learning-catalog");
const { VISUAL_MEMORY_PAGE, guidePreviewLimit } = require("./_pro-policy");
const { renderSiteLayout } = require("./_site-layout");
const { sendUnavailable } = require("./_availability");

function learningToolbar(page) {
  const course = courseForPage(page);
  return course ? `<aside class="learning-toolbar" data-learning-course="${course.id}" aria-label="Learning progress"></aside><p class="note" data-learning-status></p>` : "";
}

const LEARNING_SCRIPTS = '<script src="/learning-catalog.js" defer></script><script src="/learning.js" defer></script>';

const GUIDE_ASSETS = new Map([
  ["dotnet-roadmap.js", "Dotnet-Roadmap.html"],
  ["interview-studio.js", "Interview-Studio.html"],
]);

const PROTECTED_PAGES = new Set([
  VISUAL_MEMORY_PAGE,
  "Amazon-Design.html",
  "System-Design.html",
  "AZURECICD.html",
  "AZURECICD - Copy.html",
  "C#Dotnet.html",
  "Dotnet-Roadmap.html",
  "Interview-Studio.html",
  "DSA.html",
  "How AI work.html",
  "Project.html",
]);

const PREVIEW_COURSES = {
  [VISUAL_MEMORY_PAGE]: {
    title: "Visual Interview Memory Lab",
    description: "Remember C# and .NET through visual cues, diagrams, one-line answers and interview-ready explanations.",
  },
  "Amazon-Design.html": {
    title: "Amazon-scale marketplace design",
    description: "Explore a marketplace architecture through its requirements, APIs, data ownership, checkout flow, and operational trade-offs.",
  },
  "System-Design.html": {
    title: "System design from first principles",
    description: "Follow one marketplace case study from requirements and core concepts to reliability, security, and senior-level design decisions.",
  },
  "AZURECICD.html": {
    title: "Azure and CI/CD",
    description: "Build understanding of cloud foundations, secure deployment, messaging, pipelines, and production operations.",
  },
  "AZURECICD - Copy.html": {
    title: "Azure and CI/CD",
    description: "Build understanding of cloud foundations, secure deployment, messaging, pipelines, and production operations.",
  },
  "C#Dotnet.html": {
    title: "C# and .NET",
    description: "Learn programming foundations, ASP.NET Core, EF Core, async, security, performance, and production engineering.",
  },
  "Dotnet-Roadmap.html": {
    title: "The 365-day C#/.NET roadmap",
    description: "A structured path from programming foundations through backend, cloud, production engineering, and senior-level practice.",
  },
  "Interview-Studio.html": {
    title: "Interview practice studio",
    description: "Practice debugging, SQL review, system design, incident response, and project-story communication.",
  },
  "DSA.html": {
    title: "Data structures and algorithms",
    description: "Develop problem-solving habits with core patterns, visual traces, complexity reasoning, and coding practice.",
  },
  "How AI work.html": {
    title: "How AI, RAG, and agents work",
    description: "Build understanding of LLM fundamentals, retrieval-augmented generation, agent workflows, and responsible implementation.",
  },
  "Project.html": {
    title: "CRM and application architecture",
    description: "Explore realistic CRM, omnichannel, and commerce scenarios through architecture and implementation decisions.",
  },
};

function renderPreviewPage(page, html, directory) {
  const course = PREVIEW_COURSES[page];
  if (!course) throw new Error("Missing preview details for protected guide.");
  directory ||= __dirname.endsWith(`${path.sep}api`) ? path.dirname(__dirname) : process.cwd();
  html ??= fs.readFileSync(path.join(directory, page), "utf8");
  if (page === VISUAL_MEMORY_PAGE) return renderVisualMemoryPage(html, directory);
  if (page === "DSA.html") {
    return renderSiteLayout(dsaPreviewHtml(html).replace(/<\/body>/i,
      `<script src="/pro-access.js" defer></script>${LEARNING_SCRIPTS}</body>`), page);
  }
  const topics = guideTopics(page, html, directory, course.title);
  const title = escapeHtml(course.title);
  const description = escapeHtml(course.description);

  return renderSiteLayout(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex,nofollow,noarchive,nosnippet" />
    <title>${title} | KR7Tech preview</title>
    <link rel="stylesheet" href="/learning.css" />
    <style>
      :root { color-scheme: dark; --page:#101923; --surface:#172431; --ink:#f4f7fa; --muted:#b7c3cf; --line:#334455; --brand:#50dfbf; }
      * { box-sizing:border-box; }
      body { margin:0; padding:24px; background:var(--page); color:var(--ink); font:16px/1.6 "Segoe UI",sans-serif; }
      main { width:min(100%,1160px); margin:auto; padding:clamp(18px,4vw,40px); border:1px solid var(--line); border-radius:18px; background:linear-gradient(145deg,#193630,var(--surface) 62%); }
      .brand { color:var(--ink); font-size:1.05rem; font-weight:900; text-decoration:none; }
      .brand span { color:var(--brand); }
      .eyebrow { margin:38px 0 8px; color:var(--brand); font-size:.78rem; font-weight:900; letter-spacing:.13em; text-transform:uppercase; }
      h1 { margin:0; font-size:clamp(2rem,6vw,3.7rem); letter-spacing:-.05em; line-height:1.05; }
      .description { margin:17px 0 22px; color:var(--muted); font-size:1.08rem; }
      .preview { margin:0; padding:16px 18px; border:1px solid var(--line); border-radius:12px; background:#111b25; }
      .preview strong { color:var(--brand); }
      .preview p { margin:5px 0 0; color:var(--muted); }
      .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:23px; }
      .button { display:inline-flex; min-height:46px; align-items:center; justify-content:center; padding:9px 16px; border:1px solid var(--brand); border-radius:8px; background:var(--brand); color:#09241f; font-weight:900; text-decoration:none; }
      button.button { cursor:pointer; font:inherit; font-weight:900; }
      .button.secondary { background:transparent; color:var(--ink); }
      .note { margin:15px 0 0; color:#93a5b3; font-size:.82rem; }
      a { color:var(--brand); }
      .preview-topic { margin-top:36px; }
      .preview-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,330px),1fr)); gap:16px; }
      .preview-item { min-width:0; overflow:hidden; padding:20px; border:1px solid var(--line); border-radius:12px; background:#111b25; overflow-wrap:anywhere; }
      .preview-item h3 { margin-top:0; }
      pre, .diagram { overflow:auto; padding:12px; border-radius:8px; background:#0b141d; white-space:pre-wrap; }
      table { display:block; max-width:100%; overflow:auto; }
      td, th { padding:8px; border:1px solid var(--line); }
      summary { cursor:pointer; }
      .guide-pro-placeholder { position:relative; min-height:180px; }
      .pro-blur { filter:blur(7px); pointer-events:none; user-select:none; }
      .pro-overlay { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:12px; background:#111b2566; }
      :focus-visible { outline:3px solid var(--brand); outline-offset:4px; }
    </style>
  </head>
  <body>
    <main>
      <a class="brand" href="/">KR7<span>Tech</span></a>
      <p class="eyebrow">Learning guide preview</p>
      <h1>${title}</h1>
      <p class="description">${description}</p>
      ${learningToolbar(page)}
      <aside class="preview">
        <strong>First 10 questions and answers per topic are free</strong>
        <p>Read the free lessons below. Remaining questions and answers are blurred for visitors and unlocked with verified KR7Tech Pro access.</p>
      </aside>
      <div class="actions">
        <button class="button" type="button" data-pro-unlock>Unlock Pro - Enter PIN</button>
        <button class="button" type="button" data-local-pro-unlock hidden>Unlock Pro for local testing</button>
        <a class="button secondary" href="/Company-Interviews.html#access-heading">Sign in and explore Pro</a>
        <a class="button secondary" href="/">Back to KR7Tech</a>
        <a class="button secondary" href="/Student-Plan.html">Student Plan</a>
      </div>
      <p class="note">Enter the PIN separately for each Pro question or lesson. Opening one item does not unlock other items or topics.</p>
      ${renderTopics(topics, page)}
    </main>
    <script src="/local-pro-access.js" defer></script>
    <script src="/pro-access.js" defer></script>
    ${LEARNING_SCRIPTS}
  </body>
</html>`, page);
}

function renderVisualMemoryPage(html, directory, isPro = false) {
  const topics = guideTopics(VISUAL_MEMORY_PAGE, html, directory, "C# and .NET visual questions");
  const content = html.replace('<div data-visual-memory-items></div>', renderTopics(topics, VISUAL_MEMORY_PAGE, { unlocked: isPro }));
  if (content === html) throw new Error("Visual memory lab content container is missing.");
  return renderSiteLayout(isPro ? content.replace(/<html\b/i, '<html data-guide-access="pro"') : content, VISUAL_MEMORY_PAGE);
}

function sessionCookie(req) {
  const raw = req.headers.cookie || "";
  const match = raw.split(";").map(item => item.trim()).find(item => item.startsWith("visual_pro_session="));
  return match ? decodeURIComponent(match.slice("visual_pro_session=".length)) : null;
}

async function userFromCookie(req) {
  if (mongoEnabled()) return authenticatedUser(req);
  const token = sessionCookie(req);
  if (!token) return null;
  const response = await fetch(supabaseUrl("/auth/v1/user"), {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  return response.ok ? response.json() : null;
}

module.exports = async function handler(req, res) {
  try {
    const asset = req.query.asset;
    if (asset && !GUIDE_ASSETS.has(asset)) return res.status(404).send("File not found.");
    const page = asset ? GUIDE_ASSETS.get(asset) : req.query.page;
    if (!PROTECTED_PAGES.has(page)) return res.status(404).send("Page not found.");

    const itemIndex = req.query.item;
    if (itemIndex !== undefined && (asset || typeof itemIndex !== "string" || !/^\d{1,5}$/.test(itemIndex))) {
      return res.status(400).json({ error: "Choose a valid guide item." });
    }
    const itemAccess = itemIndex !== undefined && consumeGrant(req, `guide:${page}:${Number(itemIndex)}`);
    const { entitlements } = await learningAccess(req, { skip: itemAccess, authenticate: userFromCookie });
    const isPro = entitlements.some(item => item.tier === "Pro" && item.active !== false);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (asset) {
      if (!isPro) return res.status(403).send("Pro access is required.");
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      return res.status(200).send(fs.readFileSync(path.join(__dirname, "..", asset), "utf8"));
    }
    const candidates = [path.join(__dirname, "..", page), path.join(process.cwd(), page), path.join(process.cwd(), "StudyGuide", page)];
    const file = candidates.find(candidate => fs.existsSync(candidate));
    if (!file) return res.status(404).send("Page not found.");

    const html = fs.readFileSync(file, "utf8");
    if (itemIndex !== undefined) {
      if (!isPro && !itemAccess && Number(itemIndex) >= guidePreviewLimit(page)) {
        return res.status(403).json({ error: "Enter the PIN for this Pro lesson." });
      }
      const item = guideTopics(page, html, path.dirname(file), PREVIEW_COURSES[page].title)[0].items[Number(itemIndex)];
      if (!item) return res.status(404).json({ error: "Guide item not found." });
      return res.status(200).json({ html: item.html });
    }
    if (page === VISUAL_MEMORY_PAGE) return res.status(200).send(renderVisualMemoryPage(html, path.dirname(file), isPro));
    if (!isPro) return res.status(200).send(renderPreviewPage(page, html, path.dirname(file)));
    const toolbarContainer = /<main\b/i.test(html) ? /<main\b[^>]*>/i : /<body\b[^>]*>/i;
    const withLearningToolbar = html.replace(toolbarContainer, match =>
      `${match}${learningToolbar(page)}`);
    const practiceContainer = /<\/main>/i.test(withLearningToolbar) ? /<\/main>/i : /<\/body>/i;
    const withPractice = withLearningToolbar.replace(practiceContainer, match =>
      `${renderGuidePractice(page)}${match}`);
    const withManualLocks = withPractice.replace(/<html\b/i, '<html data-guide-access="pro"')
      .replace(/<\/head>/i, '<link rel="stylesheet" href="/learning.css" /></head>')
      .replace(/<\/body>/i, `  <aside style="padding:16px;text-align:center"><a href="/">KR7Tech home</a> | Pro access active <button type="button" data-pro-lock hidden>Lock PIN session</button></aside>
  <script src="/guide-locks.js" defer></script>
  <script src="/pro-access.js" defer></script>
  ${LEARNING_SCRIPTS}
</body>`);

    return res.status(200).send(renderSiteLayout(withManualLocks, page));
  } catch (error) {
    if (!req.query.asset && req.query.item === undefined) {
      console.error("Guide page is temporarily unavailable.", error);
      return sendUnavailable(res);
    }
    return sendError(res, error);
  }
};

module.exports.renderPreviewPage = renderPreviewPage;
