// How plans are named and priced on screen; used by the learner app (upgrade.js, views-billing.js) and the welcome page.
// Prices come only from the plans table (js/shared/billing.js reads them).
import { tr } from "./ui.js";
import { t } from "./i18n.js";
import { planPrice, money } from "./billing.js";

// Plans with a plain-text name (the starter plans) use the standard labels, so "standard" shows as "Basic"
export const planLabel = (p, lang) => !p ? "" : typeof p.name === "string" && t("acc_" + p.id) !== "acc_" + p.id ? t("acc_" + p.id) : (tr(p.name, lang) || p.id);

// "100,000 ₭ / month" in the first currency that has a monthly price (currencies in order of preference); "Free" otherwise
export function priceText(p, lang, currencies = ["LAK", "USD"], cycle = "month"){
  for (const c of currencies){ const v = planPrice(p, cycle, c); if (v) return money(v, c, lang) + " " + t(cycle === "year" ? "bl_per_year" : "bl_per_month"); }
  return t("ac_price_free");
}
