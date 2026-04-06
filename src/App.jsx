import { useState, useRef, useEffect } from "react";
import { Icon, Wordmark, LOGO_SRC } from "./components.jsx";
import { analyzeShelf, detectConflicts, buildRoutine } from "./engine.js";
import { SplashScreen } from "./splash.jsx";
import { OnboardingScreen } from "./onboarding.jsx";
import { Dashboard } from "./dashboard.jsx";
import { MyRoutine } from "./ritualscreen.jsx";
import { Shelf } from "./vanity.jsx";
import { Progress } from "./progress.jsx";
import { ProfileSheet } from "./profile.jsx";
import { ScanModal } from "./modals.jsx";
import { ProductModal, RoutineFitSheet } from "./productmodal.jsx";
import { SwanWelcomeScreen, useLocalStorage, DEMO_PRODUCTS, DEMO_VERSION } from "./utils.jsx";
import { WeekendNudgeCard } from "./weekend.jsx";
import { SeasonalNudgeCard } from "./seasonal.jsx";
import { AuthScreen } from "./auth.jsx";
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
  const [fitSheet, setFitSheet] = useState(null);

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
        cycleDay: meta.cycleDay || null,
        notifEnabled: meta.notifEnabled || false,
        amReminderEnabled: meta.amReminderEnabled !== undefined ? meta.amReminderEnabled : (meta.notifEnabled || false),
        pmReminderEnabled: meta.pmReminderEnabled !== undefined ? meta.pmReminderEnabled : (meta.notifEnabled || false),
        amReminderTime: meta.amReminderTime || "7:30",
        pmReminderTime: meta.pmReminderTime || "9:00",
        completedSteps: meta.completedSteps || null,
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
      // Restore location data from Supabase
      if (meta.locationData && meta.locationData.lat) {
        setLocationData(meta.locationData);
      }
      // Restore location denied state
      if (meta.locationDenied) {
        setLocationDenied(true);
      }
      profileLoaded.current = true;
      setNeedsOnboarding(false);
    } else {
      setUser(null);
      setNeedsOnboarding(true);
    }
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
    { id: "dashboard", icon: "home",     label: "Home" },
    { id: "routine",   icon: "routine",  label: "Ritual" },
    { id: "shelf",     icon: "shelf",    label: "Vanity" },
    { id: "progress",  icon: "sparkle", label: "Progress" },
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

  const advanceRamp = (id) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, rampWeek: (p.rampWeek || 1) + 1, rampHeld: false } : p));
  };

  const holdRamp = (id) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, rampHeld: true } : p));
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
          --clay:      #9a9688;
          --muted:     #6a6860;
          --overlay:   rgba(8,12,8,0.72);
          --cta:       #3a4134;
        }
        .theme-light {
          --deep:      #f0ece6;
          --ink:       #f7f4f0;
          --surface:   #ffffff;
          --border:    rgba(0,0,0,0.10);
          --parchment: #1a1612;
          --clay:      #7a7268;
          --muted:     #a09890;
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
        .theme-dark option { background: #1a1c1a; color: #e8e2d9; }
        .theme-light option { background: #f7f4f0; color: #1a1612; }
        .theme-light input,
        .theme-light select,
        .theme-light textarea {
          background: #f7f4f0 !important;
          color: #1a1612 !important;
        }
        .theme-light .modal-bg {
          background: rgba(200,195,188,0.55) !important;
        }
        .theme-light option {
          background: #f7f4f0;
          color: #1a1612;
        }
        .theme-light .modal-bg { background: rgba(200,195,188,0.5) !important; }
      `}</style>

      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: theme === "dark" ? "rgba(13,15,13,0.94)" : "rgba(240,236,230,0.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid var(--border)", padding: "0 22px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 54 }}>
          <Wordmark size={42} theme={theme} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={toggleTheme} title={isAuto ? "Auto theme" : theme === "dark" ? "Dark mode" : "Light mode"}
              style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "border-color 0.2s", fontSize: 13, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(122,144,112,0.5)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
              {isAuto ? "⊙" : theme === "dark" ? "☽" : "☀"}
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
        {tab === "routine"   && <MyRoutine products={products} user={user} cycleDay={user?.cycleDay || null} isFlightMode={false} journals={journals} checkIns={checkIns} setCheckIns={setCheckIns} completedSteps={completedSteps} setCompletedSteps={setCompletedSteps} onUpdateUser={updateUser} />}
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
        {tab === "progress"  && <Progress products={products} checkIns={checkIns} setCheckIns={setCheckIns} treatments={treatments} setTreatments={setTreatments} user={user} onAdvanceRamp={advanceRamp} onHoldRamp={holdRamp} journals={journals} setJournals={setJournals} onUpdateUser={updateUser} />}
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
          const newProduct = {
            id: Date.now().toString(),
            brand: p.brand || "",
            name: p.name || "",
            category: p.category || "Serum",
            ingredients: Array.isArray(p.ingredients) ? p.ingredients : (p.ingredients || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
            inRoutine: true,
            session: "auto",
            frequency: "daily",
            price: 0,
          };
          setProducts(prev => [...prev, newProduct]);
          setScanOpen(false);
        }} onClose={() => setScanOpen(false)} />}
    </div>
  );
}
