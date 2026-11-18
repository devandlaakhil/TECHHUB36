"use strict";

const crypto = require("node:crypto");
const { connect } = require("./_mongo");
const { passwordConfigured, createPasswordService } = require("./_password-auth");
const { sameOrigin, makeCookie, revokeSession, authenticatedMongoUser, SESSION_SECONDS } = require("./_mongo-auth");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method === "GET") return res.status(200).json({ enabled: passwordConfigured(), provider: "mongodb" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  if (!passwordConfigured()) return res.status(503).json({ error: "Account signup/login needs MongoDB and the application signing secret configured by the owner." });
  if (!sameOrigin(req)) return res.status(403).json({ error: "Use the KR7Tech account page." });
  const input = req.body;
  if (!input || !["signup", "login", "set-password"].includes(input.action)) {
    return res.status(400).json({ error: "Choose Create account or Login." });
  }
  try {
    const ip = process.env.VERCEL ? req.headers["x-vercel-forwarded-for"]
      : process.env.RENDER ? req.headers["true-client-ip"] : req.socket?.remoteAddress;
    const fingerprint = crypto.createHmac("sha256", process.env.AUTH_OTP_SECRET)
      .update(typeof ip === "string" ? ip.split(",")[0].trim() : "unknown").digest("hex");
    let db;
    try { ({ db } = await connect()); }
    catch (error) {
      console.error("Account auth MongoDB connection failed.", error.code || error.name);
      return res.status(503).json({
        error: "The server cannot connect to MongoDB, so account signup/login cannot continue. Check the database credentials and hosting IP access list.",
      });
    }
    const account = input.action === "set-password" ? await authenticatedMongoUser(req) : null;
    const result = await createPasswordService({ db }).perform(input.action, input, fingerprint, account?.id);
    if (result.token) {
      await revokeSession(req);
      res.setHeader("Set-Cookie", [makeCookie("session", result.token, SESSION_SECONDS), makeCookie("otp", "", 0)]);
    }
    if (result.status === 429) res.setHeader("Retry-After", "900");
    return res.status(result.status).json(result.error ? { error: result.error } : { signedIn: true, user: result.user });
  } catch (error) {
    console.error("Account auth request failed.", error.code || error.name);
    return res.status(503).json({ error: "Account signup/login is temporarily unavailable. Please try again later." });
  }
};
