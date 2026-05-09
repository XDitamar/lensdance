// src/App.js
import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Header from "./components/Header";

// 🆕 (these were already in your file)
import GoogleTranslateLoader from "./components/GoogleTranslateLoader";
import FloatingTranslateButton from "./components/FloatingTranslateButton";
import FloatingWhatsApp from "./components/FloatingWhatsApp";
import AccessibilityWidget from "./components/AccessibilityWidget";

// Pages
import MaintenancePage from "./pages/MaintenancePage"; // Import the maintenance page
// import HomePage from "./pages/HomePage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";
import GalleryPage from "./pages/GalleryPage";
import MePage from "./pages/MePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AdminPage from "./pages/AdminPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

// 🆕 add these
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

export default function App() {
  const location = useLocation();
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  
  // Check if we're in maintenance mode (at root path with MaintenancePage)
  useEffect(() => {
    setIsMaintenanceMode(location.pathname === '/');
  }, [location.pathname]);

  return (
    <>
      {!isMaintenanceMode && <Header />}
      {!isMaintenanceMode && <GoogleTranslateLoader />}
      {!isMaintenanceMode && <FloatingTranslateButton />}
      {!isMaintenanceMode && <FloatingWhatsApp />}
      {!isMaintenanceMode && <AccessibilityWidget />}

      <Routes>
        {/* Public routes */}
        <Route path="/" element={<MaintenancePage />} /> {/* Show maintenance page at root */}
        {/* <Route path="/" element={<HomePage />} /> */}
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* 🆕 Reset flow */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* User / Admin */}
        <Route path="/me" element={<MePage />} />
        <Route path="/admin" element={<AdminPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
