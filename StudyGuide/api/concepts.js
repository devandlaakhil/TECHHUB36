"use strict";

const lessons = require("./_concept-lessons");
const { sendError } = require("./_shared");
const { learningAccess } = require("./_learning-content");
const { consumeGrant } = require("./_pin-grants");
const { membershipTier } = require("./_pro-policy");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }
  const id = req.query?.id;
  if (id !== undefined && (typeof id !== "string" || !/^[a-z0-9-]{1,80}$/.test(id))) {
    return res.status(400).json({ error: "Choose a valid concept lesson." });
  }
  const lesson = id ? lessons.find(item => item.id === id) : null;
  if (id && !lesson) return res.status(404).json({ error: "Concept lesson not found." });
  try {
    const granted = Boolean(lesson && consumeGrant(req, `concept:${id}`));
    const { entitlements, verificationUnavailable } = await learningAccess(req, { skip: granted });
    const tier = membershipTier(entitlements);
    const premium = tier === "Pro";
    if (lesson && !premium && !granted) {
      return res.status(403).json({ error: "Enter the PIN separately for this Pro concept lesson." });
    }
    return res.status(200).json({
      ...(lesson ? { lesson } : {
        lessons: lessons.map(({ id, category, title, summary }) => ({ id, category, title, summary })),
      }),
      access: { premium, pinActive: granted,
        ...(verificationUnavailable ? { verificationUnavailable: true } : {}) },
    });
  } catch (error) {
    return sendError(res, error);
  }
};
