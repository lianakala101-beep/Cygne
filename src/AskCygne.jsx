import { useState, useEffect, useRef } from "react";
import { LOGO_SRC } from "./components.jsx";
import { supabase } from "./supabase.js";

const MAX_DAILY = 3;

function todayKey() {
  return `ask_cygne_${new Date().toISOString().split("T")[0]}`;
}
function getDailyUsed() {
  try { return parseInt(localStorage.getItem(todayKey()) || "0", 10); }
  catch { return 0; }
}
function bumpDailyUsed() {
  try {
    const n = getDailyUsed() + 1;
    localStorage.setItem(todayKey(), String(n));
    return n;
  } catch { return MAX_DAILY; }
}

// Word-by-word fade reveal. Splits disclaimer on the sentinel phrase.
function WordReveal({ text }) {
  const NOTE = "Note: Cygne provides";
  const noteIdx = text.indexOf(NOTE);
  const mainText       = noteIdx > -1 ? text.slice(0, noteIdx).trim() : text;
  const disclaimerText = noteIdx > -1 ? text.slice(noteIdx).trim()    : "";
  const allWords  = text.split(" ");
  const mainCount = mainText.split(" ").length;

  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (revealed >= allWords.length) return;
    const id = setTimeout(() => setRevealed((r) => r + 1), 40);
    return () => clearTimeout(id);
  }, [revealed, allWords.length]);

  return (
    <div>
      <p style={{
        fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 15,
        lineHeight: 1.9, color: "var(--color-stone)", letterSpacing: "0.04em", margin: 0,
      }}>
        {mainText.split(" ").map((w, i) => (
          <span key={i} style={{ opacity: i < revealed ? 1 : 0, transition: "opacity 0.3s ease", marginRight: "0.28em" }}>
            {w}
          </span>
        ))}
      </p>
      {disclaimerText && (
        <p style={{
          fontFamily: "var(--font-display)", fontWeight: 400, fontStyle: "italic",
          fontSize: 10, color: "var(--color-pebble)", marginTop: 24,
          lineHeight: 1.7, letterSpacing: "0.04em",
        }}>
          {disclaimerText.split(" ").map((w, i) => (
            <span key={i} style={{ opacity: (mainCount + i) < revealed ? 1 : 0, transition: "opacity 0.3s ease", marginRight: "0.28em" }}>
              {w}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ── Trigger button ──────────────────────────────────────────────────────────
export function AskCygneButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "10px 24px", background: "transparent",
        border: "1px solid rgba(45,61,43,0.3)", borderRadius: 0,
        cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 400,
        fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase",
        color: "var(--color-inky-moss)", transition: "all 0.2s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
      Ask Cygne
    </button>
  );
}

// ── Full-page overlay ───────────────────────────────────────────────────────
export function AskCygneOverlay({ user, onClose }) {
  const [question, setQuestion]   = useState("");
  const [phase, setPhase]         = useState("input"); // input | loading | response | error | limit
  const [response, setResponse]   = useState("");
  const [errorMsg, setErrorMsg]   = useState("");
  const [dailyUsed, setDailyUsed] = useState(getDailyUsed);
  const inputRef = useRef(null);
  const remaining = Math.max(0, MAX_DAILY - dailyUsed);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const handleReflect = async () => {
    if (!question.trim() || phase === "loading") return;
    if (remaining <= 0) { setPhase("limit"); return; }
    setPhase("loading");
    try {
      const userId    = user?.id || "local";
      const sessionId = `${userId}_${Date.now()}`;
      const { data, error } = await supabase.functions.invoke("ask-cygne", {
        body: { userId, question: question.trim(), sessionId },
      });
      if (error) { setErrorMsg(error.message || "Something went wrong."); setPhase("error"); return; }
      if (data?.error === "limit_reached") { setPhase("limit"); return; }
      if (data?.error) { setErrorMsg(data.message || data.error); setPhase("error"); return; }
      if (!data?.response) { setErrorMsg("No response received. Please try again."); setPhase("error"); return; }
      setDailyUsed(bumpDailyUsed());
      setResponse(data.response);
      setPhase("response");
    } catch (e) {
      setErrorMsg(e?.message || "Something went wrong.");
      setPhase("error");
    }
  };

  const handleAskAnother = () => {
    setQuestion(""); setResponse(""); setErrorMsg(""); setPhase("input");
    setTimeout(() => inputRef.current?.focus(), 80);
  };

  const ctaButton = (label, onClick, muted = false) => (
    <button
      onClick={onClick}
      style={{
        padding: "12px 28px", background: "transparent", borderRadius: 0, cursor: "pointer",
        fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 10,
        letterSpacing: "0.2em", textTransform: "uppercase", transition: "all 0.3s ease",
        border: muted ? "1px solid rgba(192,192,192,0.35)" : "1px solid rgba(45,61,43,0.3)",
        color: muted ? "var(--color-pebble)" : "var(--color-inky-moss)",
      }}
      onMouseEnter={e => {
        if (!muted) { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = muted ? "var(--color-pebble)" : "var(--color-inky-moss)";
      }}>
      {label}
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      backgroundColor: "var(--color-ivory)",
      // Same SVG fractalNoise grain as the app body
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='250' height='250'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='250' height='250' filter='url(%23g)' opacity='0.045'/%3E%3C/svg%3E\")",
      display: "flex", flexDirection: "column",
      padding: "60px 32px 40px",
      overflowY: "auto",
    }}>

      {/* ── Close ── */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 20, left: 24,
          background: "none", border: "none", cursor: "pointer",
          fontFamily: "var(--font-display)", fontSize: 22,
          color: "var(--color-pebble)", lineHeight: 1, padding: 4,
        }}>
        ×
      </button>

      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <img
          src={LOGO_SRC}
          alt="Cygne"
          style={{ width: 120, display: "block", margin: "0 auto 24px" }}
        />
        <p style={{
          fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 10,
          letterSpacing: "0.25em", textTransform: "uppercase",
          color: "var(--color-inky-moss)", margin: "0 0 8px",
        }}>Ask Cygne</p>
        <p style={{
          fontFamily: "var(--font-display)", fontWeight: 400, fontSize: 9,
          letterSpacing: "0.15em", textTransform: "uppercase",
          color: "var(--color-pebble)", margin: 0,
        }}>
          {remaining} of {MAX_DAILY} reflections remaining today
        </p>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 480, width: "100%", margin: "0 auto" }}>

        {/* INPUT / ERROR */}
        {(phase === "input" || phase === "error") && (
          <>
            <input
              ref={inputRef}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleReflect()}
              placeholder="what is your skin telling you today..."
              style={{
                fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 400,
                color: "var(--color-ink)", background: "transparent",
                border: "none", borderBottom: "1px solid rgba(192,192,192,0.4)",
                padding: "12px 0", width: "100%", outline: "none",
                letterSpacing: "0.02em",
              }}
            />
            {/* placeholder colour via CSS; inline placeholder styling not possible in JSX */}
            <style>{`
              input[data-ask-cygne]::placeholder { color: var(--color-pebble); }
            `}</style>
            {phase === "error" && errorMsg && (
              <p style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "var(--color-stone)", marginTop: 12, letterSpacing: "0.06em", opacity: 0.7 }}>
                {errorMsg}
              </p>
            )}
            <div style={{ marginTop: 32, textAlign: "center" }}>
              <button
                onClick={handleReflect}
                disabled={!question.trim()}
                style={{
                  padding: "14px 40px", background: "transparent",
                  border: "1.5px solid var(--color-inky-moss)", borderRadius: 0,
                  cursor: question.trim() ? "pointer" : "default",
                  fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
                  letterSpacing: "0.2em", textTransform: "uppercase",
                  color: "var(--color-inky-moss)", transition: "all 0.3s ease",
                  opacity: question.trim() ? 1 : 0.4,
                }}
                onMouseEnter={e => { if (question.trim()) { e.currentTarget.style.background = "var(--color-inky-moss)"; e.currentTarget.style.color = "var(--color-ivory)"; }}}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--color-inky-moss)"; }}>
                Reflect
              </button>
            </div>
          </>
        )}

        {/* LOADING */}
        {phase === "loading" && (
          <div style={{ textAlign: "center" }}>
            <img
              src={LOGO_SRC}
              alt="Cygne"
              style={{ width: 100, display: "block", margin: "0 auto 24px", animation: "askCygnePulse 1.5s ease-in-out infinite" }}
            />
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontStyle: "italic", fontSize: 16, color: "var(--color-pebble)", margin: 0, letterSpacing: "0.03em" }}>
              reading your ritual...
            </p>
          </div>
        )}

        {/* RESPONSE */}
        {phase === "response" && response && (
          <div>
            <WordReveal text={response} />
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 40, flexWrap: "wrap" }}>
              {remaining > 1 && ctaButton("Ask another", handleAskAnother)}
              {ctaButton("Close", onClose, true)}
            </div>
          </div>
        )}

        {/* LIMIT */}
        {phase === "limit" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 400, fontStyle: "italic", fontSize: 20, color: "var(--color-inky-moss)", margin: "0 0 32px", letterSpacing: "0.02em" }}>
              return tomorrow for fresh insight
            </p>
            {ctaButton("Close", onClose, true)}
          </div>
        )}
      </div>

      <style>{`
        @keyframes askCygnePulse {
          0%, 100% { opacity: 0.4; }
          50%       { opacity: 1.0; }
        }
      `}</style>
    </div>
  );
}
