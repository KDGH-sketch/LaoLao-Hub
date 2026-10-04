// Which payment provider handles new checkouts (PAYMENT_PROVIDER), plus every configured provider by id,
// so callbacks and refunds for older orders still reach the provider that took the money.
import { bcelProvider } from "./bcel.js";
import { mockProvider } from "./mock.js";

export function pickProviders(env, now){
  const byId = {};
  const mockAllowed = env.PAYMENT_ALLOW_MOCK === "true" && env.PAYMENT_ENV !== "production";
  if (env.BCEL_SA_PROFILE_ID) byId.bcel = bcelProvider(env);
  if (mockAllowed && env.PAYMENT_MOCK_SECRET) byId.mock = mockProvider(env, now);
  const active = byId[env.PAYMENT_PROVIDER || ""] || null;
  return { active, byId };
}
