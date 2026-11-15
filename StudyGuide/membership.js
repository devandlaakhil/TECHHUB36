(() => {
  "use strict";

  const PROVIDERS = { razorpay: "Razorpay", stripe: "Stripe", paypal: "PayPal" };

  function paymentOptions(config, tier = "Pro") {
    if (!["Go", "Pro"].includes(tier)) return [];
    return Object.entries(PROVIDERS).flatMap(([provider, name]) => {
      if (config?.providers?.[provider] !== true) return [];
      if (provider === "paypal" && config?.paypalTiers?.[tier] === false) return [];
      const currency = provider === "paypal" ? "USD" : "INR";
      const rawAmount = provider === "paypal" ? config?.paypalAmounts?.[tier] : config?.plans?.[tier];
      if (typeof rawAmount !== "string" && typeof rawAmount !== "number") return [];
      if (provider === "paypal" && !/^\d+\.\d{2}$/.test(String(rawAmount))) return [];
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) return [];
      return [{ provider, name, currency, amount }];
    });
  }

  function sessionToken(storage, now = Date.now()) {
    try {
      const session = JSON.parse(storage.getItem("visual-memory-lab.auth-session") || "null");
      return typeof session?.access_token === "string" && session.access_token &&
        Number.isFinite(session.expires_at) && session.expires_at * 1000 > now + 60000
        ? session.access_token : null;
    } catch {
      return null;
    }
  }

  function checkoutUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("The checkout service returned an invalid payment link.");
    return url.href;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { paymentOptions, sessionToken, checkoutUrl };
    return;
  }

  const form = document.getElementById("membership-form");
  if (!form) return;
  const status = document.getElementById("membership-status");
  const provider = document.getElementById("membership-provider");
  const plan = document.getElementById("membership-plan");
  const price = document.getElementById("membership-price");
  const adminContact = document.getElementById("membership-admin-contact");
  const offerNote = document.getElementById("membership-offer-note");
  const account = document.getElementById("membership-account");
  const button = document.getElementById("membership-buy");
  const signIn = document.getElementById("membership-sign-in");
  let choices = [];
  let busy = false;
  let checkoutFailed = false;
  let configuration;
  let cookieAccount = false;
  let currentPlan = "Free";
  const token = () => configuration?.authProvider === "mongodb" ? null
    : sessionToken({ getItem: key => localStorage.getItem(key) });

  function updateChoice() {
    const choice = choices.find(item => item.provider === provider.value);
    price.textContent = choice
      ? `${new Intl.NumberFormat(undefined, { style: "currency", currency: choice.currency }).format(choice.amount)} | one-time ${plan.value} purchase`
      : "Checkout is temporarily unavailable. Message our admin on WhatsApp below for assistance, or explore free previews.";
    if (adminContact) adminContact.hidden = Boolean(choice) && !checkoutFailed;
    if (offerNote) {
      const offer = configuration?.planOffers?.[plan.value];
      offerNote.textContent = choice?.currency === "USD"
        ? "PayPal is separately priced in USD. The 50% INR offer does not apply to this payment method."
        : choice && offer?.currency === "INR" && offer.amount === choice.amount
          ? `${offer.discountPercent}% off the regular INR ${new Intl.NumberFormat("en-IN").format(offer.regularAmount)} price. Applied automatically; no coupon required.`
          : "The 50% offer applies to INR checkouts only; PayPal USD prices are separate.";
    }
    const included = currentPlan === "Pro" || currentPlan === plan.value;
    account.textContent = included ? `Your ${currentPlan} membership already includes this access. Open My Learning to continue.`
      : cookieAccount || token() ? "You are signed in. Your purchase will be linked to this account."
      : "Create an account or log in to keep your purchase and learning access together.";
    if (signIn) {
      signIn.href = cookieAccount ? "Account.html"
        : `Account.html?${new URLSearchParams({ next: `/Membership.html?plan=${plan.value}#purchase` })}`;
      signIn.textContent = cookieAccount ? "View my account" : "Create account / Log in";
    }
    button.disabled = busy || !choice || included || !(cookieAccount || token());
  }

  function updatePlan() {
    const previousProvider = provider.value;
    choices = paymentOptions(configuration, plan.value);
    provider.replaceChildren();
    const options = choices.length ? choices : [{ provider: "", name: "Checkout unavailable" }];
    options.forEach(choice => {
      const option = document.createElement("option");
      option.value = choice.provider;
      option.textContent = choice.currency ? `${choice.name} (${choice.currency})` : choice.name;
      provider.append(option);
    });
    if (choices.some(choice => choice.provider === previousProvider)) provider.value = previousProvider;
    provider.disabled = busy || !choices.length;
    updateChoice();
  }
  const requestedPlan = new URLSearchParams(location.search).get("plan");
  if (["Go", "Pro"].includes(requestedPlan)) plan.value = requestedPlan;
  plan.addEventListener("change", updatePlan);
  provider.addEventListener("change", updateChoice);
  window.addEventListener("storage", updateChoice);
  async function refreshSession() {
    if (configuration?.authProvider === "mongodb") {
      try {
        const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
        const session = response.ok ? await response.json() : {};
        cookieAccount = session.signedIn === true;
        currentPlan = cookieAccount ? session.plan || "Free" : "Free";
      } catch { cookieAccount = false; currentPlan = "Free"; }
    }
    updateChoice();
  }
  window.addEventListener("focus", refreshSession);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const accessToken = token();
    const choice = choices.find(item => item.provider === provider.value);
    if (!(cookieAccount || accessToken) || !choice || !form.reportValidity()) {
      updateChoice();
      return;
    }
    busy = true;
    checkoutFailed = false;
    plan.disabled = true;
    provider.disabled = true;
    updateChoice();
    status.textContent = "Creating verified checkout. Access will not activate until payment verification completes.";
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ tier: plan.value, provider: choice.provider }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Checkout could not be created. Please try again.");
      window.location.assign(checkoutUrl(result.checkoutUrl));
    } catch (error) {
      status.textContent = error.message || "Checkout could not be created. No access has been granted.";
      checkoutFailed = true;
      busy = false;
      plan.disabled = false;
      updatePlan();
    }
  });

  fetch("/api/config", { cache: "no-store" }).then(async response => {
    if (!response.ok) throw new Error("Checkout is temporarily unavailable. Please try again later.");
    configuration = await response.json();
    await refreshSession();
    updatePlan();
    status.textContent = choices.length
      ? "Choose your payment method and confirm the final amount at checkout."
      : "Online checkout is temporarily unavailable. No payment will be started here.";
    updateChoice();
  }).catch(error => {
    status.textContent = error.message;
    updateChoice();
  });
})();
