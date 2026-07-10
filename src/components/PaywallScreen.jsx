// Cygne Premium paywall — dark full-screen surface that replaces the main
// tab UI when the gate fires. Fetches RC offerings on mount, renders the
// monthly + annual packages side by side, drives the purchase, and
// refreshes the parent's premium status on success. Restore is available
// below the CTA for users returning on a new device.
//
// Rendered by App.jsx exclusively when shouldShowPaywall() returns true —
// the parent handles all the gate posture logic; this component just
// reflects it. onUnlock() is called when a purchase or restore surfaces
// an active premium entitlement, so the parent can re-check status and
// let the app through.

import { useEffect, useState } from "react";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { PREMIUM_ENTITLEMENT } from "../hooks/useSubscription.js";

const IVORY = "var(--color-ivory, #faf9f4)";
const INKY_MOSS = "var(--color-inky-moss, #2d3d2b)";
const CARD_BG = "rgba(250, 249, 244, 0.06)";
const CARD_BG_SELECTED = "rgba(250, 249, 244, 0.14)";
const BORDER_DIM = "rgba(250, 249, 244, 0.18)";
const BORDER_SELECTED = "rgba(250, 249, 244, 0.85)";
const MUTED = "rgba(255, 255, 255, 0.7)";
const FAINT = "rgba(255, 255, 255, 0.5)";

// Format a period into a short human label. RC's SubscriptionPeriod comes
// as either `.unit` ("MONTH"/"YEAR"/etc) + `.numberOfUnits`, or as a raw
// billingPeriod ISO 8601 like "P1M"/"P1Y". Handle both shapes so we don't
// crash on a future SDK version.
function formatPeriod(pkg) {
  const p = pkg?.product?.subscriptionPeriod;
  if (p?.unit && p?.numberOfUnits === 1) {
    const map = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };
    return map[p.unit] || p.unit.toLowerCase();
  }
  const iso = pkg?.product?.subscriptionPeriodISO || pkg?.product?.subscriptionPeriod;
  if (typeof iso === "string") {
    if (/^P1?Y$/.test(iso)) return "year";
    if (/^P1?M$/.test(iso)) return "month";
    if (/^P1?W$/.test(iso)) return "week";
  }
  // Fall back to identifier hint. RC's default packages use "$rc_monthly"
  // / "$rc_annual" / "$rc_lifetime" identifiers.
  const id = pkg?.identifier || "";
  if (id.includes("annual") || id.includes("year")) return "year";
  if (id.includes("month")) return "month";
  return "period";
}

// Coarse label for the button caption ("year" → "yearly", "month" → "monthly").
function periodAdjective(period) {
  if (period === "year") return "yearly";
  if (period === "month") return "monthly";
  if (period === "week") return "weekly";
  return period;
}

// Rough %-off badge for the annual vs monthly comparison. Not shown when
// we can't compute it (missing prices, non-standard periods, etc.).
function annualSavingsPct(monthly, annual) {
  const m = monthly?.product?.price;
  const y = annual?.product?.price;
  if (typeof m !== "number" || typeof y !== "number" || m <= 0 || y <= 0) return null;
  const yearlyIfMonthly = m * 12;
  const pct = Math.round(((yearlyIfMonthly - y) / yearlyIfMonthly) * 100);
  if (pct <= 0) return null;
  return pct;
}

