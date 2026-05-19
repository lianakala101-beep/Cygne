import { useState, useEffect } from "react";
import { supabase, invokeEdgeFunction } from "../supabase.js";

/**
 * Bottom-sheet Ask Cygne overlay. Posts the question + caller-supplied
 * context (either a pre-built string or raw products/journals/checkIns
 * arrays) to the ask-cygne edge function and renders the response.
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

  const ask = async (q) => {
    if (!q.trim()) return;
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
        context,
        products,
        journals,
        checkIns,
        triggerLog,
        skinType: user?.skinType,
        concerns: user?.concerns,
        skinProfile: user?.skinProfile,
      });
      if (data?.error === "limit_reached") {
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
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Auto-ask if we were given a seed question
  useEffect(() => {
    if (initialQuestion) ask(initialQuestion);
  }, []);

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
          background: "var(--color-ivory, #faf9f4)",
          borderRadius: 0,
          padding: "32px 26px 40px",
          maxHeight: "88vh", overflowY: "auto",
          color: "var(--color-ink, #1c1c1a)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 18, right: 22,
            background: "none", border: "none", cursor: "pointer",
            color: "var(--color-stone, #5a5a5a)",
            fontSize: 22, lineHeight: 1, padding: 4,
            WebkitTapHighlightColor: "transparent",
            WebkitAppearance: "none", appearance: "none",
          }}
        >×</button>

        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <img
            src="/cygne-logo.png"
            alt=""
            style={{ height: 56, width: "auto", display: "block", margin: "0 auto 14px", filter: "brightness(0.45) contrast(1.35) saturate(0.6)" }}
          />
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 700, fontSize: 13, letterSpacing: "0.32em",
            textTransform: "uppercase",
            color: "var(--color-inky-moss, #2d3d2b)",
            margin: 0,
          }}>
            Ask Cygne
          </p>
        </div>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={3}
          placeholder="What would you like to ask?"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "14px 16px",
            background: "var(--color-ivory-shadow, #f0ebe0)",
            border: "1px solid rgba(45,61,43,0.14)",
            borderRadius: 0,
            fontFamily: "var(--font-body, 'Fungis Normal', 'Fungis Normal', sans-serif)",
            fontSize: 14, lineHeight: 1.55,
            color: "var(--color-ink, #1c1c1a)",
            caretColor: "var(--color-inky-moss, #2d3d2b)",
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
            border: "1.5px solid var(--color-inky-moss, #2d3d2b)",
            color: "var(--color-inky-moss, #2d3d2b)",
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
            background: "var(--color-ivory-shadow, #f0ebe0)",
            borderTop: "1px solid rgba(45,61,43,0.18)",
            borderRadius: 0,
            fontFamily: "var(--font-body, 'Fungis Normal', 'Fungis Normal', sans-serif)",
            fontSize: 14, lineHeight: 1.7,
            color: "var(--color-ink, #1c1c1a)",
            whiteSpace: "pre-wrap",
          }}>
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}
