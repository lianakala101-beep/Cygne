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

  ios: {
    // Prefer the iPad layout on tablets — the app is built mobile-first
    // and reads better at phone widths.
    contentInset: 'always',
    // Allow the WKWebView to scroll its own content (default true) so the
    // various scrollable surfaces (Reflection gallery, Progress, Monthly
    // Recap) feel native.
    scrollEnabled: true,
  },
};

export default config;
