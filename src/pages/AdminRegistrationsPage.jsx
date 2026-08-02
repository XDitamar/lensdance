import React, { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ADMIN_EMAIL, DISCIPLINES, PUBLISH_KEYS, disciplineKey } from "../constants";
import { useGeoPrice } from "../hooks/useGeoPrice";

export default function AdminRegistrationsPage() {
  const { t } = useTranslation();
  // Package labels come from the pricing config so they can never drift from
  // what the rider was actually shown on the sign-up form.
  const { prices } = useGeoPrice();
  const packageLabel = (id) => prices.packages.find((x) => x.id === id)?.label || id;
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();

  const [allRegs, setAllRegs]         = useState([]);
  const [competitions, setCompetitions] = useState([]); // unique competition names sorted by date
  const [selected, setSelected]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState(""); // new discipline filter
  const [userInfo, setUserInfo] = useState({}); // userId -> { discipline, email, username, name }

  // Auth guard
  useEffect(() => {
    if (!loadingAuth && (!user || user.email !== ADMIN_EMAIL)) {
      navigate("/");
    }
  }, [user, loadingAuth, navigate]);

  // Load all registrations once
  useEffect(() => {
    if (!user || user.email !== ADMIN_EMAIL) return;

    const loadData = async () => {
      try {
        // Load registrations
        const q = query(collection(db, "registrations"), orderBy("submittedAt", "desc"));
        const snap = await getDocs(q);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllRegs(docs);

        // Load account info (discipline, email, username, name) for registered users
        const userIds = [...new Set(docs.map(r => r.userId).filter(Boolean))];
        const infos = {};

        await Promise.all(
          userIds.map(async (userId) => {
            try {
              const userDoc = await getDoc(doc(db, "users", userId));
              if (userDoc.exists()) {
                const u = userDoc.data();
                infos[userId] = {
                  discipline: u.discipline || "other",
                  email:      u.email || "",
                  username:   u.username || "",
                  name:       u.name || "",
                };
              }
            } catch (err) {
              console.warn(`Failed to load account info for user ${userId}:`, err);
            }
          })
        );

        setUserInfo(infos);

        // Build unique competitions list, sorted by most recent registration
        const map = {};
        docs.forEach(r => {
          const key = r.competitionTitle || t("registrations.untitled");
          if (!map[key]) {
            map[key] = {
              title: key,
              count: 0,
              latestDate: r.submittedAt?.toDate?.() || new Date(0),
            };
          }
          map[key].count++;
          const d = r.submittedAt?.toDate?.() || new Date(0);
          if (d > map[key].latestDate) map[key].latestDate = d;
        });

        const list = Object.values(map).sort((a, b) => b.latestDate - a.latestDate);
        setCompetitions(list);
        if (list.length > 0) setSelected(list[0].title); // auto-select latest
        setLoading(false);
      } catch (err) {
        console.error("Failed to load data:", err);
        setLoading(false);
      }
    };

    loadData();
  }, [user, t]);

  if (loadingAuth || loading) {
    return (
      <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D", letterSpacing: ".14em" }}>
          {t("common.loading")}
        </span>
      </div>
    );
  }

  const filteredRegs = allRegs
    .filter(r => r.competitionTitle === selected)
    .filter(r => !search || [
      r.riderName, r.horseName, r.contact,
      r.userEmail || userInfo[r.userId]?.email,
      userInfo[r.userId]?.username,
    ].filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase()))
    .filter(r => !disciplineFilter || userInfo[r.userId]?.discipline === disciplineFilter);

  const formatDate = ts => {
    if (!ts?.toDate) return "—";
    const d = ts.toDate();
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  };

  return (
    <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{
        background: "#2C1E12", padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontFamily: "Georgia,serif", fontStyle: "italic", fontSize: 14, color: "#6A5A48" }}>
          Lens Dance — Admin
        </span>
        <a href="/register" style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".14em", color: "#B2967D", textDecoration: "none" }}>
          {t("registrations.back")}
        </a>
      </div>

      <div className="admin-regs-layout" style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, minHeight: "calc(100vh - 48px)" }}>

        {/* LEFT — Competition list */}
        <div className="admin-regs-sidebar" style={{ background: "#EDE8DF", borderLeft: "1px solid #DDD8CF", padding: "24px 0", overflowY: "auto" }}>
          <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #DDD8CF", marginBottom: 8 }}>
            <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" }}>
              {t("registrations.competitions")}
            </span>
          </div>

          {competitions.map(comp => (
            <button
              key={comp.title}
              onClick={() => { setSelected(comp.title); setSearch(""); }}
              style={{
                width: "100%", textAlign: "right", padding: "14px 20px",
                background: selected === comp.title ? "#F5F1EA" : "transparent",
                border: "none",
                borderRight: selected === comp.title ? "2px solid #B2967D" : "2px solid transparent",
                cursor: "pointer", direction: "rtl",
                borderBottom: "1px solid #DDD8CF",
                transition: "all .15s",
              }}
            >
              <div style={{ fontFamily: "Georgia,serif", fontSize: 13, color: "#2C1E12", marginBottom: 4 }}>
                {comp.title}
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#B2967D" }}>
                  {t("registrations.signups", { count: comp.count })}
                </span>
                <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#A89D90" }}>
                  {formatDate({ toDate: () => comp.latestDate })}
                </span>
              </div>
            </button>
          ))}

          {competitions.length === 0 && (
            <div style={{ padding: "20px", fontFamily: "Arial,sans-serif", fontSize: 11, color: "#9A8878" }}>
              {t("registrations.none")}
            </div>
          )}
        </div>

        {/* RIGHT — Registrants */}
        <div className="admin-regs-content" style={{ padding: "28px 32px", overflowY: "auto", direction: "rtl" }}>

          {/* Title + count + search */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 400, color: "#2C1E12", marginBottom: 6 }}>
              {selected || t("registrations.pick")}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D" }}>
                {t("registrations.signups", { count: filteredRegs.length })}
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("registrations.search")}
                style={{
                  background: "transparent", border: "none",
                  borderBottom: "1px solid #D7C9B8", padding: "6px 0",
                  fontFamily: "Georgia,serif", fontSize: 12, color: "#2C1E12",
                  outline: "none", minWidth: 220, direction: "rtl",
                }}
              />
              <select
                value={disciplineFilter}
                onChange={e => setDisciplineFilter(e.target.value)}
                style={{
                  background: "transparent", border: "none",
                  borderBottom: "1px solid #D7C9B8", padding: "6px 0",
                  fontFamily: "Arial,sans-serif", fontSize: 11, color: "#2C1E12",
                  outline: "none", direction: "rtl",
                }}
              >
                <option value="">{t("registrations.allCategories")}</option>
                {DISCIPLINES.map(d => (
                  <option key={d.id} value={d.id}>{t(disciplineKey(d.id))}</option>
                ))}
              </select>
            </div>
            <div style={{ height: 1, background: "#DDD8CF", marginTop: 14 }} />
          </div>

          {/* Registrations list */}
          {filteredRegs.length === 0 ? (
            <div style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#9A8878", padding: "20px 0" }}>
              {t("registrations.noResults")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredRegs.map((r, i) => (
                <div key={r.id} style={{
                  background: "#FDFAF5",
                  border: "1px solid #E2D9CE",
                  padding: "18px 20px",
                }}>
                  {/* Row 1 — Name + horse + day */}
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ fontFamily: "Georgia,serif", fontSize: 15, color: "#2C1E12", marginBottom: 3 }}>
                        {r.riderName}
                      </div>
                      <div style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#8A7868" }}>
                        🐴 {r.horseName}
                      </div>
                      {userInfo[r.userId]?.discipline && (
                        <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D", marginTop: 2 }}>
                          🏇 {DISCIPLINES.find(d => d.id === userInfo[r.userId].discipline)&& t(disciplineKey(userInfo[r.userId].discipline))}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {r.day && (
                        <span style={tagStyle("#EDE8DF", "#4A3525")}>{r.day}</span>
                      )}
                      {(r.packages || []).map(p => (
                        <span key={p} style={tagStyle("#F5F0E8", "#7D5A44")}>{packageLabel(p)}</span>
                      ))}
                    </div>
                  </div>

                  {/* Row 2 — Contact + deposit */}
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                      📱 {r.contact}
                    </span>
                    <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                      💰 {r.deposit}
                    </span>
                  </div>

                  {/* Row 2b — Account email + username */}
                  {(() => {
                    const acctEmail = r.userEmail || userInfo[r.userId]?.email;
                    const acctUsername = userInfo[r.userId]?.username;
                    if (!acctEmail && !acctUsername) {
                      return (
                        <div style={{ marginBottom: 8, fontFamily: "Arial,sans-serif", fontSize: 11, color: "#A89D90" }}>
                          {t("registrations.noAccount")}
                        </div>
                      );
                    }
                    return (
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
                        {acctEmail && (
                          <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50", direction: "ltr", unicodeBidi: "plaintext" }}>
                            ✉️ {acctEmail}
                          </span>
                        )}
                        {acctUsername && (
                          <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50", direction: "ltr", unicodeBidi: "plaintext" }}>
                            👤 @{acctUsername}
                          </span>
                        )}
                      </div>
                    );
                  })()}

                  {/* Row 3 — Permissions + terms + receipt */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #EDE8DF" }}>
                    <span style={tagStyle(
                      r.publishPermission === "yes" ? "#F0F7F0" : r.publishPermission === "no" ? "#FFF0EE" : "#FFF8E8",
                      r.publishPermission === "yes" ? "#2A5A2A" : r.publishPermission === "no" ? "#8A2A1F" : "#7A5A00"
                    )}>
                      {PUBLISH_KEYS[r.publishPermission] ? t(PUBLISH_KEYS[r.publishPermission]) : r.publishPermission}
                    </span>
                    <span style={tagStyle(r.receiptWanted === "yes" ? "#EDE8DF" : "#F5F5F5", "#6A5A50")}>
                      {t("registrations.receipt", { value: r.receiptWanted === "yes" ? t("registrations.yes") : t("registrations.no") })}
                    </span>
                    <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#A89D90" }}>
                      {t("registrations.submitted", { date: formatDate(r.submittedAt) })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function tagStyle(bg, color) {
  return {
    background: bg, color,
    fontFamily: "Arial,sans-serif", fontSize: 9,
    letterSpacing: ".08em", padding: "3px 8px",
    border: `1px solid ${color}22`,
    whiteSpace: "nowrap",
  };
}