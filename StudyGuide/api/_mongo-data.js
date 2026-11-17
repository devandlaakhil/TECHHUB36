"use strict";

const crypto = require("node:crypto");
const { connect, transaction } = require("./_mongo");
const { effectiveRole } = require("./_mongo-auth");
const TABLES = new Set(["questions", "experience_questions", "entitlements", "payments",
  "kr7_community_interest", "kr7_learner_feedback", "kr7_contact_requests"]);

function parseQuery(value) {
  const [table, query = ""] = value.split("?");
  if (!TABLES.has(table) && table !== "profiles") throw new Error("Unsupported account data operation.");
  const params = new URLSearchParams(query);
  const filter = {};
  for (const [field, condition] of params) {
    if (["select", "order", "limit", "on_conflict"].includes(field)) continue;
    if (!/^[a-z_]+$/.test(field) || !condition.startsWith("eq.")) throw new Error("Unsupported account filter.");
    const raw = condition.slice(3);
    filter[field] = raw === "true" ? true : raw === "false" ? false : raw;
  }
  const projection = { _id: 0 };
  if (params.get("select")) {
    for (const field of params.get("select").split(",")) {
      if (!/^[a-z_]+$/.test(field)) throw new Error("Unsupported account projection.");
      projection[field] = 1;
    }
  }
  const sort = {};
  if (params.get("order")) {
    for (const part of params.get("order").split(",")) {
      const [field, direction] = part.split(".");
      if (!/^[a-z_]+$/.test(field) || !["asc", "desc"].includes(direction)) throw new Error("Unsupported account sort.");
      sort[field] = direction === "asc" ? 1 : -1;
    }
  }
  return { table, params, filter, projection, sort };
}

async function mongoRest(value, options = {}) {
  if (value.startsWith("rpc/")) return rpc(value.slice(4), JSON.parse(options.body || "{}"));
  const { table, params, filter, projection, sort } = parseQuery(value);
  const { db } = await connect();
  if (table === "profiles") {
    if (options.method && options.method !== "GET") throw new Error("Profiles are read-only.");
    const user = await db.collection("users").findOne({ id: filter.id, disabled: { $ne: true } });
    return user ? [{ is_admin: effectiveRole(user) === "admin" }] : [];
  }
  const collection = db.collection(table);
  const method = options.method || "GET";
  if (method === "GET") {
    const result = await collection.find(filter, { projection }).sort(sort).limit(Number(params.get("limit")) || 10000).toArray();
    if (table === "questions" && !result.length && !Object.keys(filter).length) {
      return require("./_project-questions").companies;
    }
    return result;
  }
  if (method === "POST") {
    const record = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...JSON.parse(options.body || "{}") };
    const conflict = params.get("on_conflict");
    if (conflict) {
      const keys = conflict.split(",");
      if (keys.some(key => !/^[a-z_]+$/.test(key) || !Object.hasOwn(record, key))) throw new Error("Invalid conflict key.");
      await collection.updateOne(Object.fromEntries(keys.map(key => [key, record[key]])),
        { $setOnInsert: record }, { upsert: true });
    } else await collection.insertOne(record);
    const { _id, ...result } = record;
    return [result];
  }
  if (method === "PATCH" && Object.keys(filter).length) {
    await collection.updateMany(filter, { $set: JSON.parse(options.body || "{}") });
    return null;
  }
  throw new Error("Unsupported account write operation.");
}

async function completePayment(body) {
  return transaction(async (db, session) => {
    const payment = await db.collection("payments").findOne({ id: body.p_payment_id }, { session });
    if (!payment || payment.user_id !== body.p_user_id || payment.tier !== body.p_tier ||
        payment.provider !== body.p_provider || payment.provider_reference !== body.p_provider_reference ||
        payment.amount_minor !== body.p_amount_minor || payment.currency !== body.p_currency ||
        !["pending", "paid"].includes(payment.status)) throw new Error("Verified payment does not match the stored purchase.");
    if (payment.status === "paid") return true;
    const user = await db.collection("users").updateOne({ id: payment.user_id, disabled: { $ne: true } },
      { $inc: { accessRevision: 1 } }, { session });
    if (!user.matchedCount) throw new Error("The purchase account is not available.");
    await db.collection("payments").updateOne({ id: payment.id, status: "pending" },
      { $set: { status: "paid", paid_at: new Date().toISOString() } }, { session });
    await db.collection("entitlements").updateOne({ user_id: payment.user_id, tier: payment.tier }, {
      $set: { active: true, revoked_at: null, granted_at: new Date().toISOString(), payment_id: payment.id },
      $setOnInsert: { id: crypto.randomUUID(), user_id: payment.user_id, tier: payment.tier },
    }, { upsert: true, session });
    return true;
  });
}

