// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
// Vercel Web Analytics. The "/react" entry point, not "/next" — this is a
// Create React App project, and the Next.js import would fail to resolve.
// It only reports anything on the deployed site: in development the component
// renders nothing and sends nothing, so `npm start` stays clean.
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
// Turns a blank white page into a readable error. A component that throws
// during render otherwise unmounts the whole tree and leaves nothing on screen
// to report — see the header comment in the file.
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { installTranslateDomGuard } from "./lib/translateDomGuard";
import "./i18n";
import "./style.css";

// Must run before the first render. Google Translate replaces text nodes behind
// React's back, and React then throws trying to remove nodes that have moved —
// which blanks the entire page. See the file for the full story.
installTranslateDomGuard();

// Apply the saved theme before first paint to avoid a light-mode flash.
try {
  const saved = localStorage.getItem("theme");
  const theme = saved === "dark" || saved === "light"
    ? saved
    : (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
} catch {}

// ✅ Service Worker – Image Cache
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("[SW] Registered:", reg.scope))
      .catch((err) => console.warn("[SW] Registration failed:", err));
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      {/* Inside the router so the error page can still link back to /. */}
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
      {/* Renders nothing — it injects Vercel's insights script, which patches
          the History API itself and so records client-side navigations without
          any help from react-router. No `route` prop on purpose: passing one
          turns auto-tracking off, and every route here is a fixed path
          (/pricing, /faq, /register) with no dynamic segments to group. */}
      <Analytics />
    </AuthProvider>
  </BrowserRouter>
);
