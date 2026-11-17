"use strict";

const crypto = require("node:crypto");
const { supabaseRest } = require("./_shared");
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function localTesting(req) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ||
      process.env.AI_INTERVIEW_ALLOW_ANONYMOUS !== "true") return false;
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(`http://${req.headers.host}`).hostname);
  } catch { return false; }
}

function contextHash(body) {
  return crypto.createHash("sha256").update(JSON.stringify([body.topic, body.experience, body.role || ""])).digest("hex");
}

async function claimSession(userId, body) {
  if (body.action !== "start" && (typeof body.interviewId !== "string" || !UUID.test(body.interviewId))) {
    return { status: 409, error: "Start a new interview before submitting answers." };
  }
  const result = await supabaseRest("rpc/claim_ai_interview", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_session_id: body.action === "start" ? null : body.interviewId,
      p_context_hash: contextHash(body), p_turn: body.action === "start" ? 0 : body.turns.length }),
  });
  if (result?.error) {
    const errors = {
      membership: [403, "AI interviews require an active Pro membership."],
      session: [409, "This interview is expired, complete, or out of sequence. Start a new session or retry the current answer."],
      busy: [409, "This interview already has a request in progress. Wait before trying again."],
      invalid: [400, "Invalid interview session request."],
    };
    const [status, error] = errors[result.error] || [503, "Interview access is temporarily unavailable."];
    return { status, error, ...(result.resetAt ? { resetAt: result.resetAt } : {}) };
  }
  if (!UUID.test(result?.sessionId || "") || !UUID.test(result?.claimId || "") ||
      result?.plan !== "Pro") throw new Error("Interview access is not configured.");
  return result;
}

async function settleSession(userId, claim, turn, success, complete = false) {
  return supabaseRest("rpc/settle_ai_interview", {
    method: "POST",
    body: JSON.stringify({ p_user_id: userId, p_session_id: claim.sessionId, p_claim_id: claim.claimId,
      p_turn: turn, p_success: success, p_complete: complete }),
  });
}

module.exports = { localTesting, claimSession, settleSession };
