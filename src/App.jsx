import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { Icon } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, detectActives } from "./engine.js";
import { RAMP_SCHEDULES, RAMP_ACTIVES } from "./ramp.jsx";
import { PreAuthScreen } from "./splash.jsx";
import { Dashboard } from "./dashboard.jsx";
import { MyRoutine } from "./ritualscreen.jsx";
import { Shelf } from "./vanity.jsx";
import { Progress } from "./progress.jsx";
import { SwanWelcomeScreen, useLocalStorage, getCurrentCycleDay, daysBetweenLocal, toLocalMidnight, isoWeekNumber, isoWeekYear } from "./utils.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard } from "./seasonal.jsx";
import { supabase } from "./supabase.js";
import { API_BASE_URL } from "./config.js";
import { Capacitor } from "@capacitor/core";
import { Purchases, LOG_LEVEL } from "@revenuecat/purchases-capacitor";
import { RC_KEY_LOOKS_VALID, rcKeyInvalidReason, usePremiumStatus, shouldShowPaywall } from "./hooks/useSubscription.js";
import { PaywallScreen } from "./components/PaywallScreen.jsx";

// Module-scope readiness flag. Flips to true after Purchases.configure()
// resolves. All identity-sync + downstream getCustomerInfo calls guard on
// this — if configure was skipped (bad key, missing key, web build) any
// call would throw "Purchases not configured", so we short-circuit
// silently instead.
let rcReady = false;

// RevenueCat platform detection. The Capacitor plugin ships iOS + Android
// native bridges only; on the Vercel web build Capacitor.getPlatform()
// returns "web" and every Purchases.* call would throw. Every RC call in
// this file is gated behind `rcAvailable()` so the same source tree runs
// unchanged in both targets.
function rcAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() !== "web";
}

// Sync RevenueCat's subscriber identity to Supabase's user id when auth
// changes. `logIn` associates any anonymous entitlement history the SDK
// picked up before sign-in with the real account; `logOut` returns the
// SDK to an anonymous ID so a sign-out doesn't leave the previous user's
// premium status attached to whoever signs in next on the same device.
// Best-effort — any RC error is logged and swallowed so a subscription
// hiccup can't block Supabase auth from advancing. Also gated on rcReady
// so we don't fire logIn/logOut when configure was skipped (bad or
// missing key) — those calls would throw "Purchases not configured".
async function rcSyncIdentity(session) {
  if (!rcAvailable() || !rcReady) return;
  try {
    if (session?.user?.id) {
      await Purchases.logIn({ appUserID: session.user.id });
    } else {
      await Purchases.logOut();
    }
  } catch (e) {
    console.error("[Cygne rc] identity sync failed:", e?.message ?? e);
  }
}

// Code-split: gated by user action or onboarding state, so their chunks load
// on demand rather than blocking initial paint.
const OnboardingScreen = lazy(() => import("./onboarding.jsx").then(m => ({ default: m.OnboardingScreen })));
const Reflection       = lazy(() => import("./reflection.jsx").then(m => ({ default: m.Reflection })));
const ProfileSheet     = lazy(() => import("./profile.jsx").then(m => ({ default: m.ProfileSheet })));
const ScanModal        = lazy(() => import("./modals.jsx").then(m => ({ default: m.ScanModal })));
const ProductModal     = lazy(() => import("./productmodal.jsx").then(m => ({ default: m.ProductModal })));
const RoutineFitSheet  = lazy(() => import("./productmodal.jsx").then(m => ({ default: m.RoutineFitSheet })));

