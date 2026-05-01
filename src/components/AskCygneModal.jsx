import { useState, useEffect } from "react";
import { invokeEdgeFunction } from "../supabase.js";

/**
 * Minimal Ask Cygne overlay. Posts the question to the rapid-action
 * edge function and renders the response. Used by FaceHeatMap to
 * deep-link into a zone-specific question; will be the foundation for
 * the broader Ask Cygne feature.
 */
export function AskCygneModal({ initialQuestion = "", context = "", onClose }) {
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
      const data = await invokeEdgeFunction("rapid-action", {
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: context
              ? `${context}\n\nQuestion: ${q}`
              : q,
          }],
        }],
      });
      const text = data?.content?.[0]?.text || data?.text || "No response.";
      setAnswer(text);
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
            fontWeight: 700, fontSize: 11, letterSpacing: "0.2em",
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
            fontWeight: 700, fontSize: 11, letterSpacing: "0.18em",
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
