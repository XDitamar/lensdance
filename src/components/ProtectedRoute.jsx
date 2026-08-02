import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth } from "../firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ADMIN_EMAIL } from "../constants";

// Small full-screen loader shown while auth state resolves.
function AuthLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D", letterSpacing: ".14em" }}>
        {t("common.loading")}
      </span>
    </div>
  );
}

function useAuthUser() {
  const [state, setState] = useState({ user: null, loading: true, isAdmin: false });
  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      let isAdmin = false;
      if (user) {
        // Admin via custom claim, with the known email as a bootstrap fallback.
        try {
          const token = await user.getIdTokenResult();
          isAdmin = token.claims?.admin === true || user.email === ADMIN_EMAIL;
        } catch {
          isAdmin = user.email === ADMIN_EMAIL;
        }
      }
      setState({ user, loading: false, isAdmin });
    });
  }, []);
  return state;
}

// Requires any signed-in user.
export function ProtectedRoute({ children }) {
  const { user, loading } = useAuthUser();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Requires the admin.
export function AdminRoute({ children }) {
  const { user, loading, isAdmin } = useAuthUser();
  if (loading) return <AuthLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default ProtectedRoute;
