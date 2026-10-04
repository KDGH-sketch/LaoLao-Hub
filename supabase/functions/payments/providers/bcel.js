// BCEL Online Payment Gateway, cards (Visa / Mastercard): BCEL's card gateway runs on CyberSource, whose
// Secure Acceptance Hosted Checkout is used here. The learner types the card on BCEL's / CyberSource's page; LaoLao never sees it.
//   Request: a form POSTed to BCEL_SA_ENDPOINT with fields signed by HMAC-SHA256(secret, "name=value,…" for signed_field_names).
//   Reply:   the gateway POSTs the result (to the merchant POST URL and to the receipt page) with the same kind of signature.
// Public reference: https://developer.cybersource.com/docs/cybs/en-us/sa/developer/all/sa-hosted/secure-acceptance.html
//
// NOT TESTED — REQUIRES MERCHANT CREDENTIALS. Confirm with BCEL (cardcenter@bcel.com.la) that your merchant profile uses
// Secure Acceptance Hosted Checkout, and get the endpoint, profile id, access key and secret key from them.
// BCEL OnePay QR is not implemented: its merchant API is not public. It is added when BCEL provides the documents.
import { hmacBase64, safeEqual } from "../crypto.js";

const CARD = { "001": "visa", "002": "mastercard" };
const amountText = (n, cur) => cur === "LAK" ? String(Math.round(n)) : (Math.round(n * 100) / 100).toFixed(2);

export function bcelProvider(env){
  const endpoint = env.BCEL_SA_ENDPOINT || "https://testsecureacceptance.cybersource.com/pay";
  const profileId = env.BCEL_SA_PROFILE_ID, accessKey = env.BCEL_SA_ACCESS_KEY, secret = env.BCEL_SA_SECRET_KEY;
  if (!profileId || !accessKey || !secret) throw new Error("BCEL_SA_PROFILE_ID, BCEL_SA_ACCESS_KEY and BCEL_SA_SECRET_KEY are required");
  const signFields = f => hmacBase64(secret, String(f.signed_field_names).split(",").map(n => n + "=" + (f[n] ?? "")).join(","));
  return {
    id: "bcel", label: "BCEL Online Payment Gateway", live: !/test/i.test(endpoint),
    methods: ["mastercard", "visa"],
    async createCheckout(order, ctx){
      const f = {
        access_key: accessKey, profile_id: profileId, transaction_uuid: crypto.randomUUID().replace(/-/g, ""),
        signed_date_time: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), locale: env.BCEL_SA_LOCALE || "en",
        transaction_type: "sale", reference_number: order.id, amount: amountText(Number(order.amount), order.currency), currency: order.currency,
        payment_method: "card", override_custom_receipt_page: ctx.functionUrl + "/return", override_custom_cancel_page: ctx.functionUrl + "/return"
      };
      if (env.BCEL_SA_PRESELECT_CARD === "true") f.card_type = order.method === "visa" ? "001" : "002";
      f.unsigned_field_names = "";
      f.signed_field_names = Object.keys(f).concat("signed_field_names").join(",");
      f.signature = await signFields(f);
      return { checkout: { kind: "form", action: endpoint, fields: f }, ref: { transaction_uuid: f.transaction_uuid } };
    },
    // Verify the gateway's signed reply and map it to a result. Only signed fields are trusted.
    async parse(f){
      if (!f || !f.signature || !f.signed_field_names || !safeEqual(f.signature, await signFields(f))) throw Object.assign(new Error("invalid signature"), { status: 401 });
      if ((f.req_profile_id && f.req_profile_id !== profileId) || (f.req_access_key && f.req_access_key !== accessKey))
        throw Object.assign(new Error("reply for another merchant profile"), { status: 401 });
      const signed = new Set(String(f.signed_field_names).split(","));
      const g = k => signed.has(k) ? f[k] : undefined;
      const decision = String(g("decision") || "").toUpperCase();
      const outcome = decision === "ACCEPT" && String(g("reason_code")) === "100" ? "paid"
        : decision === "CANCEL" ? "cancelled" : decision === "REVIEW" ? "pending" : "failed";
      return { orderId: g("req_reference_number"), outcome, txnId: g("transaction_id"),
        amount: Number(g("auth_amount") ?? g("req_amount")), currency: String(g("req_currency") || "").toUpperCase(),
        method: CARD[g("req_card_type")] || "card", brand: g("card_type_name") || "", last4: String(g("req_card_number") || "").slice(-4),
        reason: decision + ":" + (g("reason_code") || ""), verification: { provider: "bcel", signature: true, decision, reasonCode: g("reason_code") || null } };
    }
    // No refund API in Hosted Checkout: refunds are made in BCEL's merchant portal, then confirmed in Admin → Payments with the portal reference.
  };
}