// Scan the last 7 days of check-ins and return the breakout zone logged 2+
// times (the most frequent), or null. Drives the home-screen reflection
// prompt. Zone values are the human labels stored in checkIns[].breakoutZones.
function findActiveBreakoutZone(checkIns) {
  if (!Array.isArray(checkIns) || !checkIns.length) return null;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const counts = {};
  for (const c of checkIns) {
    if (!c?.date || new Date(c.date).getTime() < weekAgo) continue;
    for (const z of (c.breakoutZones || [])) {
      if (!z) continue;
      counts[z] = (counts[z] || 0) + 1;
    }
  }
  const top = Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

// Home-screen nudge inviting the user to capture a reflection when a breakout
// zone has been active. Editorial styling: dark canvas, ivory outline, Fungis
// Normal, no bold.
function ReflectionPromptCard({ zone, onOpen, onDismiss }) {
  return (
    <div style={{
      position: "relative",
      background: "var(--color-inky-moss, #2d3d2b)",
      border: "1px solid var(--color-ivory, #faf9f4)",
      borderRadius: 8,
      padding: "20px 22px",
      marginBottom: 24,
      color: "var(--color-ivory, #faf9f4)",
    }}>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          position: "absolute", top: 12, right: 12,
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(250,249,244,0.6)", padding: 4, display: "inline-flex",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <Icon name="x" size={12} />
      </button>

      <p style={{
        margin: "0 0 16px",
        paddingRight: 18,
        fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
        fontWeight: 400,
        fontSize: 12,
        letterSpacing: "0.12em",
        lineHeight: 1.7,
        textTransform: "uppercase",
        color: "var(--color-ivory, #faf9f4)",
      }}>
        Your {zone} has been active — this would be a good moment to capture a reflection.
      </p>

      <button
        onClick={onOpen}
        style={{
          background: "transparent",
          border: "1px solid var(--color-ivory, #faf9f4)",
          borderRadius: 6,
          color: "var(--color-ivory, #faf9f4)",
          fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
          fontWeight: 400,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          padding: "11px 20px",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        Open Reflection
      </button>
    </div>
  );
}

export default function App() {
  // -- Auth state --------------------------------------------------------------
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const requestNotifications = () => {
    setNotifPermission("granted");
    setNotifDismissed(false);
    // Save preference to user profile (will sync to Supabase)
    if (user) {
      const updated = { ...user, notifEnabled: true, amReminderEnabled: true, pmReminderEnabled: true, amReminderTime: user.amReminderTime || "7:30", pmReminderTime: user.pmReminderTime || "9:00" };
      setUser(updated);
      const { email, ...profileData } = updated;
      supabase.auth.updateUser({ data: { ...profileData, onboarding_complete: true } }).catch(() => {});
    }
  };

  const [user, setUser] = useLocalStorage("cygne_user", null);
  const [firstRun, setFirstRun] = useLocalStorage("cygne_firstrun", false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [notifDismissed, setNotifDismissed] = useLocalStorage("cygne_notifdismissed", false);
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useLocalStorage("cygne_products", []);
  const [modal, setModal] = useState(null);
  const [checkIns, setCheckIns] = useLocalStorage("cygne_checkins", []);
  const [journals, setJournals] = useLocalStorage("cygne_journals", []);
  const [scanOpen, setScanOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [swanPopupDismissed, setSwanPopupDismissed] = useLocalStorage("cygne_swandismissed", false);

  const dismissSwanPopup = () => {
    setSwanPopupDismissed(true);
  };

  // -- Reflection prompt from logged breakout zones --------------------------
  const [showReflectionPrompt, setShowReflectionPrompt] = useState(false);
  const [reflectionPromptZone, setReflectionPromptZone] = useState(null);

  // After a check-in saves (checkIns changes), scan the last 7 days. If a zone
  // appears 2+ times, surface the home-screen reflection prompt — unless it's
  // already been dismissed today.
  useEffect(() => {
    const zone = findActiveBreakoutZone(checkIns);
    if (!zone) {
      setShowReflectionPrompt(false);
      setReflectionPromptZone(null);
      return;
    }
    let dismissedOn = null;
    try { dismissedOn = localStorage.getItem("cygne_reflection_prompt_dismissed"); } catch { /* ignore */ }
    if (dismissedOn === today) {
      setShowReflectionPrompt(false);
      return;
    }
    setReflectionPromptZone(zone);
    setShowReflectionPrompt(true);
  }, [checkIns, today]);

  const dismissReflectionPrompt = () => {
    try { localStorage.setItem("cygne_reflection_prompt_dismissed", today); } catch { /* ignore */ }
    setShowReflectionPrompt(false);
  };
  const [treatments, setTreatments] = useLocalStorage("cygne_treatments", []);
  const [locationData, setLocationData] = useState(null);
  const [locationDenied, setLocationDenied] = useLocalStorage("cygne_locationdenied", false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [waitingRoom, setWaitingRoom] = useLocalStorage("cygne_waitingroom", []);
  const [completedSteps, setCompletedSteps] = useState({ date: null, steps: [] });
  const [rampLog, setRampLog] = useLocalStorage("cygne_ramp_log", []);
  // Trigger + symptom log captured from the body-acne "What happened today?"
  // modal. Lifted to App.jsx (was session-only useState in BodyAcneTracker)
  // so it persists across reloads, syncs to Supabase, and is visible to
  // SwanSense and Ask Cygne for pattern analysis.
  const [triggerLog, setTriggerLog] = useLocalStorage("cygne_trigger_log", []);
  const [fitSheet, setFitSheet] = useState(null);
  const [reflections, setReflections] = useLocalStorage("cygne_reflections", []);

  // RevenueCat premium + local trial state. Trial starts at account
  // creation (auth.users.created_at) and lasts TRIAL_DAYS. The hook
  // internally reads RC's active `premium` entitlement; combined with
  // shouldShowPaywall() below, this drives the paywall gate.
  const premiumStatus = usePremiumStatus(authSession?.user?.created_at);

  // Track whether initial load from Supabase is done (prevents overwriting cloud data with empty localStorage)
  const profileLoaded = useRef(false);
  // Per-collection load flags. Each one flips to true ONLY after that
  // collection's table-load IIFE in loadUserProfile resolves (success or
  // error). The matching sync useEffects below gate on these so they
  // never run against the localStorage default `[]` and wipe / overwrite
  // server data during the loading race.
  // PRODUCTS specifically: the sync effect runs upsert + a stale-row
  // delete pass. Without this flag, an effect run fired by the initial
  // localStorage `[]` would compute `staleIds = every server row` and
  // wipe the table. This is the launch-blocking data-integrity bug.
  // RAMP_LOG is upsert-only with a length-0 short-circuit, so the
  // failure mode is less severe (no wipe), but applying the same flag
  // keeps the pattern symmetric and prevents a future stale-diff
  // addition from regressing.
  const productsLoaded = useRef(false);
  const rampLogLoaded = useRef(false);
  // user-sync debounce + change detection. The belt-and-suspenders
  // useEffect below fires supabase.auth.updateUser({...}) whenever the
  // `user` React state changes, including the initial setUser inside
  // loadUserProfile that just READ user_metadata. Each updateUser goes
  // through the Supabase auth client's `navigator.locks` acquire,
  // contending with any other tab / session and surfacing as
  // `AbortError: Lock was stolen by another request`. lastUserSyncRef
  // is the serialized profile data last sent to Supabase — equality
  // skips the write, so a re-render with the same data doesn't fire
  // the lock. The timer batches bursts of setUser calls into a single
  // updateUser after 1.5s of quiet.
  const lastUserSyncRef = useRef(null);
  const userSyncTimerRef = useRef(null);

  // -- Configure RevenueCat once on mount -------------------------------------
  // Fires as early as possible so the SDK is ready by the time the auth
  // effect (below) starts asking for logIn. RC internally queues calls
  // that arrive before configure resolves, so we don't need to gate the
  // auth effect on this promise. VITE_REVENUECAT_API_KEY is set per
  // platform build (iOS key in the Capacitor build; unset in web).
  // Missing key on native is a config error worth logging loudly; missing
  // key on web is expected and stays silent.
  useEffect(() => {
    if (!rcAvailable()) return;
    const apiKey = import.meta.env.VITE_REVENUECAT_API_KEY;
    if (!apiKey) {
      console.error("[Cygne rc] VITE_REVENUECAT_API_KEY is not set — subscription features will not work in this build");
      return;
    }
    // Prefix check — refuse to configure with a Test Store key (or a
    // key from the wrong platform). RC's SDK still starts with a bad
    // key but emits a runtime warning and, in some launch paths, takes
    // the app down. Catching it here disables subscription surfaces
    // gracefully instead: rcReady stays false, so identity sync + hook
    // calls silently short-circuit. Fix in the RC dashboard, not code.
    if (!RC_KEY_LOOKS_VALID) {
      console.error("[Cygne rc]", rcKeyInvalidReason());
      return;
    }
    (async () => {
      try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
        await Purchases.configure({ apiKey });
        rcReady = true;
      } catch (e) {
        console.error("[Cygne rc] configure failed:", e?.message ?? e);
      }
    })();
  }, []);

  // -- Check Supabase session on mount ----------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Cygne] getSession result:", session ? "active session" : "no session");
      setAuthSession(session);
      if (session) {
        loadUserProfile(session.user);
      }
      // Migrate any anonymous RC identity to the Supabase user id (or
      // log out if there's no session). Runs on every mount so a
      // returning user comes back with their entitlements attached.
      rcSyncIdentity(session);
      setAuthLoading(false);
    }).catch((e) => {
      console.error("[Cygne] getSession failed:", e);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      // Keep RC identity in lockstep with Supabase's — sign-in migrates
      // to the user id, sign-out drops back to an anonymous identity so
      // premium status doesn't leak between accounts on shared devices.
      rcSyncIdentity(session);
      if (!session) {
        setUser(null);
        setNeedsOnboarding(false);
        profileLoaded.current = false;
        // Reset the per-collection load + sync flags too so the next
        // sign-in's table-load IIFEs can flip them fresh, and any
        // pending user-sync debounce timer is dropped so it doesn't
        // fire against the now-signed-out session.
        productsLoaded.current = false;
        rampLogLoaded.current = false;
        lastUserSyncRef.current = null;
        if (userSyncTimerRef.current) {
          clearTimeout(userSyncTimerRef.current);
          userSyncTimerRef.current = null;
        }
        // Clear all local caches so the next sign-in doesn't inherit stale data
        setProducts([]);
        setJournals([]);
        setCheckIns([]);
        setTreatments([]);
        setWaitingRoom([]);
        setCompletedSteps({ date: null, steps: [] });
        setRampLog([]);
        setTriggerLog([]);
        setReflections([]);
        setLocationData(null);
        setLocationDenied(false);
        setNotifDismissed(false);
        setSwanPopupDismissed(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profile from Supabase user_metadata
  const loadUserProfile = (authUser) => {
    const meta = authUser?.user_metadata;
    if (meta?.onboarding_complete) {
      const initialUserData = {
        name: meta.name || "Friend",
        email: authUser.email,
        birthYear: meta.birthYear || null,
        birthMonth: meta.birthMonth || null,
        birthDay: meta.birthDay || null,
        skinType: meta.skinType || "",
        concerns: meta.concerns || [],
        knownActives: meta.knownActives || [],
        skinAgeBracket: meta.skinAgeBracket || null,
        // Persisted settings
        bodyAcneEnabled: meta.bodyAcneEnabled || false,
        bodyAcneZones: meta.bodyAcneZones || [],
        cycleTrackingEnabled: meta.cycleTrackingEnabled || false,
        cycleStartDate: meta.cycleStartDate || null,
        cycleDay: getCurrentCycleDay({ cycleStartDate: meta.cycleStartDate, cycleDay: meta.cycleDay }),
        tempUnit: meta.tempUnit || null,
        notifEnabled: meta.notifEnabled || false,
        amReminderEnabled: meta.amReminderEnabled !== undefined ? meta.amReminderEnabled : (meta.notifEnabled || false),
        pmReminderEnabled: meta.pmReminderEnabled !== undefined ? meta.pmReminderEnabled : (meta.notifEnabled || false),
        amReminderTime: meta.amReminderTime || "7:30",
        pmReminderTime: meta.pmReminderTime || "9:00",
        resetDay: meta.resetDay !== undefined && meta.resetDay !== null ? meta.resetDay : 0,
        reflectionReminderAt: meta.reflectionReminderAt || null,
        completedSteps: meta.completedSteps || null,
        // Profile data
        ingredientProfile: meta.ingredientProfile || null,
        medicalHistory: meta.medicalHistory || null,
        // Onboarding-captured preferences (skin goals, special occasion,
        // consistency, routine philosophy, climate, environment, travel,
        // fragrance sensitivity, ingredients to avoid)
        skinProfile: meta.skinProfile || null,
      };
      // Prime the user-sync change-detection ref with the same data
      // we're about to set on state. The user-sync useEffect compares
      // each new render's serialized profileData to this; matching
      // means "nothing actually changed since the last write to
      // Supabase" and skips the updateUser call. Without priming,
      // every fresh load would trigger one redundant write back to
      // user_metadata with the SAME values we just read — and each
      // write goes through navigator.locks, contending with any
      // other tab.
      const { email: _e, cycleDay: _c, ...initialProfileData } = initialUserData;
      lastUserSyncRef.current = JSON.stringify(initialProfileData);
      setUser(initialUserData);
      // Restore notification state
      if (meta.notifEnabled || meta.amReminderEnabled || meta.pmReminderEnabled) {
        setNotifPermission("granted");
      }
      // Restore notification banner dismissal from Supabase
      if (meta.notifDismissed !== undefined) {
        setNotifDismissed(meta.notifDismissed);
      }
      // Restore completed steps from Supabase
      if (meta.completedSteps) {
        setCompletedSteps(meta.completedSteps);
      }
      // Restore journals + check-ins from Supabase. Phase 1 of the
      // metadata-migration moved both of these out of user_metadata and into
      // their own per-collection tables (check_ins, journals — see
      // supabase/migrations/20260605000000_create_checkins_journals_tables.sql).
      // localStorage still primes the React state instantly via
      // useLocalStorage; these reads override it once the table query
      // resolves. Fire-and-forget so the rest of loadUserProfile doesn't
      // block on the DB roundtrip.
      (async () => {
        const { data: jRows, error: jErr } = await supabase
          .from("journals").select("data").eq("user_id", authUser.id);
        if (jErr) {
          console.error("[Cygne] journals load failed:", jErr.message);
          return;
        }
        if (Array.isArray(jRows)) {
          const next = jRows.map(r => r.data).filter(Boolean);
          // Sort by date asc to match the existing setJournals call sites'
          // expected ordering (progress.jsx sorts on insert too).
          next.sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
          setJournals(next);
        }
      })();
      (async () => {
        const { data: cRows, error: cErr } = await supabase
          .from("check_ins").select("data").eq("user_id", authUser.id);
        if (cErr) {
          console.error("[Cygne] check_ins load failed:", cErr.message);
          return;
        }
        if (Array.isArray(cRows)) {
          const next = cRows.map(r => r.data).filter(Boolean);
          // Check-ins were stored in append order; preserve that by sorting
          // ascending on `date` (full ISO timestamp).
          next.sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
          setCheckIns(next);
        }
      })();
      // Restore treatments from Supabase
      if (meta.treatments && Array.isArray(meta.treatments)) {
        setTreatments(meta.treatments);
      }
      // Restore location data from Supabase
      if (meta.locationData && meta.locationData.lat) {
        setLocationData(meta.locationData);
      }
      // Restore location denied state
      if (meta.locationDenied) {
        setLocationDenied(true);
      }
      // Restore products + rampLog from Supabase. Phase 2 of the
      // metadata-migration moved both of these out of user_metadata and
      // into their own per-collection tables (products, ramp_log — see
      // supabase/migrations/20260606000000_create_products_ramplog_tables.sql).
      // Fire-and-forget so the rest of loadUserProfile doesn't block on
      // the DB roundtrip; useLocalStorage already seeded the React state
      // instantly, the table reads override once they resolve.
      (async () => {
        try {
          const { data: pRows, error: pErr } = await supabase
            .from("products").select("data").eq("user_id", authUser.id);
          if (pErr) {
            console.error("[Cygne] products load failed:", pErr.message);
            return;
          }
          if (Array.isArray(pRows)) {
            const next = pRows.map(r => r.data).filter(Boolean);
            // Only overwrite local state when the server has something to
            // say — an empty server response should NOT clobber optimistic
            // local products that haven't been upserted yet (e.g. a new
            // user who added products before the sync effect could fire,
            // or any interleaving with a second tab / auth refresh). If the
            // server truly is empty and local is empty too, the assignment
            // is a no-op; if local has items, we keep them and let the next
            // sync effect tick upsert them.
            setProducts(prev => {
              if (next.length > 0) return next;
              return Array.isArray(prev) && prev.length > 0 ? prev : next;
            });
          }
        } finally {
          // Flip the gate AFTER the load resolves (success or error) —
          // before this line, the products sync useEffect is a no-op,
          // so the localStorage-default empty array can't trigger the
          // stale-diff delete pass and wipe the table.
          productsLoaded.current = true;
        }
      })();
      (async () => {
        try {
          const { data: rRows, error: rErr } = await supabase
            .from("ramp_log").select("data").eq("user_id", authUser.id);
          if (rErr) {
            console.error("[Cygne] ramp_log load failed:", rErr.message);
            return;
          }
          if (Array.isArray(rRows)) {
            const next = rRows.map(r => r.data).filter(Boolean);
            // rampLog has historically been kept in ascending timestamp
            // order; sort ascending so any code that reads e.g. .slice(-N)
            // gets the most recent entries.
            next.sort((a, b) => String(a?.timestamp || "").localeCompare(String(b?.timestamp || "")));
            // Same non-clobber guard as products above — an empty server
            // response should not wipe locally-appended ramp entries that
            // haven't been upserted yet.
            setRampLog(prev => {
              if (next.length > 0) return next;
              return Array.isArray(prev) && prev.length > 0 ? prev : next;
            });
          }
        } finally {
          rampLogLoaded.current = true;
        }
      })();
      if (meta.triggerLog && Array.isArray(meta.triggerLog)) {
        setTriggerLog(meta.triggerLog);
      }
      if (meta.reflections && Array.isArray(meta.reflections)) {
        // Merge cloud + local by id. Cloud is the canonical record but
        // local-only entries (cloud write failed mid-flight) must survive
        // reload — and local copies preserve `inline` data URLs that may
        // have been stripped from the cloud payload, so prefer them when
        // the cloud version is missing one.
        setReflections(prev => {
          const byId = new Map();
          for (const r of meta.reflections) if (r?.id) byId.set(r.id, r);
          for (const r of prev) {
            if (!r?.id) continue;
            const cloud = byId.get(r.id);
            if (!cloud) {
              byId.set(r.id, r);
            } else if (!cloud.inline && r.inline) {
              // Cloud stripped inline to keep user_metadata small; preserve the
              // local copy so the gallery always has an inline fallback when the
              // signed URL is stale / unreachable.
              byId.set(r.id, { ...cloud, inline: r.inline });
            }
          }
          return Array.from(byId.values());
        });
      }
      if (meta.waitingRoom && Array.isArray(meta.waitingRoom)) {
        setWaitingRoom(meta.waitingRoom);
      }
      // Restore swan popup dismissal
      if (meta.swanPopupDismissed !== undefined) {
        setSwanPopupDismissed(meta.swanPopupDismissed);
      }
      profileLoaded.current = true;
      setNeedsOnboarding(false);
      console.log("[Cygne] profile restored from Supabase", {
        userId: authUser.id,
        products: (meta.products || []).length,
        journals: (meta.journals || []).length,
        checkIns: (meta.checkIns || []).length,
        treatments: (meta.treatments || []).length,
        rampLog: (meta.rampLog || []).length,
        waitingRoom: (meta.waitingRoom || []).length,
        cycleTracking: !!meta.cycleTrackingEnabled,
        reminders: { am: meta.amReminderEnabled, pm: meta.pmReminderEnabled },
      });
    } else {
      setUser(null);
      setNeedsOnboarding(true);
    }
  };

  // -- Treatment CRUD with immediate Supabase persistence ----------------------
  const saveTreatment = (treatment) => {
    if (!profileLoaded.current && authSession) {
      console.warn("[Cygne] treatment save blocked — profile not loaded yet");
      return;
    }
    setTreatments(prev => {
      const next = [...prev, treatment];
      console.log("[Cygne] saving treatment", treatment);
      if (authSession) supabase.auth.updateUser({ data: { treatments: next } })
        .then(() => console.log("[Cygne] treatment saved to Supabase"))
        .catch(e => console.error("[Cygne] treatment save failed:", e));
      return next;
    });
  };
  const removeTreatment = (id) => {
    setTreatments(prev => {
      const next = prev.filter(t => t.id !== id);
      if (authSession) supabase.auth.updateUser({ data: { treatments: next } })
        .then(() => console.log("[Cygne] treatment removed from Supabase"))
        .catch(e => console.error("[Cygne] treatment remove failed:", e));
      return next;
    });
  };
  const updateTreatmentDate = (id, newDateIso = null) => {
    const today = new Date();
    const iso = newDateIso || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setTreatments(prev => {
      const next = prev.map(t => t.id === id ? { ...t, date: iso } : t);
      console.log("[Cygne treatment reset]", { treatmentId: id, newDate: iso });
      if (authSession) supabase.auth.updateUser({ data: { treatments: next } })
        .then(() => console.log("[Cygne] treatment date saved to Supabase"))
        .catch(e => console.error("[Cygne] treatment reset save failed:", e));
      return next;
    });
  };

  // -- Sync journals to Supabase when they change ----------------------------
  // Writes to the `journals` table (Phase 1 metadata migration). client_id is
  // the row's `date` (YYYY-MM-DD); the journal flow already de-dupes by date,
  // so upsert overwriting on (user_id, client_id) matches existing semantics.
  // Note: this is upsert-only — a row removed from local state will not be
  // deleted from the table. The journal UI never deletes today, so this is
  // safe for now; a future change can layer in a delete pass if needed.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    if (!Array.isArray(journals) || journals.length === 0) return;
    const userId = authSession.user.id;
    const rows = journals
      .filter(j => j && j.date)
      .map(j => ({ user_id: userId, client_id: String(j.date), data: j }));
    if (rows.length === 0) return;
    supabase.from("journals").upsert(rows, { onConflict: "user_id,client_id" })
      .then(({ error }) => {
        if (error) console.error("[Cygne] journals upsert failed:", error.message);
      });
  }, [journals, authSession]);

  // -- Sync check-ins to Supabase when they change ---------------------------
  // Writes to the `check_ins` table. client_id is the row's `date` (full ISO
  // timestamp) — unique per check-in by construction.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    if (!Array.isArray(checkIns) || checkIns.length === 0) return;
    const userId = authSession.user.id;
    const rows = checkIns
      .filter(c => c && c.date)
      .map(c => ({ user_id: userId, client_id: String(c.date), data: c }));
    if (rows.length === 0) return;
    supabase.from("check_ins").upsert(rows, { onConflict: "user_id,client_id" })
      .then(({ error }) => {
        if (error) console.error("[Cygne] check_ins upsert failed:", error.message);
      });
  }, [checkIns, authSession]);

  // -- Sync completed steps to Supabase when they change ---------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { completedSteps } }).catch(() => {});
  }, [completedSteps]);

  // -- Sync location data to Supabase when it changes -------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { locationData } }).catch(() => {});
  }, [locationData]);

  // -- Auto-detect temperature unit from location country ---------------------
  useEffect(() => {
    if (!user || !locationData?.country) return;
    if (user.tempUnit) return; // already set
    const unit = locationData.country === "US" ? "F" : "C";
    setUser({ ...user, tempUnit: unit });
    if (profileLoaded.current && authSession) {
      supabase.auth.updateUser({ data: { tempUnit: unit } }).catch(() => {});
    }
  }, [locationData?.country, user?.tempUnit]);

  // -- Sync location denied state to Supabase ---------------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { locationDenied } }).catch(() => {});
  }, [locationDenied]);

  // -- Sync notification dismissal to Supabase --------------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { notifDismissed } }).catch(() => {});
  }, [notifDismissed]);

  // -- Sync products (vanity shelf) to Supabase -------------------------------
  // Writes to the `products` table. UPSERT-ONLY since the previous
  // stale-diff/delete pattern caused real data loss — when local state
  // started as [] (cleared localStorage, fresh device, anything that
  // raced the table load) the diff classified every server-side row as
  // "stale" and deleted them all. The productsLoaded gate below was a
  // belt-and-suspenders patch; this rewrite removes the wipe vector at
  // the source.
  //
  // Deletions are now handled at the exact moment the user removes a
  // product — see the `onDelete` callback on the <Shelf> mount further
  // down, which directly calls supabase.from('products').delete() for
  // the specific client_id. The sync effect here only ever ADDS or
  // UPDATES rows; it can never delete.
  //
  // Trade-off: if a user is offline at delete time, the explicit delete
  // fails silently and the row stays in the table. On next online
  // load, the deleted product reappears in their vanity. This is a
  // single-product regression vs. the data-loss bug it replaces (which
  // could wipe 10+ products at once). Acceptable for launch.
  // TODO: queue offline deletes for retry — track post-launch.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    // productsLoaded gate stays as belt-and-suspenders; without the
    // stale-diff/delete pass, the worst this guards against is an
    // extra redundant upsert of the localStorage-seeded set before
    // the server set has resolved. Cheap insurance.
    if (!productsLoaded.current) return;
    if (!Array.isArray(products) || products.length === 0) return;
    const userId = authSession.user.id;
    const rows = products
      .filter(p => p && p.id != null)
      .map(p => ({ user_id: userId, client_id: String(p.id), data: p }));
    if (rows.length === 0) return;
    supabase.from("products").upsert(rows, { onConflict: "user_id,client_id" })
      .then(({ error }) => {
        if (error) console.error("[Cygne] products upsert failed:", error.message);
      });
  }, [products, authSession]);

  // -- Sync ramp log (Skin Handled It / Backing Off history) to Supabase -----
  // Writes to the `ramp_log` table. client_id is `${productId}_${timestamp}`
  // — timestamp alone isn't unique (auto-graduate / auto-enroll can emit
  // many entries in one tick all sharing the same nowIso). Append-only by
  // design; no stale-row cleanup pass since rampLog is an audit trail and
  // entries should never disappear.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    // Symmetric guard with products. ramp_log is upsert-only with no
    // delete pass, so this isn't strictly a data-loss gate today —
    // it's a "don't redundantly re-upsert localStorage state before
    // the server set has come in" guard. Cheap insurance against a
    // future stale-diff addition silently regressing the wipe.
    if (!rampLogLoaded.current) return;
    if (!Array.isArray(rampLog) || rampLog.length === 0) return;
    const userId = authSession.user.id;
    const rows = rampLog
      .filter(e => e && e.productId && e.timestamp)
      .map(e => ({ user_id: userId, client_id: `${e.productId}_${e.timestamp}`, data: e }));
    if (rows.length === 0) return;
    supabase.from("ramp_log").upsert(rows, { onConflict: "user_id,client_id" })
      .then(({ error }) => {
        if (error) console.error("[Cygne] ramp_log upsert failed:", error.message);
      });
  }, [rampLog, authSession]);

  // -- Sync trigger + symptom log (body-acne "What happened today?") ---------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { triggerLog } }).catch(e => console.error("[Cygne] triggerLog sync failed:", e));
  }, [triggerLog]);

  // -- Sync waiting room to Supabase ------------------------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { waitingRoom } }).catch(() => {});
  }, [waitingRoom]);

  // -- Sync swan popup dismissal to Supabase ----------------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { swanPopupDismissed } }).catch(() => {});
  }, [swanPopupDismissed]);

  // -- Reflection entries ------------------------------------------------------
  // Persist immediately on save so a disconnect right after capture doesn't
  // lose the week's triptych + insight snapshot.
  //
  // Inline data URLs (entry.inline) can be 300–500KB each. When Supabase
  // Storage upload succeeds, the entry has a `path` and we drop `inline` —
  // the signed URL refreshes on load and we keep user_metadata small.
  // When the storage upload FAILS (no bucket, RLS, network), inline is the
  // only copy of the photo we have, so we must let it through to
  // user_metadata or the entry won't round-trip on reload.
  // Inline base64 is NEVER stored in user_metadata. A triptych data URL can
  // exceed the GoTrue metadata size limit and cause updateUser to reject the
  // whole request (Chrome surfaces this as "Failed to load resource: bad URL"
  // on the /auth/v1/user endpoint). Local React state + localStorage keep the
  // inline copy for same-session and same-device reload, and the auth-load
  // merge preserves local inline whenever the cloud entry lacks one.
  const stripInlineForCloud = (rs) => {
    if (!Array.isArray(rs) || rs.length === 0) return rs;
    return rs.map(r => {
      if (!r) return r;
      const { inline: _drop, ...rest } = r;
      return rest;
    });
  };

  const addReflection = async (entry) => {
    if (!profileLoaded.current && authSession) {
      console.error("[Cygne] reflection save BLOCKED — profile not loaded yet (entry NOT persisted)");
      return;
    }
    console.log("[Cygne] addReflection received:", {
      id: entry?.id,
      week: entry?.weekNumber,
      hasPath: !!entry?.path,
      hasUrl: !!entry?.url,
      urlLength: entry?.url?.length || 0,
      hasInline: !!entry?.inline,
      inlineLength: entry?.inline?.length || 0,
    });
    // Replace any existing entry for the same ISO (week, week-year) so a
    // re-capture overwrites cleanly. ISO week-year is used here (not the
    // calendar year) so a year boundary doesn't misclassify the match.
    const entryISOYear = isoWeekYear(new Date(entry.date));
    const next = [
      ...reflections.filter(r => r.weekNumber !== entry.weekNumber || isoWeekYear(new Date(r.date)) !== entryISOYear),
      entry,
    ];
    setReflections(next);
    // Capturing a reflection satisfies the breakout-zone nudge — auto-dismiss
    // it and persist today's date so it doesn't reappear for the rest of today.
    dismissReflectionPrompt();
    // Recover the session before the save: React-state `authSession` can be
    // null while supabase-js's internal cache still holds a valid session
    // (initial mount, stale onAuthStateChange, signed-out-in-another-tab race).
    // getSession() reads the cache without a network call.
    let sessionForSave = authSession;
    if (!sessionForSave) {
      const { data: { session: refreshed } } = await supabase.auth.getSession();
      sessionForSave = refreshed;
      console.log("[Cygne] addReflection — authSession was null, refreshed:", refreshed ? "got session" : "still null");
    }
    if (sessionForSave) {
      const payload = stripInlineForCloud(next);
      const payloadBytes = JSON.stringify(payload).length;
      console.log("[Cygne] save-reflection-metadata attempt | reflections payload bytes:", payloadBytes, "| entries:", payload.length);
      try {
        const res = await fetch(`${API_BASE_URL}/api/save-reflection-metadata`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sessionForSave.access_token}`,
          },
          body: JSON.stringify({ userId: sessionForSave.user.id, reflections: payload }),
        });
        const rawText = await res.text().catch(() => "");
        if (!res.ok) {
          console.error(
            "[Cygne] /api/save-reflection-metadata FAILED",
            "| http_status:", res.status,
            "| body:", rawText || "(empty)",
            "| payload_bytes:", payloadBytes,
          );
        } else {
          console.log("[Cygne] reflection saved to Supabase — total:", next.length, "| payload bytes:", payloadBytes, "(server-mediated)");
        }
      } catch (e) {
        const dump = {};
        if (e) for (const k of Object.getOwnPropertyNames(e)) dump[k] = e[k];
        console.error(
          "[Cygne] /api/save-reflection-metadata THREW",
          "| message:", e?.message ?? String(e),
          "| payload_bytes:", payloadBytes,
          "| raw_error:", dump,
        );
      }
    } else {
      console.error("[Cygne] addReflection SILENT SKIP — authSession is null at save time. Entry in local state only, will not persist.");
    }
  };

  // Belt-and-suspenders sync for reflections — same inline-stripping applies,
  // and routed through /api/save-reflection-metadata so the bloated JWT never
  // hits the /auth/v1/user gateway directly.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    const payload = stripInlineForCloud(reflections);
    const payloadBytes = JSON.stringify(payload).length;
    console.log("[Cygne] belt-and-suspenders save-reflection-metadata | reflections payload bytes:", payloadBytes, "| entries:", payload.length);
    fetch(`${API_BASE_URL}/api/save-reflection-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authSession.access_token}`,
      },
      body: JSON.stringify({ userId: authSession.user.id, reflections: payload }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const rawText = await res.text().catch(() => "");
          console.error(
            "[Cygne] belt-and-suspenders save-reflection-metadata FAILED",
            "| http_status:", res.status,
            "| body:", rawText || "(empty)",
            "| payload_bytes:", payloadBytes,
          );
        }
      })
      .catch(e => {
        const dump = {};
        if (e) for (const k of Object.getOwnPropertyNames(e)) dump[k] = e[k];
        console.error(
          "[Cygne] belt-and-suspenders save-reflection-metadata THREW",
          "| message:", e?.message ?? String(e),
          "| payload_bytes:", payloadBytes,
          "| raw_error:", dump,
        );
      });
  }, [reflections]);

  // -- Weekly reflection reminder --------------------------------------------
  // Fires a browser notification on the user's chosen reset day at 19:00 local,
  // at most once per ISO week. We store the last-fired marker on the user
  // profile so the nudge doesn't repeat across devices.
  useEffect(() => {
    if (!user || !authSession) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const resetDay = typeof user.resetDay === "number" ? user.resetDay : 0;

    const tick = () => {
      const now = new Date();
      if (now.getDay() !== resetDay) return;
      if (now.getHours() < 19) return;
      const isoWeek = `${now.getFullYear()}-W${isoWeekNumber(now)}`;
      if (user.reflectionReminderAt === isoWeek) return;
      try {
        new Notification("Cygne", {
          body: "The week is behind you. Let's capture your reflection.",
          silent: false,
        });
      } catch (e) { /* ignore */ }
      const updated = { ...user, reflectionReminderAt: isoWeek };
      setUser(updated);
    };

    tick();
    const id = setInterval(tick, 60 * 60 * 1000); // check hourly
    return () => clearInterval(id);
  }, [user?.resetDay, user?.reflectionReminderAt, authSession]);

  // -- Defensive sync for the full user object (skin type, concerns, cycle,
  //    reminders, ingredient prefs, medical history). All mutations should
  //    flow through updateUser, but this belt-and-suspenders effect catches
  //    any setUser call that forgot to hit Supabase.
  useEffect(() => {
    if (!profileLoaded.current || !authSession || !user) return;
    const { email, cycleDay, ...profileData } = user;
    // Change detection: every render serializes the profile fields that
    // would actually be written and compares to the last value the sync
    // effect successfully scheduled. Identical → bail without touching
    // the auth lock. The initial setUser inside loadUserProfile primes
    // lastUserSyncRef with this same serialization, so the first
    // effect run after sign-in is a no-op rather than a redundant
    // updateUser of values we just READ from user_metadata.
    const serialized = JSON.stringify(profileData);
    if (serialized === lastUserSyncRef.current) return;

    // Debounce: bursts of setUser calls (e.g. a settings page that
    // updates several fields back-to-back) collapse into one
    // updateUser. The 1.5s window is generous enough that typical
    // UI flows finish before the timer fires but tight enough that
    // users perceive the write as immediate. Each new run cancels
    // the pending timer and schedules a fresh one; lastUserSyncRef
    // is updated INSIDE the timer callback so that if the write
    // ultimately fails (lock contention, network), the next render
    // still re-attempts rather than silently treating the unwritten
    // state as synced.
    if (userSyncTimerRef.current) clearTimeout(userSyncTimerRef.current);
    userSyncTimerRef.current = setTimeout(() => {
      lastUserSyncRef.current = serialized;
      userSyncTimerRef.current = null;
      supabase.auth.updateUser({ data: { ...profileData, onboarding_complete: true } })
        .catch(e => console.error("[Cygne] user sync failed:", e));
    }, 1500);

    return () => {
      // Component unmount / dep change: drop the pending sync. The
      // next render will schedule its own.
      if (userSyncTimerRef.current) {
        clearTimeout(userSyncTimerRef.current);
        userSyncTimerRef.current = null;
      }
    };
  }, [user, authSession]);

  // Save profile to Supabase user_metadata
  const saveUserProfile = async (profileData) => {
    await supabase.auth.updateUser({
      data: { ...profileData, onboarding_complete: true },
    });
  };

  // -- Auth callback from AuthScreen ------------------------------------------
  const handleAuth = (session, authUser, isNewUser) => {
    setAuthSession(session);
    // Always check user_metadata — a returning user who signs in
    // will have onboarding_complete set, a new signup won't.
    const meta = authUser?.user_metadata;
    if (meta?.onboarding_complete) {
      loadUserProfile(authUser);
    } else {
      setNeedsOnboarding(true);
      setUser(null);
    }
  };

  // -- Logout -----------------------------------------------------------------
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthSession(null);
    setUser(null);
    setNeedsOnboarding(false);
    setProfileOpen(false);
    setFirstRun(false);
  };

  // -- Onboarding complete callback -------------------------------------------
  const handleOnboardingComplete = async (userData) => {
    const profileWithEmail = { ...userData, email: authSession?.user?.email || "" };
    setUser(profileWithEmail);
    setProducts([]);
    setFirstRun(true);
    setNeedsOnboarding(false);
    // Flip the load gates for a first-session new user. loadUserProfile is
    // never called on this path (handleAuth branched to setNeedsOnboarding
    // for a signup with onboarding_complete === false), so profileLoaded /
    // productsLoaded / rampLogLoaded would otherwise stay false forever
    // and every sync effect in the file — including the products upsert —
    // would silently no-op. The server-side tables are empty for a brand
    // new user, so treating "loaded" as true here is accurate: local state
    // IS the source of truth at this instant. Without this, products the
    // user adds after onboarding live only in localStorage until any
    // subsequent loadUserProfile call reads back [] and wipes them.
    profileLoaded.current = true;
    productsLoaded.current = true;
    rampLogLoaded.current = true;
    await saveUserProfile(userData);
  };

  // -- Update user (also syncs to Supabase) -----------------------------------
  const updateUser = async (updated) => {
    setUser(updated);
    const { email, ...profileData } = updated;
    await supabase.auth.updateUser({
      data: { ...profileData, onboarding_complete: true },
    });
  };

  const tabs = [
    { id: "dashboard",  icon: "home",       label: "Home" },
    { id: "routine",    icon: "routine",    label: "Ritual" },
    { id: "shelf",      icon: "shelf",      label: "Vanity" },
    { id: "reflection", icon: "reflection", label: "Reflection" },
    { id: "progress",   icon: "sparkle",    label: "Progress" },
  ];

  const saveProduct = (p) => {
    setProducts(prev => prev.find(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [...prev, p]);
    setModal(null);
  };

  const toggleRoutine = (id) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p;
      const turningOn = p.inRoutine === false;
      return {
        ...p,
        inRoutine: turningOn,
        routineStartDate: turningOn && !p.routineStartDate ? new Date().toISOString().split("T")[0] : p.routineStartDate,
        rampWeek: turningOn && !p.routineStartDate ? 1 : p.rampWeek,
      };
    }));
  };

  // Record a ramp action (Skin Handled It / Backing Off) and persist both the
  // updated products list and an immutable audit log entry to Supabase
  // immediately — so a reload restores the correct progression even if a later
  // debounced sync is interrupted.
  //
  // Week progression itself is calendar-based: the week number is derived from
  // routineStartDate (see getRampWeek in ramp.jsx), advancing exactly every 7
  // local days. "Skin Handled It" does not jump the user ahead by a week — it
  // records their confirmation at the current week, and only clears routine
  // state when the user has already reached the schedule's last week (so the
  // product graduates out of Introduce Slowly). "Backing Off" shifts the
  // start date forward by 7 days, which effectively re-runs the current week.
  const recordRampAction = (id, status) => {
    if (authSession && !profileLoaded.current) {
      console.warn("[Cygne] ramp action blocked — profile not loaded yet");
      return;
    }
    const product = products.find(p => p.id === id);
    if (!product) return;
    const activeKey = product.category === "Toning Pad"
      ? "toning pad"
      : RAMP_ACTIVES.find(a => detectActives(product.ingredients || [])[a]);
    const schedule = activeKey ? RAMP_SCHEDULES[activeKey] : null;
    const maxWeek = schedule
      ? Math.max(...schedule.phases[schedule.phases.length - 1].weeks)
      : 12;
    const currentWeek = product.routineStartDate
      ? Math.max(1, Math.floor(daysBetweenLocal(product.routineStartDate) / 7) + 1)
      : (product.rampWeek || 1);
    const timestamp = new Date().toISOString();
    const entry = {
      userId: authSession?.user?.id || null,
      productId: id,
      week: currentWeek,
      status,
      timestamp,
    };

    let updatedProducts = products;
    if (status === "handled") {
      updatedProducts = products.map(p => {
        if (p.id !== id) return p;
        if (currentWeek >= maxWeek) {
          // Final confirmation — graduate out of Introduce Slowly.
          return { ...p, rampWeek: undefined, routineStartDate: undefined, rampHeld: false };
        }
        // Calendar drives week progression; clear any held flag so the card
        // continues to show the on-track state until the next 7-day boundary.
        return { ...p, rampHeld: false };
      });
    } else if (status === "backing_off") {
      updatedProducts = products.map(p => {
        if (p.id !== id) return p;
        // Shift the start date forward by 7 days so the current week repeats,
        // and mark as held so the card shows the paused state.
        const base = p.routineStartDate ? toLocalMidnight(p.routineStartDate) : toLocalMidnight(new Date());
        const shifted = new Date(base + 7 * 86400000);
        const newStart = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
        return { ...p, routineStartDate: newStart, rampHeld: true };
      });
    }

    const updatedLog = [...rampLog, entry];
    setProducts(updatedProducts);
    setRampLog(updatedLog);

    // Persistence: the products + rampLog sync useEffects above (table-
    // backed since Phase 2) fire on these setState calls and handle the
    // upserts themselves. No inline updateUser needed.
    console.log("[Cygne ramp action]", entry);
  };

  const advanceRamp = (id) => recordRampAction(id, "handled");
  const holdRamp = (id) => recordRampAction(id, "backing_off");

  // Reset the routineStartDate on a ramping product so week progression
  // starts fresh from today. Used when a date got corrupted by earlier
  // bugs and the displayed week no longer matches reality.
  const resetRampStartDate = (id, newStartDateIso = null) => {
    if (authSession && !profileLoaded.current) {
      console.warn("[Cygne] ramp reset blocked — profile not loaded yet");
      return;
    }
    const today = new Date();
    const iso = newStartDateIso || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const updated = products.map(p =>
      p.id === id ? { ...p, routineStartDate: iso, rampWeek: 1, rampHeld: false } : p
    );
    setProducts(updated);
    console.log("[Cygne ramp reset]", { productId: id, newStart: iso });
    // The products sync useEffect (table-backed since Phase 2) picks up
    // the setProducts above and handles persistence — no inline save.
  };

  // -- Introduce Slowly: auto-enrollment backfill ----------------------------
  // A product enters the Introduce Slowly list only when it's `inRoutine` AND
  // has a `routineStartDate` AND matches a ramp-eligible active (Toning Pad
  // category, or an ingredient in RAMP_ACTIVES — see the primaryRamp filter
  // in progress.jsx). `toggleRoutine` sets routineStartDate when turning a
  // product ON, but products that became inRoutine via other paths (vanity
  // bulk-add, onboarding, modal save with inRoutine preset, or just predating
  // the routineStartDate field) end up inRoutine: true with NO start date —
  // ramp-eligible but invisible on the Introduce Slowly card.
  //
  // This effect catches those: any ramp-eligible product that is inRoutine
  // (true or undefined) but missing routineStartDate gets enrolled with
  // today's date and an "auto_enrolled" rampLog entry. Once routineStartDate
  // is set the guard `!p.routineStartDate` is false on subsequent runs, so
  // this is naturally one-time per product. Manual enrollment via
  // toggleRoutine is untouched.
  useEffect(() => {
    if (authSession && !profileLoaded.current) return;
    if (!Array.isArray(products) || products.length === 0) return;

    const today = new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();
    const userId = authSession?.user?.id || null;
    const newEntries = [];
    let changed = false;

    const updatedProducts = products.map(p => {
      if (!p) return p;
      if (p.inRoutine === false) return p;
      if (p.routineStartDate) return p;
      // Same activeKey detection used everywhere else (recordRampAction,
      // auto-graduate, primaryRamp). Toning Pad is category-based; everything
      // else is ingredient-based via detectActives matching RAMP_ACTIVES.
      const activeKey = p.category === "Toning Pad"
        ? "toning pad"
        : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
      if (!activeKey) return p;
      changed = true;
      newEntries.push({
        userId,
        productId: p.id,
        week: 1,
        status: "auto_enrolled",
        timestamp: nowIso,
      });
      return { ...p, routineStartDate: today, rampWeek: 1, rampHeld: false };
    });

    if (!changed) return;

    const newLog = [...rampLog, ...newEntries];
    setProducts(updatedProducts);
    setRampLog(newLog);
    console.log(
      "[Cygne] auto-enrolled", newEntries.length,
      "ramp product" + (newEntries.length === 1 ? "" : "s") + " to Introduce Slowly:",
      newEntries.map(e => ({ productId: e.productId })),
    );
    // Persistence: the products + rampLog sync useEffects pick up the
    // setProducts / setRampLog above and write to their tables — no
    // inline updateUser since Phase 2 of the metadata migration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, authSession]);

  // -- Introduce Slowly: auto-graduation safety net ---------------------------
  // If a ramping product is more than 2 weeks past its schedule's max week, the
  // user never tapped "Skin Handled It" on the final week — graduate it for
  // them so it doesn't sit on the IntroduceSlowlyCard forever. Mirrors the
  // manual graduation path in recordRampAction("handled") final-week branch:
  // clears routineStartDate, rampWeek, rampHeld and logs an "auto_graduated"
  // rampLog entry. Runs on app load (when checkIns hydrates from metadata),
  // after each new check-in, and when the auth session lands. Manual flow,
  // UI, and other components are untouched.
  useEffect(() => {
    // Mirror recordRampAction's guard so we don't graduate based on stale state
    // while waiting for the Supabase profile to hydrate.
    if (authSession && !profileLoaded.current) return;
    if (!Array.isArray(products) || products.length === 0) return;

    const nowIso = new Date().toISOString();
    const userId = authSession?.user?.id || null;
    const newEntries = [];
    let changed = false;

    const updatedProducts = products.map(p => {
      if (!p || p.inRoutine === false || !p.routineStartDate) return p;
      const activeKey = p.category === "Toning Pad"
        ? "toning pad"
        : RAMP_ACTIVES.find(a => detectActives(p.ingredients || [])[a]);
      if (!activeKey) return p;
      const schedule = RAMP_SCHEDULES[activeKey];
      if (!schedule) return p;
      const maxWeek = Math.max(...schedule.phases[schedule.phases.length - 1].weeks);
      const currentWeek = Math.max(1, Math.floor(daysBetweenLocal(p.routineStartDate) / 7) + 1);
      if (currentWeek > maxWeek + 2) {
        changed = true;
        newEntries.push({
          userId,
          productId: p.id,
          week: currentWeek,
          status: "auto_graduated",
          timestamp: nowIso,
        });
        return { ...p, rampWeek: undefined, routineStartDate: undefined, rampHeld: false };
      }
      return p;
    });

    if (!changed) return;

    const newLog = [...rampLog, ...newEntries];
    setProducts(updatedProducts);
    setRampLog(newLog);
    console.log(
      "[Cygne] auto-graduated", newEntries.length,
      "ramp product" + (newEntries.length === 1 ? "" : "s") + ":",
      newEntries.map(e => ({ productId: e.productId, week: e.week })),
    );
    // Persistence: the products + rampLog sync useEffects pick up the
    // setProducts / setRampLog above and write to their tables — no
    // inline updateUser since Phase 2 of the metadata migration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIns, authSession]);

  // -- Loading state ----------------------------------------------------------
  // Hold the loading screen while authLoading is still true OR there's a
  // session but the profile hasn't resolved yet (user not set AND
  // needsOnboarding not flagged). That second condition is the brief window
  // between the auth session landing and loadUserProfile / handleAuth
  // populating user — without this gate the render below falls through to
  // OnboardingScreen for an instant ("What should we call you" flash).
  if (authLoading || (authSession && !user && !needsOnboarding)) {
    return (
      <div style={{ minHeight: "100vh", background: "#323d30", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 24, height: 24, border: "2px solid rgba(232,227,214,0.3)", borderTopColor: "rgba(232,227,214,0.8)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // -- No session → Pre-auth (swan-video splash + frosted-glass auth form) ---
  if (!authSession) {
    return <PreAuthScreen onAuth={handleAuth} />;
  }

  // -- Needs onboarding (new signup) ------------------------------------------
  if (needsOnboarding || (!user && authSession)) {
    return (
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--color-ivory)" }} />}>
        <OnboardingScreen onComplete={handleOnboardingComplete} setLocationData={setLocationData} />
      </Suspense>
    );
  }

  // -- Paywall gate (trial expired + no active premium entitlement) -----------
  // Only fires when RC has definitively confirmed the user is not premium
  // AND the local trial has ended (see shouldShowPaywall in
  // hooks/useSubscription.js for the full posture — web builds, invalid
  // RC keys, transient errors, and still-loading all pass through so a
  // subscription-infrastructure blip can't strand every user).
  if (shouldShowPaywall(premiumStatus)) {
    return (
      <PaywallScreen
        trialExpired={true}
        onUnlock={() => premiumStatus.refresh()}
        onSignOut={handleLogout}
      />
    );
  }

  // -- First run welcome (just completed onboarding) --------------------------
  if (firstRun) return <SwanWelcomeScreen user={user} onDone={() => { setFirstRun(false); setTab("dashboard"); }} />;

  // -- Main app ---------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: "var(--color-inky-moss, #2d3d2b)", paddingBottom: 88 }}>
      <style>{`
        /* Fonts are declared once in src/index.css. Everything below is
           the runtime token sheet — colors and aliases the legacy inline
           styles reference. --sans now resolves to Fungis Normal so any
           stale "var(--font-body)" callsite ends up in the same family as the
           rest of the app. */
        :root {
          --sage:      #6e8a72;
          --sans:      'Fungis Normal', 'Fungis', sans-serif;
          /* Cygne design system tokens */
          --color-ivory:        #faf9f4;
          --color-ivory-shadow: #f0ebe0;
          --color-ink:          #1c1c1a;
          --color-inky-moss:    #2d3d2b;
          --color-stone:        #5a5a5a;
          --color-pebble:       #7a7a7a;
          --font-display:  'Fungis Heavy', 'Fungis', sans-serif;
          --font-body:     'Fungis Normal', 'Fungis', sans-serif;
          /* Dark editorial canvas — every legacy alias resolves to the
             dark theme so any callsite using --parchment / --clay /
             --border / --surface auto-skins without a hand edit. */
          --deep:               var(--color-inky-moss);
          --ink:                #354a32;
          --surface:            rgba(255,255,255,0.06);
          --border:             rgba(250,249,244,0.2);
          --parchment:          var(--color-ivory);
          --clay:               rgba(255,255,255,0.6);
          --muted:              rgba(255,255,255,0.4);
          --taupe:              rgba(250,249,244,0.5);
          --overlay:            rgba(8,12,8,0.6);
          --sage:               var(--color-ivory);
          --cta:                rgba(250,249,244,0.08);
          --color-ivory-shadow: rgba(255,255,255,0.06);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea { outline: none; }
        input:focus, select:focus, textarea:focus { border-color: var(--sage) !important; }
        input::placeholder, textarea::placeholder { color: rgba(250,249,244,0.4); opacity: 1; }
        ::-webkit-scrollbar { display: none; }
        /* Keyboard focus: visible inky-moss ring for :focus-visible only, so
           mouse/touch interactions stay clean but keyboard navigation is
           always discoverable. */
        button:focus { outline: none; }
        button:focus-visible,
        a:focus-visible,
        [role="button"]:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible {
          outline: 2px solid var(--color-inky-moss, #2d3d2b);
          outline-offset: 2px;
          border-radius: 2px;
        }
        /* Respect prefers-reduced-motion — disable non-essential transitions
           and keyframes for users who opt out of animation. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
            scroll-behavior: auto !important;
          }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes cygneCheckDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes softPulse {
          0%   { transform: scale(1); opacity: 1; }
          50%  { transform: scale(1.06); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fadeInLine {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        option { background: #f7f4f0; color: #1c1c1a; }
        input, select, textarea {
          background: #f7f4f0;
          color: #1c1c1a;
        }
        .modal-bg { background: rgba(232,226,217,0.55); }
      `}</style>

      {/* Header — dark across every tab */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(45,61,43,0.94)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(250,249,244,0.12)",
        padding: "0 22px",
      }}>
        <div style={{ position: "relative", maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", height: 76 }}>
          <img
            src="/cygne-logo.png"
            alt="Cygne"
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              height: 56,
              width: "auto",
              pointerEvents: "none",
              userSelect: "none",
              filter: "brightness(0) invert(1)",
              opacity: 0.95,
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile"
              style={{
                width: 44, height: 44,
                background: "none", border: "none", cursor: "pointer",
                padding: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                WebkitTapHighlightColor: "transparent",
              }}>
              <span style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: "0.04em",
                color: "var(--color-ivory, #faf9f4)",
                lineHeight: 1,
                userSelect: "none",
              }}>
                {user?.name ? user.name.trim()[0].toUpperCase() : "?"}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 22px 0", animation: "fadeUp 0.3s ease" }} key={tab}>
        {tab === "dashboard" && (
          <>
            {showReflectionPrompt && reflectionPromptZone && (
              <ReflectionPromptCard
                zone={reflectionPromptZone}
                onOpen={() => { setShowReflectionPrompt(false); setTab("reflection"); }}
                onDismiss={dismissReflectionPrompt}
              />
            )}
            <Dashboard products={products} setTab={setTab} checkIns={checkIns} swanPopupDismissed={swanPopupDismissed} onDismissSwanPopup={dismissSwanPopup} treatments={treatments} locationData={locationData} user={{ ...(user || {}), id: authSession?.user?.id }} notifPermission={notifPermission} onRequestNotif={requestNotifications} notifDismissed={notifDismissed} onDismissNotif={() => setNotifDismissed(true)} journals={journals} setCheckIns={setCheckIns} triggerLog={triggerLog} />
          </>
        )}
        {tab === "routine"   && <MyRoutine
          products={products}
          user={{ ...(user || {}), id: authSession?.user?.id }}
          cycleDay={getCurrentCycleDay(user)}
          isFlightMode={false}
          journals={journals}
          setJournals={setJournals}
          checkIns={checkIns}
          completedSteps={completedSteps}
          setCompletedSteps={setCompletedSteps}
          onUpdateUser={updateUser}
          treatments={treatments}
          onAddProduct={(category) => setModal({ brand: "", name: "", category: category || "Serum", price: "", ingredients: "" })}
          onEditProduct={(idOrProduct) => {
            const p = typeof idOrProduct === "string" ? products.find(x => x.id === idOrProduct) : idOrProduct;
            if (p) { setTab("shelf"); setModal(p); }
          }}
        />}
        {tab === "shelf" && <Shelf
          products={products}
          onEdit={p => setModal(p)}
          // Explicit per-row server delete at the exact moment of user
          // intent. The products sync useEffect is now upsert-only and
          // CANNOT delete rows on its own (was the source of the
          // wipe-everything race). Local state update fires first for
          // instant UI; the server delete races in the background.
          // If the server delete fails (offline, network), the row
          // stays in the table and the deleted product will reappear
          // on next table-load.
          // TODO: queue offline deletes for retry — track post-launch.
          onDelete={async (id) => {
            setProducts(prev => prev.filter(x => x.id !== id));
            if (authSession) {
              const { error } = await supabase.from("products")
                .delete()
                .eq("user_id", authSession.user.id)
                .eq("client_id", String(id));
              if (error) console.error("[Cygne] product delete failed:", error.message);
            }
          }}
          onAdd={() => setModal({ brand: "", name: "", category: "Serum", price: "", ingredients: "" })}
          onToggleRoutine={toggleRoutine}
          // DEV-ONLY / DANGEROUS — wipes all products from local state
          // WITHOUT clearing the server table. The matching button
          // (ClearAllButton in vanity.jsx) is hard-gated behind
          // `false && <ClearAllButton .../>` at vanity.jsx:511 and is
          // NOT reachable from any production UI path. If you ever
          // remove that `false &&` gate, this handler must ALSO call
          // supabase.from("products").delete().eq("user_id", userId)
          // to wipe the server table, otherwise the user will see all
          // their products reappear on the next table-load. Better:
          // delete this handler + button entirely before launch and
          // re-add intentionally if needed.
          onClearAll={() => setProducts([])}
          onSession={(id, session) => setProducts(prev => prev.map(p => p.id === id ? { ...p, session } : p))}
          waitingRoom={waitingRoom}
          onAddFromWaiting={(item) => {
            setModal(item.product);
            setWaitingRoom(prev => prev.filter(x => x !== item));
          }}
          onDismissWaiting={(item) => setWaitingRoom(prev => prev.filter(x => x !== item))}
          checkIns={checkIns}
          journals={journals}
          user={{ ...(user || {}), id: authSession?.user?.id }}
        />}
        {tab === "reflection" && (
          <Suspense fallback={null}>
            <Reflection
              reflections={reflections}
              onAddReflection={addReflection}
              onReplaceReflections={setReflections}
              products={products}
              checkIns={checkIns}
              user={{ ...(user || {}), id: authSession?.user?.id }}
              locationData={locationData}
              journals={journals}
            />
          </Suspense>
        )}
        {tab === "progress"  && <Progress products={products} checkIns={checkIns} setCheckIns={setCheckIns} treatments={treatments} setTreatments={setTreatments} saveTreatment={saveTreatment} removeTreatment={removeTreatment} updateTreatmentDate={updateTreatmentDate} user={user} onAdvanceRamp={advanceRamp} onHoldRamp={holdRamp} onResetRampStart={resetRampStartDate} journals={journals} setJournals={setJournals} onUpdateUser={updateUser} reflections={reflections} triggerLog={triggerLog} setTriggerLog={setTriggerLog} />}
      </div>

      {/* Bottom nav — dark across every tab */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(45,61,43,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid rgba(250,249,244,0.12)", zIndex: 50 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 18px", background: "none", border: "none", cursor: "pointer", color: tab === t.id ? "var(--sage)" : "var(--clay)", transition: "color 0.2s", gap: 5, position: "relative", opacity: tab === t.id ? 1 : 0.65 }}>
              <Icon name={t.icon} size={tab === t.id ? 20 : 18} />
              <span style={{ fontFamily: "var(--font-body)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 400 }}>{t.label}</span>
              {tab === t.id && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 18, height: 1, background: "var(--sage)" }} />}
            </button>
          ))}
        </div>
      </div>

      <Suspense fallback={null}>
        {modal && <ProductModal product={modal === "add" ? null : modal} onSave={saveProduct} onClose={() => setModal(null)} user={user} />}
        {profileOpen && <ProfileSheet user={user} products={products} locationData={locationData} setLocationData={setLocationData} locationDenied={locationDenied} setLocationDenied={setLocationDenied} onUpdateUser={updateUser} onLogout={handleLogout} onClose={() => setProfileOpen(false)} />}
        {fitSheet && (
          <RoutineFitSheet
            product={fitSheet.product}
            assessment={fitSheet.assessment}
            onAddNow={() => {
              setModal(fitSheet.product);
              setFitSheet(null);
            }}
            onDefer={() => {
              setWaitingRoom(prev => [...prev, {
                product: fitSheet.product,
                reason: fitSheet.assessment.reason,
                detail: fitSheet.assessment.detail,
                deferTag: fitSheet.assessment.deferTag,
                savedAt: new Date().toISOString(),
              }]);
              setFitSheet(null);
            }}
            onClose={() => setFitSheet(null)}
          />
        )}
        {scanOpen && <ScanModal products={products} onAddToShelf={p => {
          const ingredients = Array.isArray(p.ingredients) ? p.ingredients.join(", ") : (p.ingredients || "");
          // Infer category from ingredients/name when the scan didn't return one
          const inferCategory = () => {
            const name = (p.name || "").toLowerCase();
            const text = name + " " + ingredients.toLowerCase();
            if (/cleanser|wash|foam|cleansing/.test(text)) return "Cleanser";
            if (/sunscreen|spf/.test(text)) return "SPF";
            if (/moistur|cream|lotion|balm/.test(text)) return "Moisturizer";
            if (/toner|essence|softener/.test(text)) return "Toner";
            if (/eye cream|eye gel/.test(text)) return "Eye Cream";
            if (/oil(?!\s*free)/.test(text)) return "Oil";
            if (/mask/.test(text)) return "Mask";
            if (/exfoliant|peel|scrub|acid pad/.test(text)) return "Exfoliant";
            return "Serum";
          };
          // Open ProductModal pre-populated with scan data so user can review
          setScanOpen(false);
          setModal({
            brand: p.brand || "",
            name: p.name || "",
            category: p.category || inferCategory(),
            spf: p.spf || null,
            price: "",
            ingredients,
          });
        }} onClose={() => setScanOpen(false)} />}
      </Suspense>
    </div>
  );
}
