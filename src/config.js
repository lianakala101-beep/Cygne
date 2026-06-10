// Runtime configuration.
//
// API_BASE_URL is the absolute origin where the Vercel /api/* serverless
// functions live. In the web build it defaults to an empty string, so
// `${API_BASE_URL}/api/foo` collapses to `/api/foo` and the browser
// resolves it against the current origin (Vercel hosting the same
// origin as the SPA) — current production behavior is unchanged.
//
// In the Capacitor iOS wrapper there IS no current origin (the WKWebView
// loads from `capacitor://localhost`), so we need an absolute URL.
// Build the iOS bundle with:
//
//   VITE_API_BASE_URL=https://cygne.skin npm run build && npx cap sync ios
//
// (Replace `https://cygne.skin` with whatever the production origin ends
// up being — see the Capacitor PR description for the open question.)
//
// IMPORTANT: no trailing slash. Strip one if it's accidentally set so
// `${API_BASE_URL}/api/foo` doesn't double up.
const raw = (import.meta.env.VITE_API_BASE_URL || "").trim();
export const API_BASE_URL = raw.endsWith("/") ? raw.slice(0, -1) : raw;
