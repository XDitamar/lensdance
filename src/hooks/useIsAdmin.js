import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ADMIN_EMAIL } from "../constants";

// Admin is determined by a Firebase custom claim (`admin: true`), with the
// known admin email kept as a bootstrap fallback so access never breaks before
// the claim is set. Set the claim server-side with the Admin SDK:
//   admin.auth().setCustomUserClaims(uid, { admin: true })
export default function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIsAdmin(false);
      return;
    }
    // Immediate email fallback so the UI doesn't flicker.
    if (user.email === ADMIN_EMAIL) setIsAdmin(true);
    user
      .getIdTokenResult()
      .then((res) => {
        if (!cancelled) {
          setIsAdmin(res.claims?.admin === true || user.email === ADMIN_EMAIL);
        }
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(user.email === ADMIN_EMAIL);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return isAdmin;
}
