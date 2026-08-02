// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";
import { getMainGalleryItems } from "./lib/galleryCache";

// 🆕 (these were already in your file)
import GoogleTranslateLoader from "./components/GoogleTranslateLoader";
import AutoLanguage from "./components/AutoLanguage";
import FloatingTranslateButton from "./components/FloatingTranslateButton";
import FloatingWhatsApp from "./components/FloatingWhatsApp";
import AccessibilityWidget from "./components/AccessibilityWidget";
import AdminCountryButton from "./components/AdminCountryButton";
import MaintenanceGate from "./components/MaintenanceGate";

// Pages
import HomePage from "./pages/HomePage";
import ContactPage from "./pages/ContactPage";
import GalleryPage from "./pages/GalleryPage";
import MePage from "./pages/MePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AdminPage from "./pages/AdminPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import PricingPage from "./pages/PricingPage";
// import AboutPage from "./pages/AboutPage";
import ChangeName from "./pages/ChangeName";
import ChangeDiscipline from "./pages/ChangeDiscipline";

// 🆕 add these
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import SmsLoginPage from "./pages/SmsLoginPage";
import CompetitionPage from "./pages/CompetitionPage";
import AdminRegistrationsPage from "./pages/AdminRegistrationsPage";
import AboutPage from "./pages/AboutPage";
import { ProtectedRoute, AdminRoute } from "./components/ProtectedRoute";

export default function App() {
  // Start downloading the public gallery images as soon as the site loads, so
  // the gallery page is instant when the visitor opens it.
  useEffect(() => {
    getMainGalleryItems().catch(() => {});
  }, []);

  return (
    // Shows the "under construction" screen instead of the site when
    // REACT_APP_MAINTENANCE=1 — never on localhost, never for the admin.
    // See src/components/MaintenanceGate.jsx.
    <MaintenanceGate>
      <Header />
      <GoogleTranslateLoader />
      <AutoLanguage />
      <FloatingTranslateButton />
      <FloatingWhatsApp />
      <AccessibilityWidget />
      {/* Renders nothing unless the signed-in user is the admin. */}
      <AdminCountryButton />

      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/register" element={<CompetitionPage />} />

        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        {/* <Route path="/account" element={<AccountPage />} /> */}
        <Route path="/change-password" element={<ProtectedRoute><ChangePasswordPage /></ProtectedRoute>} />
        <Route path="/change-name" element={<ProtectedRoute><ChangeName /></ProtectedRoute>} />
        <Route path="/change-discipline" element={<ProtectedRoute><ChangeDiscipline /></ProtectedRoute>} />

        {/* 🆕 Reset flow */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/sms-login" element={<SmsLoginPage />} />

        {/* User / Admin */}
        <Route path="/me" element={<ProtectedRoute><MePage /></ProtectedRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/admin/registrations" element={<AdminRoute><AdminRegistrationsPage /></AdminRoute>} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MaintenanceGate>
  );
}
