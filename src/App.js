// src/App.js
import React from "react";
import { Routes, Route } from "react-router-dom";

// Only import the maintenance page
import MaintenancePage from "./pages/MaintenancePage";

export default function App() {
  return (
    <Routes>
      {/* Show maintenance page at all routes */}
      <Route path="*" element={<MaintenancePage />} />
    </Routes>
  );
}
