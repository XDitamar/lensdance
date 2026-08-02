import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Link } from "react-router-dom";

export default function ContactPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const [showAgreement, setShowAgreement] = useState(false);
  const [readChecked, setReadChecked] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Always show popup when entering page
  useEffect(() => {
    setShowAgreement(true);
  }, []);

  // The terms live in src/locales/*.json ("contact.agreement"). Hebrew is the
  // binding version; the English one is a convenience translation and says so.
  const agreementText = t("contact.agreement");

  async function handleAgree() {
    if (!user) return;

    try {
      setSaving(true);
      await setDoc(
        doc(db, "agreements", `${user.uid}_${Date.now()}`), // unique doc
        {
          email: user.email || null,
          agreedAt: serverTimestamp(),
          language: i18n.language,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        }
      );
      setSaving(false);
      setShowAgreement(false);
    } catch (err) {
      console.error("Error saving agreement:", err);
      setSaving(false);
      alert(t("contact.saveFailed"));
    }
  }

  const canContinue = readChecked && agreeChecked && !saving;

  return (
    <div className="container">
      <h2 className="section-title">{t("contact.title")}</h2>
      <p>{t("contact.subtitle")}</p>

      <div className="google-form-embed" style={{ maxWidth: 700, margin: "0 auto" }}>
        <iframe
          src="https://docs.google.com/forms/d/1F_w9v_DrQlqodzSVnWZKiNy3UB2buS_1TGexhAK0ZtA/viewform?embedded=true"
          width="100%"
          height="800"
          frameBorder="0"
          marginHeight="0"
          marginWidth="0"
          title="Lens Dance Contact"
        >
          Loading…
        </iframe>
      </div>

      {/* Popup */}
      {showAgreement && (
        <div className="agreement-overlay">
          <div className="agreement-modal" dir={i18n.dir()}>
            {!user ? (
              <>
                <h3>{t("contact.loginRequired")}</h3>
                <p>{t("contact.loginPrompt")}</p>
                <Link to="/login" className="auth-btn">
                  {t("contact.login")}
                </Link>
              </>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{t("contact.terms")}</h3>
                <div className="agreement-text">
                  <pre style={{ margin: 0 }}>{agreementText}</pre>
                </div>

                <label style={{ display: "block", marginTop: 10 }}>
                  <input
                    type="checkbox"
                    checked={readChecked}
                    onChange={(e) => setReadChecked(e.target.checked)}
                  />{" "}
                  {t("contact.read")}
                </label>

                <label style={{ display: "block", marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={agreeChecked}
                    onChange={(e) => setAgreeChecked(e.target.checked)}
                  />{" "}
                  {t("contact.agree")}
                </label>

                <div className="agreement-actions">
                  <button
                    disabled={!canContinue}
                    onClick={handleAgree}
                    className="auth-btn"
                  >
                    {saving ? t("common.saving") : t("common.continue")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
