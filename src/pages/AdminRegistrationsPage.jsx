import React, { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ADMIN_EMAIL, DISCIPLINES, PUBLISH_KEYS, disciplineKey } from "../constants";
import { PRIORITY_SLOTS } from "../config/pricing";
import { PRIORITY_PACKAGE_ID, syncPriorityCount } from "../lib/priority";
import { SESSIONS as SESSIONS_FOR_ADMIN, SESSION_BOOKINGS, sessionById } from "../lib/sessions";
import { fetchCompetitions } from "../lib/competitions";
import AdminCompetitionsPanel from "../components/AdminCompetitionsPanel";
import { useGeoPrice } from "../hooks/useGeoPrice";

export default function AdminRegistrationsPage() {
  const { t } = useTranslation();
  // Package labels come from the pricing config so they can never drift from
  // what the rider was actually shown on the sign-up form.
  const { prices } = useGeoPrice();
  const packageLabel = (id) => prices.packages.find((x) => x.id === id)?.label || id;

  /* Deposit tracking. firestore.rules lets the admin change only these two
     fields on a registration — the rest of a sign-up stays immutable, so a
     name or a publishing permission can't be rewritten after the fact. */
  const [saving, setSaving] = useState(null);
  const [saveError, setSaveError] = useState("");

  const toggleDeposit = async (reg) => {
    const next = !reg.depositPaid;
    setSaving(reg.id);
    setSaveError("");
    try {
      // Sessions live in their own collection; the deposit field and the rule
      // that guards it are identical, so only the collection name differs.
      await updateDoc(doc(db, reg.__session ? SESSION_BOOKINGS : "registrations", reg.id), {
        depositPaid: next,
        depositPaidAt: next ? serverTimestamp() : null,
      });
      // Update in place rather than refetching the whole list — one field
      // changed and the admin is usually mid-scroll through a competition.
      setAllRegs((list) =>
        list.map((x) => (x.id === reg.id ? { ...x, depositPaid: next } : x))
      );
    } catch (e) {
      setSaveError(t("registrations.updateFailed", { detail: e?.code || e?.message || "" }));
    } finally {
      setSaving(null);
    }
  };
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();

  /* Which side of the business is on screen: the competitions and their
     sign-ups, or bookings for personal sessions. They are different
     collections with different shapes, so this is a mode rather than a
     filter. */
  const [mode, setMode] = useState("competition");
  /** Which session type is selected in session mode; null = all of them. */
  const [selectedSession, setSelectedSession] = useState(null);

  /* Real competition records (name, farm, dates, country) — created and
     removed from the panel in the sidebar. Separate from `competitions`
     below, which is still derived from the sign-ups themselves so that
     events created before this existed keep showing their archive. */
  const [comps, setComps] = useState([]);
  const [sessionBookings, setSessionBookings] = useState([]);

  const reloadCompetitions = React.useCallback(async () => {
    try {
      setComps(await fetchCompetitions());
    } catch (e) {
      console.warn("Failed to load competitions:", e);
    }
  }, []);

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

        // Competitions and personal-session bookings, in parallel. Marked with
        // __session so the shared row renderer knows which collection a record
        // came from when the deposit is toggled.
        await reloadCompetitions();
        try {
          const sSnap = await getDocs(
            query(collection(db, SESSION_BOOKINGS), orderBy("submittedAt", "desc"))
          );
          setSessionBookings(sSnap.docs.map(d => ({ id: d.id, __session: true, ...d.data() })));
        } catch (e) {
          console.warn("Failed to load session bookings:", e);
        }

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

        /* Repair the public priority tally.
           The sign-up form reads priorityCounts/{competition} to show riders
           how many places are left, and riders increment it themselves when
           they claim one. That can drift — a claim whose registration never
           landed, a sign-up removed since. The registrations are the truth, and
           this page is the only place that can read them, so recount here and
           write the real number back. Nothing to await: it is a background
           repair and the list is already on screen. */
        Object.values(map).forEach(({ title: comp }) => {
          const used = docs.filter(
            (r) =>
              (r.competitionTitle || t("registrations.untitled")) === comp &&
              (r.packages || []).includes(PRIORITY_PACKAGE_ID)
          ).length;
          syncPriorityCount(comp, used).catch((err) =>
            console.warn("Priority count sync failed for", comp, err)
          );
        });
      } catch (err) {
        console.error("Failed to load data:", err);
        setLoading(false);
      }
    };

    loadData();
  }, [user, t, reloadCompetitions]);

  if (loadingAuth || loading) {
    return (
      <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D", letterSpacing: ".14em" }}>
          {t("common.loading")}
        </span>
      </div>
    );
  }

  /* One filter pipeline for both modes. In competition mode the rows are
     sign-ups for the selected event; in session mode they are bookings for the
     selected session type. The search and discipline filters are identical
     either way, so they are applied once here rather than duplicated. */
  const rows = mode === "session"
    ? sessionBookings.filter(b => !selectedSession || b.sessionId === selectedSession)
    : allRegs.filter(r => r.competitionTitle === selected);

  const filteredRegs = rows
    .filter(r => !search || [
      r.riderName, r.horseName, r.contact, r.location,
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

        {/* LEFT — mode switch, competition management, then the list */}
        <div className="admin-regs-sidebar" style={{ background: "#EDE8DF", borderLeft: "1px solid #DDD8CF", padding: "16px 0 24px", overflowY: "auto" }}>

          {/* Competitions or personal sessions. Two different collections with
              different shapes, so this switches the whole panel rather than
              filtering one list. */}
          <div style={{ display: "flex", margin: "0 20px 16px", border: "1px solid #C8B8A4", background: "#FDFAF5" }}>
            {[
              { id: "competition", label: t("registrations.modeCompetitions") },
              { id: "session", label: t("registrations.modeSessions") },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => { setMode(m.id); setSearch(""); }}
                aria-pressed={mode === m.id}
                style={{
                  flex: 1, border: "none", cursor: "pointer", padding: "9px 6px",
                  fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".1em",
                  textTransform: "uppercase", minHeight: 34,
                  background: mode === m.id ? "#4A3525" : "transparent",
                  color: mode === m.id ? "#F5F1EA" : "#8A7868",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === "session" ? (
            <>
              <div style={{ padding: "0 20px 12px", borderBottom: "1px solid #DDD8CF", marginBottom: 8 }}>
                <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" }}>
                  {t("registrations.modeSessions")}
                </span>
              </div>

              {/* "All" first, then one row per session type with its count. */}
              {[{ id: null, label: t("registrations.allSessions") }]
                .concat(SESSIONS_FOR_ADMIN.map((x) => ({ id: x.id, label: prices[x.id]?.title || x.id })))
                .map((item) => {
                  const count = item.id
                    ? sessionBookings.filter((b) => b.sessionId === item.id).length
                    : sessionBookings.length;
                  const active = selectedSession === item.id;
                  return (
                    <button
                      key={item.id || "all"}
                      onClick={() => { setSelectedSession(item.id); setSearch(""); }}
                      style={{
                        width: "100%", textAlign: "right", padding: "13px 20px",
                        background: active ? "#F5F1EA" : "transparent", border: "none",
                        borderRight: active ? "2px solid #B2967D" : "2px solid transparent",
                        cursor: "pointer", direction: "rtl",
                        borderBottom: "1px solid #DDD8CF", transition: "all .15s",
                      }}
                    >
                      <div style={{ fontFamily: "Georgia,serif", fontSize: 13, color: "#2C1E12", marginBottom: 4 }}>
                        {item.label}
                      </div>
                      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#B2967D" }}>
                        {t("registrations.signups", { count })}
                      </span>
                    </button>
                  );
                })}
            </>
          ) : (
          <>
          {/* Create and remove the events themselves. Removing one clears it
              from the list riders see; the sign-ups already made for it stay in
              the archive below, because registrations cannot be deleted. */}
          <AdminCompetitionsPanel competitions={comps} onChanged={reloadCompetitions} />

          <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #DDD8CF", marginBottom: 8 }}>
            <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" }}>
              {t("registrations.archive")}
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
          </>
          )}
        </div>

        {/* RIGHT — Registrants */}
        <div className="admin-regs-content" style={{ padding: "28px 32px", overflowY: "auto", direction: "rtl" }}>

          {/* Title + count + search */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 400, color: "#2C1E12", marginBottom: 6 }}>
              {mode === "session"
                ? (selectedSession ? prices[selectedSession]?.title : t("registrations.allSessions"))
                : (selected || t("registrations.pick"))}
            </h1>
            {saveError && (
              <div style={{
                background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F",
                padding: "8px 12px", fontFamily: "Arial,sans-serif", fontSize: 11, marginBottom: 10,
              }}>
                {saveError}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D" }}>
                {t("registrations.signups", { count: filteredRegs.length })}
              </span>
              {/* Priority is capped per competition, so the count has to be
                  visible here — this is the only place she can tell whether
                  the next request can still be accepted. Counted across the
                  whole competition, not the filtered view. It is a competition
                  add-on only, so it is absent in session mode. */}
              {mode === "competition" && (() => {
                const used = allRegs.filter(
                  (r) => r.competitionTitle === selected && (r.packages || []).includes("priority")
                ).length;
                const full = used >= PRIORITY_SLOTS;
                return (
                  <span style={{
                    fontFamily: "Arial,sans-serif", fontSize: 10,
                    color: full ? "#8A2A1F" : "#3B6D11",
                    background: full ? "#FFF0EE" : "#EAF3DE",
                    border: `1px solid ${full ? "#E8C4BC" : "#C0DD97"}`,
                    padding: "3px 10px",
                  }}>
                    {full
                      ? t("registrations.priorityFull")
                      : t("registrations.prioritySlots", { used, total: PRIORITY_SLOTS })}
                  </span>
                );
              })()}
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
                      {/* Session bookings carry a session type and a requested
                          date instead of a competition day and packages. */}
                      {r.__session && r.sessionId && (
                        <span style={tagStyle("#F5F0E8", "#7D5A44")}>
                          {prices[r.sessionId]?.title || sessionById(r.sessionId)?.slug || r.sessionId}
                        </span>
                      )}
                      {r.__session && r.preferredDate && (
                        <span style={tagStyle("#EDE8DF", "#4A3525")}>📅 {r.preferredDate}</span>
                      )}
                      {(r.packages || []).map(p => (
                        <span key={p} style={tagStyle("#F5F0E8", "#7D5A44")}>{packageLabel(p)}</span>
                      ))}
                      {/* Deposit state, and the control to change it, in one
                          place — she is usually looking at this list while the
                          money lands. */}
                      <button
                        type="button"
                        onClick={() => toggleDeposit(r)}
                        disabled={saving === r.id}
                        title={r.depositPaid ? t("registrations.markUnpaid") : t("registrations.markPaid")}
                        style={{
                          ...tagStyle(r.depositPaid ? "#EAF3DE" : "#FFF0EE", r.depositPaid ? "#3B6D11" : "#8A2A1F"),
                          border: `1px solid ${r.depositPaid ? "#C0DD97" : "#E8C4BC"}`,
                          cursor: saving === r.id ? "wait" : "pointer",
                          opacity: saving === r.id ? 0.6 : 1,
                        }}
                      >
                        {r.depositPaid ? `✓ ${t("registrations.paid")}` : `○ ${t("registrations.unpaid")}`}
                      </button>
                    </div>
                  </div>

                  {/* Row 2 — Contact, and whatever else the record carries.
                      A competition sign-up quotes a deposit figure the rider
                      typed; a session booking has a location and possibly extra
                      animals instead. */}
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                      📱 {r.contact}
                    </span>
                    {r.deposit && (
                      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                        💰 {r.deposit}
                      </span>
                    )}
                    {r.location && (
                      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                        📍 {r.location}
                      </span>
                    )}
                    {Number(r.horseCount) > 1 && (
                      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                        🐎 ×{r.horseCount}
                      </span>
                    )}
                    {r.extraAnimal && (
                      <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#6A5A50" }}>
                        🐕 {r.extraAnimal}
                      </span>
                    )}
                  </div>

                  {r.notes && (
                    <div style={{
                      fontFamily: "Arial,sans-serif", fontSize: 11, lineHeight: 1.7,
                      color: "#4A3525", background: "#F5F1EA", border: "1px solid #E4DFD6",
                      padding: "8px 12px", marginBottom: 8,
                    }}>
                      {r.notes}
                    </div>
                  )}

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
                    {/* Session bookings never ask about a receipt, so the tag
                        would otherwise read "receipt: no" for all of them. */}
                    {!r.__session && (
                      <span style={tagStyle(r.receiptWanted === "yes" ? "#EDE8DF" : "#F5F5F5", "#6A5A50")}>
                        {t("registrations.receipt", { value: r.receiptWanted === "yes" ? t("registrations.yes") : t("registrations.no") })}
                      </span>
                    )}
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