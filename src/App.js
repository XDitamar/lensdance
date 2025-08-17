import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Header from "./components/Header";

// Pages
import HomePage from "./pages/HomePage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";

// (Optional) If you already have these, keep their imports too:
// import GalleryPage from "./pages/GalleryPage";
// import MePage from "./pages/MePage";
// import LoginPage from "./pages/LoginPage";
// import SignupPage from "./pages/SignupPage";
// import AdminPage from "./pages/AdminPage";
// import ChangePasswordPage from "./pages/ChangePasswordPage";

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/account" element={<AccountPage />} />

        {/* Add your other routes back when those files exist */}
        {/* <Route path="/gallery" element={<GalleryPage />} /> */}
        {/* <Route path="/me" element={<MePage />} /> */}
        {/* <Route path="/login" element={<LoginPage />} /> */}
        {/* <Route path="/signup" element={<SignupPage />} /> */}
        {/* <Route path="/admin" element={<AdminPage />} /> */}
        {/* <Route path="/change-password" element={<ChangePasswordPage />} /> */}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
