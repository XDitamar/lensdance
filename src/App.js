// src/App.js
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";

// 🆕 Add these:
import GoogleTranslateLoader from "./components/GoogleTranslateLoader";
import FloatingTranslateButton from "./components/FloatingTranslateButton";

// Pages
import HomePage from "./pages/HomePage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";
import GalleryPage from "./pages/GalleryPage";
import MePage from "./pages/MePage";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import AdminPage from "./pages/AdminPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";

export default function App() {
  return (
    <>
      <Header />

      {/* 🆕 Mount once so translation works across all routes */}
      <GoogleTranslateLoader />
      {/* 🆕 Always-visible floating translate button (not in navbar) */}
      <FloatingTranslateButton />

      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/contact" element={<ContactPage />} />

        {/* Auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />

        {/* User routes */}
        <Route path="/me" element={<MePage />} />

        {/* Admin route */}
        <Route path="/admin" element={<AdminPage />} />

        {/* Catch-all redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
