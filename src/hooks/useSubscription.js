// RevenueCat subscription status helper.
//
// Guarded so it's safe to call from the web build too — RevenueCat's
// Capacitor plugin has no native bridge on `web`, so a bare call to
// Purchases.getCustomerInfo() would throw. We short-circuit to a
// consistent "not premium" shape when running outside a native container.
//
// Callers should treat this as a source of truth for gating premium
// features: `if ((await checkPremiumStatus()).isPremium) { … }`. Prefer
// the `useSubscription` React hook when the answer needs to drive
// rendering.

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";

// Entitlement key configured in the RevenueCat dashboard for the paid tier.
// Keep in sync with the dashboard — if you rename the entitlement there,
// rename it here too. Everything premium in the app checks this one key.
export const PREMIUM_ENTITLEMENT = "premium";

// -------- API-key sanity check ------------------------------------------
// RevenueCat mints multiple SDK API keys per project — production App
// Store / Play Store keys AND separate "Test Store" keys for RC's
// internal sandbox. The Test Store keys work fine against RC's own test
// endpoints, but against a production Apple bundle id they trip a
// runtime warning ("The app is using a test API key…") and, in some
// installer paths, take the app down on launch.
//
// RC's public SDK keys are prefixed by platform: `appl_` for iOS App
// Store, `goog_` for Android Play Store, `strp_` for Stripe, etc.
// Test Store keys do NOT carry those prefixes. Requiring the platform
// prefix rejects the wrong-key-copied-to-secret case entirely, before
// Purchases.configure() ever runs.
//
// Runs once at module load. Both this file and src/App.jsx read the same
// import.meta.env value (Vite substitutes it at build time) so a single
// check here is the source of truth for both.
export const RC_KEY = (import.meta.env.VITE_REVENUECAT_API_KEY || "").trim();

// Expected prefix per platform. If RC ever changes their public key
// format, expand this map (or drop the check) — keep it in one spot.
const RC_EXPECTED_PREFIX = {
  ios: "appl_",
  android: "goog_",
};

export function rcExpectedPrefix() {
  return RC_EXPECTED_PREFIX[Capacitor.getPlatform()] || null;
}

// null when the key looks valid for this platform (or when we're on web
// / when there's no key configured — those cases are handled by other
// guards). Returns a human-readable string describing the problem
// otherwise. Callers should treat non-null as "do NOT configure RC."
export function rcKeyInvalidReason() {
  // Web build has no RC bridge; the caller will bail out earlier.
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() === "web") return null;
  // Absent key is caught by the App.jsx configure effect (separate error);
  // this check specifically catches wrong-KIND-of-key.
  if (!RC_KEY) return null;
  const expected = rcExpectedPrefix();
  if (!expected) return null; // unknown platform — don't second-guess
  if (!RC_KEY.startsWith(expected)) {
    const actualPrefix = RC_KEY.slice(0, 5);
    return (
      `RevenueCat API key does not look like an ${Capacitor.getPlatform()} ` +
      `App Store key. Expected prefix "${expected}", got "${actualPrefix}". ` +
      `This is almost certainly a Test Store key (or a key from the wrong ` +
      `platform) that was copied into the VITE_REVENUECAT_API_KEY secret. ` +
      `Subscription features have been disabled to prevent a launch crash. ` +
      `Fix in RevenueCat dashboard → Projects → API Keys → App Store row.`
    );
  }
  return null;
}

export const RC_KEY_LOOKS_VALID = rcKeyInvalidReason() === null;

// Shape returned to callers. `source` distinguishes the reasons the answer
// might be "not premium" so debug output is meaningful. `isPremium` is
// always a plain boolean.
function inactiveResult(source) {
  return { isPremium: false, entitlement: null, customerInfo: null, source };
}

/**
 * One-shot check. Resolves to
 *   { isPremium, entitlement, customerInfo, source }
 * where `source` is one of
 *   "web"          — running outside a native container
 *   "invalid-key"  — RC API key prefix looks wrong (Test Store / cross-platform)
 *   "error"        — native call threw
 *   "revenuecat"   — real answer from RC
 * Always resolves — never throws — so callers can safely `await` inline.
 */
export async function checkPremiumStatus() {
  // Web build has no native RevenueCat bridge.
  if (Capacitor.getPlatform() === "web" || !Capacitor.isNativePlatform()) {
    return inactiveResult("web");
  }
  // Wrong-kind-of-key: RC was never configured, calling getCustomerInfo
  // would throw. Short-circuit to a clean "not premium" state and let the
  // caller render its disabled-gracefully UI.
  if (!RC_KEY_LOOKS_VALID) {
    return inactiveResult("invalid-key");
  }
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    const entitlement = customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT] ?? null;
    return {
      isPremium: entitlement !== null,
      entitlement,
      customerInfo,
      source: "revenuecat",
    };
  } catch (e) {
    console.error("[Cygne subscription] getCustomerInfo failed:", e?.message ?? e);
    return inactiveResult("error");
  }
}

/**
 * React hook — reads premium status once on mount and returns
 *   { isPremium, entitlement, customerInfo, loading, source, refresh }
 * `refresh()` re-fetches on demand (call after a purchase, restore, or
 * app resume). Safe to call from any React component; guards the same
 * way the one-shot helper does.
 */
export function useSubscription() {
  const [state, setState] = useState({
    isPremium: false,
    entitlement: null,
    customerInfo: null,
    loading: true,
    source: null,
  });

  const load = async () => {
    setState(s => ({ ...s, loading: true }));
    const result = await checkPremiumStatus();
    setState({ ...result, loading: false });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refresh: load };
}
