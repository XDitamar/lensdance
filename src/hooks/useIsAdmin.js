import { useAuth } from "../context/AuthContext";

export default function useIsAdmin() {
  const { user } = useAuth();
  return !!user && user.email === "lensdance29@gmail.com";
}
