import { useState } from "react";
import { LOGO_SRC } from "./components.jsx";
import { supabase } from "./supabase.js";

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login"); // login | signup | forgot
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) { setError("Email and password required."); return; }
    if (mode === "signup" && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError(null);

    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) {
          console.error("[Cygne Auth] signUp error:", err);
          setError(err.message || JSON.stringify(err));
          setLoading(false);
          return;
        }

        // If email confirmation is enabled, session will be null.
        // Try to sign in immediately — works when confirmation is disabled.
        if (!data.session) {
          const { data: loginData, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
          if (loginErr) {
            console.error("[Cygne Auth] post-signup signIn error:", loginErr);
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
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          console.error("[Cygne Auth] signIn error:", err);
          setError(err.message || JSON.stringify(err));
          setLoading(false);
          return;
        }
        onAuth(data.session, data.user, false);
      }
    } catch (e) {
      console.error("[Cygne Auth] exception:", e);
      setError(e?.message || "Connection failed. Check your network and try again.");
    }
    setLoading(false);
  };

  const handleForgot = async () => {
    if (!email) { setError("Please enter your email."); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setResetSent(true);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") mode === "forgot" ? handleForgot() : handleSubmit(); };

  return (
    <div style={{ minHeight: "100vh", background: "#3a4134", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "0 36px" }}>

      {/* Top — logo */}
      <div style={{ paddingTop: 72, width: "100%", maxWidth: 380 }}>
        <img src={LOGO_SRC} alt="Cygne" style={{ height: 140, width: "auto", display: "block", filter: "brightness(1.25) contrast(1.05)", mixBlendMode: "lighten" }} />
        <p style={{ fontFamily: "'Reenie Beanie', cursive", fontSize: 22, fontWeight: 400, color: "rgba(232,227,214,0.95)", margin: "6px 0 0 110px", letterSpacing: "0.05em", lineHeight: 1 }}>built around you</p>
      </div>

      {/* Form */}
      <div style={{ width: "100%", maxWidth: 380, paddingBottom: 64 }}>

        {mode === "forgot" ? (
          resetSent ? (
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "rgba(232,227,214,0.85)", lineHeight: 1.6, margin: "0 0 24px" }}>
              Check your email for a reset link.
            </p>
          ) : (
            <>
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(232,227,214,0.45)", margin: "0 0 20px" }}>
                Reset password
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder="Email" autoFocus
                  style={inputStyle} />
              </div>
              {error && (
                <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "#c06060", margin: "0 0 14px", lineHeight: 1.5 }}>{error}</p>
              )}
              <button onClick={handleForgot} disabled={loading}
                style={{ width: "100%", padding: "15px 0", background: "rgba(232,227,214,0.12)", color: "rgba(232,227,214,0.95)", border: "1px solid rgba(232,227,214,0.28)", borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1, transition: "background 0.2s, border-color 0.2s" }}
                onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "rgba(232,227,214,0.2)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.5)"; }}}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,227,214,0.12)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.28)"; }}>
                {loading ? "..." : "Send reset link"}
              </button>
            </>
          )
        ) : (
          <>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(232,227,214,0.45)", margin: "0 0 20px" }}>
              {mode === "login" ? "Welcome back" : "Create your account"}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Email" autoFocus
                style={inputStyle} />
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Password"
                style={inputStyle} />
            </div>

            {mode === "login" && (
              <button onClick={() => { setMode("forgot"); setError(null); setResetSent(false); }}
                style={{ display: "block", background: "none", border: "none", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "rgba(232,227,214,0.38)", cursor: "pointer", padding: "0 0 14px", letterSpacing: "0.04em", transition: "color 0.2s" }}
                onMouseEnter={e => e.currentTarget.style.color = "rgba(232,227,214,0.6)"}
                onMouseLeave={e => e.currentTarget.style.color = "rgba(232,227,214,0.38)"}>
                Forgot password?
              </button>
            )}

            {error && (
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "#c06060", margin: "0 0 14px", lineHeight: 1.5 }}>{error}</p>
            )}

            <button onClick={handleSubmit} disabled={loading}
              style={{ width: "100%", padding: "15px 0", background: "rgba(232,227,214,0.12)", color: "rgba(232,227,214,0.95)", border: "1px solid rgba(232,227,214,0.28)", borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1, transition: "background 0.2s, border-color 0.2s" }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "rgba(232,227,214,0.2)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.5)"; }}}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,227,214,0.12)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.28)"; }}>
              {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>

            <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
              style={{ width: "100%", marginTop: 14, background: "none", border: "none", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "rgba(232,227,214,0.45)", cursor: "pointer", padding: "8px 0", letterSpacing: "0.06em", transition: "color 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.color = "rgba(232,227,214,0.7)"}
              onMouseLeave={e => e.currentTarget.style.color = "rgba(232,227,214,0.45)"}>
              {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </>
        )}

        {(mode === "forgot") && (
          <button onClick={() => { setMode("login"); setError(null); setResetSent(false); }}
            style={{ width: "100%", marginTop: 14, background: "none", border: "none", fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "rgba(232,227,214,0.45)", cursor: "pointer", padding: "8px 0", letterSpacing: "0.06em", transition: "color 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.color = "rgba(232,227,214,0.7)"}
            onMouseLeave={e => e.currentTarget.style.color = "rgba(232,227,214,0.45)"}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleReset = async () => {
    if (!password || password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(onDone, 1500);
  };

  const handleKeyDown = (e) => { if (e.key === "Enter") handleReset(); };

  return (
    <div style={{ minHeight: "100vh", background: "#3a4134", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: "0 36px" }}>
      <div style={{ paddingTop: 72, width: "100%", maxWidth: 380 }}>
        <img src={LOGO_SRC} alt="Cygne" style={{ height: 140, width: "auto", display: "block", filter: "brightness(1.25) contrast(1.05)", mixBlendMode: "lighten" }} />
        <p style={{ fontFamily: "'Reenie Beanie', cursive", fontSize: 22, fontWeight: 400, color: "rgba(232,227,214,0.95)", margin: "6px 0 0 110px", letterSpacing: "0.05em", lineHeight: 1 }}>built around you</p>
      </div>

      <div style={{ width: "100%", maxWidth: 380, paddingBottom: 64 }}>
        {done ? (
          <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "rgba(232,227,214,0.85)", lineHeight: 1.6 }}>
            Password updated. Signing you in...
          </p>
        ) : (
          <>
            <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: "rgba(232,227,214,0.45)", margin: "0 0 20px" }}>
              Set new password
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="New password" autoFocus style={inputStyle} />
              <input
                type="password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={handleKeyDown}
                placeholder="Confirm password" style={inputStyle} />
            </div>
            {error && (
              <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, color: "#c06060", margin: "0 0 14px", lineHeight: 1.5 }}>{error}</p>
            )}
            <button onClick={handleReset} disabled={loading}
              style={{ width: "100%", padding: "15px 0", background: "rgba(232,227,214,0.12)", color: "rgba(232,227,214,0.95)", border: "1px solid rgba(232,227,214,0.28)", borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: "0.2em", textTransform: "uppercase", cursor: loading ? "default" : "pointer", opacity: loading ? 0.5 : 1, transition: "background 0.2s, border-color 0.2s" }}
              onMouseEnter={e => { if (!loading) { e.currentTarget.style.background = "rgba(232,227,214,0.2)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.5)"; }}}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(232,227,214,0.12)"; e.currentTarget.style.borderColor = "rgba(232,227,214,0.28)"; }}>
              {loading ? "..." : "Update password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "14px 16px",
  background: "rgba(232,227,214,0.06)", border: "1px solid rgba(232,227,214,0.15)",
  borderRadius: 10, fontFamily: "'Space Grotesk', sans-serif", fontSize: 14,
  color: "rgba(232,227,214,0.95)", outline: "none",
  transition: "border-color 0.2s",
};

export { AuthScreen, ResetPasswordScreen };

