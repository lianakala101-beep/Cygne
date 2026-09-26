import { useState } from "react";
import { supabase } from "./supabase.js";

function AuthScreen({ onAuth, initialNotice = null }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(() => localStorage.getItem("cygne_remember_email") || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [resetSent, setResetSent] = useState(false);
  // Seeded from initialNotice (e.g. "Your session expired — please
  // sign in again" after a failed background token refresh) so it's
  // shown the moment this screen mounts, using the same banner a
  // login/signup error would use — same shared state so a form
  // submission naturally replaces it if the user tries something else.
  const [error, setError] = useState(initialNotice);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) { setError("Email and password required."); return; }
    if (mode === "signup" && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError(null);

    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) {
          setError(err.message || JSON.stringify(err));
          setLoading(false);
          return;
        }
        if (!data.session) {
          const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
          if (loginErr) {
            setError("Account created! Check your email to confirm, then sign in.");
            setLoading(false);
            setMode("login");
            return;
          }
          onAuth(loginData.session, loginData.user, true);
        } else {
          onAuth(data.session, data.user, true);
        }
      } else {
        const { data, error: err } = await supabase.auth.signInWithPassword({
          email, password,
          options: { persistSession: rememberMe },
        });
        if (err) {
          setFailedAttempts(f => f + 1);
          setError(err.message || JSON.stringify(err));
          setLoading(false);
          return;
        }
        if (rememberMe) {
          localStorage.setItem("cygne_remember_email", email);
        } else {
          localStorage.removeItem("cygne_remember_email");
        }
        onAuth(data.session, data.user, false);
      }
    } catch (e) {
      setError(e?.message || "Connection failed. Check your network and try again.");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 calc(var(--space-1) * 7)",
      position: "relative",
    }}>

      {/* Frosted-glass card sitting over the persistent video backdrop. */}
      <div style={{
        width: "100%",
        maxWidth: 360,
        padding: "var(--space-8) calc(var(--space-1) * 7) calc(var(--space-1) * 7)",
        background: "rgba(var(--rgb-ivory), 0.16)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(var(--rgb-ivory), 0.32)",
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>

        <p style={{
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: "var(--text-sm)",
          letterSpacing: "var(--tracking-display)",
          textTransform: "uppercase",
          color: "var(--color-ivory, #faf9f4)",
          margin: "0 0 calc(var(--space-1) * 7)",
          textAlign: "center",
        }}>
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </p>

        {/* Inputs */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Email"
            autoFocus
            className="cygne-auth-input"
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Password"
            className="cygne-auth-input"
            style={inputStyle}
          />
        </div>

        {/* Remember Me — login mode only */}
        {mode === "login" && (
          <div
            onClick={() => setRememberMe(r => !r)}
            style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", width: "100%", marginBottom: "var(--space-5)", cursor: "pointer", userSelect: "none" }}>
            <div style={{
              width: 14, height: 14, flexShrink: 0,
              border: "1px solid rgba(var(--rgb-ivory), 0.56)",
              borderRadius: 2,
              background: rememberMe ? "rgba(var(--rgb-ivory), 0.82)" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}>
              {rememberMe && (
                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="#2d3d2b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xs)", letterSpacing: "var(--tracking-display)", textTransform: "uppercase", color: "var(--color-ivory, #faf9f4)" }}>
              Remember Me
            </span>
          </div>
        )}

        {error && (
          <p style={{
            width: "100%",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-xs)",
            color: "var(--color-ivory, #faf9f4)",
            opacity: 0.85,
            margin: "0 0 var(--space-4)",
            lineHeight: 1.5,
          }}>{error}</p>
        )}

        {/* Primary button — ivory outlined to match the editorial outlined
            language but on the dark video surface. */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: "100%",
            padding: "var(--space-4) var(--space-6)",
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            letterSpacing: "var(--tracking-display)",
            textTransform: "uppercase",
            color: "var(--color-ivory, #faf9f4)",
            background: "transparent",
            border: "1.5px solid var(--color-ivory, #faf9f4)",
            borderRadius: "var(--radius)",
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.5 : 1,
            transition: "opacity 0.2s, background 0.2s",
            WebkitAppearance: "none", appearance: "none", WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "rgba(var(--rgb-ivory), 0.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
          {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
        </button>

        {/* Toggle link */}
        <button
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
          style={{
            marginTop: "var(--space-5)",
            background: "none",
            border: "none",
            fontFamily: "var(--font-body)",
            fontSize: "var(--text-xs)",
            color: "var(--color-ivory, #faf9f4)",
            cursor: "pointer",
            padding: "var(--space-2) 0",
            letterSpacing: "0.04em",
            opacity: 0.85,
          }}>
          {mode === "login" ? "Create an account" : "Already have an account? Sign in"}
        </button>

        {/* Forgot password — show after first failed attempt */}
        {mode === "login" && failedAttempts >= 1 && !resetSent && (
          <button
            onClick={async () => {
              if (!email) { setError("Enter your email above first."); return; }
              const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
              });
              if (err) { setError(err.message); return; }
              setResetSent(true);
              setError(null);
            }}
            style={{
              marginTop: "var(--space-3)",
              background: "none",
              border: "none",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-xs)",
              color: "var(--color-ivory, #faf9f4)",
              cursor: "pointer",
              padding: "var(--space-1) 0",
              letterSpacing: "0.04em",
              textDecoration: "underline",
              opacity: 0.8,
            }}>
            Forgot your password?
          </button>
        )}

        {resetSent && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-ivory, #faf9f4)", marginTop: "var(--space-3)", textAlign: "center", letterSpacing: "0.02em", opacity: 0.9 }}>
            Reset link sent — check your email.
          </p>
        )}
      </div>

      {/* Ivory placeholder styling — inline style can't reach :placeholder so
          a small scoped <style> block is the cleanest way to tint them. */}
      <style>{`
        .cygne-auth-input::placeholder { color: rgba(var(--rgb-ivory), 0.56); }
      `}</style>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "var(--space-4) var(--space-4)",
  background: "rgba(var(--rgb-ivory), 0.08)",
  border: "1px solid rgba(var(--rgb-ivory), 0.32)",
  borderRadius: "var(--radius)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--text-sm)",
  color: "var(--color-ivory, #faf9f4)",
  outline: "none",
  boxSizing: "border-box",
};

export { AuthScreen };
