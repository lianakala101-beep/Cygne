import { useState } from "react";
import { supabase } from "./supabase.js";

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
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
        const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          setError(err.message || JSON.stringify(err));
          setLoading(false);
          return;
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
      background: "var(--color-ivory)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 36px",
    }}>

      {/* Logo */}
      <img
        src="/cygne-logo.png"
        alt=""
        style={{
          width: "48%",
          maxWidth: 200,
          display: "block",
          margin: "0 auto 52px",
        }}
      />

      {/* Heading */}
      <p style={{
        fontFamily: "var(--font-display, 'Fungis', sans-serif)",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: "#1c1c1a",
        margin: "0 0 28px",
        textAlign: "center",
      }}>
        {mode === "login" ? "Welcome Back" : "Create Account"}
      </p>

      {/* Inputs */}
      <div style={{ width: "100%", maxWidth: 320, display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Email"
          autoFocus
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Password"
          style={inputStyle}
        />
      </div>

      {error && (
        <p style={{
          width: "100%",
          maxWidth: 320,
          fontFamily: "var(--font-body, 'Space Grotesk', sans-serif)",
          fontSize: 11,
          color: "#8b7355",
          margin: "0 0 14px",
          lineHeight: 1.5,
        }}>{error}</p>
      )}

      {/* Primary button — matches BEGIN YOUR RITUAL style */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          width: "100%",
          maxWidth: 320,
          padding: "14px 40px",
          fontFamily: "var(--font-display, 'Fungis', sans-serif)",
          fontSize: 12,
          fontWeight: 400,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "#1c1c1a",
          background: "transparent",
          border: "1px solid #1c1c1a",
          borderRadius: 0,
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.5 : 1,
          transition: "opacity 0.2s",
        }}>
        {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
      </button>

      {/* Toggle link */}
      <button
        onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
        style={{
          marginTop: 20,
          background: "none",
          border: "none",
          fontFamily: "var(--font-body, 'Space Grotesk', sans-serif)",
          fontSize: 11,
          color: "#7a7a7a",
          cursor: "pointer",
          padding: "8px 0",
          letterSpacing: "0.04em",
        }}>
        {mode === "login" ? "Create an account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "14px 16px",
  background: "transparent",
  border: "1px solid rgba(28,28,26,0.25)",
  borderRadius: 0,
  fontFamily: "var(--font-body, 'Space Grotesk', sans-serif)",
  fontSize: 14,
  color: "#1c1c1a",
  outline: "none",
  boxSizing: "border-box",
};

export { AuthScreen };
