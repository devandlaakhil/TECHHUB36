(() => {
  "use strict";
  function returnDestination(search = "") {
    const params = new URLSearchParams(search);
    try {
      const url = new URL(params.get("next"), "https://kr7tech.test/");
      if (url.origin === "https://kr7tech.test" && ["/Membership.html", "/Purchase.html"].includes(url.pathname)) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {}
    return "/My-Learning.html";
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { returnDestination };
    return;
  }
  const status = document.getElementById("account-status");
  const signupForm = document.getElementById("password-signup-form");
  const loginForm = document.getElementById("password-login-form");
  const setupForm = document.getElementById("account-password-setup");
  let passwordMode = "signup";
  let busy = false;
  let signedIn = false;

  async function api(url, body, method = "POST") {
    let response;
    try {
      response = await fetch(url, {
        method, credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new Error("We could not reach your account. Please try again in a moment.");
    }
    let result;
    try { result = await response.json(); }
    catch { throw new Error("Your account is temporarily unavailable. Please try again."); }
    if (!response.ok) throw new Error(result.error || "Account request could not be completed.");
    return result;
  }

  function lock(value) {
    busy = value;
    for (const form of [signupForm, loginForm, setupForm]) {
      form.querySelectorAll("input, select, button").forEach(node => { node.disabled = value; });
    }
  }

  for (const form of [signupForm, loginForm, setupForm]) {
    form.addEventListener("invalid", event => {
      status.textContent = event.target.validationMessage || "Check your username and password before continuing.";
    }, true);
  }

  function renderSession(result) {
    signedIn = result.signedIn === true;
    document.getElementById("password-account-panel").hidden = signedIn;
    signupForm.hidden = passwordMode !== "signup";
    loginForm.hidden = passwordMode !== "login";
    document.getElementById("password-existing-account").hidden = passwordMode !== "signup";
    document.getElementById("password-new-account").hidden = passwordMode !== "login";
    document.getElementById("account-dashboard").hidden = !signedIn;
    document.getElementById("account-admin").hidden = !signedIn || result.user?.role !== "admin";
    setupForm.hidden = !signedIn || result.user?.hasPassword === true || result.user?.localOnly === true;
    const continueLink = document.getElementById("account-continue");
    if (continueLink) {
      continueLink.hidden = !signedIn;
      continueLink.href = returnDestination(location.search);
      continueLink.textContent = continueLink.href.includes("Membership.html") ? "Continue to checkout"
        : continueLink.href.includes("Purchase.html") ? "Return to your purchase" : "Continue learning";
    }
    if (!signedIn) return;
    try { localStorage.removeItem("visual-memory-lab.auth-session"); } catch {}
    const user = result.user;
    document.getElementById("account-identity").textContent = user.localOnly
      ? `Signed in as ${user.username} (localhost test account).` : `Signed in as ${user.username || user.email}.`;
    document.getElementById("account-current-role").textContent = user.role[0].toUpperCase() + user.role.slice(1);
    document.getElementById("account-current-plan").textContent = result.plan || "Free";
    document.getElementById("account-id").textContent = user.id;
    const link = document.createElement("a");
    link.href = user.role === "expert" ? "Expert-Plan.html" : user.role === "admin" ? "#account-admin" : "Student-Plan.html";
    link.textContent = user.role === "expert" ? "Continue advanced preparation" : user.role === "admin"
      ? "Manage learner roles and access" : "Build your Student Plan";
    document.getElementById("account-paths").replaceChildren(link);
    status.textContent = result.localPreview
      ? "Signed in to your local preview account. Explore below, or use Sign out to test logging in again."
      : "Welcome back. Your membership and learning paths are ready below.";
    document.dispatchEvent(new CustomEvent("kr7:account-change", { detail: result }));
  }

  for (const [id, mode] of [["password-show-login", "login"], ["password-show-signup", "signup"]]) {
    document.getElementById(id).addEventListener("click", () => {
      if (busy) return;
      passwordMode = mode;
      for (const form of [signupForm, loginForm]) form.querySelectorAll('input[type="password"]').forEach(node => { node.value = ""; });
      renderSession({ signedIn: false });
      document.getElementById(mode === "login" ? "login-username" : "signup-username").focus();
      status.textContent = mode === "login" ? "Log in with your registered username and password." : "Choose your username and password to create an account.";
    });
  }
  async function passwordAction(event, action, form, prefix) {
    event.preventDefault();
    if (busy) return;
    const password = document.getElementById(`${prefix}-password`);
    const username = document.getElementById(`${prefix}-username`);
    if (action !== "login" && password.value.length < 5) {
      status.textContent = "Choose a password with at least 5 characters.";
      password.focus();
      return;
    }
    if (!form.reportValidity()) {
      status.textContent = "Check your username and password before continuing.";
      return;
    }
    const confirmation = document.getElementById(`${prefix}-confirm-password`);
    if (confirmation && password.value !== confirmation.value) {
      status.textContent = "Passwords do not match.";
      confirmation.focus();
      return;
    }
    lock(true);
    status.textContent = action === "signup" ? "Saving your account..." : "Checking your login details...";
    try {
      await api("/api/account-auth", { action,
        username: username.value.trim(), password: password.value,
      });
      document.getElementById("login-username").value = username.value.trim();
      try {
        const session = await api("/api/session", null, "GET");
        if (session.signedIn !== true) throw new Error("The new sign-in cookie was not accepted.");
        renderSession(session);
        if (action === "signup" && signedIn) status.textContent = "Account created and saved. Next time, log in with the same username and password.";
      } catch {
        passwordMode = "login";
        renderSession({ signedIn: false });
        status.textContent = action === "signup"
          ? "Your account was created, but the session could not be loaded. Use Login with the same username and password."
          : "Login details were accepted, but the session could not be loaded. Please try Login again.";
      }
    } catch (error) { status.textContent = error.message; }
    finally {
      password.value = "";
      if (confirmation) confirmation.value = "";
      lock(false);
    }
  }
  signupForm.addEventListener("submit", event => passwordAction(event, "signup", signupForm, "signup"));
  loginForm.addEventListener("submit", event => passwordAction(event, "login", loginForm, "login"));
  setupForm.addEventListener("submit", event => passwordAction(event, "set-password", setupForm, "setup"));

  document.getElementById("account-sign-out").addEventListener("click", async event => {
    event.target.disabled = true;
    try {
      await api("/api/session", null, "DELETE");
      renderSession({ signedIn: false });
      try { localStorage.removeItem("visual-memory-lab.auth-session"); } catch {}
      location.reload();
    } catch (error) { status.textContent = error.message; }
    finally { event.target.disabled = false; }
  });
  async function adminAction(button, url, body) {
    const adminStatus = document.getElementById("account-admin-status");
    if (busy || !document.getElementById("account-target-id").reportValidity()) return;
    busy = true;
    button.disabled = true;
    try {
      await api(url, body);
      adminStatus.textContent = "Access updated. The learner's next request will use the new server-verified settings.";
      renderSession(await api("/api/session", null, "GET"));
    } catch (error) { adminStatus.textContent = error.message; }
    finally { busy = false; button.disabled = false; }
  }
  document.getElementById("account-admin-form").addEventListener("submit", event => {
    event.preventDefault();
    adminAction(event.submitter, "/api/admin/roles", {
      userId: document.getElementById("account-target-id").value.trim(),
      role: document.getElementById("account-target-role").value,
    });
  });
  for (const [id, active] of [["account-grant-plan", true], ["account-revoke-plan", false]]) {
    document.getElementById(id).addEventListener("click", event => adminAction(event.target, "/api/admin/entitlements", {
      userId: document.getElementById("account-target-id").value.trim(),
      tier: document.getElementById("account-target-plan").value, active,
    }));
  }
  (async () => {
    lock(true);
    try {
      const session = await api("/api/session", null, "GET");
      renderSession(session);
      if (!signedIn) status.textContent = "Create your account, or select Already have an account? Login.";
    } catch {
      renderSession({ signedIn: false });
      status.textContent = "The saved session could not be checked. You can still try Create account or Login below.";
    } finally { lock(false); }
  })();
})();
