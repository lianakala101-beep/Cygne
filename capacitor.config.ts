/// <reference types="@capacitor/cli" />

import type { CapacitorConfig } from '@capacitor/cli';

// Capacitor configuration for the iOS wrapper around the existing Vite app.
//
// BUNDLED BUILD APPROACH:
//   We do NOT set `server.url`. The iOS app loads the local `dist/` bundle
//   (Vite's build output) directly from inside the .ipa, so there's no origin
//   server. Every API call has to use an absolute HTTPS URL — relative paths
//   like `/api/foo` would resolve against `capacitor://localhost` and fail.
//   See src/config.js for the API_BASE_URL pattern.
//
// BUILD FLOW:
//   npm run build       → Vite outputs `dist/`
//   npx cap sync ios    → copies `dist/` into the iOS project's www/
//                         (also re-installs any updated Capacitor plugins)
//   Open ios/App/App.xcworkspace in Xcode → build + archive → upload to App
//                                            Store Connect.
//   (Done via GitHub Actions on a macOS runner since the local Mac is
//   stuck on macOS 11.)

const config: CapacitorConfig = {
  appId: 'com.cygne.app',
  appName: 'Cygne',
  webDir: 'dist',

  // Background color of the native WebView itself (not CSS) — paints
  // instantly on native launch, before the page's own stylesheet loads,
  // and is what shows through in any native-chrome gap CSS can't reach
  // (e.g. a UIScrollView's resting contentInset gap). Matches
  // --color-inky-moss so there's no white flash/gap anywhere.
  backgroundColor: '#2d3d2b',

  ios: {
    // 'never': the WKWebView draws fully edge-to-edge (status bar +
    // home indicator included) instead of iOS auto-inserting a content
    // inset for the safe areas. Was 'always', which kept the page
    // itself from ever extending into the notch/home-indicator strip —
    // at rest (scroll position 0) that reserved strip showed the
    // WebView's own native background (white, since nothing set it)
    // instead of the page; once scrolled, the page's own moss
    // background happened to slide into that same screen position,
    // which is why the gap "turned moss" only after scrolling. Now the
    // page handles the safe areas itself via env(safe-area-inset-*)
    // padding on the header/bottom nav (see src/App.jsx), so the fix
    // doesn't depend on scroll position at all.
    contentInset: 'never',
    // Allow the WKWebView to scroll its own content (default true) so the
    // various scrollable surfaces (Reflection gallery, Progress, Monthly
    // Recap) feel native.
    scrollEnabled: true,
  },

  plugins: {
    StatusBar: {
      // Transparent status bar over the WebView (the default, set
      // explicitly here) — pairs with contentInset: 'never' so the page
      // itself is what's visible behind the status bar text.
      overlaysWebView: true,
      // Light status bar text (clock/battery/signal) for our dark moss
      // background. Nothing in this project ever set a style before —
      // Capacitor's own default is '.default' (dark text), which reads
      // as invisible against a dark background.
      style: 'DARK',
    },
  },
};

export default config;
