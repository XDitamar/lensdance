// src/components/AdminCompetitionsPanel.jsx
//
// Create and remove competitions, from /admin/registrations.
//
// A competition carries a name, the farm hosting it, a date range and a
// country. The country is what decides who is offered it: /register shows a
// visitor only the events in their own country, so a German rider is not
// invited to a show outside Tel Aviv. See src/lib/competitions.js.
//
// DELETING. The confirmation says so and it bears repeating here: removing a
// competition removes the event from the list, not the sign-ups people already
// submitted for it. Registrations cannot be deleted at all (firestore.rules),
// so the archive — and any deposit already paid against it — survives.

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ANY_COUNTRY,
  COMPETITION_COUNTRIES,
  countryName,
  createCompetition,
  deleteCompetition,
  formatRange,
  hasEnded,
} from "../lib/competitions";

const EMPTY = { name: "", farm: "", country: "IL", startDate: "", endDate: "" };

export default function AdminCompetitionsPanel({ competitions, onChanged }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError(t("competitions.errors.name"));
    if (!form.startDate) return setError(t("competitions.errors.start"));
    // An end before the start is a typo, not a date range — catching it here
    // saves an event that would sort into the past the moment it is saved.
    if (form.endDate && form.endDate < form.startDate) {
      return setError(t("competitions.errors.range"));
    }
    setBusy(true);
    try {
      await createCompetition(form);
      setForm(EMPTY);
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(t("common.errorWithCode", { detail: err?.code || err?.message || "unknown" }));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (comp) => {
    if (!window.confirm(t("competitions.confirmDelete", { name: comp.name }))) return;
    setBusy(true);
    setError("");
    try {
      await deleteCompetition(comp.id);
      await onChanged();
    } catch (err) {
      setError(t("common.errorWithCode", { detail: err?.code || err?.message || "unknown" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <span style={s.eyebrow}>{t("competitions.title")}</span>
        <button type="button" style={s.addBtn} onClick={() => setOpen((v) => !v)}>
          {open ? t("common.cancel") : t("competitions.add")}
        </button>
      </div>

      {error && <div style={s.error} role="alert">{error}</div>}

      {open && (
        <form onSubmit={submit} style={s.form}>
          <Row label={t("competitions.nameLabel")}>
            {(id) => (
              <input id={id} style={s.input} value={form.name} onChange={set("name")}
                placeholder={t("competitions.namePlaceholder")} />
            )}
          </Row>

          <Row label={t("competitions.farmLabel")}>
            {(id) => (
              <input id={id} style={s.input} value={form.farm} onChange={set("farm")}
                placeholder={t("competitions.farmPlaceholder")} />
            )}
          </Row>

          <div style={s.pair}>
            <Row label={t("competitions.startLabel")}>
              {(id) => (
                <input id={id} style={s.input} type="date" value={form.startDate}
                  onChange={set("startDate")} />
              )}
            </Row>
            <Row label={t("competitions.endLabel")} hint={t("competitions.endHint")}>
              {(id) => (
                <input id={id} style={s.input} type="date" value={form.endDate}
                  min={form.startDate || undefined} onChange={set("endDate")} />
              )}
            </Row>
          </div>

          <Row label={t("competitions.countryLabel")} hint={t("competitions.countryHint")}>
            {(id) => (
              <select id={id} style={s.input} value={form.country} onChange={set("country")}>
                {COMPETITION_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code === ANY_COUNTRY ? t("competitions.anyCountry") : c.name}
                  </option>
                ))}
              </select>
            )}
          </Row>

          <button type="submit" style={{ ...s.saveBtn, opacity: busy ? 0.6 : 1 }} disabled={busy}>
            {busy ? t("common.saving") : t("competitions.create")}
          </button>
        </form>
      )}

      <div style={{ marginTop: 6 }}>
        {competitions.length === 0 && (
          <p style={s.empty}>{t("competitions.empty")}</p>
        )}
        {competitions.map((comp) => {
          const past = hasEnded(comp);
          return (
            <div key={comp.id} style={{ ...s.row, opacity: past ? 0.62 : 1 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.rowName}>{comp.name}</div>
                <div style={s.rowMeta}>
                  {[comp.farm, formatRange(comp), comp.country === ANY_COUNTRY
                    ? t("competitions.anyCountry")
                    : countryName(comp.country)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {past && <span style={s.pastTag}>{t("competitions.past")}</span>}
              </div>
              <button
                type="button"
                onClick={() => remove(comp)}
                disabled={busy}
                style={s.delBtn}
                title={t("competitions.delete")}
                aria-label={`${t("competitions.delete")} — ${comp.name}`}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, hint, children }) {
  const id = React.useId();
  return (
    <div style={{ marginBottom: 12 }}>
      <label htmlFor={id} style={s.label}>{label}</label>
      {children(id)}
      {hint && <p style={s.hint}>{hint}</p>}
    </div>
  );
}

const s = {
  wrap:    { padding: "16px 20px", borderBottom: "1px solid #DDD8CF" },
  head:    { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 },
  eyebrow: { fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", color: "#B2967D" },
  addBtn:  { fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: "#4A3525", background: "transparent", border: "1px solid #B2967D", padding: "6px 12px", cursor: "pointer", minHeight: 30 },
  form:    { background: "#F5F1EA", border: "1px solid #DDD8CF", padding: 14, marginBottom: 12 },
  pair:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  label:   { display: "block", fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase", color: "#B2967D", marginBottom: 4 },
  input:   { width: "100%", boxSizing: "border-box", background: "#FFF", border: "1px solid #D7C9B8", padding: "8px 10px", fontFamily: "Arial,sans-serif", fontSize: 12, color: "#2C1E12", outline: "none", borderRadius: 0 },
  hint:    { fontFamily: "Arial,sans-serif", fontSize: 9.5, lineHeight: 1.6, color: "#8A7868", margin: "5px 0 0" },
  saveBtn: { width: "100%", background: "#4A3525", color: "#F5F1EA", border: "none", padding: "11px 0", fontFamily: "Arial,sans-serif", fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase", cursor: "pointer", marginTop: 4, minHeight: 40 },
  row:     { display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 0", borderBottom: "1px solid #E4DFD6" },
  rowName: { fontFamily: "Georgia,serif", fontSize: 12.5, color: "#2C1E12", lineHeight: 1.4 },
  rowMeta: { fontFamily: "Arial,sans-serif", fontSize: 9.5, color: "#8A7868", marginTop: 3, lineHeight: 1.5 },
  pastTag: { display: "inline-block", marginTop: 5, fontFamily: "Arial,sans-serif", fontSize: 8.5, letterSpacing: ".12em", textTransform: "uppercase", color: "#8A7868", background: "#E4DFD6", padding: "2px 7px" },
  delBtn:  { background: "transparent", border: "none", color: "#B2967D", cursor: "pointer", fontSize: 13, padding: "6px 8px", minHeight: 32, flexShrink: 0 },
  empty:   { fontFamily: "Arial,sans-serif", fontSize: 11, color: "#9A8878", margin: "8px 0" },
  error:   { background: "#FFF0EE", border: "1px solid #E8C4BC", color: "#8A2A1F", padding: "8px 11px", fontFamily: "Arial,sans-serif", fontSize: 10.5, lineHeight: 1.55, marginBottom: 10 },
};
