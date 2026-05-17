import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { Icon } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, detectActives } from "./engine.js";
import { RAMP_SCHEDULES, RAMP_ACTIVES } from "./ramp.jsx";
import { SplashScreen } from "./splash.jsx";
import { Dashboard } from "./dashboard.jsx";
import { MyRoutine } from "./ritualscreen.jsx";
import { Shelf } from "./vanity.jsx";
import { Progress } from "./progress.jsx";
import { SwanWelcomeScreen, useLocalStorage, DEMO_PRODUCTS, DEMO_VERSION, getCurrentCycleDay, daysBetweenLocal, toLocalMidnight, isoWeekNumber, isoWeekYear } from "./utils.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard } from "./seasonal.jsx";
import { AuthScreen } from "./auth.jsx";
import { supabase } from "./supabase.js";

// Code-split: gated by user action or onboarding state, so their chunks load
// on demand rather than blocking initial paint.
const OnboardingScreen = lazy(() => import("./onboarding.jsx").then(m => ({ default: m.OnboardingScreen })));
const Reflection       = lazy(() => import("./reflection.jsx").then(m => ({ default: m.Reflection })));
const ProfileSheet     = lazy(() => import("./profile.jsx").then(m => ({ default: m.ProfileSheet })));
const ScanModal        = lazy(() => import("./modals.jsx").then(m => ({ default: m.ScanModal })));
const ProductModal     = lazy(() => import("./productmodal.jsx").then(m => ({ default: m.ProductModal })));
const RoutineFitSheet  = lazy(() => import("./productmodal.jsx").then(m => ({ default: m.RoutineFitSheet })));

