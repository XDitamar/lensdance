import React, { useState, useEffect } from "react";
import { collection, getDocs, orderBy, query, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAuthState } from "react-firebase-hooks/auth";
import { useNavigate } from "react-router-dom";
import { ADMIN_EMAIL, PACKAGE_LABELS, PUBLISH_LABELS, DISCIPLINES } from "../constants";

export default function AdminRegistrationsPage() {
  const [user, loadingAuth] = useAuthState(auth);
  const navigate = useNavigate();

  const [allRegs, setAllRegs]         = useState([]);
  const [competitions, setCompetitions] = useState([]); // unique competition names sorted by date
  const [selected, setSelected]         = useState(null);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [disciplineFilter, setDisciplineFilter] = useState(""); // new discipline filter
  const [userDisciplines, setUserDisciplines] = useState({}); // userId -> discipline mapping

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

        // Load user disciplines for registered users
        const userIds = [...new Set(docs.map(r => r.userId).filter(Boolean))];
        const disciplines = {};
        
        await Promise.all(
          userIds.map(async (userId) => {
            try {
              const userDoc = await getDoc(doc(db, "users", userId));
              if (userDoc.exists()) {
                disciplines[userId] = userDoc.data().discipline || "other";
              }
            } catch (err) {
              console.warn(`Failed to load discipline for user ${userId}:`, err);
            }
          })
        );
        
        setUserDisciplines(disciplines);

        // Build unique competitions list, sorted by most recent registration
        const map = {};
        docs.forEach(r => {
          const key = r.competitionTitle || "ללא שם";
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
  }, [user]);

  if (loadingAuth || loading) {
    return (
      <div style={{ background: "#F5F1EA", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "Arial,sans-serif", fontSize: 11, color: "#B2967D", letterSpacing: ".14em" }}>
          טוען...
        </span>
      </div>
    );
  }

  const filteredRegs = allRegs
    .filter(r => r.competitionTitle === selected)
    .filter(r => !search || [r.riderName, r.horseName, r.contact].join(" ").includes(search))
    .filter(r => !disciplineFilter || userDisciplines[r.userId] === disciplineFilter);

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
          ← חזרה לדף הרשמה
        </a>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, minHeight: "calc(100vh - 48px)" }}>

        {/* LEFT — Competition list */}
        <div style={{ background: "#EDE8DF", borderLeft: "1px solid #DDD8CF", padding: "24px 0", overflowY: "auto" }}>
          <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #DDD8CF", marginBottom: 8 }}>
            <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" }}>
              תחרויות
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
                  {comp.count} נרשמים
                </span>
                <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#A89D90" }}>
                  {formatDate({ toDate: () => comp.latestDate })}
                </span>
              </div>
            </button>
          ))}

          {competitions.length === 0 && (
            <div style={{ padding: "20px", fontFamily: "Arial,sans-serif", fontSize: 11, color: "#9A8878" }}>
              אין הרשמות עדיין
            </div>
          )}
        </div>

        {/* RIGHT — Registrants */}
        <div style={{ padding: "28px 32px", overflowY: "auto", direction: "rtl" }}>

          {/* Title + count + search */}
          <div style={{ marginBottom: 24 }}>
            <h1 style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 400, color: "#2C1E12", marginBottom: 6 }}>
              {selected || "בחר תחרות"}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D" }}>
                {filteredRegs.length} נרשמים
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם / סוס / קשר..."
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
                <option value="">כל הקטגוריות</option>
                {DISCIPLINES.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <div style={{ height: 1, background: "#DDD8CF", marginTop: 14 }} />
          </div>

          {/* Registrations list */}
          {filteredRegs.length === 0 ? (
            <div style={{ fontFamily: "Arial,sans-serif", fontSize: 12, color: "#9A8878", padding: "20px 0" }}>
              אין תוצאות
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
                      {userDisciplines[r.userId] && (
                        <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#B2967D", marginTop: 2 }}>
                          🏇 {DISCIPLINES.find(d => d.id === userDisciplines[r.userId])?.label || userDisciplines[r.userId]}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      {r.day && (
                        <span style={tagStyle("#EDE8DF", "#4A3525")}>{r.day}</span>
                      )}
                      {(r.packages || []).map(p => (
                        <span key={p} style={tagStyle("#F5F0E8", "#7D5A44")}>{PACKAGE_LABELS[p] || p}</span>
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

                  {/* Row 3 — Permissions + terms + receipt */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid #EDE8DF" }}>
                    <span style={tagStyle(
                      r.publishPermission === "yes" ? "#F0F7F0" : r.publishPermission === "no" ? "#FFF0EE" : "#FFF8E8",
                      r.publishPermission === "yes" ? "#2A5A2A" : r.publishPermission === "no" ? "#8A2A1F" : "#7A5A00"
                    )}>
                      {PUBLISH_LABELS[r.publishPermission] || r.publishPermission}
                    </span>
                    <span style={tagStyle(r.receiptWanted === "yes" ? "#EDE8DF" : "#F5F5F5", "#6A5A50")}>
                      קבלה: {r.receiptWanted === "yes" ? "כן" : "לא"}
                    </span>
                    <span style={{ fontFamily: "Arial,sans-serif", fontSize: 9, color: "#A89D90" }}>
                      נרשם: {formatDate(r.submittedAt)}
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