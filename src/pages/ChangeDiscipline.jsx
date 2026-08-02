import React, { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DISCIPLINES, disciplineKey } from "../constants";
import SettingsLayout from "../components/settings/SettingsLayout";
import Field from "../components/settings/Field";
import { settingsStyles } from "../components/settings/styles";

export default function ChangeDiscipline() {
  const { t } = useTranslation();
  const [user, authLoading] = useAuthState(auth);
  const [selected, setSelected] = useState("");
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  // Load current discipline once auth resolves (auth.currentUser was null on a
  // fresh page load, which is why saving used to fail).
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then(snap => {
      if (snap.exists()) setSelected(snap.data().discipline || "");
    }).catch(() => {});
  }, [user]);

  const doChange = async (e) => {
    e.preventDefault();
    if (!user) { setError(t("errors.loginToChangeDiscipline")); return; }
    if (!selected) { setError(t("errors.disciplineRequired")); return; }
    setLoading(true); setError(""); setSuccess(false);
    try {
      // merge so the profile doc is created if it doesn't exist yet
      await setDoc(
        doc(db, "users", user.uid),
        { discipline: selected, email: user.email || null },
        { merge: true }
      );
      setSuccess(true);
      setTimeout(() => navigate("/me"), 1400);
    } catch (err) {
      console.error("Failed to update discipline:", err);
      setError(t("common.errorWithCode", { detail: err?.code || err?.message || "" }));
    } finally {
      setLoading(false);
    }
  };

  return <SettingsLayout title={t("changeDiscipline.title")} back="/me">
    {authLoading ? (
      <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#8A7868" }}>{t("common.loading")}</p>
    ) : (
      <form onSubmit={doChange} noValidate>
        <Field label={t("changeDiscipline.label")}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
            {DISCIPLINES.map(d => (
              <button key={d.id} type="button" onClick={() => setSelected(d.id)}
                style={{
                  border: `1px solid ${selected === d.id ? "#B2967D" : "#D7C9B8"}`,
                  background: selected === d.id ? "#F5F0E8" : "transparent",
                  padding: "12px 6px", cursor: "pointer", transition: "all .2s",
                  fontFamily: "Arial, sans-serif", fontSize: 10,
                  letterSpacing: ".06em", color: "#4A3525",
                }}>
                {t(disciplineKey(d.id))}
              </button>
            ))}
          </div>
        </Field>
        {error   && <div style={settingsStyles.error}>{error}</div>}
        {success && <div style={settingsStyles.success}>{t("changeDiscipline.success")}</div>}
        <button type="submit" disabled={loading} style={{ ...settingsStyles.btn, opacity: loading ? 0.65 : 1, marginTop: 8 }}>
          {loading ? t("common.updating") : t("changeDiscipline.submit")}
        </button>
      </form>
    )}
  </SettingsLayout>;
}
