import { useState, useEffect } from "react";
import { supabase, invokeEdgeFunction } from "../supabase.js";
import { getAskCygneAccess } from "../utils.jsx";

// Daily question limit — three per local day. Keyed by date so the count
// persists across reloads and resets automatically when the date rolls
// over. Old day-keys age out naturally (they're just orphaned localStorage
// entries; cleanup pass runs on read to prune them).
const DAILY_LIMIT = 3;

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `cygne_ask_count_${y}-${m}-${day}`;
}

function readDailyCount() {
  try {
    // Drop any stale `cygne_ask_count_*` keys from previous days so the
    // store doesn't grow unbounded.
    const today = todayKey();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith("cygne_ask_count_") && k !== today) {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      }
    }
    const v = localStorage.getItem(today);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

function writeDailyCount(n) {
  try { localStorage.setItem(todayKey(), String(n)); } catch { /* quota */ }
}

/**
 * Bottom-sheet Ask Cygne overlay. Posts the question + caller-supplied
 * context (either a pre-built string or raw products/journals/checkIns
 * arrays) to the ask-cygne edge function and renders the response.
 *
 * Enforces a three-questions-per-local-day limit client-side: once the
 * user has hit DAILY_LIMIT, the input + submit are replaced with a quiet
 * lock-out line and no edge function call is made.
 */
export function AskCygneModal({
  initialQuestion = "",
  context = "",
  products = [],
  journals = [],
  checkIns = [],
  triggerLog = [],
  user = null,
  onClose,
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState(null);
  const [count, setCount] = useState(readDailyCount);
  const reached = count >= DAILY_LIMIT;

  const ask = async (q) => {
    if (!q.trim()) return;
    // Hard gate — never fire the edge function once the daily limit is hit,
    // even via the auto-ask path with an initialQuestion seed.
    if (readDailyCount() >= DAILY_LIMIT) {
      setCount(DAILY_LIMIT);
      return;
    }
    setLoading(true);
    setError(null);
    setAnswer("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Please sign in to use Ask Cygne.");
        return;
      }
      const data = await invokeEdgeFunction("ask-cygne", {
        userId: session.user.id,
        question: q,
        sessionId: `${session.user.id}_${Date.now()}`,
        // Forward whatever context the caller supplied. Pre-built string
        // takes precedence on the server; raw arrays/skinProfile are used
        // to build context server-side when no string is passed.
        //
        // Note: journals + checkIns are NOT sent — Phase 1 of the metadata
        // migration moved both into per-collection tables that ask-cygne
        // reads directly via the service-role client. See PR description
        // for the migration plan.
        context,
        products,
        triggerLog,
        skinType: user?.skinType,
        concerns: user?.concerns,
        skinProfile: user?.skinProfile,
      });
      if (data?.error === "limit_reached") {
        // Server-side limit fired — lock the UI to match.
        setCount(DAILY_LIMIT);
        writeDailyCount(DAILY_LIMIT);
        setError(data.message || "You've used your reflections for today. Try again tomorrow.");
        return;
      }
      if (data?.error) {
        setError(data.message || data.error);
        return;
      }
      if (!data?.response) {
        setError("No response received. Please try again.");
        return;
      }
      setAnswer(data.response);
      // Successful response — bump the local day counter.
      const next = readDailyCount() + 1;
      setCount(next);
      writeDailyCount(next);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Auto-ask if we were given a seed question — but never when at the limit.
  useEffect(() => {
    if (initialQuestion && !reached) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Belt-and-suspenders age gate. The three UI entry points (dashboard
  // line, vanity ⋯ menu, FaceHeatMap zone drawer) all check
  // getAskCygneAccess(user) before rendering the trigger, so this modal
  // shouldn't open for an underage user via normal navigation. Defense
  // in depth in case a stale state / deep link / future caller forgets
  // the entry-point gate: refuse to render the AI chat surface for any
  // user we can confirm is under 17. ("unknown" is allowed through here
  // since the entry-point gate already shows the "add your birth year"
  // prompt in place of the trigger; if a caller somehow opens the modal
  // without going through that prompt, we still let them through so the
  // missing-birth-year case doesn't manifest as a silent no-op.
  //
  // Placed AFTER all hooks (useState x5 + useEffect above) so React's
  // rules-of-hooks aren't violated — every render calls the same hooks
  // in the same order; only the JSX return diverges.
  if (getAskCygneAccess(user) === "underage") {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(28,28,26,0.45)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "var(--color-inky-moss, #2d3d2b)",
          borderRadius: 0,
          padding: "32px 26px 40px",
          maxHeight: "88vh", overflowY: "auto",
          color: "var(--color-ivory, #faf9f4)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 18, right: 22,
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(250,249,244,0.6)",
            fontSize: 22, lineHeight: 1, padding: 4,
            WebkitTapHighlightColor: "transparent",
            WebkitAppearance: "none", appearance: "none",
          }}
        >×</button>

        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <img
            src="/cygne-logo.png"
            alt=""
            style={{ height: 56, width: "auto", display: "block", margin: "0 auto 14px", filter: "brightness(0) invert(1)", opacity: 0.95 }}
          />
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 700, fontSize: 13, letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            margin: 0,
          }}>
            Ask Cygne
          </p>
        </div>

        {reached ? (
          <p style={{
            margin: "10px 0 4px",
            padding: "16px 8px",
            textAlign: "center",
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 700, fontSize: 11, letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            lineHeight: 1.6,
          }}>
            You've reached your daily limit — come back tomorrow
          </p>
        ) : (
          <>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder="What would you like to ask?"
              style={{
                width: "100%", boxSizing: "border-box",
                padding: "14px 16px",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(250,249,244,0.2)",
                borderRadius: 0,
                fontFamily: "var(--font-body, 'Fungis Normal', 'Fungis Normal', sans-serif)",
                fontSize: 14, lineHeight: 1.55,
                color: "var(--color-ivory, #faf9f4)",
                caretColor: "var(--color-ivory, #faf9f4)",
                resize: "none",
                outline: "none",
                WebkitAppearance: "none", appearance: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            />

            <button
              onClick={() => ask(question)}
              disabled={loading || !question.trim()}
              style={{
                marginTop: 14, width: "100%",
                padding: "14px 0",
                background: "transparent",
                border: "1.5px solid rgba(250,249,244,0.5)",
                color: "var(--color-ivory, #faf9f4)",
                borderRadius: 0,
                fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
                fontWeight: 700, fontSize: 11, letterSpacing: "0.24em",
                textTransform: "uppercase",
                cursor: loading || !question.trim() ? "default" : "pointer",
                opacity: loading || !question.trim() ? 0.45 : 1,
                WebkitAppearance: "none", appearance: "none",
                WebkitTapHighlightColor: "transparent",
              }}
            >
              {loading ? "Thinking" : "Ask"}
            </button>
          </>
        )}

        {error && (
          <p style={{
            marginTop: 18,
            fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
            fontSize: 12, lineHeight: 1.55,
            color: "#8b7355",
          }}>
            {error}
          </p>
        )}

        {answer && (
          <div style={{
            marginTop: 24, padding: "20px 20px",
            background: "rgba(255,255,255,0.06)",
            borderTop: "1px solid rgba(250,249,244,0.18)",
            borderRadius: 0,
            fontFamily: "var(--font-body, 'Fungis Normal', 'Fungis Normal', sans-serif)",
            fontSize: 14, lineHeight: 1.7,
            color: "var(--color-ivory, #faf9f4)",
            whiteSpace: "pre-wrap",
          }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}
