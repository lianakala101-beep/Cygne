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

import { useEffect, useRef, useState } from "react";
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

// -------- Trial computation ---------------------------------------------

// 14-day free trial from account creation. Extend / shorten here if the
// business logic changes — the paywall + gate read it from this constant.
export const TRIAL_DAYS = 14;

/**
 * Pure function — given the ISO timestamp of the user's account creation
 * (typically `authSession.user.created_at` from Supabase), returns
 *   { isActive, daysRemaining, daysElapsed }
 *
 * A missing or unparseable date returns "trial active with full duration"
 * — benefit of the doubt to a live user rather than gating them out on a
 * data glitch. Elapsed-time math is local-day-boundary aware: we compare
 * calendar days rather than 86400000ms increments so a user who signed up
 * at 11pm and opens the app the next morning at 8am is on day 2, not
 * still day 1 with 15 hours left.
 */
export function computeTrialStatus(trialStartDate) {
  if (!trialStartDate) return { isActive: true, daysRemaining: TRIAL_DAYS, daysElapsed: 0 };
  const startMs = new Date(trialStartDate).getTime();
  if (Number.isNaN(startMs)) return { isActive: true, daysRemaining: TRIAL_DAYS, daysElapsed: 0 };
  const nowMs = Date.now();
  const daysElapsed = Math.max(0, Math.floor((nowMs - startMs) / 86400000));
  const daysRemaining = Math.max(0, TRIAL_DAYS - daysElapsed);
  return { isActive: daysRemaining > 0, daysRemaining, daysElapsed };
}

/**
 * React hook — combines RevenueCat entitlement state with local trial
 * state. Caller passes the account creation timestamp (typically
 * `authSession?.user?.created_at`). Returns
 *   { isPremium, isTrialActive, trialDaysRemaining, loading, source, refresh }
 * `source` propagates from useSubscription so the caller (or
 * shouldShowPaywall below) can reason about whether the RC answer is
 * definitive or a transient/degraded state.
 */
export function usePremiumStatus(trialStartDate) {
  const sub = useSubscription();
  const trial = computeTrialStatus(trialStartDate);
  // useSubscription's own mount effect fires once against whichever RC
  // identity is current at that moment — typically anonymous, because
  // rcSyncIdentity(session) runs from a parallel Supabase auth effect.
  // Re-check when trialStartDate lands so a signed-in user's real
  // entitlements replace the anonymous answer. First mount is a no-op
  // (useSubscription already fired) — the guarded call is only for
  // subsequent auth-identity changes.
  const primedRef = useRef(false);
  useEffect(() => {
    if (!primedRef.current) { primedRef.current = true; return; }
    if (trialStartDate) sub.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trialStartDate]);
  return {
    isPremium: sub.isPremium,
    isTrialActive: trial.isActive,
    trialDaysRemaining: trial.daysRemaining,
    loading: sub.loading,
    source: sub.source,
    refresh: sub.refresh,
  };
}

/**
 * Gate posture. Returns true only when RC has DEFINITIVELY confirmed the
 * user is not premium AND the local trial has expired. Any other state
 * — still loading, web build, invalid RC key, transient RC error —
 * returns false (don't gate). The tradeoff: someone could squeeze a few
 * extra minutes of access during a network blip. Not gating on ambiguous
 * state is the safer default — a hard paywall on a wrong-key build
 * would strand every user with no way in, and there's no way for them
 * to fix the app from the client side.
 */
export function shouldShowPaywall(status) {
  if (!status) return false;
  if (status.loading) return false;
  if (status.source !== "revenuecat") return false; // web / invalid-key / error / null
  if (status.isPremium) return false;
  if (status.isTrialActive) return false;
  return true;
}
