// src/pages/MyCompetitionsPage.jsx
//
// "My competitions" — what this rider has signed up to, reached from Settings.
//
// Until now a sign-up vanished the moment it was submitted: the rider got a
// confirmation screen and then had no way to check what they had booked, for
// which day, or whether the deposit had been marked as received. The answer
// lived only on the admin's screen, so every question about it became a
// WhatsApp message to Alina.
//
// UPCOMING ONLY, by default. Riders asked for "the competitions I'm signed up
// to", which means the ones still ahead of them — a finished event is not
// something you prepare for. Past entries are still reachable behind a toggle
// rather than deleted from view, because "did I actually book that one?" is a
// question people ask months later.
//
// A sign-up is matched to its competition by the title it was filed under
// (see `filedUnder` in CompetitionPage). An entry whose competition has since
// been removed still shows — it just has no dates to display.

import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthState } from "react-firebase-hooks/auth";
import { useTranslation } from "react-i18next";
import { auth } from "../firebase";
import {
  competitionLabel,
  fetchCompetitions,
  fetchMyRegistrations,
  formatRange,
  hasEnded,
} from "../lib/competitions";
import { useGeoPrice } from "../hooks/useGeoPrice";
import { isRtlLang } from "../i18n";
import "./my-competitions.css";

export default function MyCompetitionsPage() {
  const { t, i18n } = useTranslation();
  const [user, authLoading] = useAuthState(auth);
  const { prices } = useGeoPrice();

  const [regs, setRegs] = useState([]);
  const [comps, setComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (authLoading) return undefined;
    if (!user) { setLoading(false); return undefined; }
    let alive = true;
    (async () => {
      try {
        const [mine, all] = await Promise.all([
          fetchMyRegistrations(user.uid),
          // Public read, so this is safe from a client and gives us the dates
          // the sign-up itself does not carry.
          fetchCompetitions().catch(() => []),
        ]);
        if (!alive) return;
        setRegs(mine);
        setComps(all);
      } catch (e) {
        console.warn("Could not load my competitions:", e?.code || e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [user, authLoading]);

  /* Join each sign-up to its competition record, then split by whether the
     event has finished. The title is the only link between the two — it is
     what gets written onto the registration at submit time. */
  const { upcoming, past } = useMemo(() => {
    const byTitle = new Map(comps.map((c) => [competitionLabel(c), c]));
    const up = [];
    const old = [];
    for (const r of regs) {
      const comp = byTitle.get(r.competitionTitle) || null;
      // No matching record means the competition was removed from the list.
      // Treat it as upcoming unless the sign-up is clearly old, so a rider is
      // never wrongly told their booking is in the past.
      (comp && hasEnded(comp) ? old : up).push({ reg: r, comp });
    }
    return { upcoming: up, past: old };
  }, [regs, comps]);

  const packageLabel = (id) => prices.packages.find((p) => p.id === id)?.label || id;
  const dir = isRtlLang(i18n.language) ? "rtl" : "ltr";

  const Shell = ({ children }) => (
    <div className="mc-root" dir={dir}>
      <div className="mc-page">
        <div className="mc-head">
          <span className="mc-eyebrow">{t("myComps.eyebrow")}</span>
          <h1 className="mc-title">{t("myComps.title")}</h1>
          <div className="mc-rule" />
        </div>
        {children}
      </div>
    </div>
  );

  if (authLoading || loading) {
    return <Shell><p className="mc-muted">{t("common.loading")}</p></Shell>;
  }

  if (!user) {
    return (
      <Shell>
        <p className="mc-muted">{t("myComps.signInPrompt")}</p>
        <div className="mc-cta-row">
          <Link to="/login" className="mc-btn">{t("auth.login")}</Link>
        </div>
      </Shell>
    );
  }

  const list = showPast ? past : upcoming;

  return (
    <Shell>
      {upcoming.length === 0 && past.length === 0 ? (
        <>
          <p className="mc-muted">{t("myComps.empty")}</p>
          <div className="mc-cta-row">
            <Link to="/register" className="mc-btn">{t("myComps.signUpCta")}</Link>
          </div>
        </>
      ) : (
        <>
          {/* The toggle only appears once there is history to toggle to. */}
          {past.length > 0 && (
            <div className="mc-tabs" role="tablist">
              {[
                { id: false, label: t("myComps.upcoming", { count: upcoming.length }) },
                { id: true, label: t("myComps.past", { count: past.length }) },
              ].map((tab) => (
                <button
                  key={String(tab.id)}
                  role="tab"
                  aria-selected={showPast === tab.id}
                  className={`mc-tab${showPast === tab.id ? " is-active" : ""}`}
                  onClick={() => setShowPast(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {list.length === 0 && (
            <p className="mc-muted">
              {showPast ? t("myComps.emptyPast") : t("myComps.emptyUpcoming")}
            </p>
          )}

          <div className="mc-list">
            {list.map(({ reg, comp }) => (
              <div className={`mc-card${showPast ? " is-past" : ""}`} key={reg.id}>
                <div className="mc-card-head">
                  <div>
                    <div className="mc-card-title">{reg.competitionTitle}</div>
                    {comp && <div className="mc-card-dates">{formatRange(comp, i18n.language)}</div>}
                  </div>
                  {/* The deposit is the thing riders actually come here to
                      check, so it is the one badge on the card. */}
                  <span className={`mc-deposit${reg.depositPaid ? " is-paid" : ""}`}>
                    {reg.depositPaid ? t("registrations.paid") : t("registrations.unpaid")}
                  </span>
                </div>

                <dl className="mc-rows">
                  {reg.day && (
                    <div className="mc-row">
                      <dt>{t("myComps.day")}</dt><dd>{reg.day}</dd>
                    </div>
                  )}
                  <div className="mc-row">
                    <dt>{t("myComps.horse")}</dt><dd>{reg.horseName}</dd>
                  </div>
                  {reg.classEntry && (
                    <div className="mc-row">
                      <dt>{t("myComps.class")}</dt><dd>{reg.classEntry}</dd>
                    </div>
                  )}
                </dl>

                {(reg.packages || []).length > 0 && (
                  <div className="mc-packages">
                    {reg.packages.map((p) => (
                      <span className="mc-pkg" key={p}>{packageLabel(p)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mc-foot">
        <Link to="/me" className="mc-link">{t("myComps.toGallery")}</Link>
        <Link to="/register" className="mc-link">{t("myComps.signUpCta")}</Link>
      </div>
    </Shell>
  );
}
