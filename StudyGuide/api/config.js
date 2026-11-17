const { paypalAmountMinor, sendError, tierAmount } = require("./_shared");
const { mongoEnabled } = require("./_mongo");
const { authConfigured } = require("./_mongo-auth");
const { salesReady, purchaseReturn } = require("./_commerce");
const { planOffers } = require("./_pricing");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  try {
    const paypalAmounts = {
      L1: process.env.PAYPAL_L1_USD || null,
      L2: process.env.PAYPAL_L2_USD || null,
      L3: process.env.PAYPAL_L3_USD || null,
      Go: process.env.PAYPAL_GO_USD || null,
      Pro: process.env.PAYPAL_PRO_USD || null,
    };
    let checkoutReady = false;
    try {
      purchaseReturn("Pro", "configuration-check");
      checkoutReady = true;
    } catch {
      // Do not advertise payment providers without a valid return origin.
    }
    const paypalTiers = Object.fromEntries(["Go", "Pro"].map(tier => {
      try { return [tier, paypalAmountMinor(tier) > 0]; }
      catch { return [tier, false]; }
    }));
    checkoutReady = checkoutReady && salesReady();
    const providerReady = {
      razorpay: Boolean(
        checkoutReady &&
        process.env.RAZORPAY_KEY_ID &&
        process.env.RAZORPAY_KEY_SECRET &&
        process.env.RAZORPAY_WEBHOOK_SECRET,
      ),
      stripe: Boolean(checkoutReady && process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      paypal: Boolean(
        checkoutReady &&
        process.env.PAYPAL_CLIENT_ID &&
        process.env.PAYPAL_CLIENT_SECRET &&
        process.env.PAYPAL_WEBHOOK_ID &&
        Object.values(paypalTiers).some(Boolean),
      ),
    };
    return res.status(200).json({
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
      authProvider: mongoEnabled() ? "mongodb" : "supabase",
      emailOtpEnabled: authConfigured(),
      compilerConfigured: Boolean(process.env.JUDGE0_API_URL),
      providers: providerReady,
      plans: { L1: 500, L2: 500, L3: 500, Go: tierAmount("Go") / 100, Pro: tierAmount("Pro") / 100 },
      planOffers: planOffers(),
      planBenefits: { Go: { interviewQA: true, concepts: false, aiInterview: false },
        Pro: { interviewQA: true, concepts: true, aiInterview: true, allContent: true } },
      paypalTiers,
      paypalAmounts,
    });
  } catch (error) {
    return sendError(res, error);
  }
};
