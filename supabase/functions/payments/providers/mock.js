// Test provider: a checkout page served by this function where the tester picks the outcome. No money moves.
// Its callbacks are signed with PAYMENT_MOCK_SECRET and go through exactly the same checks as a real provider's.
// Never available when PAYMENT_ENV=production (see providers/index.js).
import { hmacHex, safeEqual } from "../crypto.js";

const FIELDS = ["order", "outcome", "txn", "amount", "currency", "method", "last4", "ts"];
const canonical = f => FIELDS.map(k => k + "=" + (f[k] ?? "")).join("&");
const REPLAY_WINDOW = 15 * 60 * 1000;

export function mockProvider(env, now = () => Date.now()){
  const secret = env.PAYMENT_MOCK_SECRET;
  if (!secret || secret.length < 16) throw new Error("PAYMENT_MOCK_SECRET (16+ characters) is required for the test provider");
  const self = {
    id: "mock", label: "Test provider (no real money)", live: false,
    methods: ["mastercard", "visa", "onepay"],
    async createCheckout(order, ctx){
      return { checkout: { kind: "redirect", url: `${ctx.functionUrl}/mock/checkout?order=${encodeURIComponent(order.id)}` }, ref: { page: "mock" } };
    },
    // What the provider would send: used by the test checkout page and by the tests
    async callback(order, outcome, extra = {}){
      const f = Object.assign({ order: order.id, outcome, txn: "MOCK-" + crypto.randomUUID().slice(0, 12).toUpperCase(), amount: String(order.amount),
        currency: order.currency, method: order.method, last4: order.method === "onepay" ? "" : "4242", ts: String(now()) }, extra);
      f.sig = await hmacHex(secret, canonical(f));
      return f;
    },
    // Verified result, or an error for anything not signed by us or older than 15 minutes (replays)
    async parse(f){
      if (!f || !f.sig || !safeEqual(f.sig, await hmacHex(secret, canonical(f)))) throw Object.assign(new Error("invalid signature"), { status: 401 });
      if (!(Math.abs(now() - Number(f.ts)) < REPLAY_WINDOW)) throw Object.assign(new Error("stale callback"), { status: 401 });
      const outcome = ["paid", "failed", "cancelled", "pending"].includes(f.outcome) ? f.outcome : "failed";
      return { orderId: f.order, outcome, txnId: f.txn, amount: Number(f.amount), currency: f.currency, method: f.method,
        brand: f.method === "onepay" ? "BCEL OnePay" : f.method === "visa" ? "Visa" : "Mastercard", last4: f.last4, reason: outcome,
        verification: { provider: "mock", signature: true, at: now() } };
    },
    async refund(order){ return { confirmed: true, ref: "MOCK-RF-" + order.id }; }
  };
  return self;
}