export default function App() {
  // -- Auth state --------------------------------------------------------------
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Ensure fonts load
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

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
  const [splashDone, setSplashDone] = useState(false);
  const [firstRun, setFirstRun] = useLocalStorage("cygne_firstrun", false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [notifDismissed, setNotifDismissed] = useLocalStorage("cygne_notifdismissed", false);
  const [tab, setTab] = useState("dashboard");
  const [products, setProducts] = useLocalStorage("cygne_products", []);
  const [demoVersion, setDemoVersion] = useLocalStorage("cygne_demo_version", null);
  const [modal, setModal] = useState(null);
  const [checkIns, setCheckIns] = useLocalStorage("cygne_checkins", []);
  const [journals, setJournals] = useLocalStorage("cygne_journals", []);
  const [scanOpen, setScanOpen] = useState(false);
  const today = new Date().toISOString().split("T")[0];
  const [swanPopupDismissed, setSwanPopupDismissed] = useLocalStorage("cygne_swandismissed", false);

  const dismissSwanPopup = () => {
    setSwanPopupDismissed(true);
  };
  const [treatments, setTreatments] = useLocalStorage("cygne_treatments", []);
  const [locationData, setLocationData] = useState(null);
  const [locationDenied, setLocationDenied] = useLocalStorage("cygne_locationdenied", false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [waitingRoom, setWaitingRoom] = useLocalStorage("cygne_waitingroom", []);
  const [completedSteps, setCompletedSteps] = useState({ date: null, steps: [] });
  const [rampLog, setRampLog] = useLocalStorage("cygne_ramp_log", []);
  const [fitSheet, setFitSheet] = useState(null);
  const [reflections, setReflections] = useLocalStorage("cygne_reflections", []);

  // Track whether initial load from Supabase is done (prevents overwriting cloud data with empty localStorage)
  const profileLoaded = useRef(false);

  // -- Check Supabase session on mount ----------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log("[Cygne] getSession result:", session ? "active session" : "no session");
      setAuthSession(session);
      if (session) {
        loadUserProfile(session.user);
      }
      setAuthLoading(false);
    }).catch((e) => {
      console.error("[Cygne] getSession failed:", e);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      if (!session) {
        setUser(null);
        setNeedsOnboarding(false);
        profileLoaded.current = false;
        // Clear all local caches so the next sign-in doesn't inherit stale data
        setProducts([]);
        setJournals([]);
        setCheckIns([]);
        setTreatments([]);
        setWaitingRoom([]);
        setCompletedSteps({ date: null, steps: [] });
        setRampLog([]);
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
      setUser({
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
      });
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
      // Restore journals from Supabase (cloud takes priority over localStorage)
      if (meta.journals && Array.isArray(meta.journals)) {
        setJournals(meta.journals);
      }
      // Restore check-ins from Supabase
      if (meta.checkIns && Array.isArray(meta.checkIns)) {
        setCheckIns(meta.checkIns);
      }
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
      // Restore products (vanity shelf) from Supabase — but fall back to
      // existing localStorage state if cloud hasn't been populated yet,
      // so pre-migration users don't see an empty vanity.
      if (meta.products && Array.isArray(meta.products)) {
        setProducts(meta.products);
      }
      if (meta.rampLog && Array.isArray(meta.rampLog)) {
        setRampLog(meta.rampLog);
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
            } else if (!cloud.url && !cloud.path && r.inline) {
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
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { journals } }).catch(() => {});
  }, [journals]);

  // -- Sync check-ins to Supabase when they change ---------------------------
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { checkIns } }).catch(() => {});
  }, [checkIns]);

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
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { products } }).catch(() => {});
  }, [products]);

  // -- Sync ramp log (Skin Handled It / Backing Off history) to Supabase -----
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { rampLog } }).catch(e => console.error("[Cygne] rampLog sync failed:", e));
  }, [rampLog]);

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
  const stripInlineForCloud = (rs) => rs.map(r => {
    if (!r) return r;
    if (!r.path) return r;          // no storage — keep inline as the carrier
    const { inline: _drop, ...rest } = r;
    return rest;
  });

  const addReflection = async (entry) => {
    if (!profileLoaded.current && authSession) {
      console.warn("[Cygne] reflection save blocked — profile not loaded yet");
      return;
    }
    // Replace any existing entry for the same ISO (week, week-year) so a
    // re-capture overwrites cleanly. ISO week-year is used here (not the
    // calendar year) so a year boundary doesn't misclassify the match.
    const entryISOYear = isoWeekYear(new Date(entry.date));
    const next = [
      ...reflections.filter(r => r.weekNumber !== entry.weekNumber || isoWeekYear(new Date(r.date)) !== entryISOYear),
      entry,
    ];
    setReflections(next);
    if (authSession) {
      try {
        await supabase.auth.updateUser({ data: { reflections: stripInlineForCloud(next) } });
        console.log("[Cygne] reflection saved to Supabase — total:", next.length, "(inline stripped)");
      } catch (e) {
        console.error("[Cygne] reflection save failed:", e);
      }
    }
  };

  // Belt-and-suspenders sync for reflections — same inline-stripping
  // applies so we don't blow the user_metadata size limit.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { reflections: stripInlineForCloud(reflections) } }).catch(() => {});
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
    supabase.auth.updateUser({ data: { ...profileData, onboarding_complete: true } })
      .catch(e => console.error("[Cygne] user sync failed:", e));
  }, [user]);

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

    console.log("[Cygne ramp action]", entry);

    if (authSession) {
      supabase.auth.updateUser({ data: { products: updatedProducts, rampLog: updatedLog } })
        .then(() => console.log("[Cygne] ramp action saved to Supabase — entries:", updatedLog.length))
        .catch(e => console.error("[Cygne] ramp action save failed:", e));
    }
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
    if (authSession) {
      supabase.auth.updateUser({ data: { products: updated } })
        .then(() => console.log("[Cygne] ramp reset saved to Supabase"))
        .catch(e => console.error("[Cygne] ramp reset save failed:", e));
    }
  };

  // -- Loading state ----------------------------------------------------------
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#323d30", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 24, height: 24, border: "2px solid rgba(232,227,214,0.3)", borderTopColor: "rgba(232,227,214,0.8)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // -- No session → Auth screen -----------------------------------------------
  if (!authSession) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  // -- Needs onboarding (new signup) ------------------------------------------
  if (needsOnboarding || (!user && authSession)) {
    return (
      <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--color-ivory)" }} />}>
        <OnboardingScreen onComplete={handleOnboardingComplete} setLocationData={setLocationData} />
      </Suspense>
    );
  }

  // -- First run welcome (just completed onboarding) --------------------------
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;
  if (firstRun) return <SwanWelcomeScreen user={user} onDone={() => { setFirstRun(false); setTab("dashboard"); }} />;

  // -- Main app ---------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", background: "var(--deep)", paddingBottom: 88 }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @font-face {
          font-family: 'Fungis Heavy';
          src: url('/fonts/FUNGIS%20Heavy.otf') format('opentype');
          font-weight: 700;
          font-style: normal;
          font-display: swap;
        }
        @font-face {
          font-family: 'Fungis Normal';
          src: url('/fonts/FUNGIS%20Regular.otf') format('opentype');
          font-weight: 400;
          font-style: normal;
          font-display: swap;
        }
        :root {
          --sage:      #6e8a72;
          --sans:      'Space Grotesk', sans-serif;
          /* Cygne design system tokens */
          --color-ivory:        #faf9f4;
          --color-ivory-shadow: #f0ebe0;
          --color-ink:          #1c1c1a;
          --color-inky-moss:    #2d3d2b;
          --color-stone:        #5a5a5a;
          --color-pebble:       #7a7a7a;
          --font-display:  'Fungis Heavy', 'Space Grotesk', sans-serif;
          --font-body:     'Fungis Normal', 'Space Grotesk', sans-serif;
          /* Surfaces (single light theme) */
          --deep:      #faf9f4;
          --ink:       #f7f4f0;
          --surface:   #ffffff;
          --border:    rgba(0,0,0,0.10);
          --parchment: #1c1c1a;
          --clay:      #5a5a5a;
          --muted:     #7a7a7a;
          --taupe:     #6b5338;
          --overlay:   rgba(30,25,20,0.5);
          --sage:      #526859;
          --cta:       #2d3d2b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea { outline: none; }
        input:focus, select:focus, textarea:focus { border-color: var(--sage) !important; }
        input::placeholder, textarea::placeholder { color: var(--muted); opacity: 0.7; }
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
        @keyframes checkInRing {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(1.75); opacity: 0; }
        }
        @keyframes checkInClose {
          from { transform: scale(1); opacity: 1; }
          to   { transform: scale(0.96); opacity: 0; }
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

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(250,249,244,0.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)", padding: "0 22px" }}>
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
              filter: "brightness(0.45) contrast(1.35) saturate(0.6)",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => setProfileOpen(true)}
              style={{ width: 34, height: 34, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTapHighlightColor: "transparent" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(122,144,112,0.22)",
                border: "1.5px solid rgba(122,144,112,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: 14,
                  letterSpacing: "0.02em",
                  color: "var(--sage)",
                  lineHeight: 1,
                  userSelect: "none",
                  marginTop: 2,
                }}>
                  {user?.name ? user.name.trim()[0].toUpperCase() : "?"}
                </span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 22px 0", animation: "fadeUp 0.3s ease" }} key={tab}>
        {tab === "dashboard" && <Dashboard products={products} setTab={setTab} checkIns={checkIns} swanPopupDismissed={swanPopupDismissed} onDismissSwanPopup={dismissSwanPopup} treatments={treatments} locationData={locationData} user={{ ...(user || {}), id: authSession?.user?.id }} notifPermission={notifPermission} onRequestNotif={requestNotifications} notifDismissed={notifDismissed} onDismissNotif={() => setNotifDismissed(true)} journals={journals} setCheckIns={setCheckIns} onLoadDemo={() => setProducts(DEMO_PRODUCTS)} />}
        {tab === "routine"   && <MyRoutine
          products={products}
          user={{ ...(user || {}), id: authSession?.user?.id }}
          cycleDay={getCurrentCycleDay(user)}
          isFlightMode={false}
          journals={journals}
          checkIns={checkIns}
          setCheckIns={setCheckIns}
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
          onDelete={id => setProducts(prev => prev.filter(x => x.id !== id))}
          onAdd={() => setModal({ brand: "", name: "", category: "Serum", price: "", ingredients: "" })}
          onToggleRoutine={toggleRoutine}
          onClearDemo={() => setProducts(prev => prev.filter(p => !p.isDemo))}
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
          rampLog={rampLog}
          onAdvanceRamp={advanceRamp}
          onHoldRamp={holdRamp}
        />}
        {tab === "reflection" && (
          <Suspense fallback={null}>
            <Reflection
              reflections={reflections}
              onAddReflection={addReflection}
              products={products}
              checkIns={checkIns}
              user={{ ...(user || {}), id: authSession?.user?.id }}
              locationData={locationData}
              journals={journals}
            />
          </Suspense>
        )}
        {tab === "progress"  && <Progress products={products} checkIns={checkIns} setCheckIns={setCheckIns} treatments={treatments} setTreatments={setTreatments} saveTreatment={saveTreatment} removeTreatment={removeTreatment} updateTreatmentDate={updateTreatmentDate} user={user} onAdvanceRamp={advanceRamp} onHoldRamp={holdRamp} onResetRampStart={resetRampStartDate} journals={journals} setJournals={setJournals} onUpdateUser={updateUser} reflections={reflections} />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(250,249,244,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--border)", zIndex: 50 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 18px", background: "none", border: "none", cursor: "pointer", color: tab === t.id ? "var(--sage)" : "var(--clay)", transition: "color 0.2s", gap: 5, position: "relative", opacity: tab === t.id ? 1 : 0.65 }}>
              <Icon name={t.icon} size={tab === t.id ? 20 : 18} />
              <span style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 400 }}>{t.label}</span>
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
