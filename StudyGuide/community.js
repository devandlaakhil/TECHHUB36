(() => {
  "use strict";
  const element = (tag, text) => {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  };
  const forms = [...document.querySelectorAll("[data-community-form]")];
  const contact = document.querySelector("[data-support-contact]");
  fetch("/api/community", { cache: "no-store" }).then(async response => {
    if (!response.ok) throw new Error();
    const config = await response.json();
    if (contact && config.supportEmail) {
      const link = element("a", config.supportEmail);
      link.href = `mailto:${encodeURIComponent(config.supportEmail)}`;
      contact.replaceChildren(element("span", "Contact: "), link);
    }
    for (const form of forms) {
      form.querySelector("fieldset").disabled = !config.enabled;
      form.querySelector("[role=status]").textContent = config.enabled
        ? "Choose your preferences and submit when ready."
        : "This form is temporarily unavailable. Please try again later. Nothing has been submitted.";
    }
  }).catch(() => {
    for (const form of forms) form.querySelector("[role=status]").textContent = "Registration is temporarily unavailable. Nothing is submitted.";
  });

  for (const form of forms) {
    let requestId = crypto.randomUUID();
    let submitting = false;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (submitting || !form.reportValidity() || form.querySelector("fieldset").disabled) return;
      submitting = true;
      const status = form.querySelector("[role=status]");
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = "Saving your request...";
      const fields = new FormData(form);
      const kind = form.dataset.communityForm;
      const body = {
        kind, name: fields.get("name") || "", email: fields.get("email") || "",
        consent: fields.get("consent") === "on",
        courseId: fields.get("courseId"), rating: Number(fields.get("rating")),
        feedback: fields.get("feedback"), publicConsent: fields.get("publicConsent") === "on",
        requestId,
      };
      try {
        const response = await fetch("/api/community", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save your request.");
        status.textContent = result.message;
        form.reset();
        requestId = crypto.randomUUID();
      } catch (error) {
        status.textContent = error.message || "Could not save your request. Please try again.";
      } finally {
        submitting = false;
        button.disabled = false;
      }
    });
  }

  const reviews = document.querySelector("[data-community-feedback]");
  if (reviews) {
    fetch("/api/community?action=feedback", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const { feedback } = await response.json();
      const limit = Number.parseInt(reviews.dataset.feedbackLimit || "", 10);
      const visibleFeedback = Number.isInteger(limit) && limit >= 0 ? feedback.slice(0, limit) : feedback;
      if (!visibleFeedback.length) {
        const empty = element("div", "");
        empty.className = "feedback-empty";
        empty.append(element("h3", "Your experience could inspire the next learner."),
          element("p", "No public learner stories yet. Try a free preview, build something, and share what helped or what could be better."));
        reviews.replaceChildren(empty);
        return;
      }
      reviews.replaceChildren(...visibleFeedback.map(item => {
        const card = element("article", "");
        card.className = "offering-card feedback-card";
        const header = element("header", "");
        header.className = "feedback-card-header";
        const avatar = element("span", item.name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0]).join("").toUpperCase());
        avatar.className = "feedback-avatar";
        avatar.setAttribute("aria-hidden", "true");
        const identity = element("div", "");
        const name = element("h3", item.name);
        name.className = "feedback-name";
        const source = element("p", "Learner feedback");
        source.className = "feedback-source";
        identity.append(name, source);
        header.append(avatar, identity);
        const stars = element("div", "");
        stars.className = "feedback-stars";
        stars.setAttribute("role", "img");
        stars.setAttribute("aria-label", `Rated ${item.rating} out of 5`);
        for (let index = 0; index < 5; index++) {
          const star = element("span", "");
          star.className = `feedback-star${index < item.rating ? " filled" : ""}`;
          stars.append(star);
        }
        const consent = element("p", "Shared with permission - owner reviewed");
        consent.className = "feedback-consent";
        card.append(header, stars, element("blockquote", item.feedback), consent);
        return card;
      }));
    }).catch(() => reviews.replaceChildren(element("p", "Learner feedback is temporarily unavailable.")));
  }
})();
