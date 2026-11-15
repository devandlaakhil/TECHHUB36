(() => {
  "use strict";
  const REPLY_DELAY_MS = 2000;
  const QUESTIONS = {
    price: "What are the Go and Pro prices?",
    benefits: "What do Go and Pro include?",
    free: "What can I use free?",
    pin: "How does the PIN work?",
    courses: "Are these video courses?",
    masterclass: "How do I join a masterclass?",
    newsletter: "Can I join the newsletter?",
    payment: "How do payments work?",
  };
  function planPrice(config, tier) {
    const price = config?.plans?.[tier];
    return Number.isFinite(price) && price > 0
      ? `${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price)} one-time`
      : "See the current price on the Pro plans page";
  }
  const proPrice = config => planPrice(config, "Pro");
  function answerFor(id, config) {
    const ready = Object.values(config?.providers || {}).some(Boolean);
    const answers = {
      price: config ? `Go: ${planPrice(config, "Go")}. Pro: ${proPrice(config)}. No monthly renewal is created. ${ready
        ? "Review the exact amount with your chosen provider before paying. PayPal uses separately configured USD pricing."
        : "Online payments are not enabled on this deployment yet. Do not send money to an unofficial account."}`
        : "I cannot confirm the current Pro price yet. Please open Pro plans to check the amount before paying.",
      benefits: "Go includes unlimited subject/company Interview Q&A, one six-question AI interview per UTC day, and the first two concept lessons per subject. Pro includes all available content, unlimited AI interview sessions, the remote code runner, live 1:1 coaching, and course completion certificates. AI needs its configured model service; the runner needs its configured compiler service. Coaching schedules and certificate eligibility/issuance details are pending; checkout does not book a session or issue a certificate. Masterclass seats and job placements are not included. Individual item PIN access is not a Pro membership.",
      free: "Read ten free questions per subject and ten lessons per standard guide. The Visual Interview Memory Lab offers thirty free questions with visual cues and interview answers. The separate Company Interviews library has ten free questions in total. Student schedules, subject search, and browser-local learning progress are free.",
      pin: "Enter the owner's PIN separately for each protected question or lesson. It opens only that item. Closing it, changing the company/topic filter, or revisiting the page locks it again. PIN confirmation is not a paid membership.",
      courses: "Courses contain topic explanations, worked examples, and revision notes, not interview question banks or a separately sold video library. Interview questions are in Interview Q&A. Pro includes completion certificates subject to published requirements; those issuance details are pending.",
      masterclass: "You can join the masterclass interest list. Dates, duration, capacity, platform, and fees are not published yet. Registering interest does not book a seat or charge you.",
      newsletter: "The newsletter page collects optional interest after consent. Email publishing has not launched. Joining the list does not create an account, unlock Pro, or register you for a masterclass.",
      payment: !config ? "Payment settings are not available yet. Open Pro plans to review the available providers before paying."
        : ready
        ? "Sign in, review Go or Pro, choose a configured provider, and confirm the amount. Access activates only after the backend verifies the payment. A return URL or chat message cannot unlock membership."
        : "No verified online checkout is configured on this deployment. You can use free previews or the owner's configured per-item PIN. Chat never collects card details or accepts payments.",
    };
    return Object.hasOwn(QUESTIONS, id) ? answers[id] : null;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { REPLY_DELAY_MS, QUESTIONS, answerFor, proPrice };
    return;
  }
  if (document.querySelector("[data-support-widget]")) return;
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const css = node("link");
  css.rel = "stylesheet";
  css.href = "/support-chat.css";
  document.head.append(css);
  let config = null;
  const configReady = fetch("/api/config", { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async response => {
    if (response.ok) config = await response.json();
  }).catch(() => {});
  configReady.then(() => {
    document.querySelectorAll("[data-pro-price]").forEach(element => { element.textContent = proPrice(config); });
    document.querySelectorAll("[data-go-price]").forEach(element => { element.textContent = planPrice(config, "Go"); });
    document.querySelectorAll("[data-pro-price-note]").forEach(element => {
      element.textContent = Object.values(config?.providers || {}).some(Boolean)
        ? "Review the exact amount and provider currency before paying."
        : "Online checkout is not enabled yet. No payment is taken here.";
    });
  });
  const widget = node("section");
  widget.dataset.supportWidget = "";
  const launch = node("button", "AskKR7Tech", "support-launcher");
  launch.type = "button";
  launch.setAttribute("aria-expanded", "false");
  launch.setAttribute("aria-controls", "kr7-support-panel");
  const panel = node("div", "", "support-panel");
  panel.id = "kr7-support-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "kr7-support-title");
  const header = node("div", "", "support-header");
  const heading = node("h2", "AskKR7Tech");
  heading.id = "kr7-support-title";
  heading.tabIndex = -1;
  const close = node("button", "Close");
  close.type = "button";
  header.append(heading, close);
  const intro = node("p", "Choose a question below. I can help with pricing, benefits, and access.");
  const disclosure = node("small", "Automated support", "support-disclosure");
  const messages = node("div", "", "support-messages");
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");
  const suggestions = node("div", "", "support-suggestions");
  const links = node("p");
  for (const [label, href] of [["Pro plans", "/Membership.html"], ["Courses", "/Courses.html"], ["Masterclass", "/Masterclass.html"],
    ["WhatsApp community", "https://chat.whatsapp.com/FKxdeTehHKF7o4kjp1bigU"]]) {
    const link = node("a", label);
    link.href = href;
    if (href.startsWith("https://chat.whatsapp.com/")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    links.append(link, document.createTextNode(" "));
  }
  let pending = false;
  let timer;
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const button = node("button", question);
    button.type = "button";
    button.dataset.supportQuestion = id;
    button.addEventListener("click", () => {
      if (pending) return;
      pending = true;
      suggestions.querySelectorAll("button").forEach(choice => { choice.disabled = true; });
      while (messages.children.length > 14) messages.firstElementChild.remove();
      messages.append(node("p", question, "support-question"));
      const typing = node("p", "Typing...", "support-typing");
      messages.append(typing);
      messages.setAttribute("aria-busy", "true");
      timer = setTimeout(() => {
        typing.replaceWith(node("p", answerFor(id, config), "support-answer"));
        messages.setAttribute("aria-busy", "false");
        pending = false;
        suggestions.querySelectorAll("button").forEach(choice => { choice.disabled = false; });
      }, REPLY_DELAY_MS);
    });
    suggestions.append(button);
  }
  const callback = node("details", "", "support-callback");
  callback.append(node("summary", "Optional: request owner follow-up"));
  const form = node("form");
  const fields = node("fieldset");
  fields.disabled = true;
  fields.append(node("legend", "Share only if you want to be contacted"));
  for (const [name, label, type, autocomplete, required] of [
    ["name", "Name", "text", "name", true],
    ["email", "Email address", "email", "email", true],
    ["phone", "Mobile with country code (optional)", "tel", "tel", false],
  ]) {
    const wrapper = node("label", label);
    const input = node("input");
    input.name = name;
    input.type = type;
    input.autocomplete = autocomplete;
    input.maxLength = name === "email" ? 254 : name === "phone" ? 24 : 80;
    input.required = required;
    wrapper.append(input);
    fields.append(wrapper);
  }
  const consent = node("label", "", "support-consent");
  const check = node("input");
  check.type = "checkbox";
  check.name = "consent";
  check.required = true;
  consent.append(check, node("span", "I agree to store these details for owner follow-up. This does not sign me up for marketing or confirm a call."));
  const send = node("button", "Send contact request");
  send.type = "submit";
  fields.append(consent, send);
  const status = node("p", "Checking contact form availability...");
  status.setAttribute("role", "status");
  const privacy = node("a", "How form data is used");
  privacy.href = "/Privacy.html";
  form.append(fields, status, privacy);
  callback.append(form);
  fetch("/api/community", { cache: "no-store", signal: AbortSignal.timeout(8000) }).then(async response => {
    if (!response.ok) throw new Error();
    const setup = await response.json();
    fields.disabled = !setup.enabled;
    status.textContent = setup.enabled
      ? "FAQ answers work without sharing personal details. Contact requests are saved privately."
      : "Owner follow-up registration is not configured. You can still use every suggested FAQ.";
  }).catch(() => { status.textContent = "Contact registration is unavailable. Suggested FAQs still work."; });
  let requestId = crypto.randomUUID();
  let sending = false;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (sending || fields.disabled || !form.reportValidity()) return;
    const data = new FormData(form);
    sending = true;
    send.disabled = true;
    status.textContent = "Saving your contact request...";
    try {
      const response = await fetch("/api/community", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "enquiry", requestId, name: data.get("name"), email: data.get("email"),
          phone: data.get("phone"), consent: data.get("consent") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save your request.");
      status.textContent = result.message;
      form.reset();
      requestId = crypto.randomUUID();
    } catch (error) {
      status.textContent = error.message || "Could not save your request.";
    } finally { sending = false; send.disabled = false; }
  });
  function setOpen(open) {
    panel.hidden = !open;
    launch.setAttribute("aria-expanded", String(open));
    if (open) heading.focus();
    else launch.focus();
  }
  launch.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false));
  panel.addEventListener("keydown", event => { if (event.key === "Escape") setOpen(false); });
  window.addEventListener("pagehide", () => clearTimeout(timer));
  panel.append(header, intro, messages, suggestions, links, callback, disclosure);
  widget.append(launch, panel);
  document.body.append(widget);
})();
