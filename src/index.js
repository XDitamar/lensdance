// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import "./i18n";
import "./style.css";

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
      <App />
    </AuthProvider>
  </BrowserRouter>
);