async function claimInterview(body) {
  if (!/^[\da-f-]{36}$/i.test(body.p_user_id || "") || !/^[\da-f]{64}$/i.test(body.p_context_hash || "") ||
      !Number.isInteger(body.p_turn) || body.p_turn < 0 || body.p_turn > 6) return { error: "invalid" };
  return transaction(async (db, session) => {
    const now = new Date();
    const users = db.collection("users");
    const user = await users.updateOne({ id: body.p_user_id, disabled: { $ne: true } },
      { $inc: { accessRevision: 1 } }, { session });
    if (!user.matchedCount) return { error: "membership" };
    const entitlement = await db.collection("entitlements").findOne({
      user_id: body.p_user_id, active: true, tier: "Pro",
    }, { session });
    if (!entitlement) return { error: "membership" };
    const interviews = db.collection("ai_interview_sessions");
    const claimId = crypto.randomUUID();
    const busyUntil = new Date(now.getTime() + 45000);
    if (!body.p_session_id) {
      if (body.p_turn !== 0) return { error: "invalid" };
      const id = crypto.randomUUID();
      await interviews.insertOne({
        id, user_id: body.p_user_id, context_hash: body.p_context_hash, state: "starting",
        completed_turns: 0, claim_id: claimId, busy_until: busyUntil, created_at: now,
        expires_at: new Date(now.getTime() + 86400000),
      }, { session });
      return { sessionId: id, claimId, plan: "Pro" };
    }
    const interview = await interviews.findOne({ id: body.p_session_id, user_id: body.p_user_id }, { session });
    if (!interview || interview.context_hash !== body.p_context_hash || interview.state !== "active" ||
        interview.expires_at <= now || body.p_turn !== interview.completed_turns + 1) return { error: "session" };
    if (interview.busy_until > now) return { error: "busy" };
    await interviews.updateOne({ id: interview.id }, { $set: { claim_id: claimId, busy_until: busyUntil } }, { session });
    return { sessionId: interview.id, claimId, plan: "Pro" };
  });
}

async function settleInterview(body) {
  const { db } = await connect();
  const now = new Date();
  const turn = body.p_turn;
  if (!Number.isInteger(turn) || turn < 0 || turn > 6 ||
      typeof body.p_success !== "boolean" || typeof body.p_complete !== "boolean") return false;
  const result = await db.collection("ai_interview_sessions").updateOne({
    id: body.p_session_id, user_id: body.p_user_id, claim_id: body.p_claim_id, busy_until: { $gt: now },
    state: turn === 0 ? "starting" : "active", completed_turns: turn === 0 ? 0 : turn - 1,
  }, { $set: {
    state: !body.p_success && turn === 0 ? "failed"
      : body.p_success && (body.p_complete || turn === 6) ? "complete" : "active",
    completed_turns: body.p_success ? turn : Math.max(0, turn - 1),
    claim_id: null, busy_until: null,
  } });
  return result.modifiedCount === 1;
}

async function takeApiRateLimit(key, limit, windowMs, now = new Date()) {
  if (!/^[a-f\d]{64}$/i.test(key) || !Number.isInteger(limit) || limit < 1 ||
      !Number.isInteger(windowMs) || windowMs < 1000 || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid API rate-limit request.");
  }
  const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
  const resetAt = new Date(windowStart + windowMs);
  const id = `api:${key}:${windowStart}`;
  const collection = (await connect()).db.collection("auth_rate_limits");
  try {
    const result = await collection.findOneAndUpdate(
      { _id: id, count: { $lt: limit } },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt.getTime() + 60000) } },
      { upsert: true, returnDocument: "after" },
    );
    return {
      allowed: Boolean(result),
      remaining: Math.max(0, limit - (result?.count || limit)),
      resetAt,
    };
  } catch (error) {
    if (error.code !== 11000) throw error;
    const result = await collection.findOneAndUpdate(
      { _id: id, count: { $lt: limit } }, { $inc: { count: 1 } }, { returnDocument: "after" },
    );
    return {
      allowed: Boolean(result),
      remaining: Math.max(0, limit - (result?.count || limit)),
      resetAt,
    };
  }
}

async function rpc(name, body) {
  if (name === "complete_verified_payment") return completePayment(body);
  if (name === "claim_ai_interview") return claimInterview(body);
  if (name === "settle_ai_interview") return settleInterview(body);
  if (name === "kr7_take_api_slot") return takeApiRateLimit(
    body.p_key, body.p_limit, body.p_window_ms, new Date(body.p_now),
  );
  if (name === "kr7_take_community_slot") {
    const { db } = await connect();
    const now = new Date();
    const collection = db.collection("auth_rate_limits");
    const id = `community:${body.p_fingerprint}`;
    const current = await collection.findOneAndUpdate(
      { _id: id, expiresAt: { $gt: now }, count: { $lt: 5 } }, { $inc: { count: 1 } },
      { returnDocument: "after" },
    );
    if (current) return true;
    try {
      await collection.findOneAndUpdate(
        { _id: id, expiresAt: { $lte: now } },
        { $set: { count: 1, expiresAt: new Date(now.getTime() + 3600000) } },
        { upsert: true, returnDocument: "after" },
      );
      return true;
    } catch (error) {
      if (error.code === 11000) return false;
      throw error;
    }
  }
  throw new Error("Unsupported account procedure.");
}

module.exports = { mongoRest, parseQuery, takeApiRateLimit };
