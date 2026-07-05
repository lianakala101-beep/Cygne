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

// Shape returned to callers. `source` distinguishes the reasons the answer
// might be "not premium" so debug output is meaningful. `isPremium` is
// always a plain boolean.
function inactiveResult(source) {
  return { isPremium: false, entitlement: null, customerInfo: null, source };
}

/**
 * One-shot check. Resolves to
 *   { isPremium, entitlement, customerInfo, source }
 * where `source` is one of "web" / "no-native" / "error" / "revenuecat".
 * Always resolves — never throws — so callers can safely `await` inline.
 */
export async function checkPremiumStatus() {
  // Web build has no native RevenueCat bridge.
  if (Capacitor.getPlatform() === "web" || !Capacitor.isNativePlatform()) {
    return inactiveResult("web");
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
