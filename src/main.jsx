import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components.jsx'
import './index.css'

// Wrap the root in ErrorBoundary so any render-time throw in App or its
// descendants renders the ivory "SOMETHING INTERRUPTED US" fallback
// instead of unmounting the React root to a blank screen. Previously
// the boundary was only wired around <Progress> and <ProfileSheet>, so
// a launch-path crash (e.g. anything in the auth/RC/paywall wiring)
// would leave the reviewer/user staring at nothing and force-close the
// app — which reads as a launch error to App Review.
ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)

// Register the service worker in production only — Vite's dev server doesn't
// emit /sw.js the same way, and a stale SW from dev would intercept HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
