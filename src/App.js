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
import CompetitionPage from "./pages/CompetitionPage";
import AdminRegistrationsPage from "./pages/AdminRegistrationsPage";
import AboutPage from "./pages/AboutPage";

export default function App() {
  // Start downloading the public gallery images as soon as the site loads, so
  // the gallery page is instant when the visitor opens it.
  useEffect(() => {
    getMainGalleryItems().catch(() => {});
  }, []);

  return (
    <>
      <Header />
      <GoogleTranslateLoader />
      <AutoLanguage />
      <FloatingTranslateButton />
      <FloatingWhatsApp />
      <AccessibilityWidget />

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
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route path="/change-name" element={<ChangeName />} />
        <Route path="/change-discipline" element={<ChangeDiscipline />} />

        {/* 🆕 Reset flow */}
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* User / Admin */}
        <Route path="/me" element={<MePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/registrations" element={<AdminRegistrationsPage />} />

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