export function PaywallScreen({ trialExpired, onUnlock, onSignOut }) {
  const [offerings, setOfferings] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // true while purchase/restore in flight
  const [error, setError] = useState(null);

  // Fetch offerings on mount. RC's Capacitor plugin returns
  //   { current: Offering | null, all: { [name]: Offering } }
  // Offering has .availablePackages[] + convenience accessors like
  // .monthly and .annual for standard-identifier packages.
  useEffect(() => {
    (async () => {
      // TEMP diagnostic — remove after we've traced the "Couldn't load
      // subscription options" empty-offerings issue. Two logs bracket
      // getOfferings(): the "start" line proves we reached the call at
      // all, the "result" line dumps the raw shape (offerings.current
      // may be null with a non-empty offerings.all, or the whole
      // response may be empty). Any throw lands in the catch below and
      // logs the error message + full object for RC error codes.
      console.log("[Cygne paywall DIAG] getOfferings start");
      try {
        const result = await Purchases.getOfferings();
        console.log(
          "[Cygne paywall DIAG] getOfferings result | current identifier:",
          result?.current?.identifier ?? null,
          "| current package count:",
          result?.current?.availablePackages?.length ?? 0,
          "| all offering keys:",
          result?.all ? Object.keys(result.all) : null,
          "| full result:",
          JSON.stringify(result),
        );
        const current = result?.current;
        if (!current || !Array.isArray(current.availablePackages) || current.availablePackages.length === 0) {
          console.warn(
            "[Cygne paywall DIAG] no current offering or empty packages — check the RevenueCat dashboard for a `default` offering with attached products",
          );
          setError("Subscription options aren't available right now. Please try again in a moment.");
          setLoading(false);
          return;
        }
        setOfferings(current);
        // Default the selection to annual if present (higher value); else monthly; else first available.
        const preferred = current.annual || current.monthly || current.availablePackages[0];
        setSelectedId(preferred?.identifier || null);
      } catch (e) {
        console.error(
          "[Cygne paywall DIAG] getOfferings threw:",
          "| message:", e?.message ?? String(e),
          "| code:", e?.code ?? null,
          "| underlyingErrorMessage:", e?.underlyingErrorMessage ?? null,
          "| full error:", e,
        );
        setError("Couldn't load subscription options. Please check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const packages = offerings?.availablePackages || [];
  // Pin the display order to monthly first, annual second. Anything else
  // (lifetime, custom) slots after in RC's own order.
  const monthly = offerings?.monthly || packages.find(p => p.identifier === "$rc_monthly");
  const annual = offerings?.annual || packages.find(p => p.identifier === "$rc_annual");
  const orderedPackages = [
    monthly,
    annual,
    ...packages.filter(p => p !== monthly && p !== annual),
  ].filter(Boolean);
  const savingsPct = annualSavingsPct(monthly, annual);

  const handlePurchase = async () => {
    if (!selectedId) return;
    const pkg = packages.find(p => p.identifier === selectedId);
    if (!pkg) return;
    setBusy(true);
    setError(null);
    try {
      const result = await Purchases.purchasePackage({ aPackage: pkg });
      const active = result?.customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
      if (active) {
        onUnlock?.();
      } else {
        // Purchase completed but entitlement not visible yet — RC's
        // dashboard is likely misconfigured (product not attached to the
        // premium entitlement). Log loudly; the user just paid.
        console.error("[Cygne paywall] purchase completed but premium entitlement not active — check RC dashboard entitlement mapping");
        setError("Purchase completed but we couldn't activate premium. Contact support.");
      }
    } catch (e) {
      // RC signals user-cancellation via a specific field. Silently reset.
      if (e?.userCancelled || e?.code === "1" /* PURCHASE_CANCELLED_ERROR */) {
        // no-op
      } else {
        console.error("[Cygne paywall] purchase failed:", e?.message ?? e);
        setError(e?.message || "Purchase failed. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await Purchases.restorePurchases();
      const active = result?.customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT];
      if (active) {
        onUnlock?.();
      } else {
        setError("No active subscription found on this Apple ID.");
      }
    } catch (e) {
      console.error("[Cygne paywall] restore failed:", e?.message ?? e);
      setError(e?.message || "Restore failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const headline = trialExpired ? "Your trial has ended" : "Unlock Cygne Premium";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: INKY_MOSS,
        display: "flex", flexDirection: "column",
        overflow: "auto",
        padding: "56px 24px 32px",
        color: IVORY,
      }}
    >
      {/* Logo */}
      <img
        src="/cygne-logo.png"
        alt="Cygne"
        style={{
          height: 40, width: "auto", display: "block",
          margin: "0 auto 32px",
          filter: "brightness(0) invert(1)", opacity: 0.95,
        }}
      />

      {/* Header + subtext */}
      <h1
        style={{
          fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
          fontWeight: 700, fontSize: 22, letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: IVORY,
          margin: "0 0 14px",
          textAlign: "center",
          lineHeight: 1.3,
        }}
      >
        {headline}
      </h1>
      <p
        style={{
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 14, lineHeight: 1.65,
          color: MUTED,
          margin: "0 auto 32px",
          textAlign: "center",
          maxWidth: 340,
        }}
      >
        The intelligence layer gets smarter the longer you use it. Continue your ritual.
      </p>

      {/* Body: loading / error / offerings */}
      {loading ? (
        <p style={{
          textAlign: "center",
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 12, color: FAINT, letterSpacing: "0.1em",
          textTransform: "uppercase", margin: "40px 0",
        }}>
          Loading options…
        </p>
      ) : orderedPackages.length === 0 ? (
        <p style={{
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 13, color: MUTED, textAlign: "center", margin: "40px auto",
          maxWidth: 320, lineHeight: 1.55,
        }}>
          {error || "Subscription options aren't available right now."}
        </p>
      ) : (
        <>
          {/* Pricing cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 440, width: "100%", margin: "0 auto 20px" }}>
            {orderedPackages.map(pkg => {
              const period = formatPeriod(pkg);
              const isSelected = selectedId === pkg.identifier;
              const isAnnual = pkg === annual;
              return (
                <button
                  key={pkg.identifier}
                  onClick={() => setSelectedId(pkg.identifier)}
                  disabled={busy}
                  style={{
                    position: "relative",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "18px 20px",
                    background: isSelected ? CARD_BG_SELECTED : CARD_BG,
                    border: `1.5px solid ${isSelected ? BORDER_SELECTED : BORDER_DIM}`,
                    borderRadius: 10,
                    color: IVORY,
                    cursor: busy ? "default" : "pointer",
                    textAlign: "left",
                    transition: "background 180ms ease, border-color 180ms ease",
                    WebkitAppearance: "none", appearance: "none",
                    WebkitTapHighlightColor: "transparent",
                    fontFamily: "inherit",
                  }}
                >
                  <div>
                    <p style={{
                      fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
                      fontWeight: 700, fontSize: 11, letterSpacing: "0.18em",
                      textTransform: "uppercase", color: IVORY,
                      margin: "0 0 4px",
                    }}>
                      {periodAdjective(period)}
                    </p>
                    <p style={{
                      fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
                      fontSize: 13, color: MUTED, margin: 0,
                    }}>
                      {pkg.product?.priceString} / {period}
                    </p>
                  </div>
                  {isAnnual && savingsPct !== null && (
                    <span style={{
                      fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
                      fontWeight: 700, fontSize: 9, letterSpacing: "0.2em",
                      textTransform: "uppercase",
                      color: INKY_MOSS,
                      background: IVORY,
                      padding: "5px 10px", borderRadius: 4,
                    }}>
                      Save {savingsPct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Purchase CTA */}
          <button
            onClick={handlePurchase}
            disabled={busy || !selectedId}
            style={{
              display: "block",
              width: "100%", maxWidth: 440,
              margin: "0 auto 14px",
              padding: "16px 0",
              background: "transparent",
              border: `1.5px solid ${IVORY}`,
              color: IVORY,
              borderRadius: 10,
              fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
              fontWeight: 700, fontSize: 12, letterSpacing: "0.22em",
              textTransform: "uppercase",
              cursor: busy || !selectedId ? "default" : "pointer",
              opacity: busy || !selectedId ? 0.5 : 1,
              transition: "opacity 180ms ease",
              WebkitAppearance: "none", appearance: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {busy ? "Please wait…" : "Start my membership"}
          </button>

          {/* Restore */}
          <button
            onClick={handleRestore}
            disabled={busy}
            style={{
              background: "none", border: "none",
              color: MUTED,
              fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
              fontSize: 12, letterSpacing: "0.06em",
              margin: "0 auto 20px",
              cursor: busy ? "default" : "pointer",
              padding: 8,
              textDecoration: "underline",
              textDecorationColor: FAINT,
              textUnderlineOffset: 4,
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Restore purchases
          </button>
        </>
      )}

      {/* Error line */}
      {error && !loading && orderedPackages.length > 0 && (
        <p style={{
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 12, color: "#e8b4a0",
          textAlign: "center", margin: "0 auto 20px", maxWidth: 340, lineHeight: 1.55,
        }}>
          {error}
        </p>
      )}

      {/* Legal footer */}
      <div style={{ marginTop: "auto", paddingTop: 24, textAlign: "center", maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
        <p style={{
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 10, color: FAINT, lineHeight: 1.6,
          margin: "0 0 8px",
        }}>
          Cancel anytime. Subscription auto-renews unless cancelled at least 24 hours before the end of the current period.
        </p>
        <p style={{
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontSize: 10, color: FAINT, letterSpacing: "0.06em",
          margin: 0,
        }}>
          <a href="https://cygne.skin/terms" target="_blank" rel="noreferrer" style={{ color: FAINT, textDecoration: "underline" }}>
            Terms of Service
          </a>
          {" · "}
          <a href="https://cygne.skin/privacy" target="_blank" rel="noreferrer" style={{ color: FAINT, textDecoration: "underline" }}>
            Privacy Policy
          </a>
        </p>
        {onSignOut && (
          <button
            onClick={onSignOut}
            disabled={busy}
            style={{
              background: "none", border: "none",
              color: FAINT,
              fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
              fontSize: 10, letterSpacing: "0.06em",
              marginTop: 14,
              cursor: busy ? "default" : "pointer",
              padding: 6,
              textDecoration: "underline",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
