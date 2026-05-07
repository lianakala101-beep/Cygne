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
        background: "rgba(28,28,26,0.55)",
        backdropFilter: "blur(10px)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 520,
          background: "var(--color-ivory, #faf9f4)",
          borderRadius: "20px 20px 0 0",
          padding: "24px 22px 32px",
          maxHeight: "85vh", overflowY: "auto",
          color: "var(--color-ink, #1c1c1a)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 400, fontSize: 11, letterSpacing: "0.2em",
            color: "var(--color-inky-moss, #2d3d2b)", margin: 0,
          }}>
            ASK CYGNE
          </p>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-stone, #5a5a5a)", fontSize: 18, lineHeight: 1 }}
          >×</button>
        </div>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={2}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "12px 14px",
            background: "var(--color-ivory-shadow, #f0ebe0)",
            border: "1px solid rgba(45,61,43,0.18)",
            borderRadius: 12,
            fontFamily: "var(--font-body, 'Fungis Normal', 'Space Grotesk', sans-serif)",
            fontSize: 13, color: "var(--color-ink, #1c1c1a)",
            resize: "none", outline: "none",
          }}
        />

        <button
          onClick={() => ask(question)}
          disabled={loading || !question.trim()}
          style={{
            marginTop: 12, width: "100%",
            padding: "12px 0",
            background: "transparent",
            border: "1px solid var(--color-inky-moss, #2d3d2b)",
            color: "var(--color-inky-moss, #2d3d2b)",
            borderRadius: 12,
            fontFamily: "var(--font-display, 'Fungis Heavy', sans-serif)",
            fontWeight: 400, fontSize: 11, letterSpacing: "0.18em",
            cursor: loading ? "default" : "pointer",
            opacity: loading || !question.trim() ? 0.5 : 1,
          }}
        >
          {loading ? "THINKING…" : "ASK"}
        </button>

        {error && (
          <p style={{
            marginTop: 14,
            fontFamily: "var(--font-body, 'Fungis Normal', sans-serif)",
            fontSize: 12, color: "#a04a3c",
          }}>
            {error}
          </p>
        )}

        {answer && (
          <div style={{
            marginTop: 18, padding: "16px 16px",
            background: "rgba(45,61,43,0.06)",
            border: "1px solid rgba(45,61,43,0.15)",
            borderRadius: 12,
            fontFamily: "var(--font-body, 'Fungis Normal', 'Space Grotesk', sans-serif)",
            fontSize: 13, lineHeight: 1.6,
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
