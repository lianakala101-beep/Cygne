import { useState, useRef, useEffect } from "react";
import { Icon, Wordmark, LOGO_SRC } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine, detectActives } from "./engine.js";
import { RAMP_SCHEDULES, RAMP_ACTIVES } from "./ramp.jsx";
import { SplashScreen } from "./splash.jsx";
import { OnboardingScreen } from "./onboarding.jsx";
import { Dashboard } from "./dashboard.jsx";
import { MyRoutine } from "./ritualscreen.jsx";
import { Shelf } from "./vanity.jsx";
import { Progress } from "./progress.jsx";
import { ProfileSheet } from "./profile.jsx";
import { ScanModal } from "./modals.jsx";
import { ProductModal, RoutineFitSheet } from "./productmodal.jsx";
import { SwanWelcomeScreen, useLocalStorage, DEMO_PRODUCTS, DEMO_VERSION, getCurrentCycleDay, daysBetweenLocal, toLocalMidnight } from "./utils.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard } from "./seasonal.jsx";
import { AuthScreen } from "./auth.jsx";
import { Reflection, isoWeekNumber } from "./reflection.jsx";
import { supabase } from "./supabase.js";

export default function App() {
  // -- Auth state --------------------------------------------------------------
  const [authSession, setAuthSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // -- Theme: auto by time, manual override ----------------------------------
  const getAutoTheme = () => {
    const h = new Date().getHours();
    return (h >= 7 && h < 19) ? "light" : "dark";
  };
  const [themeOverride, setThemeOverride] = useLocalStorage("cygne_theme", null);
  const theme = themeOverride || getAutoTheme();
  const toggleTheme = () => setThemeOverride(t => {
    if (t === null) return getAutoTheme() === "dark" ? "light" : "dark";
    if (t === "light") return "dark";
    return "light";
  });
  const isAuto = themeOverride === null;

  // Ensure fonts load
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Reenie+Beanie&display=swap";
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
  const [completedSteps, setCompletedSteps] = useLocalStorage("cygne_completedsteps", { date: null, steps: [] });
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
        setReflections(meta.reflections);
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
  const addReflection = async (entry) => {
    if (!profileLoaded.current && authSession) {
      console.warn("[Cygne] reflection save blocked — profile not loaded yet");
      return;
    }
    // Replace any existing entry for the same ISO week so re-captures overwrite.
    const next = [...reflections.filter(r => r.weekNumber !== entry.weekNumber || new Date(r.date).getFullYear() !== new Date(entry.date).getFullYear()), entry];
    setReflections(next);
    if (authSession) {
      try {
        await supabase.auth.updateUser({ data: { reflections: next } });
        console.log("[Cygne] reflection saved to Supabase — total:", next.length);
      } catch (e) {
        console.error("[Cygne] reflection save failed:", e);
      }
    }
  };

  // Belt-and-suspenders sync for reflections.
  useEffect(() => {
    if (!profileLoaded.current || !authSession) return;
    supabase.auth.updateUser({ data: { reflections } }).catch(() => {});
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
      <div style={{ minHeight: "100vh", background: "#3a4134", display: "flex", alignItems: "center", justifyContent: "center" }}>
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
    return <OnboardingScreen onComplete={handleOnboardingComplete} setLocationData={setLocationData} />;
  }

  // -- First run welcome (just completed onboarding) --------------------------
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />;
  if (firstRun) return <SwanWelcomeScreen user={user} onDone={() => { setFirstRun(false); setTab("dashboard"); }} />;

  // -- Main app ---------------------------------------------------------------
  return (
    <div className={`theme-${theme}`} style={{ minHeight: "100vh", background: "var(--deep)", paddingBottom: 88, transition: "background 0.4s ease, color 0.4s ease" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Reenie+Beanie&display=swap" rel="stylesheet" />
      <style>{`
        :root {
          --sage:      #7a9070;
          --script:    'Reenie Beanie', cursive;
          --cursive:   'Reenie Beanie', cursive;
          --sans:      'Space Grotesk', sans-serif;
        }
        .theme-dark {
          --deep:      #0e100d;
          --ink:       #151813;
          --surface:   #1c201a;
          --border:    rgba(200,215,190,0.09);
          --parchment: #e8e2d9;
          --clay:      #8b7355;
          --muted:     #6b5a43;
          --taupe:     #8b7355;
          --overlay:   rgba(8,12,8,0.72);
          --cta:       #3a4134;
        }
        .theme-light {
          --deep:      #f0ece6;
          --ink:       #f7f4f0;
          --surface:   #ffffff;
          --border:    rgba(0,0,0,0.10);
          --parchment: #1a1612;
          --clay:      #6b5338;
          --muted:     #a8906c;
          --taupe:     #6b5338;
          --overlay:   rgba(30,25,20,0.5);
          --sage:      #5a7060;
          --cta:       #4a5e44;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, select, textarea { outline: none; }
        input:focus, select:focus, textarea:focus { border-color: var(--sage) !important; }
        input::placeholder, textarea::placeholder { color: var(--muted); opacity: 0.7; }
        ::-webkit-scrollbar { display: none; }
        .theme-light ::-webkit-scrollbar { display: none; }
        .theme-light button:focus { outline: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes cygneCheckDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes etherealGlide {
          0%   { transform: translateY(0px) rotate(0deg); }
          25%  { transform: translateY(-3px) rotate(-1deg); }
          50%  { transform: translateY(0px) rotate(0deg); }
          75%  { transform: translateY(3px) rotate(1deg); }
          100% { transform: translateY(0px) rotate(0deg); }
        }
        .theme-dark option { background: #1a1c1a; color: #e8e2d9; }
        .theme-light option { background: #f7f4f0; color: #1a1612; }
        .theme-light input,
        .theme-light select,
        .theme-light textarea {
          background: #f7f4f0 !important;
          color: #1a1612 !important;
        }
        .theme-light .modal-bg {
          background: rgba(232,226,217,0.55) !important;
        }
        .theme-light option {
          background: #f7f4f0;
          color: #1a1612;
        }
        .theme-light .modal-bg { background: rgba(232,226,217,0.5) !important; }
      `}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: theme === "dark" ? "rgba(13,15,13,0.94)" : "rgba(240,236,230,0.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)", padding: "0 22px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <Wordmark size={42} theme={theme} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={toggleTheme} title={isAuto ? "Auto theme" : theme === "dark" ? "Dark mode" : "Light mode"}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "border-color 0.2s", color: "var(--clay)", flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
              <Icon name={isAuto ? "auto" : theme === "dark" ? "moon" : "sun"} size={14} />
            </button>
            <button onClick={() => setProfileOpen(true)}
              style={{ width: 34, height: 34, borderRadius: "50%", background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTapHighlightColor: "transparent" }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(122,144,112,0.22)",
                border: "1.5px solid rgba(122,144,112,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{
                  fontFamily: "Reenie Beanie, cursive",
                  fontSize: 22,
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
        {tab === "dashboard" && <Dashboard products={products} setTab={setTab} checkIns={checkIns} swanPopupDismissed={swanPopupDismissed} onDismissSwanPopup={dismissSwanPopup} treatments={treatments} locationData={locationData} user={user} theme={theme} notifPermission={notifPermission} onRequestNotif={requestNotifications} notifDismissed={notifDismissed} onDismissNotif={() => setNotifDismissed(true)} journals={journals} setCheckIns={setCheckIns} onLoadDemo={() => setProducts(DEMO_PRODUCTS)} />}
        {tab === "routine"   && <MyRoutine
          products={products}
          user={user}
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
          user={user}
        />}
        {tab === "reflection" && <Reflection
          reflections={reflections}
          onAddReflection={addReflection}
          products={products}
          checkIns={checkIns}
          user={{ ...(user || {}), id: authSession?.user?.id }}
          locationData={locationData}
          journals={journals}
        />}
        {tab === "progress"  && <Progress products={products} checkIns={checkIns} setCheckIns={setCheckIns} treatments={treatments} setTreatments={setTreatments} saveTreatment={saveTreatment} removeTreatment={removeTreatment} updateTreatmentDate={updateTreatmentDate} user={user} onAdvanceRamp={advanceRamp} onHoldRamp={holdRamp} onResetRampStart={resetRampStartDate} journals={journals} setJournals={setJournals} onUpdateUser={updateUser} />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: theme === "dark" ? "rgba(13,15,13,0.97)" : "rgba(240,236,230,0.97)", backdropFilter: "blur(16px)", borderTop: "1px solid var(--border)", zIndex: 50 }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 18px", background: "none", border: "none", cursor: "pointer", color: tab === t.id ? "var(--sage)" : "var(--clay)", transition: "color 0.2s", gap: 5, position: "relative", opacity: tab === t.id ? 1 : 0.65 }}>
              <Icon name={t.icon} size={tab === t.id ? 20 : 18} />
              <span style={{ fontFamily: "var(--sans)", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: tab === t.id ? 600 : 400 }}>{t.label}</span>
              {tab === t.id && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 18, height: 1, background: "var(--sage)" }} />}
            </button>
          ))}
        </div>
      </div>

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
    </div>
  );
}
